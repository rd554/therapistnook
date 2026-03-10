import os
import io
import math
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from dotenv import load_dotenv

load_dotenv()

from database import get_db, init_db
from models import Practitioner, Question, Session, Answer, Result
from schemas import (
    LoginRequest, LoginResponse,
    PractitionerCreate, PractitionerUpdate, PractitionerResponse,
    SessionCreate, SessionResponse, SessionListItem, ResumeRequest,
    QuestionsPage, QuestionResponse,
    AnswersBatch, ResultResponse, ScoreResult,
)
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_practitioner, require_owner,
    generate_ref_code, generate_resume_code,
)
from scoring import full_scoring_pipeline

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="MMPI-2 Assessment API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SCALE_LABELS = {
    "L": "L (Lie)",
    "F": "F (Infrequency)",
    "K": "K (Correction)",
    "1_Hs": "1-Hs (Hypochondriasis)",
    "2_D": "2-D (Depression)",
    "3_Hy": "3-Hy (Hysteria)",
    "4_Pd": "4-Pd (Psychopathic Deviate)",
    "5_Mf": "5-Mf (Masculinity-Femininity)",
    "6_Pa": "6-Pa (Paranoia)",
    "7_Pt": "7-Pt (Psychasthenia)",
    "8_Sc": "8-Sc (Schizophrenia)",
    "9_Ma": "9-Ma (Hypomania)",
    "0_Si": "0-Si (Social Introversion)",
}

CLINICAL_SCALE_ORDER = ["1_Hs", "2_D", "3_Hy", "4_Pd", "5_Mf", "6_Pa", "7_Pt", "8_Sc", "9_Ma", "0_Si"]
VALIDITY_SCALE_ORDER = ["L", "F", "K"]


def _compute_age(dob: date) -> int:
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


# ═════════════════════════════════════════════════════════════════════════════════
#  AUTH
# ═════════════════════════════════════════════════════════════════════════════════

@app.post("/api/auth/login", response_model=LoginResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    prac = (await db.execute(
        select(Practitioner).where(Practitioner.email == data.email)
    )).scalar_one_or_none()

    if not prac or not verify_password(data.password, prac.password_hash):
        raise HTTPException(401, "Invalid email or password")
    if not prac.is_active:
        raise HTTPException(403, "Account has been deactivated. Contact the administrator.")

    token = create_access_token(prac.id, prac.role)
    return LoginResponse(
        access_token=token, role=prac.role,
        name=prac.name, practitioner_id=prac.id,
    )


@app.get("/api/auth/me", response_model=PractitionerResponse)
async def get_me(prac=Depends(get_current_practitioner), db: AsyncSession = Depends(get_db)):
    count = (await db.execute(
        select(func.count(Session.id)).where(Session.practitioner_id == prac.id)
    )).scalar() or 0
    return PractitionerResponse(
        id=prac.id, name=prac.name, email=prac.email,
        role=prac.role, ref_code=prac.ref_code,
        is_active=prac.is_active, created_at=prac.created_at,
        session_count=count,
    )


# ═════════════════════════════════════════════════════════════════════════════════
#  ADMIN — Practitioner Management (Owner only)
# ═════════════════════════════════════════════════════════════════════════════════

@app.get("/api/admin/practitioners", response_model=list[PractitionerResponse])
async def list_practitioners(owner=Depends(require_owner), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Practitioner).order_by(Practitioner.created_at.desc())
    )).scalars().all()

    result = []
    for p in rows:
        count = (await db.execute(
            select(func.count(Session.id)).where(Session.practitioner_id == p.id)
        )).scalar() or 0
        result.append(PractitionerResponse(
            id=p.id, name=p.name, email=p.email,
            role=p.role, ref_code=p.ref_code,
            is_active=p.is_active, created_at=p.created_at,
            session_count=count,
        ))
    return result


