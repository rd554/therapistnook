"""
Clinical Intelligence Chat Service

Retrieval-then-answer Q&A over a single patient's *approved* Clinical
Intelligence record ("ask about this patient"). Deliberately narrow:

- `answer_clinical_question` takes a `ci` (ClinicalIntelligence row) and
  patient fields as plain arguments - no db session, no patient_id lookup of
  its own. It can only ever see the one record it's handed. Cross-patient
  leakage would require a caller bug that passes the wrong `ci` in, not
  anything this module could do on its own.
- Context is built only from approved sections (patient_summary, symptoms,
  diagnoses, treatment_goals, relationships, life_events, risk_factors,
  outstanding_questions, timeline). Pending/unreviewed AI suggestions are
  never included - the assistant should answer from what a practitioner has
  actually confirmed, not from suggestions still in the review queue.
- Every fact fed to the model is tagged with a reference key (`[S1]`, `[S2]`,
  ...) tied to that fact's own `sources[]` citation(s). The model is
  instructed to end factual claims with their reference key(s); the reply is
  then parsed for those keys and only citations that actually resolve
  through the registry are returned. If no keys resolve, the answer is
  flagged `grounded=False` so the UI can show it as unverified rather than
  silently trusting free text.
- `answer_clinical_question` returns raw text with `[S#]` markers intact,
  and the caller (main.py) stores that raw text as the message's `content`.
  Markers/markdown are stripped only at the API response boundary via
  `clean_display_text`, never before storage - the model's citing behavior
  degrades within a conversation if its own prior turns, replayed back as
  history, stop showing markers.
"""

import os
import re
from typing import Optional

import httpx

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

MAX_TIMELINE_ITEMS = 15
MAX_HISTORY_TURNS = 10

_CITATION_RE = re.compile(r"\[S(\d+)\]")

SECTION_LABEL = {
    "patient_summary": "Patient Summary",
    "symptoms": "Symptoms",
    "diagnoses": "Diagnoses",
    "treatment_goals": "Treatment Goals",
    "relationships": "Important Relationships",
    "life_events": "Life Events",
    "risk_factors": "Risk Factors",
    "outstanding_questions": "Outstanding Questions",
    "timeline": "Timeline",
}


def _clean_sources(sources: Optional[list]) -> list:
    """Keep only citation-relevant fields; excerpts are for display, not the prompt."""
    out = []
    for s in (sources or []):
        out.append({
            "source_type": s.get("source_type"),
            "source_id": s.get("source_id"),
            "excerpt": s.get("excerpt"),
            "date": s.get("date"),
        })
    return out or [{"source_type": None, "source_id": None, "excerpt": None, "date": None}]


def build_context(ci, patient_name: str, patient_age, patient_gender: str):
    """
    Build the prompt-facing context text plus a citation registry from one
    ClinicalIntelligence row. Returns (context_text, registry, entries) where
    `entries` is [{key, section, text}] - used by the mock responder too, so
    dev/test runs without an API key still exercise real keyword matching
    rather than a canned string.
    """
    entries = []
    counter = {"n": 0}

    def add(section: str, text: str, sources: Optional[list]):
        counter["n"] += 1
        key = f"S{counter['n']}"
        entries.append({
            "key": key,
            "section": section,
            "text": text,
            "citations": _clean_sources(sources),
        })
        return key

    # Identity line is sourced to the patient record itself, not left
    # uncited - otherwise a plain "how old is this patient" question
    # answers correctly but resolves zero [S#] keys and gets mislabeled
    # ungrounded.
    add(
        "patient_record",
        f"Patient: {patient_name}, age {patient_age}, gender {patient_gender}.",
        [{"source_type": "patient_record", "source_id": None, "excerpt": None, "date": None}],
    )

    if ci.patient_summary and ci.patient_summary.get("text"):
        add("patient_summary", ci.patient_summary["text"], ci.patient_summary.get("sources"))

    for s in (ci.symptoms or []):
        text = f"Symptom: {s.get('name')} — status: {s.get('current_status')}, severity: {s.get('severity')}"
        add("symptoms", text, s.get("sources"))

    for d in (ci.diagnoses or []):
        text = f"Diagnosis: {d.get('name')} — status: {d.get('status')}"
        if d.get("icd_code"):
            text += f" ({d['icd_code']})"
        add("diagnoses", text, d.get("sources"))

    for g in (ci.treatment_goals or []):
        text = f"Treatment goal: {g.get('goal')} — status: {g.get('status')}"
        add("treatment_goals", text, g.get("sources"))

    for r in (ci.relationships or []):
        text = f"Relationship: {r.get('person')} ({r.get('relationship_type')}), importance: {r.get('importance')}"
        if r.get("notes"):
            text += f" — {r['notes']}"
        add("relationships", text, r.get("sources"))

    for e in (ci.life_events or []):
        text = f"Life event: {e.get('event')} ({e.get('event_type')})"
        if e.get("description"):
            text += f" — {e['description']}"
        add("life_events", text, e.get("sources"))

    for rf in (ci.risk_factors or []):
        text = f"Risk factor: {rf.get('risk_type')} — status: {rf.get('status')}, severity: {rf.get('severity')}"
        add("risk_factors", text, rf.get("sources"))

    for q in (ci.outstanding_questions or []):
        status = "resolved" if q.get("resolved") else "open"
        text = f"Outstanding question ({status}): {q.get('question')}"
        add("outstanding_questions", text, q.get("sources"))

    for t in (ci.timeline or [])[-MAX_TIMELINE_ITEMS:]:
        text = f"Timeline — {t.get('date')}: {t.get('title')}"
        if t.get("description"):
            text += f" — {t['description']}"
        add("timeline", text, [{"source_type": t.get("source_type"), "source_id": t.get("source_id"), "date": t.get("date")}])

    context_text = "\n".join(f"[{e['key']}] {e['text']}" for e in entries)

    registry = {e["key"]: {"section": e["section"], "citations": e["citations"]} for e in entries}
    return context_text, registry, entries


