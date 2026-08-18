import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, Text, Date, DateTime, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


def generate_uuid():
    return str(uuid.uuid4())


class Practitioner(Base):
    __tablename__ = "practitioners"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="practitioner")  # "owner" or "practitioner"
    ref_code = Column(String, unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=True)
    profile_setup_complete = Column(Boolean, default=False)
    created_by = Column(String, ForeignKey("practitioners.id"), nullable=True)
    # Future avatar picker — preset illustration id or uploaded URL (no UI yet)
    avatar_id = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    sessions = relationship("Session", back_populates="practitioner")
    patients = relationship("Patient", back_populates="practitioner")


class Patient(Base):
    __tablename__ = "patients"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, index=True)
    full_name = Column(String, nullable=False)
    date_of_birth = Column(Date, nullable=False)
    age = Column(Integer, nullable=False)
    gender = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    emergency_contact = Column(String, nullable=True)
    referral_source = Column(String, nullable=True)
    status = Column(String, nullable=False, default="active")  # "active" or "archived"
    # Future avatar picker — preset illustration id or uploaded URL (no UI yet)
    avatar_id = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    practitioner = relationship("Practitioner", back_populates="patients")
    clinical_history = relationship("ClinicalHistory", back_populates="patient", uselist=False)
    clinical_documents = relationship("ClinicalDocument", back_populates="patient", cascade="all, delete-orphan")
    assessments = relationship("Assessment", back_populates="patient", cascade="all, delete-orphan")


class ClinicalHistory(Base):
    __tablename__ = "clinical_histories"

    id = Column(String, primary_key=True, default=generate_uuid)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False, unique=True, index=True)
    
    # Status: not_started, in_progress, completed
    status = Column(String, nullable=False, default="not_started")
    current_step = Column(Integer, nullable=False, default=1)
    
    # Step 1: Basic Information (mostly from Patient model, but can have additional fields)
    basic_info = Column(JSON, nullable=True)  # address, additional contact info
    
    # Step 2: Presenting Complaint
    presenting_complaint = Column(JSON, nullable=True)
    # chief_complaint, duration, duration_unit, severity (1-10), trigger, functional_impact
    
    # Step 3: History of Present Illness
    history_present_illness = Column(JSON, nullable=True)
    # onset, onset_date, previous_episodes, previous_episodes_count, course, previous_diagnoses, previous_treatment, hospitalisations
    
    # Step 4: Medical History
    medical_history = Column(JSON, nullable=True)
    # medical_conditions, neurological_conditions, current_medications, previous_medications, allergies
    
    # Step 5: Family History
    family_history = Column(JSON, nullable=True)
    # family_members: [{relation, conditions: [], relationship_quality, notes}]
    # conditions can include: depression, anxiety, bipolar, schizophrenia, suicide, substance_abuse
    
    # Step 6: Personal History
    personal_history = Column(JSON, nullable=True)
    # childhood, education, occupation, employment_status, financial_situation, living_arrangement
    
    # Step 7: Relationship History
    relationship_history = Column(JSON, nullable=True)
    # marital_status, romantic_relationships, family_relationships, social_support
    
    # Step 8: Substance Use
    substance_use = Column(JSON, nullable=True)
    # alcohol: {use, frequency, duration, previous_treatment}
    # smoking: {use, frequency, duration, previous_treatment}
    # tobacco: {use, frequency, duration, previous_treatment}
    # drugs: {use, substances, frequency, duration, previous_treatment}
    
    # Step 9: Trauma History
    trauma_history = Column(JSON, nullable=True)
    # major_life_events, physical_abuse, sexual_abuse, emotional_abuse, accidents, bereavement, bullying, other_trauma
    
    # Step 10: Risk Assessment
    risk_assessment = Column(JSON, nullable=True)
    # suicide_risk: {present, level, notes}
    # self_harm: {present, level, notes}
    # violence: {present, level, notes}
    # abuse: {present, level, notes}
    # neglect: {present, level, notes}
    
    # Step 11: Therapist Notes
    therapist_notes = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    patient = relationship("Patient", back_populates="clinical_history")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    number = Column(Integer, unique=True, nullable=False, index=True)
    text = Column(Text, nullable=False)


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, index=True)
    resume_code = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    dob = Column(Date, nullable=False)
    gender = Column(String, nullable=False)
    nationality = Column(String, nullable=False)
    education = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed = Column(Boolean, default=False)
    # Nullable: sessions are created through the unauthenticated patient-facing
    # intake flow (name/dob typed by the patient via a practitioner's ref link),
    # so there's no Patient record to point at yet. Resolved + persisted lazily
    # by _resolve_session_patient_id() in main.py the first time it's needed
    # (assessment list, MMPI->Clinical Intelligence wiring), scoped to
    # practitioner_id so two practitioners' same-named patients never cross-link.
    patient_id = Column(String, ForeignKey("patients.id"), nullable=True, index=True)

    practitioner = relationship("Practitioner", back_populates="sessions")
    answers = relationship("Answer", back_populates="session", cascade="all, delete-orphan")
    results = relationship("Result", back_populates="session", cascade="all, delete-orphan")


class Answer(Base):
    __tablename__ = "answers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    question_number = Column(Integer, nullable=False)
    response = Column(Boolean, nullable=False)

    session = relationship("Session", back_populates="answers")

    __table_args__ = (
        {},
    )


class Result(Base):
    __tablename__ = "results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, unique=True, index=True)
    raw_scores = Column(JSON, nullable=False)
    k_corrected_scores = Column(JSON, nullable=False)
    t_scores = Column(JSON, nullable=False)
    harris_lingoes_subscales = Column(JSON, nullable=True)
    si_subscales = Column(JSON, nullable=True)
    supplementary_scales = Column(JSON, nullable=True)
    interpretation = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    session = relationship("Session", back_populates="results")


# Document categories
DOCUMENT_CATEGORIES = [
    "psychological_assessment",
    "mmpi2_assessment",
    "personality_assessment",
    "cognitive_assessment",
    "psychological_report",
    "psychiatric_report",
    "medical_report",
    "lab_report",
    "prescription",
    "referral_letter",
    "consent_form",
    "progress_report",
    "other",
]

# Processing status for future AI compatibility
PROCESSING_STATUS = ["pending", "processing", "completed", "failed"]

# Assessment types (extensible)
ASSESSMENT_TYPES = [
    "mmpi2",
    "phq9",
    "gad7",
    "bdi2",
    "mcmi",
    "big_five",
    "cognitive",
    "custom",
]