@app.post("/api/admin/practitioners", response_model=PractitionerResponse)
async def create_practitioner(data: PractitionerCreate, owner=Depends(require_owner), db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(
        select(Practitioner).where(Practitioner.email == data.email)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Email already registered")

    ref = generate_ref_code()
    while (await db.execute(select(Practitioner).where(Practitioner.ref_code == ref))).scalar_one_or_none():
        ref = generate_ref_code()

    prac = Practitioner(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        role="practitioner",
        ref_code=ref,
    )
    db.add(prac)
    await db.commit()
    await db.refresh(prac)

    from email_service import send_practitioner_welcome
    send_practitioner_welcome(
        to_email=data.email,
        name=data.name,
        password=data.password,
        ref_code=ref,
    )

    return PractitionerResponse(
        id=prac.id, name=prac.name, email=prac.email,
        role=prac.role, ref_code=prac.ref_code,
        is_active=prac.is_active, created_at=prac.created_at,
        session_count=0,
    )


@app.patch("/api/admin/practitioners/{prac_id}", response_model=PractitionerResponse)
async def update_practitioner(prac_id: str, data: PractitionerUpdate, owner=Depends(require_owner), db: AsyncSession = Depends(get_db)):
    prac = await db.get(Practitioner, prac_id)
    if not prac:
        raise HTTPException(404, "Practitioner not found")

    if data.name is not None:
        prac.name = data.name
    if data.email is not None:
        prac.email = data.email
    if data.password is not None:
        prac.password_hash = hash_password(data.password)
    if data.is_active is not None:
        prac.is_active = data.is_active

    await db.commit()
    await db.refresh(prac)
    count = (await db.execute(
        select(func.count(Session.id)).where(Session.practitioner_id == prac.id)
    )).scalar() or 0
    return PractitionerResponse(
        id=prac.id, name=prac.name, email=prac.email,
        role=prac.role, ref_code=prac.ref_code,
        is_active=prac.is_active, created_at=prac.created_at,
        session_count=count,
    )


# ═════════════════════════════════════════════════════════════════════════════════
#  PATIENT-FACING — Sessions (no auth, uses ref_code / resume_code)
# ═════════════════════════════════════════════════════════════════════════════════

@app.get("/api/practitioner/by-ref/{ref_code}")
async def get_practitioner_by_ref(ref_code: str, db: AsyncSession = Depends(get_db)):
    prac = (await db.execute(
        select(Practitioner).where(Practitioner.ref_code == ref_code, Practitioner.is_active == True)
    )).scalar_one_or_none()
    if not prac:
        raise HTTPException(404, "Invalid or inactive test link")
    return {"name": prac.name, "ref_code": prac.ref_code}


@app.post("/api/patient/sessions", response_model=SessionResponse)
async def create_patient_session(data: SessionCreate, db: AsyncSession = Depends(get_db)):
    prac = (await db.execute(
        select(Practitioner).where(Practitioner.ref_code == data.ref_code, Practitioner.is_active == True)
    )).scalar_one_or_none()
    if not prac:
        raise HTTPException(404, "Invalid or inactive test link")

    code = generate_resume_code()
    while (await db.execute(select(Session).where(Session.resume_code == code))).scalar_one_or_none():
        code = generate_resume_code()

    session = Session(
        practitioner_id=prac.id,
        resume_code=code,
        name=data.name,
        dob=data.dob,
        gender=data.gender,
        nationality=data.nationality,
        education=data.education,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return SessionResponse(
        id=session.id, name=session.name, dob=session.dob,
        age=_compute_age(session.dob), gender=session.gender,
        nationality=session.nationality, education=session.education,
        created_at=session.created_at, completed=session.completed,
        answered_count=0, resume_code=session.resume_code,
    )


@app.post("/api/patient/resume", response_model=SessionResponse)
async def resume_session(data: ResumeRequest, db: AsyncSession = Depends(get_db)):
    session = (await db.execute(
        select(Session).where(Session.resume_code == data.resume_code.upper().strip())
    )).scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Invalid resume code. Please check and try again.")
    if session.completed:
        raise HTTPException(400, "This assessment has already been completed.")

    count = (await db.execute(
        select(func.count(Answer.id)).where(Answer.session_id == session.id)
    )).scalar() or 0

    return SessionResponse(
        id=session.id, name=session.name, dob=session.dob,
        age=_compute_age(session.dob), gender=session.gender,
        nationality=session.nationality, education=session.education,
        created_at=session.created_at, completed=session.completed,
        answered_count=count, resume_code=session.resume_code,
    )


# ═════════════════════════════════════════════════════════════════════════════════
#  QUESTIONS (public)
# ═════════════════════════════════════════════════════════════════════════════════

@app.get("/api/questions", response_model=QuestionsPage)
async def get_questions(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    total = (await db.execute(select(func.count(Question.id)))).scalar() or 0
    total_pages = max(1, math.ceil(total / per_page))
    offset = (page - 1) * per_page

    rows = (await db.execute(
        select(Question).order_by(Question.number).offset(offset).limit(per_page)
    )).scalars().all()

    return QuestionsPage(
        questions=[QuestionResponse(number=q.number, text=q.text) for q in rows],
        page=page, total_pages=total_pages, total_questions=total,
    )


# ═════════════════════════════════════════════════════════════════════════════════
#  ANSWERS (patient-facing, uses session_id)
# ═════════════════════════════════════════════════════════════════════════════════

@app.post("/api/patient/sessions/{session_id}/answers")
async def save_answers(session_id: str, batch: AnswersBatch, db: AsyncSession = Depends(get_db)):
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if session.completed:
        raise HTTPException(400, "Session already completed")

    q_numbers = [a.question_number for a in batch.answers]
    await db.execute(
        delete(Answer).where(Answer.session_id == session_id, Answer.question_number.in_(q_numbers))
    )
    for a in batch.answers:
        db.add(Answer(session_id=session_id, question_number=a.question_number, response=a.response))
    await db.commit()

    count = (await db.execute(
        select(func.count(Answer.id)).where(Answer.session_id == session_id)
    )).scalar() or 0
    return {"saved": len(batch.answers), "total_answered": count}


@app.get("/api/patient/sessions/{session_id}/answers")
async def get_answers(session_id: str, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Answer).where(Answer.session_id == session_id))).scalars().all()
    return {str(a.question_number): a.response for a in rows}


@app.post("/api/patient/sessions/{session_id}/finish", response_model=ScoreResult)
async def finish_session(session_id: str, db: AsyncSession = Depends(get_db)):
    """Patient finishes the test — score it and mark complete."""
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    rows = (await db.execute(select(Answer).where(Answer.session_id == session_id))).scalars().all()
    if len(rows) < 567:
        raise HTTPException(400, f"Only {len(rows)} of 567 answers submitted")

    answers = {a.question_number: a.response for a in rows}
    result = full_scoring_pipeline(answers, session.gender)

    await db.execute(delete(Result).where(Result.session_id == session_id))
    db.add(Result(
        session_id=session_id,
        raw_scores=result["raw_scores"],
        k_corrected_scores=result["k_corrected_scores"],
        t_scores=result["t_scores"],
    ))
    session.completed = True
    await db.commit()
    return ScoreResult(**result)


# ═════════════════════════════════════════════════════════════════════════════════
#  DASHBOARD — Practitioner views their sessions/results (auth required)
# ═════════════════════════════════════════════════════════════════════════════════

@app.get("/api/dashboard/sessions", response_model=list[SessionListItem])
async def list_my_sessions(prac=Depends(get_current_practitioner), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Session).where(Session.practitioner_id == prac.id).order_by(Session.created_at.desc())
    )).scalars().all()

    items = []
    for s in rows:
        count = (await db.execute(
            select(func.count(Answer.id)).where(Answer.session_id == s.id)
        )).scalar() or 0
        items.append(SessionListItem(
            id=s.id, name=s.name, dob=s.dob,
            age=_compute_age(s.dob), gender=s.gender,
            created_at=s.created_at, completed=s.completed,
            answered_count=count,
        ))
    return items


