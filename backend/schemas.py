from pydantic import BaseModel, EmailStr
from typing import Optional, Any
from datetime import date, datetime


# ─── Auth ────────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    role: str
    name: str
    practitioner_id: str
    must_change_password: bool = False
    profile_setup_complete: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ─── Practitioner ────────────────────────────────────────────────────────────────

class PractitionerCreate(BaseModel):
    name: str
    email: str
    password: str


class PractitionerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


class PractitionerResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    ref_code: str
    is_active: bool
    must_change_password: bool = False
    profile_setup_complete: bool = False
    avatar_id: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    session_count: int = 0


# ─── Session (Patient) ──────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    name: str
    dob: date
    gender: str
    nationality: str
    education: str
    ref_code: str


class SessionResponse(BaseModel):
    id: str
    name: str
    dob: date
    age: int
    gender: str
    nationality: str
    education: str
    created_at: datetime
    completed: bool
    answered_count: int = 0
    resume_code: Optional[str] = None


class SessionListItem(BaseModel):
    id: str
    name: str
    dob: date
    age: int
    gender: str
    created_at: datetime
    completed: bool
    answered_count: int = 0


class ResumeRequest(BaseModel):
    resume_code: str


# ─── Questions ───────────────────────────────────────────────────────────────────

class QuestionResponse(BaseModel):
    number: int
    text: str


class QuestionsPage(BaseModel):
    questions: list[QuestionResponse]
    page: int
    total_pages: int
    total_questions: int


# ─── Answers ─────────────────────────────────────────────────────────────────────

class AnswerItem(BaseModel):
    question_number: int
    response: bool


class AnswersBatch(BaseModel):
    answers: list[AnswerItem]


# ─── Results ─────────────────────────────────────────────────────────────────────

class ScoreResult(BaseModel):
    raw_scores: dict[str, float]
    k_corrected_scores: dict[str, float]
    t_scores: dict[str, float]
    harris_lingoes_subscales: Optional[dict[str, Any]] = None
    si_subscales: Optional[dict[str, Any]] = None
    supplementary_scales: Optional[dict[str, Any]] = None


class ResultResponse(BaseModel):
    session_id: str
    patient_name: str
    patient_dob: date
    patient_age: int
    patient_gender: str
    raw_scores: dict[str, float]
    k_corrected_scores: dict[str, float]
    t_scores: dict[str, float]
    harris_lingoes_subscales: Optional[dict[str, Any]] = None
    si_subscales: Optional[dict[str, Any]] = None
    supplementary_scales: Optional[dict[str, Any]] = None
    interpretation: Optional[str] = None
    profile_data: list[dict]


# ─── Patient ──────────────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    full_name: str
    date_of_birth: date
    gender: str
    phone: Optional[str] = None
    email: Optional[str] = None
    emergency_contact: Optional[str] = None
    referral_source: Optional[str] = None


class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    emergency_contact: Optional[str] = None
    referral_source: Optional[str] = None
    status: Optional[str] = None


class PatientResponse(BaseModel):
    id: str
    practitioner_id: str
    full_name: str
    date_of_birth: date
    age: int
    gender: str
    phone: Optional[str] = None
    email: Optional[str] = None
    emergency_contact: Optional[str] = None
    referral_source: Optional[str] = None
    status: str
    avatar_id: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PatientListItem(BaseModel):
    id: str
    full_name: str
    age: int
    gender: str
    status: str
    avatar_id: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    clinical_history_status: Optional[str] = "not_started"


# ─── Therapist Daily Notes (Dashboard) ───────────────────────────────────────────

class TherapistNoteResponse(BaseModel):
    id: Optional[str] = None
    note_date: date
    content: str
    updated_at: Optional[datetime] = None


class TherapistNoteUpsert(BaseModel):
    date: date
    content: str = ""


# ─── Clinical History ─────────────────────────────────────────────────────────

class ClinicalHistoryUpdate(BaseModel):
    current_step: Optional[int] = None
    basic_info: Optional[dict] = None
    presenting_complaint: Optional[dict] = None
    history_present_illness: Optional[dict] = None
    medical_history: Optional[dict] = None
    family_history: Optional[dict] = None
    personal_history: Optional[dict] = None
    relationship_history: Optional[dict] = None
    substance_use: Optional[dict] = None
    trauma_history: Optional[dict] = None
    risk_assessment: Optional[dict] = None
    therapist_notes: Optional[str] = None
    status: Optional[str] = None


class ClinicalHistoryResponse(BaseModel):
    id: str
    patient_id: str
    status: str
    current_step: int
    basic_info: Optional[dict] = None
    presenting_complaint: Optional[dict] = None
    history_present_illness: Optional[dict] = None
    medical_history: Optional[dict] = None
    family_history: Optional[dict] = None
    personal_history: Optional[dict] = None
    relationship_history: Optional[dict] = None
    substance_use: Optional[dict] = None
    trauma_history: Optional[dict] = None
    risk_assessment: Optional[dict] = None
    therapist_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class ClinicalHistorySummary(BaseModel):
    status: str
    current_step: int
    completed_at: Optional[datetime] = None
    updated_at: datetime


# ─── Clinical Documents ───────────────────────────────────────────────────────

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

ALLOWED_MIME_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg",
    "image/png",
    "image/jpg",
    "text/plain",
]


class DocumentUploadResponse(BaseModel):
    id: str
    patient_id: str
    category: str
    display_name: str
    original_filename: str
    mime_type: str
    file_size: int
    version: int
    processing_status: str
    uploaded_by_name: str
    notes: Optional[str] = None
    created_at: datetime


class DocumentResponse(BaseModel):
    id: str
    patient_id: str
    uploaded_by: str
    uploaded_by_name: str
    category: str
    original_filename: str
    display_name: str
    mime_type: str
    file_size: int
    version: int
    parent_document_id: Optional[str] = None
    notes: Optional[str] = None
    processing_status: str
    created_at: datetime
    updated_at: datetime


class DocumentUpdate(BaseModel):
    display_name: Optional[str] = None
    notes: Optional[str] = None
    category: Optional[str] = None


class DocumentListItem(BaseModel):
    id: str
    type: str  # "document" or "assessment"
    name: str
    category: str
    uploaded_by_name: str
    date: datetime
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    status: str
    version: int = 1
    assessment_type: Optional[str] = None
    reference_id: Optional[str] = None


# ─── Assessments ──────────────────────────────────────────────────────────────

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


class AssessmentCreate(BaseModel):
    assessment_type: str
    display_name: str
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    notes: Optional[str] = None


class AssessmentUpdate(BaseModel):
    display_name: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class AssessmentResponse(BaseModel):
    id: str
    patient_id: str
    practitioner_id: str
    practitioner_name: str
    assessment_type: str
    display_name: str
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    status: str
    completion_date: Optional[datetime] = None
    processing_status: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AssessmentListItem(BaseModel):
    """Practitioner-wide assessment list item with patient details."""
    id: str
    patient_id: str
    patient_name: str
    patient_age: int
    patient_gender: str
    assessment_type: str
    display_name: str
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    status: str
    completion_date: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    created_at: datetime
    source: str = "assessment"  # "assessment" | "session"


# ─── Voice Profile ─────────────────────────────────────────────────────────────

class VoiceProfileResponse(BaseModel):
    id: str
    practitioner_id: str
    audio_duration: Optional[int] = None
    status: str
    created_at: datetime
    updated_at: datetime


class VoiceProfileStatus(BaseModel):
    has_voice_profile: bool
    status: Optional[str] = None
    audio_duration: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ─── Therapy Sessions ──────────────────────────────────────────────────────────

AUDIO_MIME_TYPES = [
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/m4a",
    "audio/x-m4a",
    "audio/mp4",
    "video/mp4",
]