class ClinicalDocument(Base):
    __tablename__ = "clinical_documents"

    id = Column(String, primary_key=True, default=generate_uuid)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False, index=True)
    uploaded_by = Column(String, ForeignKey("practitioners.id"), nullable=False, index=True)
    
    # Document metadata
    category = Column(String, nullable=False)  # From DOCUMENT_CATEGORIES
    original_filename = Column(String, nullable=False)
    display_name = Column(String, nullable=False)  # Can be renamed by user
    storage_path = Column(String, nullable=False)  # Internal storage path
    mime_type = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)  # In bytes
    file_hash = Column(String, nullable=True)  # For duplicate detection
    
    # Versioning
    version = Column(Integer, nullable=False, default=1)
    parent_document_id = Column(String, ForeignKey("clinical_documents.id"), nullable=True)
    
    # Optional notes
    notes = Column(Text, nullable=True)

    # Text extracted from the file (PDF/DOCX/TXT) for Clinical Intelligence analysis.
    # Null for unsupported types (.doc, .xls/.xlsx, images) or if extraction found no text
    # (e.g. a scanned/image-only PDF).
    extracted_text = Column(Text, nullable=True)

    # Processing status: pending -> completed/failed once text extraction + Clinical
    # Intelligence processing has run (see upload_document in main.py).
    processing_status = Column(String, nullable=False, default="pending")  # pending, processing, completed, failed
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    patient = relationship("Patient", back_populates="clinical_documents")
    uploader = relationship("Practitioner", foreign_keys=[uploaded_by])
    versions = relationship("ClinicalDocument", backref="parent", remote_side=[id])


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(String, primary_key=True, default=generate_uuid)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False, index=True)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, index=True)
    
    # Assessment metadata
    assessment_type = Column(String, nullable=False)  # mmpi2, phq9, gad7, etc.
    display_name = Column(String, nullable=False)  # e.g., "MMPI-2 Assessment - July 2026"
    
    # Reference to actual assessment data (e.g., session_id for MMPI)
    reference_type = Column(String, nullable=True)  # "session" for MMPI, "document" for uploaded, etc.
    reference_id = Column(String, nullable=True)  # ID of the referenced entity
    
    # Status
    status = Column(String, nullable=False, default="pending")  # pending, in_progress, completed, cancelled
    completion_date = Column(DateTime(timezone=True), nullable=True)
    
    # Processing status for future AI
    processing_status = Column(String, nullable=False, default="pending")
    
    # Optional notes
    notes = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    patient = relationship("Patient", back_populates="assessments")
    practitioner = relationship("Practitioner", foreign_keys=[practitioner_id])


# ═══════════════════════════════════════════════════════════════════════════════
#  SESSION INTELLIGENCE — Voice Profiles and Therapy Sessions
# ═══════════════════════════════════════════════════════════════════════════════

# Therapy session processing status
THERAPY_SESSION_STATUS = ["pending", "processing", "completed", "failed"]

# Supported audio formats
AUDIO_FORMATS = [".mp3", ".wav", ".m4a", ".mp4"]


class VoiceProfile(Base):
    """Practitioner voice profile for speaker identification."""
    __tablename__ = "voice_profiles"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, unique=True, index=True)
    
    # Voice sample storage
    audio_storage_path = Column(String, nullable=False)
    audio_duration = Column(Integer, nullable=True)  # Duration in seconds
    
    # Voice embedding for speaker identification
    embedding = Column(JSON, nullable=True)  # Serialized voice embedding vector
    
    # Status
    status = Column(String, nullable=False, default="pending")  # pending, processing, ready, failed
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    practitioner = relationship("Practitioner", backref="voice_profile")


class TherapySession(Base):
    """Therapy session recording with transcription and analysis."""
    __tablename__ = "therapy_sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False, index=True)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, index=True)
    
    # Recording metadata
    audio_storage_path = Column(String, nullable=False)
    audio_duration = Column(Integer, nullable=True)  # Duration in seconds
    original_filename = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)  # In bytes
    mime_type = Column(String, nullable=False)
    
    # Session metadata
    session_date = Column(DateTime(timezone=True), nullable=False)
    detected_language = Column(String, nullable=True)  # e.g., "en", "hi", "es"
    input_type = Column(String, nullable=False, default="audio")  # "audio" or "transcript"
    
    # Transcript
    transcript = Column(JSON, nullable=True)  # [{speaker, timestamp, text}, ...]
    transcript_text = Column(Text, nullable=True)  # Plain text version for search
    
    # Translation (if non-English)
    translation = Column(JSON, nullable=True)  # [{speaker, timestamp, text}, ...]
    translation_text = Column(Text, nullable=True)  # Plain text version
    
    # AI-generated summaries
    summary = Column(JSON, nullable=True)
    # {
    #   presenting_issues: str,
    #   key_discussion_points: str,
    #   emotional_themes: str,
    #   homework_discussed: str,
    #   action_items: str,
    #   open_questions: str,
    # }
    
    # SOAP Notes
    soap_notes = Column(JSON, nullable=True)
    # {
    #   subjective: str,
    #   objective: str,
    #   assessment: str,
    #   plan: str,
    #   edited: bool,  # True if practitioner edited the SOAP notes
    # }
    
    # Processing status
    processing_status = Column(String, nullable=False, default="pending")  # pending, processing, completed, failed
    processing_error = Column(Text, nullable=True)  # Error message if processing failed
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    patient = relationship("Patient", backref="therapy_sessions")
    practitioner = relationship("Practitioner", backref="therapy_sessions")


# ═══════════════════════════════════════════════════════════════════════════════
#  CLINICAL INTELLIGENCE — Unified Patient Intelligence Layer
# ═══════════════════════════════════════════════════════════════════════════════

# Source types for citation tracking
SOURCE_TYPES = [
    "clinical_history",
    "therapy_session",
    "assessment",
    "clinical_document",
    "mmpi_result",
    "soap_notes",
    "therapist_notes",
]

# Confidence levels
CONFIDENCE_LEVELS = ["high", "medium", "low"]

# Update review status
UPDATE_REVIEW_STATUS = ["pending", "approved", "rejected"]


class ClinicalIntelligence(Base):
    """
    Main Clinical Intelligence record for a patient.
    Stores the current state of all intelligence sections.
    """
    __tablename__ = "clinical_intelligence"

    id = Column(String, primary_key=True, default=generate_uuid)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False, unique=True, index=True)
    
    # Current version number
    version = Column(Integer, nullable=False, default=1)
    
    # Patient Summary - continuously updated overview
    patient_summary = Column(JSON, nullable=True)
    # {
    #   text: str,
    #   last_updated: datetime,
    #   sources: [{source_type, source_id, excerpt}]
    # }
    
    # Psychological Profile
    psychological_profile = Column(JSON, nullable=True)
    # {
    #   current_presentation: {text, confidence, sources},
    #   behavioral_observations: {text, confidence, sources},
    #   personality_characteristics: {text, confidence, sources},
    #   protective_factors: {text, confidence, sources},
    #   strengths: [{text, confidence, sources}],
    #   areas_requiring_attention: [{text, confidence, sources}],
    # }
    
    # Symptoms tracking
    symptoms = Column(JSON, nullable=True)
    # [{
    #   name: str,
    #   current_status: str,  # active, remission, resolved
    #   severity: str,  # mild, moderate, severe
    #   first_mention: datetime,
    #   last_updated: datetime,
    #   history: [{status, date, source}],
    #   sources: [{source_type, source_id, excerpt, date}],
    #   confidence: str,
    # }]
    
    # Diagnoses
    diagnoses = Column(JSON, nullable=True)
    # [{
    #   name: str,
    #   status: str,  # current, historical, provisional, ruled_out
    #   icd_code: str (optional),
    #   diagnosed_date: datetime,
    #   diagnosed_by: str,
    #   last_updated: datetime,
    #   sources: [{source_type, source_id, excerpt, date}],
    #   confidence: str,
    #   history: [{status, date, source, note}],
    # }]
    
    # Treatment Goals
    treatment_goals = Column(JSON, nullable=True)
    # [{
    #   goal: str,
    #   status: str,  # current, completed, ongoing, discontinued
    #   created_date: datetime,
    #   target_date: datetime (optional),
    #   completed_date: datetime (optional),
    #   progress_notes: [{note, date, source}],
    #   sources: [{source_type, source_id, excerpt, date}],
    #   confidence: str,
    # }]
    
    # Important Relationships
    relationships = Column(JSON, nullable=True)
    # [{
    #   person: str,  # e.g., "Mother", "Partner - Sarah"
    #   relationship_type: str,  # mother, father, partner, child, sibling, friend, employer, other
    #   importance: str,  # high, medium, low
    #   notes: str,
    #   first_mention: datetime,
    #   last_updated: datetime,
    #   sources: [{source_type, source_id, excerpt, date}],
    #   confidence: str,
    # }]
    
    # Life Events
    life_events = Column(JSON, nullable=True)
    # [{
    #   event: str,
    #   event_type: str,  # marriage, divorce, bereavement, trauma, job_change, relocation, hospitalization, medication_change, other
    #   date: datetime,
    #   description: str,
    #   impact: str,
    #   sources: [{source_type, source_id, excerpt, date}],
    #   confidence: str,
    # }]
    
    # Risk Factors
    risk_factors = Column(JSON, nullable=True)
    # [{
    #   risk_type: str,  # suicide, self_harm, violence, substance_abuse, other
    #   status: str,  # current, historical, resolved
    #   severity: str,  # low, moderate, high, critical
    #   first_identified: datetime,
    #   last_updated: datetime,
    #   last_assessment: datetime,
    #   history: [{status, severity, date, source, note}],
    #   sources: [{source_type, source_id, excerpt, date}],
    #   confidence: str,
    # }]
    
    # Timeline - chronological events
    timeline = Column(JSON, nullable=True)
    # [{
    #   date: datetime,
    #   event_type: str,  # clinical_history, assessment, session, report, life_event, risk_event, diagnosis, treatment
    #   title: str,
    #   description: str,
    #   source_type: str,
    #   source_id: str,
    #   importance: str,  # high, medium, low
    # }]
    
    # Outstanding Questions
    outstanding_questions = Column(JSON, nullable=True)
    # [{
    #   question: str,
    #   category: str,  # medication, family, sleep, trauma, other
    #   priority: str,  # high, medium, low
    #   created_date: datetime,
    #   resolved: bool,
    #   resolved_date: datetime (optional),
    #   resolution: str (optional),
    #   sources: [{source_type, source_id, excerpt, date}],
    # }]
    
    # Processing metadata
    last_processed_at = Column(DateTime(timezone=True), nullable=True)
    last_source_type = Column(String, nullable=True)
    last_source_id = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    patient = relationship("Patient", backref="clinical_intelligence")