@app.get("/api/dashboard/sessions/{session_id}", response_model=ResultResponse)
async def get_session_results(session_id: str, prac=Depends(get_current_practitioner), db: AsyncSession = Depends(get_db)):
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    # Owner can see all; practitioners can see only their own
    if prac.role != "owner" and session.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")

    result = (await db.execute(
        select(Result).where(Result.session_id == session_id)
    )).scalar_one_or_none()
    if not result:
        raise HTTPException(404, "Results not yet available. Assessment may still be in progress.")

    t = result.t_scores
    profile = []
    for scale in VALIDITY_SCALE_ORDER + CLINICAL_SCALE_ORDER:
        profile.append({
            "scale": scale,
            "label": SCALE_LABELS.get(scale, scale),
            "t_score": t.get(scale, 50),
            "raw": result.raw_scores.get(scale, 0),
            "k_corrected": result.k_corrected_scores.get(scale, 0),
        })

    return ResultResponse(
        session_id=session_id,
        patient_name=session.name,
        patient_dob=session.dob,
        patient_age=_compute_age(session.dob),
        patient_gender=session.gender,
        raw_scores=result.raw_scores,
        k_corrected_scores=result.k_corrected_scores,
        t_scores=result.t_scores,
        interpretation=result.interpretation,
        profile_data=profile,
    )


