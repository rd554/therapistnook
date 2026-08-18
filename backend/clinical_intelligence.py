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
    pending_updates: Optional[list[dict]] = None,
) -> list[dict]:
    """
    Process clinical history data and generate intelligence updates.

    Returns list of proposed updates for practitioner review. Re-running this
    over unchanged source data should be a no-op - see `_dedupe_updates`.
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

    return _dedupe_updates(updates, existing_intelligence, pending_updates)


async def process_therapy_session(
    session_data: dict,
    existing_intelligence: Optional[dict] = None,
    pending_updates: Optional[list[dict]] = None,
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

    return _dedupe_updates(updates, existing_intelligence, pending_updates)


async def process_assessment(
    assessment_data: dict,
    result_data: Optional[dict] = None,
    existing_intelligence: Optional[dict] = None,
    pending_updates: Optional[list[dict]] = None,
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

    return _dedupe_updates(updates, existing_intelligence, pending_updates)


async def process_mmpi_interpretation(
    session_data: dict,
    result_data: dict,
    interpretation: str,
    existing_intelligence: Optional[dict] = None,
    pending_updates: Optional[list[dict]] = None,
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

    return _dedupe_updates(updates, existing_intelligence, pending_updates)


async def process_document(
    document_data: dict,
    extracted_text: Optional[str] = None,
    existing_intelligence: Optional[dict] = None,
    pending_updates: Optional[list[dict]] = None,
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

    return _dedupe_updates(updates, existing_intelligence, pending_updates)


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
    """Extract family relationships.

    The wizard writes fixed per-relation keys (mother/father/siblings/
    grandparents/other), each an object with `conditions`, `quality`, `notes`
    - not the `family_members` list shape this used to assume.
    """
    updates = []
    now = datetime.now(timezone.utc).isoformat()

    relation_labels = {
        "mother": "Mother",
        "father": "Father",
        "siblings": "Siblings",
        "grandparents": "Grandparents",
        "other": "Other family",
    }

    for key, relation in relation_labels.items():
        member = data.get(key)
        if not isinstance(member, dict):
            continue
        conditions = member.get("conditions") or []
        quality = member.get("quality", "")
        notes = member.get("notes", "")

        # Nothing meaningful recorded for this relation - skip rather than
        # proposing an empty relationship entry.
        if not conditions and not quality and not notes:
            continue

        condition_text = ", ".join(conditions) if conditions else "No known conditions"

        updates.append({
            "update_type": "relationship",
            "section": "relationships",
            "operation": "add",
            "proposed_changes": {
                "id": generate_uuid(),
                "person": relation,
                "relationship_type": key,
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
    """Extract trauma-related life events.

    Most trauma fields are wizard toggle objects (`{present: bool, details: str}`),
    not flat strings - `major_life_events` and `other` are the exceptions and stay
    flat free-text. Treating a `{"present": False}` dict as truthy previously fired
    an event for every trauma type explicitly marked absent.
    """
    updates = []
    now = datetime.now(timezone.utc).isoformat()

    # (field, event_type, description, "text" for flat free-text fields or
    # "flag" for {present, details} toggle objects)
    trauma_types = [
        ("major_life_events", "trauma", "Major life event", "text"),
        ("physical_abuse", "trauma", "Physical abuse history", "flag"),
        ("sexual_abuse", "trauma", "Sexual abuse history", "flag"),
        ("emotional_abuse", "trauma", "Emotional abuse history", "flag"),
        ("neglect", "trauma", "Neglect history", "flag"),
        ("domestic_violence", "trauma", "Domestic violence history", "flag"),
        ("accidents", "trauma", "Accident history", "flag"),
        ("medical_trauma", "trauma", "Medical trauma history", "flag"),
        ("natural_disaster", "trauma", "Natural disaster history", "flag"),
        ("bereavement", "bereavement", "Bereavement", "flag"),
        ("bullying", "trauma", "Bullying history", "flag"),
        ("other", "trauma", "Other trauma", "text"),
    ]

    for field, event_type, description, kind in trauma_types:
        raw = data.get(field)

        if kind == "text":
            if not isinstance(raw, str) or not raw.strip():
                continue
            detail_text = raw.strip()
        else:
            if not isinstance(raw, dict) or not raw.get("present"):
                continue
            detail_text = (raw.get("details") or "").strip() or description

        updates.append({
            "update_type": "life_event",
            "section": "life_events",
            "operation": "add",
            "proposed_changes": {
                "id": generate_uuid(),
                "event": description,
                "event_type": event_type,
                "description": detail_text,
                "impact": "significant",
                "sources": [{
                    "source_type": source_info["source_type"],
                    "source_id": source_info["source_id"],
                    "excerpt": f"{description}: {detail_text}",
                    "date": now,
                }],
                "confidence": "high",
            },
            "source_type": source_info["source_type"],
            "source_id": source_info["source_id"],
            "source_excerpt": f"{description}: {detail_text}",
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
    """Extract risk factors from risk assessment.

    The wizard keys this object by `suicide` (not `suicide_risk`), and
    `present` is a tri-state string ("no" / "past" / "current"), not a
    boolean - `data.get(field)` truthiness on the whole sub-object always
    passed, and a plain `.get("present")` truthy-check treated "no" as
    present. Both meant the suicide-risk path in particular never fired
    correctly.
    """
    updates = []
    now = datetime.now(timezone.utc).isoformat()

    risk_types = [
        ("suicide", "suicide"),
        ("self_harm", "self_harm"),
        ("violence", "violence"),
        ("abuse", "other"),
        ("neglect", "other"),
    ]

    for field, risk_type in risk_types:
        risk_data = data.get(field, {})
        if not isinstance(risk_data, dict):
            continue
        present = risk_data.get("present")
        if present not in ("current", "past"):
            continue
        level = risk_data.get("level", "low")
        notes = risk_data.get("notes", "")

        # Map levels
        severity_map = {"low": "low", "moderate": "moderate", "medium": "moderate", "high": "high", "severe": "critical"}
        severity = severity_map.get(level, "low")
        status = "current" if present == "current" else "historical"

        updates.append({
            "update_type": "risk_factor",
            "section": "risk_factors",
            "operation": "add",
            "proposed_changes": {
                "id": generate_uuid(),
                "risk_type": risk_type,
                "status": status,
                "severity": severity,
                "first_identified": now,
                "last_updated": now,
                "last_assessment": now,
                "history": [{
                    "status": status,
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
        for risk_type in ["suicide", "self_harm", "violence"]:
            risk_data = ra.get(risk_type, {})
            if isinstance(risk_data, dict) and risk_data.get("present") in ("current", "past"):
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

    # gpt-4o-mini has a 128k-token context window, so a full multi-page report fits
    # in one call without chunking (same approach as session_intelligence.py's
    # transcript processing). Still cap it - extremely long documents (huge exports,
    # multi-report bundles) shouldn't blow the token budget - and log when we do so
    # this doesn't silently drop content the way the old 4000-char cap did.
    MAX_CHARS = 60000
    text = extracted_text[:MAX_CHARS]
    if len(extracted_text) > MAX_CHARS:
        print(f"Document intelligence: truncated {document_data.get('id')} from "
              f"{len(extracted_text)} to {MAX_CHARS} chars")

    prompt = f"""Analyze this clinical document and extract structured clinical information.