class ClinicalIntelligenceVersion(Base):
    """
    Version history for Clinical Intelligence.
    Stores complete snapshots for rollback capability.
    """
    __tablename__ = "clinical_intelligence_versions"

    id = Column(String, primary_key=True, default=generate_uuid)
    clinical_intelligence_id = Column(String, ForeignKey("clinical_intelligence.id"), nullable=False, index=True)
    
    version = Column(Integer, nullable=False)
    
    # Snapshot of all data at this version
    snapshot = Column(JSON, nullable=False)
    
    # Change metadata
    change_reason = Column(String, nullable=True)
    source_type = Column(String, nullable=True)
    source_id = Column(String, nullable=True)
    changed_by = Column(String, ForeignKey("practitioners.id"), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    intelligence = relationship("ClinicalIntelligence", backref="versions")
    practitioner = relationship("Practitioner", foreign_keys=[changed_by])


class ClinicalIntelligenceUpdate(Base):
    """
    Pending updates to Clinical Intelligence requiring practitioner review.
    AI-generated updates are queued here before being applied.
    """
    __tablename__ = "clinical_intelligence_updates"

    id = Column(String, primary_key=True, default=generate_uuid)
    clinical_intelligence_id = Column(String, ForeignKey("clinical_intelligence.id"), nullable=False, index=True)
    
    # Update details
    update_type = Column(String, nullable=False)  # summary, symptom, diagnosis, goal, relationship, event, risk, question
    section = Column(String, nullable=False)  # Which section is being updated
    operation = Column(String, nullable=False)  # add, update, merge
    
    # The proposed changes
    proposed_changes = Column(JSON, nullable=False)
    # {
    #   field: str,
    #   old_value: any,
    #   new_value: any,
    #   merge_strategy: str,  # replace, append, merge
    # }
    
    # Source of this update
    source_type = Column(String, nullable=False)
    source_id = Column(String, nullable=False)
    source_excerpt = Column(Text, nullable=True)
    
    # AI confidence
    confidence = Column(String, nullable=False, default="medium")
    reasoning = Column(Text, nullable=True)
    
    # Review status
    review_status = Column(String, nullable=False, default="pending")  # pending, approved, rejected
    reviewed_by = Column(String, ForeignKey("practitioners.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_notes = Column(Text, nullable=True)
    
    # Whether to auto-apply (for low-risk updates)
    auto_apply = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    intelligence = relationship("ClinicalIntelligence", backref="pending_updates")
    reviewer = relationship("Practitioner", foreign_keys=[reviewed_by])


class ClinicalIntelligenceChatMessage(Base):
    """
    Messages in the per-patient "ask about this patient" Q&A chat.

    Every row carries patient_id in addition to clinical_intelligence_id even
    though the two are 1:1 today. This is deliberate: every query in main.py
    filters on patient_id taken straight from the URL, never by joining
    through clinical_intelligence_id alone, so a join bug can't leak one
    patient's conversation into another's. See main.py's chat endpoints.
    """
    __tablename__ = "clinical_intelligence_chat_messages"

    id = Column(String, primary_key=True, default=generate_uuid)
    clinical_intelligence_id = Column(String, ForeignKey("clinical_intelligence.id"), nullable=False, index=True)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False, index=True)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=True)

    role = Column(String, nullable=False)  # user, assistant
    content = Column(Text, nullable=False)

    # Structured citations for assistant messages, resolved server-side from
    # the patient's own record (see clinical_chat_service.py) - never
    # freehand text from the model.
    citations = Column(JSON, nullable=True)
    # [{source_type, source_id, excerpt, date, section}]

    # False when the assistant's answer contained no verifiable citation
    # back to the record (e.g. "I don't have that information"). Lets the
    # UI visually distinguish a grounded answer from an unverified one.
    grounded = Column(Boolean, nullable=True)  # null for user messages

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    intelligence = relationship("ClinicalIntelligence", backref="chat_messages")


# ═══════════════════════════════════════════════════════════════════════════════
#  CALENDAR & SCHEDULING — Appointments and Availability
# ═══════════════════════════════════════════════════════════════════════════════

# Session types
SESSION_TYPES = [
    "therapy_session",
    "follow_up",
    "assessment_session",
    "consultation",
]

# Session modes
SESSION_MODES = ["online", "offline"]

# Appointment statuses
APPOINTMENT_STATUSES = [
    "scheduled",
    "completed",
    "cancelled",
    "no_show",
    "rescheduled",
]


class Appointment(Base):
    """Scheduled therapy session/appointment."""
    __tablename__ = "appointments"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, index=True)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False, index=True)
    
    # Scheduling details
    date = Column(Date, nullable=False, index=True)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    duration_minutes = Column(Integer, nullable=False)  # Duration in minutes
    
    # Session metadata
    session_type = Column(String, nullable=False, default="therapy_session")  # From SESSION_TYPES
    session_mode = Column(String, nullable=False, default="offline")  # online or offline
    
    # Status tracking
    status = Column(String, nullable=False, default="scheduled")  # From APPOINTMENT_STATUSES
    
    # Notes
    notes = Column(Text, nullable=True)  # Internal practitioner notes
    
    # Rescheduling tracking
    rescheduled_from_id = Column(String, ForeignKey("appointments.id"), nullable=True)
    rescheduled_to_id = Column(String, ForeignKey("appointments.id"), nullable=True)
    cancellation_reason = Column(Text, nullable=True)
    
    # Future integrations (placeholders)
    meeting_link = Column(String, nullable=True)  # For future Google Meet/Zoom integration
    payment_id = Column(String, nullable=True)  # For future payment integration

    # Google Calendar event ID this appointment was pushed to (see
    # _create_calendar_event_for_appointment in main.py). Null if Google
    # Calendar wasn't connected when the appointment was created, or the push
    # failed. Used to keep the calendar event in sync on reschedule/cancel/
    # delete instead of leaving a stale event behind on the practitioner's
    # Google Calendar.
    google_event_id = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    practitioner = relationship("Practitioner", backref="appointments")
    patient = relationship("Patient", backref="appointments")
    rescheduled_from = relationship("Appointment", foreign_keys=[rescheduled_from_id], remote_side=[id], backref="rescheduled_to_appointment")