@app.post("/api/dashboard/sessions/{session_id}/interpret")
async def interpret_results(session_id: str, prac=Depends(get_current_practitioner), db: AsyncSession = Depends(get_db)):
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if prac.role != "owner" and session.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")

    result = (await db.execute(
        select(Result).where(Result.session_id == session_id)
    )).scalar_one_or_none()
    if not result:
        raise HTTPException(404, "Score the session first")

    age = _compute_age(session.dob)
    t = result.t_scores

    elevated = [f"{SCALE_LABELS.get(s, s)}: T={t.get(s, 50)}"
                for s in CLINICAL_SCALE_ORDER if t.get(s, 50) >= 65]
    validity_summary = ", ".join(f"{s}={t.get(s, 50)}" for s in VALIDITY_SCALE_ORDER)

    prompt = f"""You are a licensed clinical psychologist interpreting an MMPI-2 profile.

Patient: {session.name}, Age: {age}, Gender: {session.gender}

Validity Scale T-Scores: {validity_summary}
Clinical Scale T-Scores:
{chr(10).join(f"  {SCALE_LABELS.get(s, s)}: T={t.get(s, 50)}" for s in CLINICAL_SCALE_ORDER)}

Clinically elevated scales (T≥65): {', '.join(elevated) if elevated else 'None'}

Provide a professional MMPI-2 narrative interpretation covering:
1. **Validity Assessment**: Comment on L, F, and K scales and whether the profile appears valid.
2. **Clinical Profile Summary**: Describe the overall pattern of elevations.
3. **Code Type Analysis**: Identify the two-point or three-point code type and its clinical significance.
4. **Scale-by-Scale Interpretation**: Briefly interpret each elevated clinical scale.
5. **Diagnostic Impressions**: Suggest possible diagnostic considerations (not formal diagnoses).
6. **Treatment Recommendations**: Suggest therapeutic approaches based on the profile.

Write in a professional clinical tone suitable for a psychological report."""

    if not OPENAI_API_KEY or OPENAI_API_KEY.startswith("sk-your"):
        interpretation = _generate_fallback_interpretation(session, age, t)
    else:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.4,
                        "max_tokens": 2000,
                    },
                )
                resp.raise_for_status()
                interpretation = resp.json()["choices"][0]["message"]["content"]
        except Exception:
            interpretation = _generate_fallback_interpretation(session, age, t)

    result.interpretation = interpretation
    await db.commit()
    return {"interpretation": interpretation}


def _generate_fallback_interpretation(session, age: int, t_scores: dict) -> str:
    elevated = [(s, t_scores.get(s, 50)) for s in CLINICAL_SCALE_ORDER if t_scores.get(s, 50) >= 65]

    validity_notes = []
    l_t, f_t, k_t = t_scores.get("L", 50), t_scores.get("F", 50), t_scores.get("K", 50)

    if f_t > 80:
        validity_notes.append("The elevated F scale suggests possible over-reporting of symptoms, a cry for help, or random responding.")
    elif f_t < 45:
        validity_notes.append("The low F scale suggests a tendency to under-report psychological difficulties.")
    if l_t > 65:
        validity_notes.append("The elevated L scale indicates a tendency to present oneself in an overly favorable light.")
    if k_t > 65:
        validity_notes.append("The elevated K scale suggests psychological defensiveness or a reluctance to disclose personal difficulties.")
    elif k_t < 40:
        validity_notes.append("The low K scale suggests openness to admitting problems or possible lack of personal resources.")
    if not validity_notes:
        validity_notes.append("The validity scales are within normal limits, suggesting a valid and interpretable profile.")

    sections = [
        "## MMPI-2 Clinical Interpretation Report\n",
        f"**Patient:** {session.name} | **Age:** {age} | **Gender:** {session.gender}\n",
        "### 1. Validity Assessment\n" + "\n".join(validity_notes),
    ]

    if elevated:
        desc = ", ".join(f"{SCALE_LABELS.get(s, s)} (T={ts})" for s, ts in elevated)
        sections.append(f"### 2. Clinical Profile Summary\nThe following scales are clinically elevated (T≥65): {desc}. These elevations suggest areas of significant psychological concern that warrant clinical attention.")
    else:
        sections.append("### 2. Clinical Profile Summary\nNo clinical scales reach the threshold for clinical significance (T≥65). The profile suggests relatively typical psychological functioning.")

    if len(elevated) >= 2:
        code = "-".join(s.split("_")[0] for s, _ in sorted(elevated, key=lambda x: -x[1])[:2])
        sections.append(f"### 3. Code Type Analysis\nThe two-point code type is **{code}**. This configuration should be interpreted in the context of the patient's presenting concerns and clinical history.")
    else:
        sections.append("### 3. Code Type Analysis\nA clear two-point code type is not present given the current elevation pattern.")

    sections.append("### 4. Diagnostic Impressions\nFormal diagnostic conclusions should integrate this MMPI-2 data with clinical interview findings, behavioral observations, and collateral information.")
    sections.append("### 5. Treatment Recommendations\nTreatment planning should address the identified areas of elevation. Individual psychotherapy is recommended. Regular reassessment of symptoms is advisable.")
    sections.append("\n---\n*Note: This is an automated preliminary interpretation. Configure an OpenAI API key for a comprehensive AI-generated report.*")

    return "\n\n".join(sections)


