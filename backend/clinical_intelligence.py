"""
Clinical Intelligence Service

The central intelligence layer for patient data. Processes all sources
(clinical history, documents, assessments, sessions) to maintain a
continuously updated understanding of each patient.

Key principles:
- Every insight must be traceable to a source
- Never fabricate information
- Maintain history, never simply overwrite
- AI updates require practitioner review
"""

import os
import json
import uuid
from typing import Optional, Any
from datetime import datetime, timezone

import httpx

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


def generate_uuid():
    return str(uuid.uuid4())


async def process_clinical_history(
    patient_id: str,
    clinical_history: dict,
    existing_intelligence: Optional[dict] = None,
) -> list[dict]:
    """
    Process clinical history data and generate intelligence updates.
    
    Returns list of proposed updates for practitioner review.
    """
    updates = []
    source_info = {
        "source_type": "clinical_history",
        "source_id": clinical_history.get("id", patient_id),
    }
    
    # Extract information from each section
    if clinical_history.get("presenting_complaint"):
        updates.extend(await _extract_from_presenting_complaint(
            clinical_history["presenting_complaint"],
            source_info,
            existing_intelligence,
        ))
    
    if clinical_history.get("history_present_illness"):
        updates.extend(await _extract_from_history_present_illness(
            clinical_history["history_present_illness"],
            source_info,
            existing_intelligence,
        ))
    
    if clinical_history.get("medical_history"):
        updates.extend(await _extract_from_medical_history(
            clinical_history["medical_history"],
            source_info,
            existing_intelligence,
        ))
    
    if clinical_history.get("family_history"):
        updates.extend(await _extract_from_family_history(
            clinical_history["family_history"],
            source_info,
            existing_intelligence,
        ))
    
    if clinical_history.get("personal_history"):
        updates.extend(await _extract_from_personal_history(
            clinical_history["personal_history"],
            source_info,
            existing_intelligence,
        ))
    
    if clinical_history.get("relationship_history"):
        updates.extend(await _extract_from_relationship_history(
            clinical_history["relationship_history"],
            source_info,
            existing_intelligence,
        ))
    
    if clinical_history.get("substance_use"):
        updates.extend(await _extract_from_substance_use(
            clinical_history["substance_use"],
            source_info,
            existing_intelligence,
        ))
    
    if clinical_history.get("trauma_history"):
        updates.extend(await _extract_from_trauma_history(
            clinical_history["trauma_history"],
            source_info,
            existing_intelligence,
        ))
    
    if clinical_history.get("risk_assessment"):
        updates.extend(await _extract_from_risk_assessment(
            clinical_history["risk_assessment"],
            source_info,
            existing_intelligence,
        ))
    
    # Generate patient summary from all data
    summary_update = await _generate_patient_summary(
        clinical_history,
        source_info,
        existing_intelligence,
    )
    if summary_update:
        updates.append(summary_update)
    
    return updates


async def process_therapy_session(
    session_data: dict,
    existing_intelligence: Optional[dict] = None,
) -> list[dict]:
    """
    Process therapy session data and generate intelligence updates.
    """
    updates = []
    source_info = {
        "source_type": "therapy_session",
        "source_id": session_data.get("id"),
    }
    
    # Combine transcript and summary for analysis
    text_content = ""
    if session_data.get("transcript_text"):
        text_content = session_data["transcript_text"]
    if session_data.get("translation_text"):
        text_content = session_data["translation_text"]
    
    summary = session_data.get("summary", {})
    soap = session_data.get("soap_notes", {})
    
    if not text_content and not summary:
        return updates
    
    # Use AI to extract clinical information
    extraction = await _extract_session_intelligence(
        text_content,
        summary,
        soap,
        source_info,
        existing_intelligence,
    )
    
    updates.extend(extraction)
    
    # Add timeline entry for this session
    session_date = session_data.get("session_date", datetime.now(timezone.utc))
    if isinstance(session_date, str):
        session_date = datetime.fromisoformat(session_date.replace("Z", "+00:00"))
    
    timeline_update = {
        "update_type": "timeline",
        "section": "timeline",
        "operation": "add",
        "proposed_changes": {
            "id": generate_uuid(),
            "date": session_date.isoformat(),
            "event_type": "session",
            "title": f"Therapy Session",
            "description": summary.get("presenting_issues", "Session recorded"),
            "source_type": "therapy_session",
            "source_id": session_data.get("id"),
            "importance": "medium",
        },
        "source_type": source_info["source_type"],
        "source_id": source_info["source_id"],
        "confidence": "high",
        "reasoning": "Recording of therapy session",
        "auto_apply": True,
    }
    updates.append(timeline_update)
    
    return updates