class TranscriptSegment(BaseModel):
    speaker: str  # "Therapist" or "Patient"
    timestamp: float  # Start time in seconds
    end_timestamp: Optional[float] = None
    text: str


class SessionSummary(BaseModel):
    presenting_issues: Optional[str] = None
    key_discussion_points: Optional[str] = None
    emotional_themes: Optional[str] = None
    homework_discussed: Optional[str] = None
    action_items: Optional[str] = None
    open_questions: Optional[str] = None


class SOAPNotes(BaseModel):
    subjective: Optional[str] = None
    objective: Optional[str] = None
    assessment: Optional[str] = None
    plan: Optional[str] = None
    edited: bool = False


class TherapySessionCreate(BaseModel):
    session_date: datetime


class TherapySessionResponse(BaseModel):
    id: str
    patient_id: str
    practitioner_id: str
    audio_duration: Optional[int] = None
    original_filename: str
    file_size: int
    session_date: datetime
    detected_language: Optional[str] = None
    transcript: Optional[list[TranscriptSegment]] = None
    transcript_text: Optional[str] = None
    translation: Optional[list[TranscriptSegment]] = None
    translation_text: Optional[str] = None
    summary: Optional[SessionSummary] = None
    soap_notes: Optional[SOAPNotes] = None
    processing_status: str
    processing_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TherapySessionListItem(BaseModel):
    id: str
    patient_id: str
    session_date: datetime
    audio_duration: Optional[int] = None
    detected_language: Optional[str] = None
    processing_status: str
    created_at: datetime


class SOAPNotesUpdate(BaseModel):
    subjective: Optional[str] = None
    objective: Optional[str] = None
    assessment: Optional[str] = None
    plan: Optional[str] = None


# ─── Clinical Intelligence ─────────────────────────────────────────────────────

SOURCE_TYPES = [
    "clinical_history",
    "therapy_session",
    "assessment",
    "clinical_document",
    "mmpi_result",
    "soap_notes",
    "therapist_notes",
]

CONFIDENCE_LEVELS = ["high", "medium", "low"]


class SourceCitation(BaseModel):
    source_type: str
    source_id: str
    excerpt: Optional[str] = None
    date: Optional[datetime] = None


class SymptomItem(BaseModel):
    id: Optional[str] = None
    name: str
    current_status: str  # active, remission, resolved
    severity: Optional[str] = None  # mild, moderate, severe
    first_mention: Optional[datetime] = None
    last_updated: Optional[datetime] = None
    history: Optional[list[dict]] = None
    sources: Optional[list[SourceCitation]] = None
    confidence: str = "medium"


class DiagnosisItem(BaseModel):
    id: Optional[str] = None
    name: str
    status: str  # current, historical, provisional, ruled_out
    icd_code: Optional[str] = None
    diagnosed_date: Optional[datetime] = None
    diagnosed_by: Optional[str] = None
    last_updated: Optional[datetime] = None
    sources: Optional[list[SourceCitation]] = None
    confidence: str = "medium"
    history: Optional[list[dict]] = None


class TreatmentGoalItem(BaseModel):
    id: Optional[str] = None
    goal: str
    status: str  # current, completed, ongoing, discontinued
    created_date: Optional[datetime] = None
    target_date: Optional[datetime] = None
    completed_date: Optional[datetime] = None
    progress_notes: Optional[list[dict]] = None
    sources: Optional[list[SourceCitation]] = None
    confidence: str = "medium"


class RelationshipItem(BaseModel):
    id: Optional[str] = None
    person: str
    relationship_type: str  # mother, father, partner, child, sibling, friend, employer, other
    importance: str = "medium"  # high, medium, low
    notes: Optional[str] = None
    first_mention: Optional[datetime] = None
    last_updated: Optional[datetime] = None
    sources: Optional[list[SourceCitation]] = None
    confidence: str = "medium"


class LifeEventItem(BaseModel):
    id: Optional[str] = None
    event: str
    event_type: str  # marriage, divorce, bereavement, trauma, job_change, relocation, hospitalization, medication_change, other
    date: Optional[datetime] = None
    description: Optional[str] = None
    impact: Optional[str] = None
    sources: Optional[list[SourceCitation]] = None
    confidence: str = "medium"


class RiskFactorItem(BaseModel):
    id: Optional[str] = None
    risk_type: str  # suicide, self_harm, violence, substance_abuse, other
    status: str  # current, historical, resolved
    severity: str = "low"  # low, moderate, high, critical
    first_identified: Optional[datetime] = None
    last_updated: Optional[datetime] = None
    last_assessment: Optional[datetime] = None
    history: Optional[list[dict]] = None
    sources: Optional[list[SourceCitation]] = None
    confidence: str = "medium"


class TimelineItem(BaseModel):
    id: Optional[str] = None
    date: datetime
    event_type: str  # clinical_history, assessment, session, report, life_event, risk_event, diagnosis, treatment
    title: str
    description: Optional[str] = None
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    importance: str = "medium"


class OutstandingQuestionItem(BaseModel):
    id: Optional[str] = None
    question: str
    category: str  # medication, family, sleep, trauma, other
    priority: str = "medium"  # high, medium, low
    created_date: Optional[datetime] = None
    resolved: bool = False
    resolved_date: Optional[datetime] = None
    resolution: Optional[str] = None
    sources: Optional[list[SourceCitation]] = None


class PatientSummary(BaseModel):
    text: str
    last_updated: Optional[datetime] = None
    sources: Optional[list[SourceCitation]] = None


class PsychologicalProfileSection(BaseModel):
    text: Optional[str] = None
    confidence: str = "medium"
    sources: Optional[list[SourceCitation]] = None


class PsychologicalProfile(BaseModel):
    current_presentation: Optional[PsychologicalProfileSection] = None
    behavioral_observations: Optional[PsychologicalProfileSection] = None
    personality_characteristics: Optional[PsychologicalProfileSection] = None
    protective_factors: Optional[PsychologicalProfileSection] = None
    strengths: Optional[list[PsychologicalProfileSection]] = None
    areas_requiring_attention: Optional[list[PsychologicalProfileSection]] = None


class ClinicalIntelligenceResponse(BaseModel):
    id: str
    patient_id: str
    version: int
    patient_summary: Optional[PatientSummary] = None
    psychological_profile: Optional[PsychologicalProfile] = None
    symptoms: Optional[list[SymptomItem]] = None
    diagnoses: Optional[list[DiagnosisItem]] = None
    treatment_goals: Optional[list[TreatmentGoalItem]] = None
    relationships: Optional[list[RelationshipItem]] = None
    life_events: Optional[list[LifeEventItem]] = None
    risk_factors: Optional[list[RiskFactorItem]] = None
    timeline: Optional[list[TimelineItem]] = None
    outstanding_questions: Optional[list[OutstandingQuestionItem]] = None
    last_processed_at: Optional[datetime] = None
    last_source_type: Optional[str] = None
    last_source_id: Optional[str] = None
    pending_updates_count: int = 0
    created_at: datetime
    updated_at: datetime


class ClinicalIntelligenceVersionResponse(BaseModel):
    id: str
    version: int
    change_reason: Optional[str] = None
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    changed_by: Optional[str] = None
    changed_by_name: Optional[str] = None
    created_at: datetime


class ClinicalIntelligenceUpdateResponse(BaseModel):
    id: str
    update_type: str
    section: str
    operation: str
    proposed_changes: dict
    source_type: str
    source_id: str
    source_excerpt: Optional[str] = None
    confidence: str
    reasoning: Optional[str] = None
    review_status: str
    reviewed_by: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    auto_apply: bool
    created_at: datetime