class PractitionerAvailability(Base):
    """Practitioner availability settings for scheduling."""
    __tablename__ = "practitioner_availability"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, unique=True, index=True)
    
    # Working days (0=Monday, 6=Sunday)
    working_days = Column(JSON, nullable=False, default=lambda: [0, 1, 2, 3, 4])  # Mon-Fri by default
    
    # Working hours
    work_start_time = Column(String, nullable=False, default="09:00")  # HH:MM format
    work_end_time = Column(String, nullable=False, default="18:00")  # HH:MM format
    
    # Break hours
    break_start_time = Column(String, nullable=True, default="13:00")  # HH:MM format
    break_end_time = Column(String, nullable=True, default="14:00")  # HH:MM format
    
    # Default session duration in minutes
    default_session_duration = Column(Integer, nullable=False, default=50)
    
    # Buffer time between appointments in minutes
    buffer_minutes = Column(Integer, nullable=False, default=10)
    
    # Timezone
    timezone = Column(String, nullable=False, default="Asia/Kolkata")
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    practitioner = relationship("Practitioner", backref="availability")


class UnavailableDate(Base):
    """Specific dates when practitioner is unavailable (holidays, leave, etc.)."""
    __tablename__ = "unavailable_dates"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, index=True)
    
    date = Column(Date, nullable=False, index=True)
    reason = Column(String, nullable=True)  # e.g., "Holiday", "Personal Leave"
    
    # Full day or partial
    is_full_day = Column(Boolean, nullable=False, default=True)
    unavailable_start = Column(String, nullable=True)  # HH:MM format, if partial
    unavailable_end = Column(String, nullable=True)  # HH:MM format, if partial
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    practitioner = relationship("Practitioner", backref="unavailable_dates")


# ═══════════════════════════════════════════════════════════════════════════════
#  PAYMENTS — Payment Tracking and Revenue Management
# ═══════════════════════════════════════════════════════════════════════════════

# Payment statuses
PAYMENT_STATUSES = [
    "pending",
    "paid",
    "failed",
    "refunded",
    "cancelled",
    "expired",
]

# Refund statuses
REFUND_STATUSES = [
    "not_applicable",
    "initiated",
    "completed",
]

# Payment methods (for future gateway integration)
PAYMENT_METHODS = [
    "payment_link",
    "cash",
    "bank_transfer",
    "card",
    "upi",
    "other",
]


def generate_receipt_number():
    """Generate a unique invoice number with format: INV-YYYYMMDD-XXXX.

    The model/table/column are still named "Receipt"/"receipt_number" — only
    the user-facing label changed from Receipt to Invoice, and this prefix
    with it. Renaming the table itself would need a migration this codebase
    has no framework for (see database.py), and buys nothing the rename
    actually needs. Numbers already issued with the old "RCP-" prefix are
    left untouched; only new ones get "INV-".
    """
    from datetime import datetime
    import random
    import string
    date_part = datetime.now().strftime("%Y%m%d")
    random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"INV-{date_part}-{random_part}"


def generate_payment_link_token():
    """Generate a secure payment link token"""
    import secrets
    return secrets.token_urlsafe(32)


class Payment(Base):
    """Payment record for appointments."""
    __tablename__ = "payments"

    id = Column(String, primary_key=True, default=generate_uuid)
    appointment_id = Column(String, ForeignKey("appointments.id"), nullable=False, unique=True, index=True)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, index=True)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False, index=True)
    
    # Amount details
    session_fee = Column(Integer, nullable=False)  # Amount in paise/cents (base currency unit)
    discount_amount = Column(Integer, nullable=False, default=0)  # Discount in paise/cents
    discount_reason = Column(String, nullable=True)  # Reason for discount
    tax_amount = Column(Integer, nullable=False, default=0)  # Tax in paise/cents
    tax_percentage = Column(Integer, nullable=True)  # Tax percentage * 100 (e.g., 1800 = 18%)
    final_amount = Column(Integer, nullable=False)  # Final payable amount in paise/cents
    currency = Column(String, nullable=False, default="INR")  # Currency code
    
    # Payment status
    status = Column(String, nullable=False, default="pending")  # From PAYMENT_STATUSES
    
    # Payment link
    payment_link_token = Column(String, unique=True, nullable=True, index=True)
    payment_link_expires_at = Column(DateTime(timezone=True), nullable=True)
    
    # Payment method and gateway details (for future integration)
    payment_method = Column(String, nullable=True)  # From PAYMENT_METHODS
    gateway_transaction_id = Column(String, nullable=True)  # Payment gateway reference
    gateway_response = Column(JSON, nullable=True)  # Full gateway response for audit
    
    # Payment timestamps
    paid_at = Column(DateTime(timezone=True), nullable=True)
    failed_at = Column(DateTime(timezone=True), nullable=True)
    failure_reason = Column(String, nullable=True)
    
    # Refund tracking
    refund_status = Column(String, nullable=False, default="not_applicable")  # From REFUND_STATUSES
    refund_amount = Column(Integer, nullable=True)  # Refund amount in paise/cents
    refund_reason = Column(String, nullable=True)
    refund_initiated_at = Column(DateTime(timezone=True), nullable=True)
    refund_completed_at = Column(DateTime(timezone=True), nullable=True)
    refund_initiated_by = Column(String, ForeignKey("practitioners.id"), nullable=True)
    
    # Notes
    notes = Column(Text, nullable=True)  # Internal notes
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    appointment = relationship("Appointment", backref="payment")
    practitioner = relationship("Practitioner", foreign_keys=[practitioner_id], backref="payments")
    patient = relationship("Patient", backref="payments")
    refund_initiator = relationship("Practitioner", foreign_keys=[refund_initiated_by])


class Receipt(Base):
    """Receipt generated after successful payment."""
    __tablename__ = "receipts"

    id = Column(String, primary_key=True, default=generate_uuid)
    payment_id = Column(String, ForeignKey("payments.id"), nullable=False, unique=True, index=True)
    
    # Receipt identification
    receipt_number = Column(String, unique=True, nullable=False, index=True, default=generate_receipt_number)
    
    # Snapshot of payment details at receipt generation time
    patient_name = Column(String, nullable=False)
    patient_email = Column(String, nullable=True)
    patient_dob = Column(Date, nullable=True)  # for insurance/reimbursement claims
    practitioner_name = Column(String, nullable=False)
    
    # Amount details (snapshot)
    session_fee = Column(Integer, nullable=False)
    discount_amount = Column(Integer, nullable=False, default=0)
    tax_amount = Column(Integer, nullable=False, default=0)
    final_amount = Column(Integer, nullable=False)
    currency = Column(String, nullable=False, default="INR")
    
    # Appointment details (snapshot)
    appointment_date = Column(Date, nullable=False)
    session_type = Column(String, nullable=False)

    # Payment method used
    payment_method = Column(String, nullable=True)
    payment_date = Column(DateTime(timezone=True), nullable=False)
    
    # Receipt storage
    storage_path = Column(String, nullable=True)  # Path to generated PDF receipt
    
    # Timestamps
    generated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    payment = relationship("Payment", backref="receipt")


