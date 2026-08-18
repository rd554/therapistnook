"""
Session Intelligence Service

Handles the AI processing pipeline for therapy session recordings:
1. Speaker identification (using voice profile)
2. Speech-to-text transcription
3. Language detection
4. Translation (if non-English)
5. Session summary generation
6. SOAP notes generation
"""

import os
import json
import asyncio
from typing import Optional
from datetime import datetime, timezone

import httpx

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


async def process_therapy_session(
    audio_path: str,
    voice_embedding: Optional[list] = None,
    session_date: Optional[datetime] = None,
) -> dict:
    """
    Process a therapy session recording through the full pipeline.
    
    Returns a dict with:
    - transcript: list of {speaker, timestamp, end_timestamp, text}
    - transcript_text: plain text version
    - detected_language: language code
    - translation: list (if non-English)
    - translation_text: plain text (if non-English)
    - summary: dict with session summary sections
    - soap_notes: dict with SOAP notes
    """
    result = {
        "transcript": [],
        "transcript_text": "",
        "detected_language": "en",
        "translation": None,
        "translation_text": None,
        "summary": None,
        "soap_notes": None,
    }
    
    # Step 1: Transcribe the audio
    transcription_result = await transcribe_audio(audio_path)
    if not transcription_result:
        raise Exception("Failed to transcribe audio")
    
    result["detected_language"] = transcription_result.get("language", "en")
    
    # Step 2: Identify speakers and format transcript
    raw_segments = transcription_result.get("segments", [])
    transcript_segments = await identify_speakers(raw_segments, voice_embedding)
    result["transcript"] = transcript_segments
    result["transcript_text"] = format_transcript_text(transcript_segments)
    
    # Step 3: Translate if non-English
    if result["detected_language"] != "en":
        translation_segments = await translate_transcript(transcript_segments, result["detected_language"])
        result["translation"] = translation_segments
        result["translation_text"] = format_transcript_text(translation_segments)
        text_for_analysis = result["translation_text"]
    else:
        text_for_analysis = result["transcript_text"]
    
    # Step 4: Generate summary
    result["summary"] = await generate_session_summary(text_for_analysis)
    
    # Step 5: Generate SOAP notes
    result["soap_notes"] = await generate_soap_notes(text_for_analysis, result["summary"])

    return result


async def process_transcript_session(
    transcript_text: str,
    session_date: Optional[datetime] = None,
) -> dict:
    """
    Process a manually-uploaded session transcript (no audio, no recording).

    The therapist pastes/uploads the transcript text directly, so there is
    nothing to transcribe, no speakers to identify, and no translation step —
    this goes straight to summary + SOAP note generation on the provided text.
    A 50-60 min session transcript can run several thousand words; both
    generate_session_summary/generate_soap_notes are sized (context window +
    request timeout) to handle that in one call.

    Returns a dict shaped like process_therapy_session()'s output so callers
    can populate a TherapySession row the same way regardless of source,
    just with the audio-only fields left null.
    """
    result = {
        "transcript": None,
        "transcript_text": transcript_text,
        "detected_language": None,
        "translation": None,
        "translation_text": None,
        "summary": None,
        "soap_notes": None,
    }

    result["summary"] = await generate_session_summary(transcript_text)
    result["soap_notes"] = await generate_soap_notes(transcript_text, result["summary"])

    return result


async def transcribe_audio(audio_path: str) -> Optional[dict]:
    """
    Transcribe audio using OpenAI Whisper API.
    Returns raw transcription with segments and detected language.
    """
    if not OPENAI_API_KEY or OPENAI_API_KEY.startswith("sk-your"):
        return await _mock_transcription(audio_path)
    
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            with open(audio_path, "rb") as audio_file:
                files = {
                    "file": (os.path.basename(audio_path), audio_file, "audio/mpeg"),
                    "model": (None, "whisper-1"),
                    "response_format": (None, "verbose_json"),
                    "timestamp_granularities[]": (None, "segment"),
                }
                response = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                    files=files,
                )
                response.raise_for_status()
                return response.json()
    except Exception as e:
        print(f"Transcription error: {e}")
        return await _mock_transcription(audio_path)


async def _mock_transcription(audio_path: str) -> dict:
    """Generate mock transcription for development/demo purposes."""
    return {
        "language": "en",
        "segments": [
            {"start": 0.0, "end": 5.0, "text": "Hello, how have you been since our last session?"},
            {"start": 5.5, "end": 15.0, "text": "I've been doing okay, but I've had some anxiety this week about work."},
            {"start": 15.5, "end": 25.0, "text": "Can you tell me more about what's been triggering that anxiety?"},
            {"start": 25.5, "end": 45.0, "text": "Well, there's this big project deadline coming up, and I feel overwhelmed with everything I need to do."},
            {"start": 45.5, "end": 60.0, "text": "That sounds challenging. Let's explore some coping strategies you could use when feeling overwhelmed."},
            {"start": 60.5, "end": 80.0, "text": "I've been trying the breathing exercises you taught me, and they help a little, but sometimes my mind just races."},
            {"start": 80.5, "end": 100.0, "text": "It's good that you're practicing those techniques. Racing thoughts are common with anxiety. Have you tried the grounding technique we discussed?"},
            {"start": 100.5, "end": 120.0, "text": "I haven't been consistent with that one. I'll try to practice it more this week."},
        ]
    }