class ReviewUpdateRequest(BaseModel):
    action: str  # approve, reject
    notes: Optional[str] = None


class ClinicalIntelligenceStats(BaseModel):
    total_symptoms: int = 0
    active_symptoms: int = 0
    total_diagnoses: int = 0
    current_diagnoses: int = 0
    total_goals: int = 0
    current_goals: int = 0
    completed_goals: int = 0
    total_relationships: int = 0
    total_life_events: int = 0
    current_risk_factors: int = 0
    outstanding_questions: int = 0
    pending_updates: int = 0
    last_updated: Optional[datetime] = None


# ─── Calendar & Scheduling ──────────────────────────────────────────────────────

SESSION_TYPES = [
    "therapy_session",
    "follow_up",
    "assessment_session",
    "consultation",
]

SESSION_MODES = ["online", "offline"]

APPOINTMENT_STATUSES = [
    "scheduled",
    "completed",
    "cancelled",
    "no_show",
    "rescheduled",
]


class AppointmentCreate(BaseModel):
    patient_id: str
    date: date
    start_time: datetime
    end_time: datetime
    session_type: str = "therapy_session"
    session_mode: str = "offline"
    notes: Optional[str] = None


class AppointmentUpdate(BaseModel):
    date: Optional[date] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    session_type: Optional[str] = None
    session_mode: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    cancellation_reason: Optional[str] = None


class AppointmentReschedule(BaseModel):
    new_date: date
    new_start_time: datetime
    new_end_time: datetime
    notes: Optional[str] = None


class AppointmentResponse(BaseModel):
    id: str
    practitioner_id: str
    practitioner_name: str
    patient_id: str
    patient_name: str
    date: date
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    session_type: str
    session_mode: str
    status: str
    notes: Optional[str] = None
    rescheduled_from_id: Optional[str] = None
    rescheduled_to_id: Optional[str] = None
    cancellation_reason: Optional[str] = None
    meeting_link: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Only populated by the meeting-link endpoint, to report whether the
    # patient was actually emailed (vs. the link merely being generated).
    email_sent: Optional[bool] = None
    email_error: Optional[str] = None


class AppointmentListItem(BaseModel):
    id: str
    practitioner_id: str
    practitioner_name: str
    patient_id: str
    patient_name: str
    date: date
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    session_type: str
    session_mode: str
    status: str
    meeting_link: Optional[str] = None


class CalendarEvent(BaseModel):
    """Calendar event for frontend display"""
    id: str
    title: str
    start: datetime
    end: datetime
    patient_id: str
    patient_name: str
    session_type: str
    session_mode: str
    status: str
    color: Optional[str] = None


class AvailabilityCreate(BaseModel):
    working_days: list[int] = [0, 1, 2, 3, 4]  # Mon-Fri
    work_start_time: str = "09:00"
    work_end_time: str = "18:00"
    break_start_time: Optional[str] = "13:00"
    break_end_time: Optional[str] = "14:00"
    default_session_duration: int = 50
    buffer_minutes: int = 10
    timezone: str = "Asia/Kolkata"


class AvailabilityUpdate(BaseModel):
    working_days: Optional[list[int]] = None
    work_start_time: Optional[str] = None
    work_end_time: Optional[str] = None
    break_start_time: Optional[str] = None
    break_end_time: Optional[str] = None
    default_session_duration: Optional[int] = None
    buffer_minutes: Optional[int] = None
    timezone: Optional[str] = None


class AvailabilityResponse(BaseModel):
    id: str
    practitioner_id: str
    working_days: list[int]
    work_start_time: str
    work_end_time: str
    break_start_time: Optional[str] = None
    break_end_time: Optional[str] = None
    default_session_duration: int
    buffer_minutes: int
    timezone: str
    created_at: datetime
    updated_at: datetime


class UnavailableDateCreate(BaseModel):
    date: date
    reason: Optional[str] = None
    is_full_day: bool = True
    unavailable_start: Optional[str] = None
    unavailable_end: Optional[str] = None


class UnavailableDateResponse(BaseModel):
    id: str
    practitioner_id: str
    date: date
    reason: Optional[str] = None
    is_full_day: bool
    unavailable_start: Optional[str] = None
    unavailable_end: Optional[str] = None
    created_at: datetime


class TimeSlot(BaseModel):
    """Available time slot for booking"""
    start: datetime
    end: datetime
    available: bool = True


class DayAvailability(BaseModel):
    """Availability for a single day"""
    date: date
    is_working_day: bool
    is_unavailable: bool = False
    unavailable_reason: Optional[str] = None
    slots: list[TimeSlot] = []


class TodaySchedule(BaseModel):
    """Today's schedule for dashboard"""
    appointments: list[AppointmentListItem]
    total_count: int
    completed_count: int
    upcoming_count: int


class UpcomingAppointments(BaseModel):
    """Upcoming appointments for dashboard"""
    appointments: list[AppointmentListItem]
    total_count: int


# ─── Payments ─────────────────────────────────────────────────────────────────

PAYMENT_STATUSES = [
    "pending",
    "paid",
    "failed",
    "refunded",
    "cancelled",
    "expired",
]

REFUND_STATUSES = [
    "not_applicable",
    "initiated",
    "completed",
]

PAYMENT_METHODS = [
    "payment_link",
    "cash",
    "bank_transfer",
    "card",
    "upi",
    "other",
]


class PaymentCreate(BaseModel):
    """Payment creation with appointment"""
    session_fee: int  # Amount in paise/cents
    discount_amount: int = 0
    discount_reason: Optional[str] = None
    tax_percentage: Optional[int] = None  # Tax percentage * 100 (e.g., 1800 = 18%)
    notes: Optional[str] = None


class PaymentUpdate(BaseModel):
    """Update payment details"""
    session_fee: Optional[int] = None
    discount_amount: Optional[int] = None
    discount_reason: Optional[str] = None
    tax_percentage: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    payment_method: Optional[str] = None


class PaymentStatusUpdate(BaseModel):
    """Update payment status manually"""
    status: str
    payment_method: Optional[str] = None
    notes: Optional[str] = None


class RefundRequest(BaseModel):
    """Request refund for a payment"""
    refund_amount: Optional[int] = None  # Partial refund, if not provided full refund
    reason: str


class RefundComplete(BaseModel):
    """Mark refund as completed"""
    notes: Optional[str] = None


class PaymentResponse(BaseModel):
    """Full payment response"""
    id: str
    appointment_id: str
    practitioner_id: str
    practitioner_name: str
    patient_id: str
    patient_name: str
    session_fee: int
    discount_amount: int
    discount_reason: Optional[str] = None
    tax_amount: int
    tax_percentage: Optional[int] = None
    final_amount: int
    currency: str
    status: str
    payment_link_token: Optional[str] = None
    payment_link_url: Optional[str] = None
    payment_link_expires_at: Optional[datetime] = None
    payment_method: Optional[str] = None
    paid_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    failure_reason: Optional[str] = None
    refund_status: str
    refund_amount: Optional[int] = None
    refund_reason: Optional[str] = None
    refund_initiated_at: Optional[datetime] = None
    refund_completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    appointment_date: Optional[date] = None
    session_type: Optional[str] = None
    receipt_number: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PaymentListItem(BaseModel):
    """Payment list item for tables"""
    id: str
    appointment_id: str
    practitioner_id: str
    practitioner_name: str
    patient_id: str
    patient_name: str
    final_amount: int
    currency: str
    status: str
    payment_method: Optional[str] = None
    appointment_date: date
    session_type: str
    paid_at: Optional[datetime] = None
    refund_status: str
    receipt_number: Optional[str] = None
    created_at: datetime