class InternalNotification(Base):
    """Internal notification for payment and other system events."""
    __tablename__ = "internal_notifications"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, index=True)
    
    # Notification details
    notification_type = Column(String, nullable=False)  # payment_received, payment_failed, refund_completed, appointment_awaiting_payment
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    
    # Reference to related entities
    reference_type = Column(String, nullable=True)  # payment, appointment, patient
    reference_id = Column(String, nullable=True)
    
    # Status
    is_read = Column(Boolean, nullable=False, default=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    
    # Additional data
    extra_data = Column(JSON, nullable=True)  # Additional context data
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    practitioner = relationship("Practitioner", backref="notifications")


# ═══════════════════════════════════════════════════════════════════════════════
#  PUBLIC PROFILE — Therapist Public Profile & Patient Onboarding
# ═══════════════════════════════════════════════════════════════════════════════

# Therapy approaches
THERAPY_APPROACHES = [
    "cognitive_behavioral",
    "psychodynamic",
    "humanistic",
    "integrative",
    "mindfulness_based",
    "dialectical_behavior",
    "solution_focused",
    "narrative",
    "family_systems",
    "trauma_informed",
    "acceptance_commitment",
    "interpersonal",
    "gestalt",
    "emdr",
    "art_therapy",
    "play_therapy",
    "other",
]

# Specializations
SPECIALIZATIONS = [
    "anxiety",
    "depression",
    "trauma_ptsd",
    "relationship_issues",
    "grief_loss",
    "stress_management",
    "self_esteem",
    "anger_management",
    "ocd",
    "addiction",
    "eating_disorders",
    "bipolar_disorder",
    "personality_disorders",
    "schizophrenia",
    "child_adolescent",
    "couples_therapy",
    "family_therapy",
    "lgbtq",
    "life_transitions",
    "career_counseling",
    "chronic_illness",
    "sleep_disorders",
    "other",
]

# Resource types
RESOURCE_TYPES = [
    "consent_form",
    "therapy_guidelines",
    "cancellation_policy",
    "privacy_policy",
    "faq",
    "emergency_info",
    "welcome_packet",
    "intake_instructions",
    "other",
]


def generate_profile_slug(name: str) -> str:
    """Generate a URL-friendly slug from practitioner name."""
    import re
    slug = name.lower().strip()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[\s_-]+', '-', slug)
    slug = slug.strip('-')
    return slug


class PractitionerProfile(Base):
    """Extended public profile for practitioners."""
    __tablename__ = "practitioner_profiles"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, unique=True, index=True)
    
    # Public URL slug (e.g., dr-john-smith)
    slug = Column(String, unique=True, nullable=False, index=True)
    
    # Profile visibility
    is_public = Column(Boolean, nullable=False, default=False)
    is_admin_approved = Column(Boolean, nullable=False, default=True)
    
    # Professional Information
    display_name = Column(String, nullable=True)  # How name appears publicly
    title = Column(String, nullable=True)  # Dr., Mr., Ms., etc.
    tagline = Column(String, nullable=True)  # Short professional tagline
    bio = Column(Text, nullable=True)  # Full professional biography
    
    # Qualifications
    qualifications = Column(JSON, nullable=True)  # [{degree, institution, year}]
    certifications = Column(JSON, nullable=True)  # [{name, issuer, year, expiry}]
    license_number = Column(String, nullable=True)
    professional_memberships = Column(JSON, nullable=True)  # [{organization, membership_id}]
    
    # Experience
    years_of_experience = Column(Integer, nullable=True)
    areas_of_expertise = Column(JSON, nullable=True)  # List of expertise areas
    specializations = Column(JSON, nullable=True)  # From SPECIALIZATIONS
    therapy_approaches = Column(JSON, nullable=True)  # From THERAPY_APPROACHES
    
    # Languages
    languages = Column(JSON, nullable=True)  # [{language, proficiency}]
    
    # Consultation Fee
    consultation_fee = Column(Integer, nullable=True)  # Amount in paise/cents
    consultation_fee_currency = Column(String, nullable=False, default="INR")
    fee_notes = Column(String, nullable=True)  # e.g., "Sliding scale available"
    
    # Contact Information (public)
    public_email = Column(String, nullable=True)
    public_phone = Column(String, nullable=True)
    clinic_address = Column(Text, nullable=True)
    website_url = Column(String, nullable=True)
    instagram_handle = Column(String, nullable=True)

    # Profile Images
    profile_photo_path = Column(String, nullable=True)
    cover_image_path = Column(String, nullable=True)
    clinic_logo_path = Column(String, nullable=True)

    # Digital signature/stamp — rendered on invoice PDFs above the practitioner's
    # printed name. Optional; most practitioners won't upload one.
    signature_image_path = Column(String, nullable=True)
    stamp_image_path = Column(String, nullable=True)

    # Onboarding Content
    welcome_message = Column(Text, nullable=True)
    what_to_expect = Column(Text, nullable=True)
    how_therapy_works = Column(Text, nullable=True)
    preparation_guidelines = Column(Text, nullable=True)
    faq_content = Column(JSON, nullable=True)  # [{question, answer}]
    emergency_disclaimer = Column(Text, nullable=True)
    consent_info = Column(Text, nullable=True)
    
    # SEO Metadata
    meta_title = Column(String, nullable=True)
    meta_description = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    published_at = Column(DateTime(timezone=True), nullable=True)  # When profile was first made public
    
    # Relationships
    practitioner = relationship("Practitioner", backref="public_profile")
    resources = relationship("PractitionerResource", back_populates="profile", cascade="all, delete-orphan")
    testimonials = relationship("Testimonial", back_populates="profile", cascade="all, delete-orphan")