def _strip_markers(text: str) -> str:
    """Remove [S#] markers before feeding a past turn back into the prompt.

    Reference keys are renumbered fresh from the *current* record on every
    request (a symptom approved between turn 3 and turn 5 shifts the
    numbering), so a marker from history can point at the wrong fact by the
    time it's replayed. The stored `content` keeps its markers for display;
    only this stripped copy goes into the prompt.
    """
    return _CITATION_RE.sub("", text).strip()


def clean_display_text(text: str) -> str:
    """Strip inline [S#] citation markers and markdown bold syntax from the
    model's raw answer for display. Citations are already pulled into
    structured chips by `_resolve_citations` - the inline markers are just
    plumbing for that, not something a practitioner should have to read
    past. Markdown bold (**text**) is stripped rather than rendered, since
    the chat bubble displays plain text - the goal is a normal
    conversational reply, not literal asterisks.

    Deliberately NOT applied to what gets stored/replayed as history (see
    `answer_clinical_question`/main.py) - the model reliably keeps including
    [S#] markers in new answers only if its own prior turns, fed back as
    history, still contain them. Only call this at the API response
    boundary, right before a message is shown to the practitioner.
    """
    text = re.sub(r"\s*\[S\d+\]", "", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def _resolve_citations(answer_text: str, registry: dict):
    """Parse [S#] markers out of the model's answer and resolve them through
    the registry built for *this* request. Unknown/hallucinated keys are
    silently dropped rather than surfaced - they can't be resolved to a real
    citation, so they're not evidence of anything either way."""
    seen = set()
    citations = []
    for match in _CITATION_RE.finditer(answer_text):
        key = f"S{match.group(1)}"
        entry = registry.get(key)
        if not entry:
            continue
        for c in entry["citations"]:
            dedupe_key = (c.get("source_type"), c.get("source_id"), entry["section"])
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            citations.append({**c, "section": entry["section"]})
    return citations


async def answer_clinical_question(
    question: str,
    patient_name: str,
    patient_age,
    patient_gender: str,
    patient_id: str,
    ci,
    history: list[dict],
) -> dict:
    """
    Returns {"content": str, "citations": list[dict], "grounded": bool}.
    `history` is [{role, content}], oldest first, already scoped to this
    patient by the caller (see main.py) - this function just formats it.
    """
    context_text, registry, entries = build_context(ci, patient_name, patient_age, patient_gender)

    if not OPENAI_API_KEY or OPENAI_API_KEY.startswith("sk-your"):
        answer_text = _mock_answer(question, entries, patient_name)
    else:
        answer_text = await _ai_answer(question, context_text, patient_name, patient_id, history)

    citations = _resolve_citations(answer_text, registry)
    return {
        # Raw text, markers intact - the caller stores this as-is (see
        # main.py) so future turns replay a consistent citing style back to
        # the model. clean_display_text() is applied only when a message is
        # actually returned to the practitioner.
        "content": answer_text,
        "citations": citations,
        "grounded": len(citations) > 0,
    }


async def _ai_answer(question: str, context_text: str, patient_name: str, patient_id: str, history: list[dict]) -> str:
    system_prompt = f"""You are a clinical assistant answering a practitioner's questions about ONE specific patient: {patient_name} (patient_id={patient_id}).

Rules:
- Only use facts from the CLINICAL RECORD below. Never use outside/general knowledge about this patient, and never reference or infer anything about any other patient.
- If the record doesn't contain the answer, say so plainly rather than guessing.
- This record reflects only practitioner-approved information. AI-suggested updates still awaiting review are intentionally excluded, so "no information" here doesn't mean nothing was ever suggested - just nothing confirmed yet.
- Write like you're speaking to a colleague, not writing a report - no markdown bold (no **text**) and no headers. Numbered or bulleted lists are fine when summarizing multiple distinct items (e.g. several sessions), one item per line.
- Every factual claim must end with the bracket reference(s) it came from - this is mandatory for every claim, no matter how short, simple, or obvious the answer feels, and with no exceptions for brevity or tone. Never write a factual sentence without one, including a one-line answer to a simple question. Examples of the required format:
  - Short answer: "Ravi is 27 years old [S1]."
  - Multi-item summary:
    1. On July 13, 2026, the patient reported improved sleep after starting the new routine [S12].
    2. On July 20, 2026, work-related anxiety had decreased noticeably [S13].
If a claim has no bracket reference to attach, do not state it as fact. The brackets are stripped before the practitioner sees your reply and rebuilt as citation chips underneath it, so always include them even though they won't appear as visible text.

CLINICAL RECORD:
{context_text}"""

    # Caller (main.py) already scopes history to MAX_HISTORY_TURNS via the DB
    # query limit; no need to re-slice here.
    messages = [{"role": "system", "content": system_prompt}]
    for turn in history:
        messages.append({"role": turn["role"], "content": _strip_markers(turn["content"])})
    if history:
        # Past assistant turns above have their [S#] markers stripped (they'd
        # point at stale registry numbers - see _strip_markers). Left alone,
        # the model reliably imitates that marker-free pattern in new
        # replies within the same conversation, overriding the system
        # instruction above. Re-assert it right before generation, closest
        # to where it matters, rather than relying on the system prompt to
        # still carry weight after several history turns.
        messages.append({
            "role": "system",
            "content": "Reminder: the assistant turns above had their [S#] "
            "brackets removed only for display in this history - that is "
            "not a style to imitate. Your new reply must still end every "
            "factual claim with its [S#] bracket, per the rules above.",
        })
    messages.append({"role": "user", "content": question})

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": messages,
                    "temperature": 0.2,
                    "max_tokens": 500,
                },
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"Clinical chat error: {e}")
        return "Sorry, I couldn't process that question right now. Please try again."