class PaymentDashboard(BaseModel):
    """Payment dashboard statistics"""
    pending_count: int
    pending_amount: int
    paid_count: int
    paid_amount: int
    failed_count: int
    refunded_count: int
    refunded_amount: int
    cancelled_count: int
    monthly_revenue: int
    today_revenue: int
    outstanding_amount: int
    currency: str


class RecentTransaction(BaseModel):
    """Recent transaction for dashboard"""
    id: str
    patient_name: str
    amount: int
    currency: str
    status: str
    payment_method: Optional[str] = None
    date: datetime
    appointment_date: date


class ReceiptResponse(BaseModel):
    """Receipt response"""
    id: str
    payment_id: str
    receipt_number: str
    patient_name: str
    patient_email: Optional[str] = None
    practitioner_name: str
    session_fee: int
    discount_amount: int
    tax_amount: int
    final_amount: int
    currency: str
    appointment_date: date
    session_type: str
    payment_method: Optional[str] = None
    payment_date: datetime
    generated_at: datetime


class PaymentHistoryItem(BaseModel):
    """Payment history item for patient profile"""
    id: str
    appointment_id: str
    appointment_date: date
    session_type: str
    amount: int
    currency: str
    status: str
    payment_method: Optional[str] = None
    paid_at: Optional[datetime] = None
    receipt_number: Optional[str] = None


class PaymentFilters(BaseModel):
    """Payment list filters"""
    status: Optional[str] = None
    practitioner_id: Optional[str] = None
    patient_id: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    payment_method: Optional[str] = None
    search: Optional[str] = None  # Search by patient name or receipt number


# ─── Internal Notifications ────────────────────────────────────────────────────

NOTIFICATION_TYPES = [
    "payment_received",
    "payment_failed",
    "refund_completed",
    "appointment_awaiting_payment",
]


class NotificationResponse(BaseModel):
    """Notification response"""
    id: str
    notification_type: str
    title: str
    message: str
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    is_read: bool
    read_at: Optional[datetime] = None
    extra_data: Optional[dict] = None
    created_at: datetime


class NotificationList(BaseModel):
    """List of notifications with counts"""
    notifications: list[NotificationResponse]
    total_count: int
    unread_count: int


# ─── Appointment with Payment ─────────────────────────────────────────────────

class AppointmentWithPaymentCreate(BaseModel):
    """Create appointment with payment details"""
    patient_id: str
    date: date
    start_time: datetime
    end_time: datetime
    session_type: str = "therapy_session"
    session_mode: str = "offline"
    notes: Optional[str] = None
    # Payment details
    session_fee: int  # Amount in paise/cents
    discount_amount: int = 0
    discount_reason: Optional[str] = None
    tax_percentage: Optional[int] = None


class AppointmentResponseWithPayment(BaseModel):
    """Appointment response with payment status"""
    id: str
    practitioner_id: str
    practitioner_name: str
    patient_id: str
    patient_name: str
    date: date
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    session_type: str
    session_mode: str
    status: str
    notes: Optional[str] = None
    rescheduled_from_id: Optional[str] = None
    rescheduled_to_id: Optional[str] = None
    cancellation_reason: Optional[str] = None
    meeting_link: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Payment details
    payment_id: Optional[str] = None
    payment_status: Optional[str] = None
    payment_amount: Optional[int] = None
    payment_currency: Optional[str] = None
    payment_link_url: Optional[str] = None
    receipt_number: Optional[str] = None


# ─── Public Profile ────────────────────────────────────────────────────────────

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


class QualificationItem(BaseModel):
    degree: str
    institution: str
    year: Optional[int] = None


class CertificationItem(BaseModel):
    name: str
    issuer: Optional[str] = None
    year: Optional[int] = None
    expiry: Optional[int] = None


class MembershipItem(BaseModel):
    organization: str
    membership_id: Optional[str] = None


class LanguageItem(BaseModel):
    language: str
    proficiency: str = "fluent"  # native, fluent, intermediate, basic


class FAQItem(BaseModel):
    question: str
    answer: str


# ─── Profile Create/Update ─────────────────────────────────────────────────────

class PractitionerProfileCreate(BaseModel):
    """Initial profile creation (mostly auto-generated)"""
    slug: Optional[str] = None
    display_name: Optional[str] = None


class PractitionerProfileUpdate(BaseModel):
    """Update practitioner profile"""
    # Visibility
    is_public: Optional[bool] = None
    
    # Basic Info
    slug: Optional[str] = None
    display_name: Optional[str] = None
    title: Optional[str] = None
    tagline: Optional[str] = None
    bio: Optional[str] = None
    
    # Qualifications
    qualifications: Optional[list[QualificationItem]] = None
    certifications: Optional[list[CertificationItem]] = None
    license_number: Optional[str] = None
    professional_memberships: Optional[list[MembershipItem]] = None
    
    # Experience
    years_of_experience: Optional[int] = None
    areas_of_expertise: Optional[list[str]] = None
    specializations: Optional[list[str]] = None
    therapy_approaches: Optional[list[str]] = None
    
    # Languages
    languages: Optional[list[LanguageItem]] = None
    
    # Fee
    consultation_fee: Optional[int] = None
    consultation_fee_currency: Optional[str] = None
    fee_notes: Optional[str] = None
    
    # Contact
    public_email: Optional[str] = None
    public_phone: Optional[str] = None
    clinic_address: Optional[str] = None
    website_url: Optional[str] = None
    instagram_handle: Optional[str] = None

    # Onboarding Content
    welcome_message: Optional[str] = None
    what_to_expect: Optional[str] = None
    how_therapy_works: Optional[str] = None
    preparation_guidelines: Optional[str] = None
    faq_content: Optional[list[FAQItem]] = None
    emergency_disclaimer: Optional[str] = None
    consent_info: Optional[str] = None
    
    # SEO
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None


# ─── Profile Response ──────────────────────────────────────────────────────────

class PractitionerProfileResponse(BaseModel):
    """Full profile response for management"""
    id: str
    practitioner_id: str
    slug: str
    is_public: bool
    is_admin_approved: bool
    
    # Basic Info
    display_name: Optional[str] = None
    title: Optional[str] = None
    tagline: Optional[str] = None
    bio: Optional[str] = None
    
    # Qualifications
    qualifications: Optional[list[QualificationItem]] = None
    certifications: Optional[list[CertificationItem]] = None
    license_number: Optional[str] = None
    professional_memberships: Optional[list[MembershipItem]] = None
    
    # Experience
    years_of_experience: Optional[int] = None
    areas_of_expertise: Optional[list[str]] = None
    specializations: Optional[list[str]] = None
    therapy_approaches: Optional[list[str]] = None
    
    # Languages
    languages: Optional[list[LanguageItem]] = None
    
    # Fee
    consultation_fee: Optional[int] = None
    consultation_fee_currency: str = "INR"
    fee_notes: Optional[str] = None
    
    # Contact
    public_email: Optional[str] = None
    public_phone: Optional[str] = None
    clinic_address: Optional[str] = None
    website_url: Optional[str] = None
    instagram_handle: Optional[str] = None

    # Images
    profile_photo_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    clinic_logo_url: Optional[str] = None
    
    # Onboarding Content
    welcome_message: Optional[str] = None
    what_to_expect: Optional[str] = None
    how_therapy_works: Optional[str] = None
    preparation_guidelines: Optional[str] = None
    faq_content: Optional[list[FAQItem]] = None
    emergency_disclaimer: Optional[str] = None
    consent_info: Optional[str] = None
    
    # SEO
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None