class PractitionerResource(Base):
    """Resources uploaded by practitioners for public access."""
    __tablename__ = "practitioner_resources"

    id = Column(String, primary_key=True, default=generate_uuid)
    profile_id = Column(String, ForeignKey("practitioner_profiles.id"), nullable=False, index=True)
    
    # Resource metadata
    resource_type = Column(String, nullable=False)  # From RESOURCE_TYPES
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    
    # File storage (for uploaded documents)
    storage_path = Column(String, nullable=True)
    original_filename = Column(String, nullable=True)
    mime_type = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    
    # Or rich text content (for inline content)
    content = Column(Text, nullable=True)
    
    # Visibility
    is_public = Column(Boolean, nullable=False, default=True)
    display_order = Column(Integer, nullable=False, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    profile = relationship("PractitionerProfile", back_populates="resources")


class Testimonial(Base):
    """Patient testimonials for public profile."""
    __tablename__ = "testimonials"

    id = Column(String, primary_key=True, default=generate_uuid)
    profile_id = Column(String, ForeignKey("practitioner_profiles.id"), nullable=False, index=True)
    
    # Testimonial content
    display_name = Column(String, nullable=False)  # e.g., "A.B." or "Anonymous"
    feedback = Column(Text, nullable=False)
    rating = Column(Integer, nullable=True)  # 1-5 stars, optional
    
    # Visibility
    is_public = Column(Boolean, nullable=False, default=True)
    display_order = Column(Integer, nullable=False, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    profile = relationship("PractitionerProfile", back_populates="testimonials")


# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 5 — Online Booking, Meeting Integration & Notifications
# ═══════════════════════════════════════════════════════════════════════════════

# Booking request statuses (for public booking flow)
BOOKING_REQUEST_STATUSES = [
    "requested",
    "pending_payment",
    "payment_processing",
    "paid",
    "confirmed",
    "cancelled",
    "expired",
]

# Meeting provider types
MEETING_PROVIDERS = [
    "google_meet",
    "zoom",
    "microsoft_teams",
    "custom",
]

# Notification channels
NOTIFICATION_CHANNELS = [
    "email",
    "whatsapp",
    "sms",
    "in_app",
]

# Notification types for templates
NOTIFICATION_EVENT_TYPES = [
    "booking_created",
    "payment_pending",
    "payment_successful",
    "appointment_confirmed",
    "meeting_link_generated",
    "reminder_24h",
    "reminder_2h",
    "reminder_30min",
    "appointment_cancelled",
    "appointment_rescheduled",
    "new_booking_therapist",
    "payment_received_therapist",
]

# Reminder timing options (in minutes before appointment)
REMINDER_TIMINGS = [
    1440,  # 24 hours
    120,   # 2 hours
    30,    # 30 minutes
]


def generate_booking_token():
    """Generate a secure booking token for patient access."""
    import secrets
    return secrets.token_urlsafe(24)


class BookingRequest(Base):
    """Public booking request from patients."""
    __tablename__ = "booking_requests"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, index=True)
    
    # Booking token for patient access (no login required)
    booking_token = Column(String, unique=True, nullable=False, index=True, default=generate_booking_token)
    
    # Patient details (may or may not be an existing patient)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=True, index=True)
    patient_name = Column(String, nullable=False)
    patient_email = Column(String, nullable=False, index=True)
    patient_phone = Column(String, nullable=True)
    
    # Requested slot
    requested_date = Column(Date, nullable=False, index=True)
    requested_start_time = Column(DateTime(timezone=True), nullable=False)
    requested_end_time = Column(DateTime(timezone=True), nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    
    # Session details
    session_type = Column(String, nullable=False, default="therapy_session")
    session_mode = Column(String, nullable=False, default="online")
    
    # Status tracking
    status = Column(String, nullable=False, default="requested")
    
    # Payment integration
    payment_id = Column(String, ForeignKey("payments.id"), nullable=True, unique=True, index=True)
    
    # Resulting appointment (created after payment)
    appointment_id = Column(String, ForeignKey("appointments.id"), nullable=True, unique=True, index=True)
    
    # Meeting link (generated after payment confirmation)
    meeting_link = Column(String, nullable=True)
    meeting_provider = Column(String, nullable=True)
    meeting_id = Column(String, nullable=True)
    
    # Notes from patient
    patient_notes = Column(Text, nullable=True)
    
    # Expiry
    expires_at = Column(DateTime(timezone=True), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancellation_reason = Column(String, nullable=True)
    
    # Relationships
    practitioner = relationship("Practitioner", backref="booking_requests")
    patient = relationship("Patient", backref="booking_requests")
    payment = relationship("Payment", backref="booking_request", foreign_keys=[payment_id])
    appointment = relationship("Appointment", backref="booking_request", foreign_keys=[appointment_id])


class IntakeSubmission(Base):
    """
    Lightweight public intake form submission ("Start Intake" on the patient
    onboarding page) — deliberately NOT a Patient row. It's unverified data from
    an anonymous visitor, so it's kept separate from the clinical patients table
    (which analytics/session/assessment code assumes contains real, accepted
    patients) until a practitioner explicitly accepts it.
    """
    __tablename__ = "intake_submissions"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, index=True)

    full_name = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    gender = Column(String, nullable=False)
    phone = Column(String, nullable=True)  # required by the form/API; nullable at the DB level only so ALTER TABLE works on existing rows
    chief_complaint = Column(Text, nullable=False)

    # "pending" (awaiting practitioner action) / "accepted" / "declined"
    status = Column(String, nullable=False, default="pending", index=True)

    # Set when accepted; the resulting real Patient record
    patient_id = Column(String, ForeignKey("patients.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    practitioner = relationship("Practitioner", backref="intake_submissions")
    patient = relationship("Patient", backref="intake_submission", uselist=False)


class MeetingProviderConfig(Base):
    """Configuration for meeting providers per practitioner."""
    __tablename__ = "meeting_provider_configs"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, unique=True, index=True)
    
    # Default provider
    default_provider = Column(String, nullable=False, default="google_meet")
    
    # Google Meet configuration
    google_calendar_enabled = Column(Boolean, nullable=False, default=False)
    google_credentials = Column(JSON, nullable=True)
    google_refresh_token = Column(String, nullable=True)
    
    # Zoom configuration (future)
    zoom_enabled = Column(Boolean, nullable=False, default=False)
    zoom_account_id = Column(String, nullable=True)
    zoom_client_id = Column(String, nullable=True)
    zoom_client_secret = Column(String, nullable=True)
    
    # Microsoft Teams configuration (future)
    teams_enabled = Column(Boolean, nullable=False, default=False)
    teams_tenant_id = Column(String, nullable=True)
    teams_client_id = Column(String, nullable=True)
    teams_client_secret = Column(String, nullable=True)
    
    # Custom meeting link template
    custom_link_template = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    practitioner = relationship("Practitioner", backref="meeting_config")


class NotificationTemplate(Base):
    """Reusable notification templates."""
    __tablename__ = "notification_templates"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=True, index=True)
    
    # Template identification
    event_type = Column(String, nullable=False, index=True)
    channel = Column(String, nullable=False)
    
    # Template content
    name = Column(String, nullable=False)
    subject = Column(String, nullable=True)
    body = Column(Text, nullable=False)
    
    # For WhatsApp - template ID for pre-approved templates
    whatsapp_template_id = Column(String, nullable=True)
    
    # Whether this is a system template or custom
    is_system = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    practitioner = relationship("Practitioner", backref="notification_templates")


class NotificationLog(Base):
    """Log of all sent notifications."""
    __tablename__ = "notification_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    
    # Who this notification is for
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=True, index=True)
    recipient_type = Column(String, nullable=False)  # patient, therapist
    recipient_email = Column(String, nullable=True)
    recipient_phone = Column(String, nullable=True)
    
    # Notification details
    channel = Column(String, nullable=False)
    event_type = Column(String, nullable=False, index=True)
    template_id = Column(String, ForeignKey("notification_templates.id"), nullable=True)
    
    # Content sent
    subject = Column(String, nullable=True)
    body = Column(Text, nullable=False)
    
    # Reference to related entity
    reference_type = Column(String, nullable=True)  # booking_request, appointment, payment
    reference_id = Column(String, nullable=True)
    
    # Delivery status
    status = Column(String, nullable=False, default="pending")  # pending, sent, delivered, failed
    sent_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    failed_at = Column(DateTime(timezone=True), nullable=True)
    failure_reason = Column(String, nullable=True)
    
    # External provider tracking
    provider_message_id = Column(String, nullable=True)
    provider_response = Column(JSON, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    practitioner = relationship("Practitioner", backref="notification_logs")
    template = relationship("NotificationTemplate")


class ScheduledReminder(Base):
    """Scheduled reminders for appointments."""
    __tablename__ = "scheduled_reminders"

    id = Column(String, primary_key=True, default=generate_uuid)
    
    # What this reminder is for
    booking_request_id = Column(String, ForeignKey("booking_requests.id"), nullable=True, index=True)
    appointment_id = Column(String, ForeignKey("appointments.id"), nullable=True, index=True)
    
    # Reminder details
    reminder_type = Column(String, nullable=False)  # reminder_24h, reminder_2h, reminder_30min
    channel = Column(String, nullable=False)
    
    # Recipient
    recipient_type = Column(String, nullable=False)  # patient, therapist
    recipient_email = Column(String, nullable=True)
    recipient_phone = Column(String, nullable=True)
    
    # Scheduling
    scheduled_for = Column(DateTime(timezone=True), nullable=False, index=True)
    
    # Status
    status = Column(String, nullable=False, default="scheduled")  # scheduled, sent, cancelled, failed
    sent_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    failure_reason = Column(String, nullable=True)
    
    # Link to notification log once sent
    notification_log_id = Column(String, ForeignKey("notification_logs.id"), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    booking_request = relationship("BookingRequest", backref="scheduled_reminders")
    appointment = relationship("Appointment", backref="scheduled_reminders")
    notification_log = relationship("NotificationLog")


class WhatsAppConfig(Base):
    """WhatsApp Business API configuration."""
    __tablename__ = "whatsapp_configs"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, unique=True, index=True)
    
    # WhatsApp Business API credentials
    is_enabled = Column(Boolean, nullable=False, default=False)
    phone_number_id = Column(String, nullable=True)
    business_account_id = Column(String, nullable=True)
    access_token = Column(String, nullable=True)
    
    # Webhook verification
    verify_token = Column(String, nullable=True)
    webhook_secret = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    practitioner = relationship("Practitioner", backref="whatsapp_config")


# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 7 — Settings, Configuration & Platform Integrations
# ═══════════════════════════════════════════════════════════════════════════════

# Audit log action types
AUDIT_ACTION_TYPES = [
    "login",
    "logout",
    "user_create",
    "user_update",
    "user_delete",
    "patient_create",
    "patient_update",
    "patient_delete",
    "appointment_create",
    "appointment_update",
    "appointment_cancel",
    "payment_create",
    "payment_update",
    "payment_refund",
    "settings_update",
    "integration_connect",
    "integration_disconnect",
    "password_change",
    "role_update",
    "permission_update",
]

# Date formats
DATE_FORMATS = [
    "DD/MM/YYYY",
    "MM/DD/YYYY",
    "YYYY-MM-DD",
    "DD-MM-YYYY",
    "DD.MM.YYYY",
]

# Time formats
TIME_FORMATS = [
    "12h",  # 12-hour with AM/PM
    "24h",  # 24-hour format
]

# Currencies
CURRENCIES = [
    "INR",
    "USD",
    "EUR",
    "GBP",
    "AUD",
    "CAD",
]

# Email providers
EMAIL_PROVIDERS = [
    "smtp",
    "sendgrid",
    "mailgun",
    "ses",
]

# WhatsApp providers
WHATSAPP_PROVIDERS = [
    "meta_cloud_api",
    "twilio",
    "messagebird",
]

# Payment gateway providers
PAYMENT_GATEWAY_PROVIDERS = [
    "razorpay",
    "stripe",
    "paypal",
    "square",
]

# Calendar sync directions
CALENDAR_SYNC_DIRECTIONS = [
    "one_way_to_google",
    "one_way_from_google",
    "two_way",
]


class ClinicSettings(Base):
    """Clinic-wide settings managed by administrators."""
    __tablename__ = "clinic_settings"

    id = Column(String, primary_key=True, default=generate_uuid)
    
    # Basic Information
    clinic_name = Column(String, nullable=False, default="My Practice")
    clinic_description = Column(Text, nullable=True)
    clinic_email = Column(String, nullable=True)
    clinic_phone = Column(String, nullable=True)
    clinic_website = Column(String, nullable=True)
    clinic_address = Column(Text, nullable=True)
    instagram_handle = Column(String, nullable=True)

    # Localization
    timezone = Column(String, nullable=False, default="Asia/Kolkata")
    currency = Column(String, nullable=False, default="INR")
    date_format = Column(String, nullable=False, default="DD/MM/YYYY")
    time_format = Column(String, nullable=False, default="12h")
    
    # Logo and Branding (stored as paths)
    logo_path = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AppointmentConfiguration(Base):
    """Default appointment configuration for the clinic."""
    __tablename__ = "appointment_configurations"

    id = Column(String, primary_key=True, default=generate_uuid)
    
    # Default session settings
    default_duration_minutes = Column(Integer, nullable=False, default=50)
    available_durations = Column(JSON, nullable=False, default=lambda: [30, 45, 50, 60, 90])  # Minutes
    buffer_time_minutes = Column(Integer, nullable=False, default=10)
    
    # Working schedule defaults
    default_working_days = Column(JSON, nullable=False, default=lambda: [0, 1, 2, 3, 4])  # Mon-Fri
    default_work_start_time = Column(String, nullable=False, default="09:00")
    default_work_end_time = Column(String, nullable=False, default="18:00")
    default_break_start_time = Column(String, nullable=True, default="13:00")
    default_break_end_time = Column(String, nullable=True, default="14:00")
    
    # Holiday calendar (list of dates)
    holidays = Column(JSON, nullable=True)  # [{date, name}]
    
    # Booking constraints
    max_advance_booking_days = Column(Integer, nullable=False, default=30)  # Days in advance
    min_booking_notice_hours = Column(Integer, nullable=False, default=24)  # Minimum hours notice
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class EmailConfiguration(Base):
    """Email configuration for the platform."""
    __tablename__ = "email_configurations"

    id = Column(String, primary_key=True, default=generate_uuid)
    
    # Provider settings
    provider = Column(String, nullable=False, default="smtp")  # smtp, sendgrid, mailgun, ses
    is_enabled = Column(Boolean, nullable=False, default=False)
    
    # Sender information
    sender_name = Column(String, nullable=True)
    sender_email = Column(String, nullable=True)
    reply_to_email = Column(String, nullable=True)
    
    # SMTP settings (encrypted in production)
    smtp_host = Column(String, nullable=True)
    smtp_port = Column(Integer, nullable=True, default=587)
    smtp_username = Column(String, nullable=True)
    smtp_password = Column(String, nullable=True)  # Should be encrypted
    smtp_use_tls = Column(Boolean, nullable=False, default=True)
    
    # API-based provider settings
    api_key = Column(String, nullable=True)  # For SendGrid, Mailgun, etc.
    api_secret = Column(String, nullable=True)
    
    # Test status
    last_test_at = Column(DateTime(timezone=True), nullable=True)
    last_test_status = Column(String, nullable=True)  # success, failed
    last_test_error = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class PaymentGatewayConfiguration(Base):
    """Payment gateway configuration."""
    __tablename__ = "payment_gateway_configurations"

    id = Column(String, primary_key=True, default=generate_uuid)
    
    # Provider
    provider = Column(String, nullable=False, default="razorpay")  # razorpay, stripe, paypal
    is_enabled = Column(Boolean, nullable=False, default=False)
    is_test_mode = Column(Boolean, nullable=False, default=True)
    
    # API credentials (encrypted in production)
    api_key = Column(String, nullable=True)
    api_secret = Column(String, nullable=True)
    webhook_secret = Column(String, nullable=True)
    
    # Payment settings
    currency = Column(String, nullable=False, default="INR")
    tax_enabled = Column(Boolean, nullable=False, default=False)
    default_tax_percentage = Column(Integer, nullable=True)  # Stored as percentage * 100
    
    # Invoice settings
    invoice_prefix = Column(String, nullable=False, default="INV")
    receipt_prefix = Column(String, nullable=False, default="RCP")
    
    # Test connection status
    last_test_at = Column(DateTime(timezone=True), nullable=True)
    last_test_status = Column(String, nullable=True)
    last_test_error = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class Branding(Base):
    """Platform branding configuration."""
    __tablename__ = "branding"

    id = Column(String, primary_key=True, default=generate_uuid)
    
    # Platform identity
    platform_name = Column(String, nullable=False, default="MMPI-2 Practice")
    
    # Images (stored as paths)
    logo_path = Column(String, nullable=True)
    favicon_path = Column(String, nullable=True)
    email_logo_path = Column(String, nullable=True)
    
    # Footer
    footer_text = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class SecuritySettings(Base):
    """Security settings for the platform."""
    __tablename__ = "security_settings"

    id = Column(String, primary_key=True, default=generate_uuid)
    
    # Password policy
    min_password_length = Column(Integer, nullable=False, default=8)
    require_uppercase = Column(Boolean, nullable=False, default=True)
    require_lowercase = Column(Boolean, nullable=False, default=True)
    require_numbers = Column(Boolean, nullable=False, default=True)
    require_special_chars = Column(Boolean, nullable=False, default=False)
    password_expiry_days = Column(Integer, nullable=True)  # Null = never expires
    
    # Session settings
    session_timeout_minutes = Column(Integer, nullable=False, default=1440)  # 24 hours
    max_login_attempts = Column(Integer, nullable=False, default=5)
    lockout_duration_minutes = Column(Integer, nullable=False, default=30)
    
    # Two-factor authentication (future)
    two_factor_enabled = Column(Boolean, nullable=False, default=False)
    two_factor_required = Column(Boolean, nullable=False, default=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class Role(Base):
    """Custom roles for access control."""
    __tablename__ = "roles"

    id = Column(String, primary_key=True, default=generate_uuid)
    
    # Role identification
    name = Column(String, nullable=False, unique=True)
    display_name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    
    # Role type
    is_system = Column(Boolean, nullable=False, default=False)  # System roles cannot be deleted
    is_active = Column(Boolean, nullable=False, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class Permission(Base):
    """Granular permissions for roles."""
    __tablename__ = "permissions"

    id = Column(String, primary_key=True, default=generate_uuid)
    role_id = Column(String, ForeignKey("roles.id"), nullable=False, index=True)
    
    # Permission definition
    resource = Column(String, nullable=False)  # e.g., "patients", "appointments", "settings"
    action = Column(String, nullable=False)  # e.g., "create", "read", "update", "delete", "manage"
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    role = relationship("Role", backref="permissions")


class AuditLog(Base):
    """Audit log for tracking system activities."""
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    
    # Who performed the action
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=True, index=True)
    practitioner_name = Column(String, nullable=True)  # Snapshot at time of action
    practitioner_email = Column(String, nullable=True)  # Snapshot at time of action
    
    # What action was performed
    action = Column(String, nullable=False, index=True)  # From AUDIT_ACTION_TYPES
    resource_type = Column(String, nullable=True)  # e.g., "patient", "appointment", "payment"
    resource_id = Column(String, nullable=True)
    
    # Action details
    description = Column(Text, nullable=False)
    old_values = Column(JSON, nullable=True)  # Previous state (for updates)
    new_values = Column(JSON, nullable=True)  # New state
    
    # Request context
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    
    # Timestamp
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    
    # Relationships
    practitioner = relationship("Practitioner", backref="audit_logs")


class SystemPreferences(Base):
    """System-wide preferences."""
    __tablename__ = "system_preferences"

    id = Column(String, primary_key=True, default=generate_uuid)
    
    # Default language and localization
    default_language = Column(String, nullable=False, default="en")
    default_timezone = Column(String, nullable=False, default="Asia/Kolkata")
    default_date_format = Column(String, nullable=False, default="DD/MM/YYYY")
    default_time_format = Column(String, nullable=False, default="12h")
    default_currency = Column(String, nullable=False, default="INR")
    number_format = Column(String, nullable=False, default="en-IN")  # Locale for number formatting
    
    # Data retention
    audit_log_retention_days = Column(Integer, nullable=False, default=365)
    notification_log_retention_days = Column(Integer, nullable=False, default=90)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class CalendarIntegration(Base):
    """Calendar integration settings per practitioner."""
    __tablename__ = "calendar_integrations"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, unique=True, index=True)
    
    # Google Calendar
    google_connected = Column(Boolean, nullable=False, default=False)
    google_calendar_id = Column(String, nullable=True)
    google_credentials = Column(JSON, nullable=True)  # OAuth tokens
    google_refresh_token = Column(String, nullable=True)
    google_sync_direction = Column(String, nullable=False, default="two_way")
    google_last_sync_at = Column(DateTime(timezone=True), nullable=True)
    google_sync_error = Column(String, nullable=True)
    
    # Future providers placeholders
    outlook_connected = Column(Boolean, nullable=False, default=False)
    apple_connected = Column(Boolean, nullable=False, default=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    practitioner = relationship("Practitioner", backref="calendar_integration")


class PractitionerNotificationPreferences(Base):
    """Notification preferences per practitioner."""
    __tablename__ = "practitioner_notification_preferences"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, unique=True, index=True)
    
    # Email notifications
    email_new_booking = Column(Boolean, nullable=False, default=True)
    email_booking_cancelled = Column(Boolean, nullable=False, default=True)
    email_booking_rescheduled = Column(Boolean, nullable=False, default=True)
    email_payment_received = Column(Boolean, nullable=False, default=True)
    email_daily_summary = Column(Boolean, nullable=False, default=False)
    
    # In-app notifications
    inapp_new_booking = Column(Boolean, nullable=False, default=True)
    inapp_booking_cancelled = Column(Boolean, nullable=False, default=True)
    inapp_booking_rescheduled = Column(Boolean, nullable=False, default=True)
    inapp_payment_received = Column(Boolean, nullable=False, default=True)
    inapp_reminder_upcoming = Column(Boolean, nullable=False, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    practitioner = relationship("Practitioner", backref="notification_preferences")


class TherapistDailyNote(Base):
    """One free-form note per practitioner per calendar day (dashboard Therapist's Note)."""
    __tablename__ = "therapist_daily_notes"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, index=True)
    note_date = Column(Date, nullable=False, index=True)
    content = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    practitioner = relationship("Practitioner", backref="daily_notes")

    __table_args__ = (
        UniqueConstraint("practitioner_id", "note_date", name="uq_therapist_note_day"),
    )


class ActiveSession(Base):
    """Track active login sessions for security."""
    __tablename__ = "active_sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    practitioner_id = Column(String, ForeignKey("practitioners.id"), nullable=False, index=True)
    
    # Session details
    token_hash = Column(String, nullable=False, index=True)  # Hash of the JWT token
    device_info = Column(String, nullable=True)  # User agent or device name
    ip_address = Column(String, nullable=True)
    location = Column(String, nullable=True)  # Derived from IP if available
    
    # Status
    is_current = Column(Boolean, nullable=False, default=True)  # Is this the current session
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_active_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    practitioner = relationship("Practitioner", backref="active_sessions")