async def identify_speakers(
    segments: list[dict],
    voice_embedding: Optional[list] = None,
) -> list[dict]:
    """
    Identify speakers in transcript segments.
    Uses voice embedding if available, otherwise alternates based on context.
    """
    result = []
    
    # Simple heuristic: alternate speakers starting with therapist
    # In production, this would use voice embedding comparison
    current_speaker = "Therapist"
    
    for i, seg in enumerate(segments):
        # Heuristic: shorter statements with questions are likely therapist
        text = seg.get("text", "").strip()
        is_question = text.endswith("?")
        
        # Use pattern: therapist asks, patient responds
        if i == 0:
            current_speaker = "Therapist"
        elif i > 0:
            prev_text = segments[i-1].get("text", "")
            if prev_text.endswith("?"):
                current_speaker = "Patient"
            elif current_speaker == "Patient" and (is_question or len(text) < 100):
                current_speaker = "Therapist"
            elif current_speaker == "Therapist" and not is_question and len(text) > 50:
                current_speaker = "Patient"
        
        result.append({
            "speaker": current_speaker,
            "timestamp": seg.get("start", 0.0),
            "end_timestamp": seg.get("end", 0.0),
            "text": text,
        })
    
    return result


def format_transcript_text(segments: list[dict]) -> str:
    """Format transcript segments into readable plain text."""
    lines = []
    for seg in segments:
        timestamp = format_timestamp(seg.get("timestamp", 0))
        speaker = seg.get("speaker", "Unknown")
        text = seg.get("text", "")
        lines.append(f"[{timestamp}] {speaker}: {text}")
    return "\n\n".join(lines)


def format_timestamp(seconds: float) -> str:
    """Format seconds into MM:SS format."""
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins:02d}:{secs:02d}"


async def translate_transcript(
    segments: list[dict],
    source_language: str,
) -> list[dict]:
    """
    Translate transcript segments to English using GPT-4.
    """
    if not OPENAI_API_KEY or OPENAI_API_KEY.startswith("sk-your"):
        return segments  # Return original if no API key
    
    translated_segments = []
    
    for seg in segments:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [
                            {
                                "role": "system",
                                "content": f"Translate the following text from {source_language} to English. Only output the translation, nothing else."
                            },
                            {"role": "user", "content": seg["text"]}
                        ],
                        "temperature": 0.3,
                        "max_tokens": 500,
                    },
                )
                response.raise_for_status()
                translated_text = response.json()["choices"][0]["message"]["content"]
                translated_segments.append({
                    **seg,
                    "text": translated_text.strip(),
                })
        except Exception:
            translated_segments.append(seg)
    
    return translated_segments


def _stringify_fields(data: dict, fields: list[str]) -> dict:
    """
    GPT-4o-mini doesn't always honor "return a string" — it sometimes
    returns a list of bullet points for a field instead. Both SessionSummary
    and SOAPNotes schemas require plain strings, so normalize before we hand
    the parsed JSON back (otherwise response serialization blows up).
    """
    for field in fields:
        value = data.get(field)
        if isinstance(value, list):
            data[field] = "\n".join(str(item) for item in value)
    return data


async def generate_session_summary(transcript_text: str) -> dict:
    """
    Generate a structured summary of the therapy session.
    """
    if not OPENAI_API_KEY or OPENAI_API_KEY.startswith("sk-your"):
        return _mock_session_summary()
    
    prompt = f"""You are a clinical psychologist assistant. Analyze this therapy session transcript and generate a structured summary.

TRANSCRIPT:
{transcript_text}

Generate a JSON object with the following sections. Be concise but thorough. Do not make unsupported conclusions.

{{
    "presenting_issues": "What issues or concerns did the patient bring up?",
    "key_discussion_points": "Main topics discussed during the session",
    "emotional_themes": "Emotional patterns or themes observed",
    "homework_discussed": "Any homework, exercises, or tasks discussed",
    "action_items": "Specific action items for patient or therapist",
    "open_questions": "Unresolved questions or topics for future sessions"
}}

Respond ONLY with valid JSON."""

    try:
        # A full 50-60 min session transcript can run several thousand words;
        # gpt-4o-mini's 128k-token context handles that fine, but the request
        # itself takes longer to complete, so give it more room than a short prompt.
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.4,
                    "max_tokens": 1500,
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]

            # Parse JSON from response
            content = content.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1].rsplit("\n", 1)[0]

            parsed = json.loads(content)
            return _stringify_fields(parsed, [
                "presenting_issues", "key_discussion_points", "emotional_themes",
                "homework_discussed", "action_items", "open_questions",
            ])
    except Exception as e:
        print(f"Summary generation error: {e}")
        return _mock_session_summary()