async def process_assessment(
    assessment_data: dict,
    result_data: Optional[dict] = None,
    existing_intelligence: Optional[dict] = None,
) -> list[dict]:
    """
    Process assessment data and generate intelligence updates.
    """
    updates = []
    source_info = {
        "source_type": "assessment",
        "source_id": assessment_data.get("id"),
    }
    
    assessment_type = assessment_data.get("assessment_type", "unknown")
    
    # Add timeline entry
    completion_date = assessment_data.get("completion_date") or assessment_data.get("created_at")
    if isinstance(completion_date, str):
        completion_date = datetime.fromisoformat(completion_date.replace("Z", "+00:00"))
    elif not completion_date:
        completion_date = datetime.now(timezone.utc)
    
    timeline_update = {
        "update_type": "timeline",
        "section": "timeline",
        "operation": "add",
        "proposed_changes": {
            "id": generate_uuid(),
            "date": completion_date.isoformat(),
            "event_type": "assessment",
            "title": f"{assessment_type.upper()} Assessment",
            "description": assessment_data.get("display_name", "Assessment completed"),
            "source_type": "assessment",
            "source_id": assessment_data.get("id"),
            "importance": "high",
        },
        "source_type": source_info["source_type"],
        "source_id": source_info["source_id"],
        "confidence": "high",
        "reasoning": "Assessment completion recorded",
        "auto_apply": True,
    }
    updates.append(timeline_update)
    
    # Process MMPI results if available
    if assessment_type == "mmpi2" and result_data:
        updates.extend(await _process_mmpi_results(
            result_data,
            source_info,
            existing_intelligence,
        ))
    
    return updates


async def process_mmpi_interpretation(
    session_data: dict,
    result_data: dict,
    interpretation: str,
    existing_intelligence: Optional[dict] = None,
) -> list[dict]:
    """
    Process MMPI interpretation and generate intelligence updates.
    """
    updates = []
    source_info = {
        "source_type": "mmpi_result",
        "source_id": result_data.get("session_id"),
    }
    
    # Extract clinical insights from interpretation
    extraction = await _extract_mmpi_intelligence(
        result_data,
        interpretation,
        source_info,
        existing_intelligence,
    )
    
    updates.extend(extraction)
    
    return updates


async def process_document(
    document_data: dict,
    extracted_text: Optional[str] = None,
    existing_intelligence: Optional[dict] = None,
) -> list[dict]:
    """
    Process clinical document and generate intelligence updates.
    """
    updates = []
    source_info = {
        "source_type": "clinical_document",
        "source_id": document_data.get("id"),
    }
    
    # Add timeline entry for document upload
    created_at = document_data.get("created_at", datetime.now(timezone.utc))
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    
    category = document_data.get("category", "other")
    display_name = document_data.get("display_name", "Document")
    
    timeline_update = {
        "update_type": "timeline",
        "section": "timeline",
        "operation": "add",
        "proposed_changes": {
            "id": generate_uuid(),
            "date": created_at.isoformat(),
            "event_type": "report",
            "title": f"{category.replace('_', ' ').title()}",
            "description": display_name,
            "source_type": "clinical_document",
            "source_id": document_data.get("id"),
            "importance": "medium",
        },
        "source_type": source_info["source_type"],
        "source_id": source_info["source_id"],
        "confidence": "high",
        "reasoning": "Document upload recorded",
        "auto_apply": True,
    }
    updates.append(timeline_update)
    
    # If we have extracted text, analyze it
    if extracted_text:
        extraction = await _extract_document_intelligence(
            extracted_text,
            document_data,
            source_info,
            existing_intelligence,
        )
        updates.extend(extraction)
    
    return updates


# ═══════════════════════════════════════════════════════════════════════════════
#  EXTRACTION HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

async def _extract_from_presenting_complaint(
    data: dict,
    source_info: dict,
    existing: Optional[dict],
) -> list[dict]:
    """Extract symptoms from presenting complaint."""
    updates = []
    now = datetime.now(timezone.utc).isoformat()
    
    chief_complaint = data.get("chief_complaint", "")
    if chief_complaint:
        # Create symptom entry
        severity_map = {1: "mild", 2: "mild", 3: "mild", 4: "moderate", 5: "moderate", 
                       6: "moderate", 7: "severe", 8: "severe", 9: "severe", 10: "severe"}
        severity = severity_map.get(data.get("severity", 5), "moderate")
        
        updates.append({
            "update_type": "symptom",
            "section": "symptoms",
            "operation": "add",
            "proposed_changes": {
                "id": generate_uuid(),
                "name": chief_complaint,
                "current_status": "active",
                "severity": severity,
                "first_mention": now,
                "last_updated": now,
                "history": [{"status": "active", "severity": severity, "date": now, "source": "Clinical History"}],
                "sources": [{
                    "source_type": source_info["source_type"],
                    "source_id": source_info["source_id"],
                    "excerpt": f"Chief complaint: {chief_complaint}",
                    "date": now,
                }],
                "confidence": "high",
            },
            "source_type": source_info["source_type"],
            "source_id": source_info["source_id"],
            "source_excerpt": f"Chief complaint: {chief_complaint}",
            "confidence": "high",
            "reasoning": "Extracted from presenting complaint section of clinical history",
            "auto_apply": False,
        })
    
    return updates