class PublicProfileResponse(BaseModel):
    """Public-facing profile response (no sensitive data)"""
    slug: str
    
    # Basic Info
    display_name: Optional[str] = None
    title: Optional[str] = None
    tagline: Optional[str] = None
    bio: Optional[str] = None
    
    # Qualifications
    qualifications: Optional[list[QualificationItem]] = None
    certifications: Optional[list[CertificationItem]] = None
    license_number: Optional[str] = None
    professional_memberships: Optional[list[MembershipItem]] = None
    
    # Experience
    years_of_experience: Optional[int] = None
    areas_of_expertise: Optional[list[str]] = None
    specializations: Optional[list[str]] = None
    therapy_approaches: Optional[list[str]] = None
    
    # Languages
    languages: Optional[list[LanguageItem]] = None
    
    # Fee
    consultation_fee: Optional[int] = None
    consultation_fee_currency: str = "INR"
    fee_notes: Optional[str] = None
    
    # Contact
    public_email: Optional[str] = None
    public_phone: Optional[str] = None
    clinic_address: Optional[str] = None
    website_url: Optional[str] = None
    instagram_handle: Optional[str] = None

    # Images
    profile_photo_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    clinic_logo_url: Optional[str] = None
    
    # SEO
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None


class PublicOnboardingResponse(BaseModel):
    """Onboarding content for patients"""
    slug: str
    display_name: Optional[str] = None
    title: Optional[str] = None
    profile_photo_url: Optional[str] = None
    
    # Onboarding Content
    welcome_message: Optional[str] = None
    what_to_expect: Optional[str] = None
    how_therapy_works: Optional[str] = None
    preparation_guidelines: Optional[str] = None
    faq_content: Optional[list[FAQItem]] = None
    emergency_disclaimer: Optional[str] = None
    consent_info: Optional[str] = None


# ─── Resources ─────────────────────────────────────────────────────────────────

class ResourceCreate(BaseModel):
    """Create a resource"""
    resource_type: str
    title: str
    description: Optional[str] = None
    content: Optional[str] = None  # For text content
    is_public: bool = True
    display_order: int = 0


class ResourceUpdate(BaseModel):
    """Update a resource"""
    resource_type: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    is_public: Optional[bool] = None
    display_order: Optional[int] = None


class ResourceResponse(BaseModel):
    """Resource response"""
    id: str
    profile_id: str
    resource_type: str
    title: str
    description: Optional[str] = None
    content: Optional[str] = None
    file_url: Optional[str] = None
    original_filename: Optional[str] = None
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    is_public: bool
    display_order: int
    created_at: datetime
    updated_at: datetime


class PublicResourceResponse(BaseModel):
    """Public resource response"""
    id: str
    resource_type: str
    title: str
    description: Optional[str] = None
    content: Optional[str] = None
    file_url: Optional[str] = None
    original_filename: Optional[str] = None
    mime_type: Optional[str] = None


# ─── Testimonials ──────────────────────────────────────────────────────────────

class TestimonialCreate(BaseModel):
    """Create a testimonial"""
    display_name: str  # e.g., "A.B." or "Anonymous"
    feedback: str
    rating: Optional[int] = None  # 1-5
    is_public: bool = True
    display_order: int = 0


class TestimonialUpdate(BaseModel):
    """Update a testimonial"""
    display_name: Optional[str] = None
    feedback: Optional[str] = None
    rating: Optional[int] = None
    is_public: Optional[bool] = None
    display_order: Optional[int] = None


class TestimonialResponse(BaseModel):
    """Testimonial response"""
    id: str
    profile_id: str
    display_name: str
    feedback: str
    rating: Optional[int] = None
    is_public: bool
    display_order: int
    created_at: datetime
    updated_at: datetime


class PublicTestimonialResponse(BaseModel):
    """Public testimonial response"""
    id: str
    display_name: str
    feedback: str
    rating: Optional[int] = None


# ─── Availability Preview ──────────────────────────────────────────────────────

class AvailabilitySlotPreview(BaseModel):
    """Availability slot for public preview"""
    start: datetime
    end: datetime


class DayAvailabilityPreview(BaseModel):
    """Day availability for public preview"""
    date: date
    is_available: bool
    slots: list[AvailabilitySlotPreview] = []


class AvailabilityPreviewResponse(BaseModel):
    """Availability preview for public profile"""
    practitioner_slug: str
    timezone: str
    days: list[DayAvailabilityPreview]


# ─── Admin Controls ────────────────────────────────────────────────────────────

class AdminProfileUpdate(BaseModel):
    """Admin update for profile"""
    is_admin_approved: Optional[bool] = None
    is_public: Optional[bool] = None


class ProfileListItem(BaseModel):
    """Profile list item for admin view"""
    id: str
    practitioner_id: str
    practitioner_name: str
    practitioner_email: str
    slug: str
    display_name: Optional[str] = None
    is_public: bool
    is_admin_approved: bool
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None


# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 5 — Online Booking, Meeting Integration & Notifications
# ═══════════════════════════════════════════════════════════════════════════════

# Booking request statuses
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


# ─── Public Booking ───────────────────────────────────────────────────────────

class PublicBookingSlot(BaseModel):
    """Available slot for public booking"""
    start: datetime
    end: datetime
    duration_minutes: int


class PublicBookingDay(BaseModel):
    """Day with available slots for public booking"""
    date: date
    is_available: bool
    slots: list[PublicBookingSlot] = []


class PublicAvailableSlotsResponse(BaseModel):
    """Available slots response for public booking"""
    practitioner_slug: str
    practitioner_name: str
    timezone: str
    session_types: list[dict]  # [{id, name, duration_minutes, fee}]
    days: list[PublicBookingDay]


class BookingRequestCreate(BaseModel):
    """Create a new booking request"""
    patient_name: str
    patient_email: EmailStr
    patient_phone: Optional[str] = None
    requested_date: date
    requested_start_time: datetime
    session_type: str = "therapy_session"
    session_mode: str = "online"
    patient_notes: Optional[str] = None


class BookingRequestResponse(BaseModel):
    """Booking request response"""
    id: str
    booking_token: str
    practitioner_id: str
    practitioner_name: str
    patient_name: str
    patient_email: str
    patient_phone: Optional[str] = None
    requested_date: date
    requested_start_time: datetime
    requested_end_time: datetime
    duration_minutes: int
    session_type: str
    session_mode: str
    status: str
    patient_notes: Optional[str] = None
    payment_id: Optional[str] = None
    payment_status: Optional[str] = None
    payment_amount: Optional[int] = None
    payment_currency: Optional[str] = None
    payment_link_url: Optional[str] = None
    appointment_id: Optional[str] = None
    meeting_link: Optional[str] = None
    meeting_provider: Optional[str] = None
    expires_at: Optional[datetime] = None
    created_at: datetime
    confirmed_at: Optional[datetime] = None


class BookingConfirmationResponse(BaseModel):
    """Public booking confirmation for patients"""
    booking_token: str
    status: str
    practitioner_name: str
    practitioner_title: Optional[str] = None
    practitioner_photo_url: Optional[str] = None
    patient_name: str
    appointment_date: date
    appointment_time: datetime
    duration_minutes: int
    session_type: str
    session_mode: str
    meeting_link: Optional[str] = None
    payment_status: Optional[str] = None
    payment_amount: Optional[int] = None
    payment_currency: Optional[str] = None
    receipt_number: Optional[str] = None
    clinic_address: Optional[str] = None
    therapist_phone: Optional[str] = None
    therapist_email: Optional[str] = None


class BookingListItem(BaseModel):
    """Booking request list item for therapist view"""
    id: str
    booking_token: str
    patient_name: str
    patient_email: str
    patient_phone: Optional[str] = None
    requested_date: date
    requested_start_time: datetime
    duration_minutes: int
    session_type: str
    session_mode: str
    status: str
    payment_status: Optional[str] = None
    created_at: datetime


# ─── Public Intake ────────────────────────────────────────────────────────────