DOCUMENT CATEGORY: {category}
DOCUMENT CONTENT:
{text}

Extract any of the following if present (respond with JSON):
{{
    "diagnoses": [{{"name": str, "status": "current/historical/provisional"}}],
    "symptoms": [{{"name": str, "status": "active/remission/resolved", "severity": "mild/moderate/severe"}}],
    "risk_factors": [{{"risk_type": "suicide/self_harm/violence/substance_abuse/other", "severity": "low/moderate/high/critical", "notes": str}}],
    "recommendations": [string]
}}

Only include fields that have actual data. Do not fabricate information."""

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 1500,
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

            for risk in extracted.get("risk_factors", []):
                risk_type = risk.get("risk_type", "other")
                severity = risk.get("severity", "moderate")
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
                        "history": [{"status": "current", "severity": severity, "date": now, "source": f"{category} document"}],
                        "sources": [{
                            "source_type": source_info["source_type"],
                            "source_id": source_info["source_id"],
                            "excerpt": risk.get("notes") or f"Document: {risk_type}",
                            "date": now,
                        }],
                        "confidence": "medium",
                    },
                    "source_type": source_info["source_type"],
                    "source_id": source_info["source_id"],
                    "confidence": "medium",
                    "reasoning": f"Risk factor extracted from {category} document",
                    "auto_apply": False,
                })

            for recommendation in extracted.get("recommendations", []):
                if not recommendation:
                    continue
                updates.append({
                    "update_type": "question",
                    "section": "outstanding_questions",
                    "operation": "add",
                    "proposed_changes": {
                        "id": generate_uuid(),
                        "question": recommendation,
                        "category": "other",
                        "priority": "medium",
                        "created_date": now,
                        "resolved": False,
                        "sources": [{
                            "source_type": source_info["source_type"],
                            "source_id": source_info["source_id"],
                            "excerpt": recommendation[:200],
                            "date": now,
                        }],
                    },
                    "source_type": source_info["source_type"],
                    "source_id": source_info["source_id"],
                    "confidence": "medium",
                    "reasoning": f"Recommendation extracted from {category} document",
                    "auto_apply": False,
                })

    except Exception as e:
        print(f"Document intelligence extraction error: {e}")

    return updates


# ═══════════════════════════════════════════════════════════════════════════════
#  DEDUPLICATION
#
#  Every process_* entry point above re-runs its extraction functions against
#  the *entire* current source (e.g. the whole clinical history), every time
#  it's called - not just what changed. Without this pass, re-saving a
#  clinical history section, or re-processing a session, proposes the same
#  finding again as a brand-new pending update each time. `_dedupe_updates`
#  is the single choke point all process_* functions run their output through
#  before returning it, so callers in main.py don't need to reimplement this.
# ═══════════════════════════════════════════════════════════════════════════════

# Fields that legitimately differ between two proposals of "the same fact"
# (ids, timestamps, nested source/history logs) and so are ignored when
# deciding whether two proposed_changes dicts describe the same thing.
_VOLATILE_COMPARE_KEYS = {
    "id", "first_mention", "last_updated", "first_identified",
    "last_assessment", "created_date", "sources", "history",
}


def _semantic_key(section: Optional[str], changes: dict) -> Optional[str]:
    """
    Stable identity key for a proposed change within a section - i.e. "what
    fact is this about", independent of wording/timestamps. Two updates with
    the same (section, key) are treated as proposals about the same
    underlying fact for deduplication purposes. Returns None for sections
    that don't have a natural notion of identity (skips dedup for those).
    """
    if not isinstance(changes, dict):
        return None

    if section in ("symptoms", "diagnoses"):
        name = (changes.get("name") or "").strip().lower()
        return name or None

    if section == "relationships":
        key = (changes.get("relationship_type") or changes.get("person") or "").strip().lower()
        return key or None

    if section == "life_events":
        event_type = (changes.get("event_type") or "").strip().lower()
        event = (changes.get("event") or "").strip().lower()
        if not event_type and not event:
            return None
        return f"{event_type}:{event}"

    if section == "risk_factors":
        risk_type = (changes.get("risk_type") or "").strip().lower()
        return risk_type or None

    if section == "treatment_goals":
        goal = (changes.get("goal") or "").strip().lower()
        return goal[:120] or None

    if section == "outstanding_questions":
        question = (changes.get("question") or "").strip().lower()
        return question[:120] or None

    if section == "timeline":
        return f"{changes.get('source_type', '')}:{changes.get('source_id', '')}:{changes.get('event_type', '')}"

    if section in ("patient_summary", "psychological_profile"):
        # Singleton sections - the section itself is the identity.
        return section

    return None


def _normalize_for_compare(changes: dict) -> dict:
    """Strip volatile fields and normalize strings so two dicts describing
    the same fact compare equal regardless of casing/whitespace/ids."""
    normalized = {}
    for key, value in changes.items():
        if key in _VOLATILE_COMPARE_KEYS:
            continue
        if isinstance(value, str):
            value = value.strip().lower()
        normalized[key] = value
    return normalized


def _dedupe_updates(
    updates: list[dict],
    existing_intelligence: Optional[dict],
    pending_updates: Optional[list[dict]],
) -> list[dict]:
    """
    Filter a freshly-extracted batch of updates against already-approved
    state and the already-pending review queue, so re-running extraction
    over unchanged source data is a no-op instead of creating duplicates.

    Rules (per update, by semantic key within its section):
    - Already proposed within this same batch -> drop.
    - Matches an approved item with identical content -> drop, nothing new.
    - Matches an approved item with different content -> convert to an
      `operation: "update"` targeting that item's id, instead of a new "add".
    - No approved match, but an equivalent proposal is already pending
      review -> drop (don't pile another copy onto the queue).
    - Otherwise -> keep as-is.
    """
    existing_intelligence = existing_intelligence or {}
    pending_updates = pending_updates or []

    pending_index = set()
    for pending in pending_updates:
        key = _semantic_key(pending.get("section"), pending.get("proposed_changes") or {})
        if key is not None:
            pending_index.add((pending.get("section"), key))

    result = []
    seen_in_batch = set()

    for update in updates:
        section = update.get("section")
        changes = update.get("proposed_changes") or {}
        key = _semantic_key(section, changes)

        if key is None:
            result.append(update)
            continue

        batch_key = (section, key)
        if batch_key in seen_in_batch:
            continue
        seen_in_batch.add(batch_key)

        if section in ("patient_summary", "psychological_profile"):
            if batch_key in pending_index:
                continue
            result.append(update)
            continue

        approved_items = existing_intelligence.get(section) or []
        matched_existing = None
        for item in approved_items:
            if isinstance(item, dict) and _semantic_key(section, item) == key:
                matched_existing = item
                break

        if matched_existing is not None:
            if _normalize_for_compare(changes) == _normalize_for_compare(matched_existing):
                continue  # already recorded, nothing new to say
            updated = dict(update)
            new_changes = dict(changes)
            new_changes["id"] = matched_existing.get("id", new_changes.get("id"))
            updated["operation"] = "update"
            updated["proposed_changes"] = new_changes
            result.append(updated)
            continue

        if batch_key in pending_index:
            continue  # equivalent proposal already awaiting review

        result.append(update)

    return result


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