async def _extract_from_history_present_illness(
    data: dict,
    source_info: dict,
    existing: Optional[dict],
) -> list[dict]:
    """Extract diagnoses and history from HPI."""
    updates = []
    now = datetime.now(timezone.utc).isoformat()
    
    # Previous diagnoses
    previous_diagnoses = data.get("previous_diagnoses", "")
    if previous_diagnoses:
        updates.append({
            "update_type": "diagnosis",
            "section": "diagnoses",
            "operation": "add",
            "proposed_changes": {
                "id": generate_uuid(),
                "name": previous_diagnoses,
                "status": "historical",
                "last_updated": now,
                "sources": [{
                    "source_type": source_info["source_type"],
                    "source_id": source_info["source_id"],
                    "excerpt": f"Previous diagnosis: {previous_diagnoses}",
                    "date": now,
                }],
                "confidence": "high",
            },
            "source_type": source_info["source_type"],
            "source_id": source_info["source_id"],
            "source_excerpt": f"Previous diagnosis: {previous_diagnoses}",
            "confidence": "high",
            "reasoning": "Extracted from history of present illness",
            "auto_apply": False,
        })
    
    # Hospitalisations as life events
    hospitalisations = data.get("hospitalisations", "")
    if hospitalisations:
        updates.append({
            "update_type": "life_event",
            "section": "life_events",
            "operation": "add",
            "proposed_changes": {
                "id": generate_uuid(),
                "event": "Hospitalisation",
                "event_type": "hospitalization",
                "description": hospitalisations,
                "sources": [{
                    "source_type": source_info["source_type"],
                    "source_id": source_info["source_id"],
                    "excerpt": hospitalisations,
                    "date": now,
                }],
                "confidence": "medium",
            },
            "source_type": source_info["source_type"],
            "source_id": source_info["source_id"],
            "source_excerpt": hospitalisations,
            "confidence": "medium",
            "reasoning": "Hospitalisation history extracted from HPI",
            "auto_apply": False,
        })
    
    return updates


async def _extract_from_medical_history(
    data: dict,
    source_info: dict,
    existing: Optional[dict],
) -> list[dict]:
    """Extract medical conditions."""
    updates = []
    now = datetime.now(timezone.utc).isoformat()
    
    # Medical conditions
    conditions = data.get("medical_conditions", "")
    if conditions:
        updates.append({
            "update_type": "diagnosis",
            "section": "diagnoses",
            "operation": "add",
            "proposed_changes": {
                "id": generate_uuid(),
                "name": f"Medical: {conditions}",
                "status": "current",
                "last_updated": now,
                "sources": [{
                    "source_type": source_info["source_type"],
                    "source_id": source_info["source_id"],
                    "excerpt": f"Medical conditions: {conditions}",
                    "date": now,
                }],
                "confidence": "high",
            },
            "source_type": source_info["source_type"],
            "source_id": source_info["source_id"],
            "source_excerpt": f"Medical conditions: {conditions}",
            "confidence": "high",
            "reasoning": "Medical conditions from medical history",
            "auto_apply": False,
        })
    
    # Neurological conditions
    neuro = data.get("neurological_conditions", "")
    if neuro:
        updates.append({
            "update_type": "diagnosis",
            "section": "diagnoses",
            "operation": "add",
            "proposed_changes": {
                "id": generate_uuid(),
                "name": f"Neurological: {neuro}",
                "status": "current",
                "last_updated": now,
                "sources": [{
                    "source_type": source_info["source_type"],
                    "source_id": source_info["source_id"],
                    "excerpt": f"Neurological conditions: {neuro}",
                    "date": now,
                }],
                "confidence": "high",
            },
            "source_type": source_info["source_type"],
            "source_id": source_info["source_id"],
            "source_excerpt": f"Neurological conditions: {neuro}",
            "confidence": "high",
            "reasoning": "Neurological conditions from medical history",
            "auto_apply": False,
        })
    
    return updates