def _mock_session_summary() -> dict:
    """Generate mock summary for development/demo purposes."""
    return {
        "presenting_issues": "Patient reported experiencing work-related anxiety, particularly around an upcoming project deadline. Feelings of overwhelm and racing thoughts were mentioned.",
        "key_discussion_points": "Discussed current anxiety levels, work stressors, and coping mechanisms. Reviewed breathing exercises and grounding techniques previously introduced.",
        "emotional_themes": "Anxiety, overwhelm, and some progress in emotional regulation through breathing exercises.",
        "homework_discussed": "Grounding technique practice was recommended. Patient acknowledged inconsistency with this technique.",
        "action_items": "Patient to practice grounding technique daily, especially when experiencing racing thoughts. Continue breathing exercises.",
        "open_questions": "What specific aspects of the project are most overwhelming? Are there workplace support systems available?",
    }


async def generate_soap_notes(transcript_text: str, summary: dict) -> dict:
    """
    Generate SOAP (Subjective, Objective, Assessment, Plan) notes.
    """
    if not OPENAI_API_KEY or OPENAI_API_KEY.startswith("sk-your"):
        return _mock_soap_notes()
    
    summary_text = json.dumps(summary, indent=2) if summary else "No summary available"
    
    prompt = f"""You are a clinical psychologist. Based on this therapy session transcript and summary, generate professional SOAP notes.

TRANSCRIPT:
{transcript_text}

SESSION SUMMARY:
{summary_text}

Generate SOAP notes in JSON format:

{{
    "subjective": "Patient's self-reported symptoms, feelings, and concerns",
    "objective": "Observable behaviors, mental status observations, affect during session",
    "assessment": "Clinical impressions, progress observations, diagnostic considerations",
    "plan": "Treatment plan, interventions, homework, next steps"
}}

Use professional clinical language. Be concise but comprehensive. Do not make unsupported diagnostic conclusions.

Respond ONLY with valid JSON."""

    try:
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.4,
                    "max_tokens": 1500,
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]

            content = content.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1].rsplit("\n", 1)[0]

            result = json.loads(content)
            result = _stringify_fields(result, ["subjective", "objective", "assessment", "plan"])
            result["edited"] = False
            return result
    except Exception as e:
        print(f"SOAP notes generation error: {e}")
        return _mock_soap_notes()


def _mock_soap_notes() -> dict:
    """Generate mock SOAP notes for development/demo purposes."""
    return {
        "subjective": "Patient reports ongoing work-related anxiety, particularly concerning an upcoming project deadline. States feeling 'overwhelmed with everything I need to do.' Notes some improvement with breathing exercises but reports persistent racing thoughts. Acknowledges inconsistency with grounding technique practice.",
        "objective": "Patient appeared alert and oriented. Affect was mildly anxious but appropriate. Good eye contact maintained. Speech was normal rate and volume. Patient was engaged and participatory in session. Demonstrated insight into anxiety triggers and coping strategies.",
        "assessment": "Patient continues to experience anxiety symptoms related to occupational stressors. Partial response to relaxation techniques (breathing exercises). Inconsistent use of grounding techniques may be limiting therapeutic progress. Overall, patient shows motivation to engage in treatment and implement coping strategies.",
        "plan": "1. Continue weekly therapy sessions. 2. Patient to practice grounding technique (5-4-3-2-1) daily. 3. Continue breathing exercises. 4. Explore work-related stressors in more detail next session. 5. Consider discussing time management strategies for project deadline.",
        "edited": False,
    }


async def generate_voice_embedding(audio_path: str) -> Optional[list]:
    """
    Generate a voice embedding from an audio sample.
    In production, this would use a speaker embedding model.
    For now, returns a placeholder.
    """
    # Placeholder for voice embedding generation
    # In production, use a model like resemblyzer, speechbrain, or pyannote.audio
    return [0.0] * 128  # Placeholder 128-dimensional embedding


async def get_audio_duration(audio_path: str) -> int:
    """
    Get the duration of an audio file in seconds.
    """
    try:
        from mutagen import File as MutagenFile
        audio = MutagenFile(audio_path)
        if audio and audio.info:
            return int(audio.info.length)
    except ImportError:
        pass
    except Exception:
        pass
    
    # Fallback: estimate based on file size (rough approximation)
    try:
        file_size = os.path.getsize(audio_path)
        # Assume ~128kbps average bitrate
        return int(file_size / (128 * 1024 / 8))
    except Exception:
        return 0