class IntakeSubmissionCreate(BaseModel):
    """Public 'Start Intake' form submission (unauthenticated, from a prospective patient)"""
    full_name: str
    age: int
    gender: str
    phone: str
    chief_complaint: str


class IntakeSubmissionResponse(BaseModel):
    """Intake submission list item for the practitioner-facing Patients view"""
    id: str
    full_name: str
    age: int
    gender: str
    phone: Optional[str] = None
    chief_complaint: str
    status: str
    created_at: datetime


# ─── Meeting Integration ──────────────────────────────────────────────────────

class MeetingProviderConfigResponse(BaseModel):
    """Meeting provider configuration response"""
    id: str
    practitioner_id: str
    default_provider: str
    google_calendar_enabled: bool
    zoom_enabled: bool
    teams_enabled: bool
    has_custom_link: bool
    created_at: datetime
    updated_at: datetime


class MeetingProviderConfigUpdate(BaseModel):
    """Update meeting provider configuration"""
    default_provider: Optional[str] = None
    custom_link_template: Optional[str] = None


class MeetingLinkResponse(BaseModel):
    """Meeting link response"""
    meeting_link: str
    meeting_provider: str
    meeting_id: Optional[str] = None


# ─── Notification Templates ───────────────────────────────────────────────────

class NotificationTemplateCreate(BaseModel):
    """Create a notification template"""
    event_type: str
    channel: str
    name: str
    subject: Optional[str] = None
    body: str
    whatsapp_template_id: Optional[str] = None
    is_active: bool = True


class NotificationTemplateUpdate(BaseModel):
    """Update a notification template"""
    name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    whatsapp_template_id: Optional[str] = None
    is_active: Optional[bool] = None


class NotificationTemplateResponse(BaseModel):
    """Notification template response"""
    id: str
    practitioner_id: Optional[str] = None
    event_type: str
    channel: str
    name: str
    subject: Optional[str] = None
    body: str
    whatsapp_template_id: Optional[str] = None
    is_system: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ─── Notification Logs ────────────────────────────────────────────────────────

class NotificationLogResponse(BaseModel):
    """Notification log response"""
    id: str
    recipient_type: str
    recipient_email: Optional[str] = None
    recipient_phone: Optional[str] = None
    channel: str
    event_type: str
    subject: Optional[str] = None
    body: str
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    status: str
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    failure_reason: Optional[str] = None
    created_at: datetime


class NotificationLogList(BaseModel):
    """List of notification logs"""
    notifications: list[NotificationLogResponse]
    total_count: int


# ─── Scheduled Reminders ──────────────────────────────────────────────────────

class ScheduledReminderResponse(BaseModel):
    """Scheduled reminder response"""
    id: str
    booking_request_id: Optional[str] = None
    appointment_id: Optional[str] = None
    reminder_type: str
    channel: str
    recipient_type: str
    recipient_email: Optional[str] = None
    recipient_phone: Optional[str] = None
    scheduled_for: datetime
    status: str
    sent_at: Optional[datetime] = None
    created_at: datetime


class ReminderSettingsUpdate(BaseModel):
    """Update reminder settings for a booking/appointment"""
    enable_24h_reminder: bool = True
    enable_2h_reminder: bool = True
    enable_30min_reminder: bool = True
    email_reminders: bool = True
    whatsapp_reminders: bool = False


# ─── WhatsApp Configuration ───────────────────────────────────────────────────

class WhatsAppConfigResponse(BaseModel):
    """WhatsApp configuration response"""
    id: str
    practitioner_id: str
    is_enabled: bool
    phone_number_id: Optional[str] = None
    business_account_id: Optional[str] = None
    has_access_token: bool
    created_at: datetime
    updated_at: datetime


class WhatsAppConfigUpdate(BaseModel):
    """Update WhatsApp configuration"""
    is_enabled: Optional[bool] = None
    phone_number_id: Optional[str] = None
    business_account_id: Optional[str] = None
    access_token: Optional[str] = None


# ─── Extended Inbox Notifications ─────────────────────────────────────────────

EXTENDED_NOTIFICATION_TYPES = [
    # Payment related
    "payment_received",
    "payment_failed",
    "refund_completed",
    "appointment_awaiting_payment",
    # Booking related
    "new_booking_request",
    "booking_confirmed",
    "booking_cancelled",
    "booking_rescheduled",
    # Meeting related
    "meeting_link_generated",
    # Reminder related
    "reminder_sent",
]


class InboxNotificationResponse(BaseModel):
    """Extended notification response for inbox"""
    id: str
    notification_type: str
    title: str
    message: str
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    is_read: bool
    read_at: Optional[datetime] = None
    extra_data: Optional[dict] = None
    # Additional context
    patient_name: Optional[str] = None
    patient_id: Optional[str] = None
    appointment_date: Optional[date] = None
    amount: Optional[int] = None
    currency: Optional[str] = None
    created_at: datetime


class InboxNotificationList(BaseModel):
    """Inbox notification list with counts by type"""
    notifications: list[InboxNotificationResponse]
    total_count: int
    unread_count: int
    counts_by_type: dict  # {notification_type: count}


# ─── Patient Appointment View (No Login) ──────────────────────────────────────

class PatientAppointmentView(BaseModel):
    """Appointment view for patients (accessed via token)"""
    booking_token: str
    status: str
    
    # Therapist info
    practitioner_name: str
    practitioner_title: Optional[str] = None
    practitioner_photo_url: Optional[str] = None
    clinic_address: Optional[str] = None
    
    # Appointment details
    appointment_date: date
    appointment_time: datetime
    duration_minutes: int
    session_type: str
    session_mode: str
    
    # Meeting details (only shown if confirmed and online)
    meeting_link: Optional[str] = None
    meeting_provider: Optional[str] = None
    
    # Payment details
    payment_status: Optional[str] = None
    payment_amount: Optional[int] = None
    payment_currency: Optional[str] = None
    payment_link_url: Optional[str] = None
    receipt_number: Optional[str] = None
    
    # Contact for questions
    therapist_email: Optional[str] = None
    therapist_phone: Optional[str] = None


class PatientReceiptView(BaseModel):
    """Receipt view for patients"""
    receipt_number: str
    patient_name: str
    practitioner_name: str
    appointment_date: date
    session_type: str
    session_fee: int
    discount_amount: int
    tax_amount: int
    final_amount: int
    currency: str
    payment_method: Optional[str] = None
    payment_date: datetime
    generated_at: datetime


# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 6 — Practice Analytics & Reporting
# ═══════════════════════════════════════════════════════════════════════════════

ANALYTICS_PERIODS = [
    "today",
    "this_week",
    "this_month",
    "last_month",
    "this_quarter",
    "this_year",
    "custom",
]


class DateRange(BaseModel):
    """Date range for analytics period"""
    start: date
    end: date


class PracticeOverviewResponse(BaseModel):
    """Practice overview metrics"""
    total_patients: int
    active_patients: int
    new_patients_this_month: int
    returning_patients: int
    total_appointments: int
    sessions_completed: int
    upcoming_appointments: int
    pending_payments: int


class MonthlyCount(BaseModel):
    """Monthly count data point"""
    year: int
    month: int
    count: int


class PatientAnalyticsResponse(BaseModel):
    """Patient analytics response"""
    active_patients: int
    inactive_patients: int
    new_patients_by_month: list[MonthlyCount]
    patients_at_period_start: int
    avg_sessions_per_patient: float
    retention_rate: float
    period: DateRange


class AppointmentTrendItem(BaseModel):
    """Appointment trend data point"""
    date: Optional[str] = None
    year: Optional[int] = None
    week: Optional[int] = None
    count: int