async def _extract_from_family_history(
    data: dict,
    source_info: dict,
    existing: Optional[dict],
) -> list[dict]:
    """Extract family relationships."""
    updates = []
    now = datetime.now(timezone.utc).isoformat()
    
    family_members = data.get("family_members", [])
    for member in family_members:
        if not member:
            continue
        relation = member.get("relation", "Unknown")
        conditions = member.get("conditions", [])
        quality = member.get("relationship_quality", "")
        notes = member.get("notes", "")
        
        condition_text = ", ".join(conditions) if conditions else "No known conditions"
        
        updates.append({
            "update_type": "relationship",
            "section": "relationships",
            "operation": "add",
            "proposed_changes": {
                "id": generate_uuid(),
                "person": relation,
                "relationship_type": relation.lower(),
                "importance": "high" if quality in ["good", "close"] else "medium",
                "notes": f"Conditions: {condition_text}. {notes}".strip(),
                "first_mention": now,
                "last_updated": now,
                "sources": [{
                    "source_type": source_info["source_type"],
                    "source_id": source_info["source_id"],
                    "excerpt": f"Family member: {relation}",
                    "date": now,
                }],
                "confidence": "high",
            },
            "source_type": source_info["source_type"],
            "source_id": source_info["source_id"],
            "source_excerpt": f"Family member: {relation}",
            "confidence": "high",
            "reasoning": "Family relationship from family history",
            "auto_apply": True,
        })
    
    return updates


async def _extract_from_personal_history(
    data: dict,
    source_info: dict,
    existing: Optional[dict],
) -> list[dict]:
    """Extract life events from personal history."""
    updates = []
    now = datetime.now(timezone.utc).isoformat()
    
    # Occupation changes
    occupation = data.get("occupation", "")
    if occupation:
        updates.append({
            "update_type": "life_event",
            "section": "life_events",
            "operation": "add",
            "proposed_changes": {
                "id": generate_uuid(),
                "event": "Occupation",
                "event_type": "job_change",
                "description": f"Current occupation: {occupation}",
                "sources": [{
                    "source_type": source_info["source_type"],
                    "source_id": source_info["source_id"],
                    "excerpt": f"Occupation: {occupation}",
                    "date": now,
                }],
                "confidence": "high",
            },
            "source_type": source_info["source_type"],
            "source_id": source_info["source_id"],
            "source_excerpt": f"Occupation: {occupation}",
            "confidence": "high",
            "reasoning": "Occupation from personal history",
            "auto_apply": True,
        })
    
    return updates


async def _extract_from_relationship_history(
    data: dict,
    source_info: dict,
    existing: Optional[dict],
) -> list[dict]:
    """Extract relationship information."""
    updates = []
    now = datetime.now(timezone.utc).isoformat()
    
    marital_status = data.get("marital_status", "")
    if marital_status:
        # Marital status can indicate life events
        event_type = "other"
        if marital_status in ["married", "civil_partnership"]:
            event_type = "marriage"
        elif marital_status in ["divorced", "separated"]:
            event_type = "divorce"
        elif marital_status == "widowed":
            event_type = "bereavement"
        
        if event_type != "other":
            updates.append({
                "update_type": "life_event",
                "section": "life_events",
                "operation": "add",
                "proposed_changes": {
                    "id": generate_uuid(),
                    "event": marital_status.replace("_", " ").title(),
                    "event_type": event_type,
                    "description": f"Marital status: {marital_status}",
                    "sources": [{
                        "source_type": source_info["source_type"],
                        "source_id": source_info["source_id"],
                        "excerpt": f"Marital status: {marital_status}",
                        "date": now,
                    }],
                    "confidence": "high",
                },
                "source_type": source_info["source_type"],
                "source_id": source_info["source_id"],
                "source_excerpt": f"Marital status: {marital_status}",
                "confidence": "high",
                "reasoning": "Life event inferred from marital status",
                "auto_apply": True,
            })
    
    return updates


async def _extract_from_substance_use(
    data: dict,
    source_info: dict,
    existing: Optional[dict],
) -> list[dict]:
    """Extract substance use risk factors."""
    updates = []
    now = datetime.now(timezone.utc).isoformat()
    
    for substance in ["alcohol", "smoking", "tobacco", "drugs"]:
        substance_data = data.get(substance, {})
        if substance_data and substance_data.get("use"):
            frequency = substance_data.get("frequency", "unknown")
            
            # Determine severity based on frequency
            severity = "low"
            if frequency in ["daily", "heavy"]:
                severity = "high"
            elif frequency in ["weekly", "moderate"]:
                severity = "moderate"
            
            updates.append({
                "update_type": "risk_factor",
                "section": "risk_factors",
                "operation": "add",
                "proposed_changes": {
                    "id": generate_uuid(),
                    "risk_type": "substance_abuse",
                    "status": "current",
                    "severity": severity,
                    "first_identified": now,
                    "last_updated": now,
                    "history": [{"status": "current", "severity": severity, "date": now, "source": "Clinical History"}],
                    "sources": [{
                        "source_type": source_info["source_type"],
                        "source_id": source_info["source_id"],
                        "excerpt": f"{substance.title()} use: {frequency}",
                        "date": now,
                    }],
                    "confidence": "high",
                },
                "source_type": source_info["source_type"],
                "source_id": source_info["source_id"],
                "source_excerpt": f"{substance.title()} use: {frequency}",
                "confidence": "high",
                "reasoning": f"{substance.title()} use identified in substance history",
                "auto_apply": False,
            })
    
    return updates