_IDENTITY_KEYWORDS = {"age", "old", "aged", "gender", "sex", "born", "birthday"}


def _mock_answer(question: str, entries: list[dict], patient_name: str) -> str:
    """Dev-mode fallback (no OPENAI_API_KEY configured). Does simple keyword
    matching against the same entries the real prompt would see, so both the
    grounded and ungrounded response paths are exercisable without a live
    API key."""
    # The patient's own name is near-universal in practitioner questions
    # ("how is Ravi's sleep?") and isn't diagnostic of *which* fact is being
    # asked about - without stripping it, the patient_record entry (which is
    # mostly just the name) would false-match ahead of the real answer.
    name_words = set(re.findall(r"[a-z]{4,}", patient_name.lower()))
    q_words = set(re.findall(r"[a-z]{4,}", question.lower())) - name_words
    # Identity keywords ("age", "old", "sex") are mostly under 4 letters, so
    # they'd never survive the length-filtered extraction above - check them
    # against the full unfiltered word set instead.
    q_words_all = set(re.findall(r"[a-z]+", question.lower()))

    for e in entries:
        if e["section"] == "patient_record":
            if q_words_all & _IDENTITY_KEYWORDS:
                return f"Based on {patient_name}'s record: {e['text']} [{e['key']}]"
            continue
        e_words = set(re.findall(r"[a-z]{4,}", e["text"].lower())) - name_words
        if q_words & e_words:
            return f"Based on {patient_name}'s record: {e['text']} [{e['key']}]"
    return f"I don't see anything in {patient_name}'s record that answers that."