class AppointmentAnalyticsResponse(BaseModel):
    """Appointment analytics response"""
    total: int
    completed: int
    cancelled: int
    rescheduled: int
    no_shows: int
    scheduled: int
    attendance_rate: float
    avg_duration_minutes: int
    appointments_by_day: dict[int, int]
    appointments_by_type: dict[str, int]
    appointment_trend: list[AppointmentTrendItem]
    period: DateRange


class MonthlyRevenue(BaseModel):
    """Monthly revenue data point"""
    year: int
    month: int
    amount: int
    count: int


class PaymentMethodStats(BaseModel):
    """Payment method statistics"""
    amount: int
    count: int


class RevenueAnalyticsResponse(BaseModel):
    """Revenue analytics response"""
    total_revenue: int
    monthly_revenue: int
    yearly_revenue: int
    outstanding_payments: int
    total_refunds: int
    avg_session_fee: int
    revenue_by_month: list[MonthlyRevenue]
    revenue_by_method: dict[str, PaymentMethodStats]
    currency: str
    period: DateRange


class AssessmentTypeStats(BaseModel):
    """Assessment type statistics"""
    total: int
    completed: int


class AssessmentTrendItem(BaseModel):
    """Assessment trend data point"""
    year: int
    month: int
    total: int
    completed: int


class AssessmentAnalyticsResponse(BaseModel):
    """Assessment analytics response"""
    total_sent: int
    total_completed: int
    pending: int
    completion_rate: float
    assessments_by_type: dict[str, AssessmentTypeStats]
    assessment_trend: list[AssessmentTrendItem]
    period: DateRange


class PractitionerAnalyticsItem(BaseModel):
    """Individual practitioner analytics"""
    practitioner_id: str
    name: str
    email: str
    role: str
    patients_managed: int
    appointments_total: int
    appointments_completed: int
    revenue: int
    attendance_rate: float
    cancellation_rate: float
    assessment_completion_rate: float


class PractitionerAnalyticsResponse(BaseModel):
    """Practitioner analytics response (admin only)"""
    practitioners: list[PractitionerAnalyticsItem]
    period: DateRange


class HomeDashboardSummary(BaseModel):
    """Home dashboard summary metrics"""
    revenue_this_month: int
    today_appointments: int
    pending_payments_count: int
    pending_payments_amount: int
    new_patients_this_month: int
    attendance_rate: float
    currency: str


class AnalyticsExportRequest(BaseModel):
    """Request for analytics export"""
    report_type: str  # overview, patients, appointments, revenue, assessments, practitioners
    period: str = "this_month"
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    format: str = "csv"  # csv, excel, pdf


# ═══════════════════════════════════════════════════════════════════════════════
#  PHASE 7 — Settings, Configuration & Platform Integrations
# ═══════════════════════════════════════════════════════════════════════════════

# Constants
DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD-MM-YYYY", "DD.MM.YYYY"]
TIME_FORMATS = ["12h", "24h"]
CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD"]
EMAIL_PROVIDERS = ["smtp", "sendgrid", "mailgun", "ses"]
WHATSAPP_PROVIDERS = ["meta_cloud_api", "twilio", "messagebird"]
PAYMENT_GATEWAY_PROVIDERS = ["razorpay", "stripe", "paypal", "square"]
CALENDAR_SYNC_DIRECTIONS = ["one_way_to_google", "one_way_from_google", "two_way"]


# ─── Clinic Settings ───────────────────────────────────────────────────────────

class ClinicSettingsUpdate(BaseModel):
    """Update clinic settings"""
    clinic_name: Optional[str] = None
    clinic_description: Optional[str] = None
    clinic_email: Optional[str] = None
    clinic_phone: Optional[str] = None
    clinic_website: Optional[str] = None
    clinic_address: Optional[str] = None
    instagram_handle: Optional[str] = None
    timezone: Optional[str] = None
    currency: Optional[str] = None
    date_format: Optional[str] = None
    time_format: Optional[str] = None


class ClinicSettingsResponse(BaseModel):
    """Clinic settings response"""
    id: str
    clinic_name: str
    clinic_description: Optional[str] = None
    clinic_email: Optional[str] = None
    clinic_phone: Optional[str] = None
    clinic_website: Optional[str] = None
    clinic_address: Optional[str] = None
    instagram_handle: Optional[str] = None
    timezone: str
    currency: str
    date_format: str
    time_format: str
    logo_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ─── Appointment Configuration ─────────────────────────────────────────────────

class HolidayItem(BaseModel):
    """Holiday definition"""
    date: date
    name: str


class AppointmentConfigUpdate(BaseModel):
    """Update appointment configuration"""
    default_duration_minutes: Optional[int] = None
    available_durations: Optional[list[int]] = None
    buffer_time_minutes: Optional[int] = None
    default_working_days: Optional[list[int]] = None
    default_work_start_time: Optional[str] = None
    default_work_end_time: Optional[str] = None
    default_break_start_time: Optional[str] = None
    default_break_end_time: Optional[str] = None
    holidays: Optional[list[HolidayItem]] = None
    max_advance_booking_days: Optional[int] = None
    min_booking_notice_hours: Optional[int] = None


class AppointmentConfigResponse(BaseModel):
    """Appointment configuration response"""
    id: str
    default_duration_minutes: int
    available_durations: list[int]
    buffer_time_minutes: int
    default_working_days: list[int]
    default_work_start_time: str
    default_work_end_time: str
    default_break_start_time: Optional[str] = None
    default_break_end_time: Optional[str] = None
    holidays: Optional[list[HolidayItem]] = None
    max_advance_booking_days: int
    min_booking_notice_hours: int
    created_at: datetime
    updated_at: datetime


# ─── Email Configuration ───────────────────────────────────────────────────────

class EmailConfigUpdate(BaseModel):
    """Update email configuration"""
    provider: Optional[str] = None
    is_enabled: Optional[bool] = None
    sender_name: Optional[str] = None
    sender_email: Optional[str] = None
    reply_to_email: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None


class EmailConfigResponse(BaseModel):
    """Email configuration response"""
    id: str
    provider: str
    is_enabled: bool
    sender_name: Optional[str] = None
    sender_email: Optional[str] = None
    reply_to_email: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_use_tls: bool
    has_api_key: bool = False
    last_test_at: Optional[datetime] = None
    last_test_status: Optional[str] = None
    last_test_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TestEmailRequest(BaseModel):
    """Test email request"""
    recipient_email: str


class TestEmailResponse(BaseModel):
    """Test email response"""
    success: bool
    message: str
    error: Optional[str] = None


# ─── Payment Gateway Configuration ─────────────────────────────────────────────

class PaymentGatewayConfigUpdate(BaseModel):
    """Update payment gateway configuration"""
    provider: Optional[str] = None
    is_enabled: Optional[bool] = None
    is_test_mode: Optional[bool] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    webhook_secret: Optional[str] = None
    currency: Optional[str] = None
    tax_enabled: Optional[bool] = None
    default_tax_percentage: Optional[int] = None
    invoice_prefix: Optional[str] = None
    receipt_prefix: Optional[str] = None


class PaymentGatewayConfigResponse(BaseModel):
    """Payment gateway configuration response"""
    id: str
    provider: str
    is_enabled: bool
    is_test_mode: bool
    has_api_key: bool = False
    has_api_secret: bool = False
    has_webhook_secret: bool = False
    currency: str
    tax_enabled: bool
    default_tax_percentage: Optional[int] = None
    invoice_prefix: str
    receipt_prefix: str
    last_test_at: Optional[datetime] = None
    last_test_status: Optional[str] = None
    last_test_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TestPaymentGatewayResponse(BaseModel):
    """Test payment gateway response"""
    success: bool
    message: str
    error: Optional[str] = None


# ─── Branding ──────────────────────────────────────────────────────────────────