async def _extract_from_trauma_history(
    data: dict,
    source_info: dict,
    existing: Optional[dict],
) -> list[dict]:
    """Extract trauma-related life events."""
    updates = []
    now = datetime.now(timezone.utc).isoformat()
    
    trauma_types = [
        ("major_life_events", "trauma", "Major life event"),
        ("physical_abuse", "trauma", "Physical abuse history"),
        ("sexual_abuse", "trauma", "Sexual abuse history"),
        ("emotional_abuse", "trauma", "Emotional abuse history"),
        ("accidents", "trauma", "Accident history"),
        ("bereavement", "bereavement", "Bereavement"),
        ("bullying", "trauma", "Bullying history"),
        ("other_trauma", "trauma", "Other trauma"),
    ]
    
    for field, event_type, description in trauma_types:
        value = data.get(field, "")
        if value:
            updates.append({
                "update_type": "life_event",
                "section": "life_events",
                "operation": "add",
                "proposed_changes": {
                    "id": generate_uuid(),
                    "event": description,
                    "event_type": event_type,
                    "description": value if isinstance(value, str) else str(value),
                    "impact": "significant",
                    "sources": [{
                        "source_type": source_info["source_type"],
                        "source_id": source_info["source_id"],
                        "excerpt": f"{description}: {value}",
                        "date": now,
                    }],
                    "confidence": "high",
                },
                "source_type": source_info["source_type"],
                "source_id": source_info["source_id"],
                "source_excerpt": f"{description}: {value}",
                "confidence": "high",
                "reasoning": f"Trauma history: {description}",
                "auto_apply": False,
            })
    
    return updates


async def _extract_from_risk_assessment(
    data: dict,
    source_info: dict,
    existing: Optional[dict],
) -> list[dict]:
    """Extract risk factors from risk assessment."""
    updates = []
    now = datetime.now(timezone.utc).isoformat()
    
    risk_types = [
        ("suicide_risk", "suicide"),
        ("self_harm", "self_harm"),
        ("violence", "violence"),
        ("abuse", "other"),
        ("neglect", "other"),
    ]
    
    for field, risk_type in risk_types:
        risk_data = data.get(field, {})
        if risk_data and risk_data.get("present"):
            level = risk_data.get("level", "low")
            notes = risk_data.get("notes", "")
            
            # Map levels
            severity_map = {"low": "low", "moderate": "moderate", "high": "high", "severe": "critical"}
            severity = severity_map.get(level, "low")
            
            updates.append({
                "update_type": "risk_factor",
                "section": "risk_factors",
                "operation": "add",
                "proposed_changes": {
                    "id": generate_uuid(),
                    "risk_type": risk_type,
                    "status": "current",
                    "severity": severity,
                    "first_identified": now,
                    "last_updated": now,
                    "last_assessment": now,
                    "history": [{
                        "status": "current",
                        "severity": severity,
                        "date": now,
                        "source": "Clinical History",
                        "note": notes,
                    }],
                    "sources": [{
                        "source_type": source_info["source_type"],
                        "source_id": source_info["source_id"],
                        "excerpt": f"{field.replace('_', ' ').title()}: {level}. {notes}",
                        "date": now,
                    }],
                    "confidence": "high",
                },
                "source_type": source_info["source_type"],
                "source_id": source_info["source_id"],
                "source_excerpt": f"{field.replace('_', ' ').title()}: {level}",
                "confidence": "high",
                "reasoning": f"Risk assessment: {field.replace('_', ' ')}",
                "auto_apply": False,
            })
    
    return updates