# ═════════════════════════════════════════════════════════════════════════════════
#  PDF REPORT (auth required)
# ═════════════════════════════════════════════════════════════════════════════════

@app.get("/api/dashboard/sessions/{session_id}/report/pdf")
async def generate_pdf(session_id: str, token: str = Query(...), db: AsyncSession = Depends(get_db)):
    from auth import decode_token
    payload = decode_token(token)
    prac = await db.get(Practitioner, payload["sub"])
    if not prac or not prac.is_active:
        raise HTTPException(401, "Invalid token")

    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if prac.role != "owner" and session.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")

    result = (await db.execute(
        select(Result).where(Result.session_id == session_id)
    )).scalar_one_or_none()
    if not result:
        raise HTTPException(404, "Score the session first")

    age = _compute_age(session.dob)
    t = result.t_scores

    from fpdf import FPDF

    class PDF(FPDF):
        def header(self):
            self.set_font("Helvetica", "B", 14)
            self.cell(0, 10, "MMPI-2 Assessment Report", new_x="LMARGIN", new_y="NEXT", align="C")
            self.set_draw_color(41, 98, 255)
            self.set_line_width(0.5)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(5)

        def footer(self):
            self.set_y(-15)
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(128, 128, 128)
            self.cell(0, 10, f"Page {self.page_no()}/{{nb}} | Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", align="C")

    pdf = PDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "Patient Information", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    for line in [
        f"Name: {session.name}",
        f"DOB: {session.dob.strftime('%B %d, %Y')}  |  Age: {age}  |  Gender: {session.gender}",
        f"Nationality: {session.nationality}  |  Education: {session.education}",
        f"Assessment Date: {session.created_at.strftime('%B %d, %Y') if session.created_at else 'N/A'}",
    ]:
        pdf.cell(0, 6, line, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "Scale Scores", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 9)

    col_widths = [60, 30, 35, 35]
    for i, h in enumerate(["Scale", "Raw", "K-Corrected", "T-Score"]):
        pdf.cell(col_widths[i], 7, h, border=1, align="C")
    pdf.ln()

    pdf.set_font("Helvetica", "", 9)
    for scale in VALIDITY_SCALE_ORDER + CLINICAL_SCALE_ORDER:
        label = SCALE_LABELS.get(scale, scale)
        raw = result.raw_scores.get(scale, "-")
        kc = result.k_corrected_scores.get(scale, "-")
        ts = t.get(scale, "-")
        fmt = lambda v: f"{v:.1f}" if isinstance(v, float) else str(v)
        pdf.cell(col_widths[0], 6, label, border=1)
        pdf.cell(col_widths[1], 6, fmt(raw), border=1, align="C")
        pdf.cell(col_widths[2], 6, fmt(kc), border=1, align="C")
        pdf.cell(col_widths[3], 6, fmt(ts), border=1, align="C")
        pdf.ln()
    pdf.ln(6)

    if result.interpretation:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, "Clinical Interpretation", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        text = result.interpretation.replace("##", "").replace("**", "").replace("*", "")
        for line in text.split("\n"):
            line = line.strip()
            if line:
                pdf.multi_cell(0, 5, line)
                pdf.ln(1)

    buf = io.BytesIO()
    pdf.output(buf)
    buf.seek(0)

    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=MMPI2_Report_{session.name.replace(' ', '_')}_{session_id[:8]}.pdf"},
    )


# ═════════════════════════════════════════════════════════════════════════════════
#  HEALTH
# ═════════════════════════════════════════════════════════════════════════════════

@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}