class BrandingUpdate(BaseModel):
    """Update branding"""
    platform_name: Optional[str] = None
    footer_text: Optional[str] = None


class BrandingResponse(BaseModel):
    """Branding response"""
    id: str
    platform_name: str
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    email_logo_url: Optional[str] = None
    footer_text: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ─── Security Settings ─────────────────────────────────────────────────────────

class SecuritySettingsUpdate(BaseModel):
    """Update security settings"""
    min_password_length: Optional[int] = None
    require_uppercase: Optional[bool] = None
    require_lowercase: Optional[bool] = None
    require_numbers: Optional[bool] = None
    require_special_chars: Optional[bool] = None
    password_expiry_days: Optional[int] = None
    session_timeout_minutes: Optional[int] = None
    max_login_attempts: Optional[int] = None
    lockout_duration_minutes: Optional[int] = None
    two_factor_enabled: Optional[bool] = None
    two_factor_required: Optional[bool] = None


class SecuritySettingsResponse(BaseModel):
    """Security settings response"""
    id: str
    min_password_length: int
    require_uppercase: bool
    require_lowercase: bool
    require_numbers: bool
    require_special_chars: bool
    password_expiry_days: Optional[int] = None
    session_timeout_minutes: int
    max_login_attempts: int
    lockout_duration_minutes: int
    two_factor_enabled: bool
    two_factor_required: bool
    created_at: datetime
    updated_at: datetime


# ─── Roles & Permissions ───────────────────────────────────────────────────────

class PermissionItem(BaseModel):
    """Permission definition"""
    resource: str
    action: str


class RoleCreate(BaseModel):
    """Create a new role"""
    name: str
    display_name: str
    description: Optional[str] = None
    permissions: list[PermissionItem] = []


class RoleUpdate(BaseModel):
    """Update a role"""
    display_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    permissions: Optional[list[PermissionItem]] = None


class RoleResponse(BaseModel):
    """Role response"""
    id: str
    name: str
    display_name: str
    description: Optional[str] = None
    is_system: bool
    is_active: bool
    permissions: list[PermissionItem] = []
    created_at: datetime
    updated_at: datetime


class RoleListItem(BaseModel):
    """Role list item"""
    id: str
    name: str
    display_name: str
    description: Optional[str] = None
    is_system: bool
    is_active: bool
    permissions_count: int = 0
    created_at: datetime


# ─── Audit Logs ────────────────────────────────────────────────────────────────

class AuditLogResponse(BaseModel):
    """Audit log response"""
    id: str
    practitioner_id: Optional[str] = None
    practitioner_name: Optional[str] = None
    practitioner_email: Optional[str] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    description: str
    old_values: Optional[dict] = None
    new_values: Optional[dict] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime


class AuditLogFilters(BaseModel):
    """Audit log filters"""
    action: Optional[str] = None
    resource_type: Optional[str] = None
    practitioner_id: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    search: Optional[str] = None


class AuditLogListResponse(BaseModel):
    """Audit log list response"""
    logs: list[AuditLogResponse]
    total_count: int
    page: int
    page_size: int


# ─── System Preferences ────────────────────────────────────────────────────────

class SystemPreferencesUpdate(BaseModel):
    """Update system preferences"""
    default_language: Optional[str] = None
    default_timezone: Optional[str] = None
    default_date_format: Optional[str] = None
    default_time_format: Optional[str] = None
    default_currency: Optional[str] = None
    number_format: Optional[str] = None
    audit_log_retention_days: Optional[int] = None
    notification_log_retention_days: Optional[int] = None


class SystemPreferencesResponse(BaseModel):
    """System preferences response"""
    id: str
    default_language: str
    default_timezone: str
    default_date_format: str
    default_time_format: str
    default_currency: str
    number_format: str
    audit_log_retention_days: int
    notification_log_retention_days: int
    created_at: datetime
    updated_at: datetime


# ─── Calendar Integration ──────────────────────────────────────────────────────

class CalendarIntegrationUpdate(BaseModel):
    """Update calendar integration"""
    google_sync_direction: Optional[str] = None


class CalendarIntegrationResponse(BaseModel):
    """Calendar integration response"""
    id: str
    practitioner_id: str
    google_connected: bool
    google_calendar_id: Optional[str] = None
    google_sync_direction: str
    google_last_sync_at: Optional[datetime] = None
    google_sync_error: Optional[str] = None
    outlook_connected: bool
    apple_connected: bool
    created_at: datetime
    updated_at: datetime


class GoogleCalendarConnectRequest(BaseModel):
    """Request to connect Google Calendar"""
    authorization_code: str
    redirect_uri: str


class GoogleAuthUrlResponse(BaseModel):
    """Google OAuth consent URL for the Calendar/Meet connect flow"""
    auth_url: str


class CalendarSyncResponse(BaseModel):
    """Calendar sync response"""
    success: bool
    message: str
    synced_at: Optional[datetime] = None
    events_synced: int = 0
    error: Optional[str] = None


# ─── Practitioner Notification Preferences ─────────────────────────────────────

class NotificationPreferencesUpdate(BaseModel):
    """Update notification preferences"""
    email_new_booking: Optional[bool] = None
    email_booking_cancelled: Optional[bool] = None
    email_booking_rescheduled: Optional[bool] = None
    email_payment_received: Optional[bool] = None
    email_daily_summary: Optional[bool] = None
    inapp_new_booking: Optional[bool] = None
    inapp_booking_cancelled: Optional[bool] = None
    inapp_booking_rescheduled: Optional[bool] = None
    inapp_payment_received: Optional[bool] = None
    inapp_reminder_upcoming: Optional[bool] = None


class NotificationPreferencesResponse(BaseModel):
    """Notification preferences response"""
    id: str
    practitioner_id: str
    email_new_booking: bool
    email_booking_cancelled: bool
    email_booking_rescheduled: bool
    email_payment_received: bool
    email_daily_summary: bool
    inapp_new_booking: bool
    inapp_booking_cancelled: bool
    inapp_booking_rescheduled: bool
    inapp_payment_received: bool
    inapp_reminder_upcoming: bool
    created_at: datetime
    updated_at: datetime


# ─── Active Sessions ───────────────────────────────────────────────────────────

class ActiveSessionResponse(BaseModel):
    """Active session response"""
    id: str
    device_info: Optional[str] = None
    ip_address: Optional[str] = None
    location: Optional[str] = None
    is_current: bool
    created_at: datetime
    last_active_at: datetime


class ActiveSessionsListResponse(BaseModel):
    """Active sessions list response"""
    sessions: list[ActiveSessionResponse]
    total_count: int


# ─── Data Management ───────────────────────────────────────────────────────────

class DataExportRequest(BaseModel):
    """Data export request"""
    export_type: str  # patients, appointments, payments, all
    format: str = "csv"  # csv, json, xlsx
    include_archived: bool = False


class DataExportResponse(BaseModel):
    """Data export response"""
    success: bool
    download_url: Optional[str] = None
    file_name: Optional[str] = None
    message: str


class DataImportResponse(BaseModel):
    """Data import response"""
    success: bool
    records_imported: int = 0
    records_failed: int = 0
    errors: list[str] = []
    message: str


class DataRetentionSettings(BaseModel):
    """Data retention settings"""
    audit_log_retention_days: int = 365
    notification_log_retention_days: int = 90
    archived_patient_retention_days: Optional[int] = None  # Null = keep forever


# ─── Settings Navigation ───────────────────────────────────────────────────────

class SettingsSectionItem(BaseModel):
    """Settings section item"""
    id: str
    label: str
    description: str
    icon: str


class SettingsNavigation(BaseModel):
    """Settings navigation for role"""
    role: str
    sections: list[SettingsSectionItem]