async def _generate_patient_summary(
    clinical_history: dict,
    source_info: dict,
    existing: Optional[dict],
) -> Optional[dict]:
    """Generate or update patient summary using AI."""
    # Gather all available information
    sections = []
    
    if clinical_history.get("presenting_complaint"):
        pc = clinical_history["presenting_complaint"]
        sections.append(f"Presenting Complaint: {pc.get('chief_complaint', 'Not specified')}")
    
    if clinical_history.get("history_present_illness"):
        hpi = clinical_history["history_present_illness"]
        if hpi.get("previous_diagnoses"):
            sections.append(f"Previous Diagnoses: {hpi['previous_diagnoses']}")
    
    if clinical_history.get("medical_history"):
        mh = clinical_history["medical_history"]
        if mh.get("medical_conditions"):
            sections.append(f"Medical Conditions: {mh['medical_conditions']}")
    
    if clinical_history.get("risk_assessment"):
        ra = clinical_history["risk_assessment"]
        risks = []
        for risk_type in ["suicide_risk", "self_harm", "violence"]:
            risk_data = ra.get(risk_type, {})
            if risk_data.get("present"):
                risks.append(f"{risk_type.replace('_', ' ')}: {risk_data.get('level', 'present')}")
        if risks:
            sections.append(f"Risk Factors: {', '.join(risks)}")
    
    if not sections:
        return None
    
    # Build summary using AI
    summary_text = await _ai_generate_summary(sections, existing)
    now = datetime.now(timezone.utc).isoformat()
    
    return {
        "update_type": "summary",
        "section": "patient_summary",
        "operation": "update",
        "proposed_changes": {
            "text": summary_text,
            "last_updated": now,
            "sources": [{
                "source_type": source_info["source_type"],
                "source_id": source_info["source_id"],
                "date": now,
            }],
        },
        "source_type": source_info["source_type"],
        "source_id": source_info["source_id"],
        "confidence": "medium",
        "reasoning": "Summary generated from clinical history",
        "auto_apply": False,
    }


async def _ai_generate_summary(sections: list[str], existing: Optional[dict]) -> str:
    """Use AI to generate a patient summary."""
    if not OPENAI_API_KEY or OPENAI_API_KEY.startswith("sk-your"):
        return _mock_generate_summary(sections)
    
    existing_summary = ""
    if existing and existing.get("patient_summary"):
        existing_summary = existing["patient_summary"].get("text", "")
    
    prompt = f"""You are a clinical psychologist. Generate a concise patient summary paragraph (3-5 sentences) based on the following clinical information.

CLINICAL INFORMATION:
{chr(10).join(sections)}

{"EXISTING SUMMARY (integrate new information):" + chr(10) + existing_summary if existing_summary else ""}

Write a professional clinical summary. Be factual and concise. Do not make assumptions beyond the provided information."""

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.4,
                    "max_tokens": 500,
                },
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"Summary generation error: {e}")
        return _mock_generate_summary(sections)


def _mock_generate_summary(sections: list[str]) -> str:
    """Generate mock summary for development."""
    return " ".join(sections[:3]) + " Further clinical assessment recommended."


async def _extract_session_intelligence(
    transcript_text: str,
    summary: dict,
    soap: dict,
    source_info: dict,
    existing: Optional[dict],
) -> list[dict]:
    """Extract intelligence from therapy session data."""
    updates = []
    now = datetime.now(timezone.utc).isoformat()
    
    # Extract from SOAP notes
    if soap:
        # Subjective often contains symptoms
        subjective = soap.get("subjective", "")
        if subjective:
            updates.append({
                "update_type": "symptom",
                "section": "symptoms",
                "operation": "add",
                "proposed_changes": {
                    "id": generate_uuid(),
                    "name": "Session-reported symptoms",
                    "current_status": "active",
                    "severity": "moderate",
                    "first_mention": now,
                    "last_updated": now,
                    "sources": [{
                        "source_type": source_info["source_type"],
                        "source_id": source_info["source_id"],
                        "excerpt": subjective[:200],
                        "date": now,
                    }],
                    "confidence": "medium",
                },
                "source_type": source_info["source_type"],
                "source_id": source_info["source_id"],
                "source_excerpt": subjective[:200],
                "confidence": "medium",
                "reasoning": "Symptoms extracted from session SOAP notes",
                "auto_apply": False,
            })
        
        # Plan often contains treatment goals
        plan = soap.get("plan", "")
        if plan:
            updates.append({
                "update_type": "goal",
                "section": "treatment_goals",
                "operation": "add",
                "proposed_changes": {
                    "id": generate_uuid(),
                    "goal": plan[:500],
                    "status": "current",
                    "created_date": now,
                    "sources": [{
                        "source_type": source_info["source_type"],
                        "source_id": source_info["source_id"],
                        "excerpt": plan[:200],
                        "date": now,
                    }],
                    "confidence": "medium",
                },
                "source_type": source_info["source_type"],
                "source_id": source_info["source_id"],
                "source_excerpt": plan[:200],
                "confidence": "medium",
                "reasoning": "Treatment plan from session SOAP notes",
                "auto_apply": False,
            })
    
    # Extract from summary
    if summary:
        # Open questions become outstanding questions
        open_questions = summary.get("open_questions", "")
        if open_questions:
            updates.append({
                "update_type": "question",
                "section": "outstanding_questions",
                "operation": "add",
                "proposed_changes": {
                    "id": generate_uuid(),
                    "question": open_questions,
                    "category": "other",
                    "priority": "medium",
                    "created_date": now,
                    "resolved": False,
                    "sources": [{
                        "source_type": source_info["source_type"],
                        "source_id": source_info["source_id"],
                        "excerpt": open_questions[:200],
                        "date": now,
                    }],
                },
                "source_type": source_info["source_type"],
                "source_id": source_info["source_id"],
                "source_excerpt": open_questions[:200],
                "confidence": "medium",
                "reasoning": "Outstanding questions from session summary",
                "auto_apply": True,
            })
    
    return updates


async def _process_mmpi_results(
    result_data: dict,
    source_info: dict,
    existing: Optional[dict],
) -> list[dict]:
    """Process MMPI results for clinical intelligence."""
    updates = []
    now = datetime.now(timezone.utc).isoformat()
    
    t_scores = result_data.get("t_scores", {})
    
    # Map clinical scales to potential symptoms/areas of concern
    clinical_scale_map = {
        "Hs": ("Hypochondriasis", "Somatic concerns"),
        "D": ("Depression", "Depressive symptoms"),
        "Hy": ("Hysteria", "Conversion symptoms"),
        "Pd": ("Psychopathic Deviate", "Antisocial tendencies"),
        "Mf": ("Masculinity-Femininity", "Gender role concerns"),
        "Pa": ("Paranoia", "Paranoid ideation"),
        "Pt": ("Psychasthenia", "Anxiety/OCD symptoms"),
        "Sc": ("Schizophrenia", "Thought disturbance"),
        "Ma": ("Hypomania", "Manic symptoms"),
        "Si": ("Social Introversion", "Social withdrawal"),
    }
    
    elevated_scales = []
    for scale, (name, symptom_area) in clinical_scale_map.items():
        score = t_scores.get(scale)
        if score and score >= 65:
            elevated_scales.append(f"{scale} ({name}): T={score}")
            
            # Create symptom entry for elevated scale
            severity = "moderate" if score < 75 else "severe"
            updates.append({
                "update_type": "symptom",
                "section": "symptoms",
                "operation": "add",
                "proposed_changes": {
                    "id": generate_uuid(),
                    "name": symptom_area,
                    "current_status": "active",
                    "severity": severity,
                    "first_mention": now,
                    "last_updated": now,
                    "sources": [{
                        "source_type": source_info["source_type"],
                        "source_id": source_info["source_id"],
                        "excerpt": f"MMPI-2 {scale} scale elevated (T={score})",
                        "date": now,
                    }],
                    "confidence": "high",
                },
                "source_type": source_info["source_type"],
                "source_id": source_info["source_id"],
                "source_excerpt": f"MMPI-2 {scale} scale elevated (T={score})",
                "confidence": "high",
                "reasoning": f"Elevated MMPI-2 clinical scale: {name}",
                "auto_apply": False,
            })
    
    # Create psychological profile update
    if elevated_scales:
        profile_text = f"MMPI-2 assessment indicates elevated scores on: {', '.join(elevated_scales)}."
        updates.append({
            "update_type": "profile",
            "section": "psychological_profile",
            "operation": "update",
            "proposed_changes": {
                "current_presentation": {
                    "text": profile_text,
                    "confidence": "high",
                    "sources": [{
                        "source_type": source_info["source_type"],
                        "source_id": source_info["source_id"],
                        "date": now,
                    }],
                },
            },
            "source_type": source_info["source_type"],
            "source_id": source_info["source_id"],
            "source_excerpt": profile_text,
            "confidence": "high",
            "reasoning": "Psychological profile derived from MMPI-2 results",
            "auto_apply": False,
        })
    
    return updates


async def _extract_mmpi_intelligence(
    result_data: dict,
    interpretation: str,
    source_info: dict,
    existing: Optional[dict],
) -> list[dict]:
    """Extract intelligence from MMPI interpretation."""
    updates = []
    now = datetime.now(timezone.utc).isoformat()
    
    if interpretation:
        # Update psychological profile with interpretation
        updates.append({
            "update_type": "profile",
            "section": "psychological_profile",
            "operation": "update",
            "proposed_changes": {
                "personality_characteristics": {
                    "text": interpretation[:1000],
                    "confidence": "high",
                    "sources": [{
                        "source_type": source_info["source_type"],
                        "source_id": source_info["source_id"],
                        "excerpt": "AI interpretation of MMPI-2 results",
                        "date": now,
                    }],
                },
            },
            "source_type": source_info["source_type"],
            "source_id": source_info["source_id"],
            "source_excerpt": interpretation[:200],
            "confidence": "high",
            "reasoning": "Personality characteristics from MMPI-2 interpretation",
            "auto_apply": False,
        })
    
    return updates


async def _extract_document_intelligence(
    extracted_text: str,
    document_data: dict,
    source_info: dict,
    existing: Optional[dict],
) -> list[dict]:
    """Extract intelligence from document text using AI."""
    if not OPENAI_API_KEY or OPENAI_API_KEY.startswith("sk-your"):
        return []
    
    updates = []
    category = document_data.get("category", "other")
    
    prompt = f"""Analyze this clinical document and extract structured clinical information.

DOCUMENT CATEGORY: {category}
DOCUMENT CONTENT:
{extracted_text[:4000]}

Extract any of the following if present (respond with JSON):
{{
    "diagnoses": [{{name, status (current/historical/provisional)}}],
    "symptoms": [{{name, status (active/remission/resolved), severity}}],
    "medications": [{{name, dosage, notes}}],
    "risk_factors": [{{type, severity, notes}}],
    "recommendations": [string]
}}

Only include fields that have actual data. Do not fabricate information."""

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 1000,
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            
            # Parse JSON
            content = content.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1].rsplit("\n", 1)[0]
            
            extracted = json.loads(content)
            now = datetime.now(timezone.utc).isoformat()
            
            # Create updates from extracted data
            for diagnosis in extracted.get("diagnoses", []):
                updates.append({
                    "update_type": "diagnosis",
                    "section": "diagnoses",
                    "operation": "add",
                    "proposed_changes": {
                        "id": generate_uuid(),
                        "name": diagnosis["name"],
                        "status": diagnosis.get("status", "provisional"),
                        "last_updated": now,
                        "sources": [{
                            "source_type": source_info["source_type"],
                            "source_id": source_info["source_id"],
                            "excerpt": f"Document: {diagnosis['name']}",
                            "date": now,
                        }],
                        "confidence": "medium",
                    },
                    "source_type": source_info["source_type"],
                    "source_id": source_info["source_id"],
                    "confidence": "medium",
                    "reasoning": f"Diagnosis extracted from {category} document",
                    "auto_apply": False,
                })
            
            for symptom in extracted.get("symptoms", []):
                updates.append({
                    "update_type": "symptom",
                    "section": "symptoms",
                    "operation": "add",
                    "proposed_changes": {
                        "id": generate_uuid(),
                        "name": symptom["name"],
                        "current_status": symptom.get("status", "active"),
                        "severity": symptom.get("severity", "moderate"),
                        "first_mention": now,
                        "last_updated": now,
                        "sources": [{
                            "source_type": source_info["source_type"],
                            "source_id": source_info["source_id"],
                            "excerpt": f"Document: {symptom['name']}",
                            "date": now,
                        }],
                        "confidence": "medium",
                    },
                    "source_type": source_info["source_type"],
                    "source_id": source_info["source_id"],
                    "confidence": "medium",
                    "reasoning": f"Symptom extracted from {category} document",
                    "auto_apply": False,
                })
            
    except Exception as e:
        print(f"Document intelligence extraction error: {e}")
    
    return updates


# ═══════════════════════════════════════════════════════════════════════════════
#  MERGE AND APPLY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def merge_intelligence_update(
    current_data: dict,
    update: dict,
) -> dict:
    """
    Merge an approved update into the current intelligence data.
    Returns the updated data structure.
    """
    section = update.get("section")
    operation = update.get("operation")
    changes = update.get("proposed_changes", {})
    
    if not section:
        return current_data
    
    # Handle different sections
    if section == "patient_summary":
        current_data["patient_summary"] = changes
    
    elif section == "psychological_profile":
        if current_data.get("psychological_profile") is None:
            current_data["psychological_profile"] = {}
        for key, value in changes.items():
            current_data["psychological_profile"][key] = value
    
    elif section in ["symptoms", "diagnoses", "treatment_goals", "relationships", 
                      "life_events", "risk_factors", "timeline", "outstanding_questions"]:
        if current_data.get(section) is None:
            current_data[section] = []
        
        if operation == "add":
            current_data[section].append(changes)
        elif operation == "update":
            # Find and update existing item by id
            item_id = changes.get("id")
            for i, item in enumerate(current_data[section]):
                if item.get("id") == item_id:
                    current_data[section][i].update(changes)
                    break
            else:
                # If not found, add as new
                current_data[section].append(changes)
    
    return current_data


def create_intelligence_snapshot(intelligence_data: dict) -> dict:
    """Create a snapshot of intelligence data for versioning."""
    return {
        "patient_summary": intelligence_data.get("patient_summary"),
        "psychological_profile": intelligence_data.get("psychological_profile"),
        "symptoms": intelligence_data.get("symptoms"),
        "diagnoses": intelligence_data.get("diagnoses"),
        "treatment_goals": intelligence_data.get("treatment_goals"),
        "relationships": intelligence_data.get("relationships"),
        "life_events": intelligence_data.get("life_events"),
        "risk_factors": intelligence_data.get("risk_factors"),
        "timeline": intelligence_data.get("timeline"),
        "outstanding_questions": intelligence_data.get("outstanding_questions"),
    }
