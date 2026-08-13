import os
import io
import math
import json
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone, timedelta

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy import select, func, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession
from dotenv import load_dotenv

load_dotenv()

from database import get_db, init_db
from models import (
    Practitioner, Question, Session, Answer, Result, Patient, ClinicalHistory, 
    ClinicalDocument, Assessment, VoiceProfile, TherapySession, 
    ClinicalIntelligence, ClinicalIntelligenceVersion, ClinicalIntelligenceUpdate,
    Payment, Receipt, InternalNotification,
    PractitionerProfile, PractitionerResource, Testimonial,
    BookingRequest, MeetingProviderConfig, NotificationTemplate, NotificationLog,
    ScheduledReminder, WhatsAppConfig, PractitionerAvailability, UnavailableDate, Appointment,
    TherapistDailyNote, IntakeSubmission,
    generate_payment_link_token, generate_profile_slug, generate_uuid,
)
from schemas import (
    LoginRequest, LoginResponse, ChangePasswordRequest,
    PractitionerCreate, PractitionerUpdate, PractitionerResponse,
    SessionCreate, SessionResponse, SessionListItem, ResumeRequest,
    QuestionsPage, QuestionResponse,
    AnswersBatch, ResultResponse, ScoreResult,
    PatientCreate, PatientUpdate, PatientResponse, PatientListItem,
    ClinicalHistoryUpdate, ClinicalHistoryResponse, ClinicalHistorySummary,
    DocumentUploadResponse, DocumentResponse, DocumentUpdate, DocumentListItem,
    AssessmentCreate, AssessmentUpdate, AssessmentResponse, AssessmentListItem,
    DOCUMENT_CATEGORIES, ALLOWED_MIME_TYPES, ASSESSMENT_TYPES,
    VoiceProfileResponse, VoiceProfileStatus,
    TherapySessionResponse, TherapySessionListItem, SOAPNotesUpdate,
    AUDIO_MIME_TYPES,
    ClinicalIntelligenceResponse, ClinicalIntelligenceVersionResponse,
    ClinicalIntelligenceUpdateResponse, ClinicalIntelligenceStats,
    ReviewUpdateRequest,
    PaymentCreate, PaymentUpdate, PaymentStatusUpdate, PaymentResponse, PaymentListItem,
    PaymentDashboard, RecentTransaction, RefundRequest, RefundComplete,
    ReceiptResponse, PaymentHistoryItem,
    NotificationResponse, NotificationList,
    AppointmentWithPaymentCreate, AppointmentResponseWithPayment,
    PAYMENT_STATUSES, PAYMENT_METHODS,
    # Public Profile schemas
    PractitionerProfileCreate, PractitionerProfileUpdate, PractitionerProfileResponse,
    PublicProfileResponse, PublicOnboardingResponse,
    ResourceCreate, ResourceUpdate, ResourceResponse, PublicResourceResponse,
    TestimonialCreate, TestimonialUpdate, TestimonialResponse, PublicTestimonialResponse,
    AvailabilityPreviewResponse, DayAvailabilityPreview, AvailabilitySlotPreview,
    AdminProfileUpdate, ProfileListItem,
    RESOURCE_TYPES,
    # Phase 5 - Booking schemas
    PublicBookingSlot, PublicBookingDay, PublicAvailableSlotsResponse,
    BookingRequestCreate, BookingRequestResponse, BookingConfirmationResponse,
    BookingListItem, PatientAppointmentView, PatientReceiptView,
    InboxNotificationResponse, InboxNotificationList,
    BOOKING_REQUEST_STATUSES,
    TherapistNoteResponse, TherapistNoteUpsert,
    IntakeSubmissionCreate, IntakeSubmissionResponse,
)
from storage import save_file, get_file_path, read_file, delete_file, validate_file_type, get_mime_type, validate_audio_file, save_voice_profile, save_therapy_session_audio, get_audio_mime_type
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_practitioner, require_owner,
    generate_ref_code, generate_resume_code,
)
from scoring import full_scoring_pipeline
import scoring as scoring_module

from logging_config import setup_logging, get_logger
from middleware import (
    SecurityHeadersMiddleware,
    RateLimitMiddleware,
    RequestLoggingMiddleware,
    ErrorHandlerMiddleware,
    configure_cors_origins,
)
from exceptions import register_exception_handlers

logger = setup_logging()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting MMPI-2 Assessment API")
    await init_db()
    logger.info("Database initialized")
    yield
    logger.info("Shutting down MMPI-2 Assessment API")

app = FastAPI(
    title="MMPI-2 Assessment API",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if ENVIRONMENT != "production" else None,
    redoc_url="/api/redoc" if ENVIRONMENT != "production" else None,
)

register_exception_handlers(app)

app.add_middleware(ErrorHandlerMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

if ENVIRONMENT == "production":
    app.add_middleware(RateLimitMiddleware, requests_per_minute=120, burst_limit=20)

cors_origins = configure_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if cors_origins else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    expose_headers=["X-Process-Time"],
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

# Two-point / three-point code-type interpretive text, extracted from the practice's
# reference manual (MMPI Report.pdf). Keyed by the elevated scale digits sorted ascending
# (e.g. both "27" and "72" resolve to key "27"), each with a "generic" narrative and,
# where the source distinguishes them, "male"/"female" variants. Loaded once and cached.
CODE_TYPE_LIBRARY_PATH = os.path.join(os.path.dirname(__file__), "..", "code_type_interpretations.json")
_code_type_library: dict | None = None


def load_code_type_library() -> dict:
    global _code_type_library
    if _code_type_library is None:
        with open(CODE_TYPE_LIBRARY_PATH) as f:
            _code_type_library = json.load(f)
    return _code_type_library


def _code_type_lookup(scale_digits: list, gender: str) -> tuple:
    """Look up a code-type entry by a list of clinical-scale digit strings (e.g. ["2","7"]).
    Returns (canonical_key, text) or (None, None) if no entry exists for this combination.
    Gender is only used to prefer a matching male/female variant when the manual distinguishes
    them; an unspecified gender (or a variant the entry doesn't have) always falls back to
    "generic" rather than silently picking male, and never returns a null text for a key that
    actually exists in the library."""
    library = load_code_type_library()
    key = "".join(sorted(scale_digits))
    entry = library.get(key)
    if not entry:
        return None, None
    gender_norm = (gender or "").strip().lower()
    if gender_norm == "female" and "female" in entry:
        text = entry["female"]
    elif gender_norm == "male" and "male" in entry:
        text = entry["male"]
    else:
        text = entry.get("generic") or entry.get("female") or entry.get("male")
    return key, text


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
        raise HTTPException(403, "Your account has been disabled. Please contact your administrator.")

    token = create_access_token(prac.id, prac.role)
    return LoginResponse(
        access_token=token, role=prac.role,
        name=prac.name, practitioner_id=prac.id,
        must_change_password=prac.must_change_password if prac.must_change_password is not None else False,
        profile_setup_complete=prac.profile_setup_complete if prac.profile_setup_complete is not None else False,
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
        must_change_password=prac.must_change_password if prac.must_change_password is not None else False,
        profile_setup_complete=prac.profile_setup_complete if prac.profile_setup_complete is not None else False,
        avatar_id=getattr(prac, "avatar_id", None),
        avatar_url=getattr(prac, "avatar_url", None),
        session_count=count,
    )


@app.post("/api/auth/change-password")
async def change_password(data: ChangePasswordRequest, prac=Depends(get_current_practitioner), db: AsyncSession = Depends(get_db)):
    if not verify_password(data.current_password, prac.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    
    if len(data.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters long")
    
    if data.current_password == data.new_password:
        raise HTTPException(400, "New password must be different from current password")
    
    prac.password_hash = hash_password(data.new_password)
    prac.must_change_password = False
    await db.commit()
    
    return {"message": "Password changed successfully"}


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
            must_change_password=p.must_change_password if p.must_change_password is not None else False,
            profile_setup_complete=p.profile_setup_complete if p.profile_setup_complete is not None else False,
            session_count=count,
        ))
    return result


@app.post("/api/admin/practitioners", response_model=PractitionerResponse)
async def create_practitioner(data: PractitionerCreate, owner=Depends(require_owner), db: AsyncSession = Depends(get_db)):
    if not data.name or not data.name.strip():
        raise HTTPException(400, "Name is required")
    if not data.email or not data.email.strip():
        raise HTTPException(400, "Email is required")
    if not data.password or len(data.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters long")
    
    import re
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_pattern, data.email):
        raise HTTPException(400, "Please enter a valid email address")
    
    existing = (await db.execute(
        select(Practitioner).where(Practitioner.email == data.email)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "A practitioner with this email already exists")

    ref = generate_ref_code()
    while (await db.execute(select(Practitioner).where(Practitioner.ref_code == ref))).scalar_one_or_none():
        ref = generate_ref_code()

    prac = Practitioner(
        name=data.name.strip(),
        email=data.email.strip().lower(),
        password_hash=hash_password(data.password),
        role="practitioner",
        ref_code=ref,
        must_change_password=True,
        created_by=owner.id,
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
        must_change_password=prac.must_change_password,
        profile_setup_complete=prac.profile_setup_complete if prac.profile_setup_complete is not None else False,
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
        must_change_password=prac.must_change_password if prac.must_change_password is not None else False,
        profile_setup_complete=prac.profile_setup_complete if prac.profile_setup_complete is not None else False,
        session_count=count,
    )


@app.delete("/api/admin/practitioners/{prac_id}")
async def delete_practitioner(prac_id: str, owner=Depends(require_owner), db: AsyncSession = Depends(get_db)):
    prac = await db.get(Practitioner, prac_id)
    if not prac:
        raise HTTPException(404, "Practitioner not found")
    
    if prac.role == "owner":
        raise HTTPException(403, "Cannot delete owner account")
    
    # Check if practitioner has any sessions
    session_count = (await db.execute(
        select(func.count(Session.id)).where(Session.practitioner_id == prac_id)
    )).scalar() or 0
    
    if session_count > 0:
        raise HTTPException(400, f"Cannot delete practitioner with {session_count} existing session(s). Disable the account instead.")
    
    await db.delete(prac)
    await db.commit()
    
    return {"message": "Practitioner deleted successfully"}


# ═════════════════════════════════════════════════════════════════════════════════
#  PATIENT MANAGEMENT — Practitioner manages their patients
# ═════════════════════════════════════════════════════════════════════════════════

@app.get("/api/patients", response_model=list[PatientListItem])
async def list_patients(
    search: str = Query(None),
    status: str = Query("active"),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """List patients for the current practitioner with search and filters."""
    query = select(Patient).where(Patient.practitioner_id == prac.id)
    
    # Filter by status
    if status and status != "all":
        query = query.where(Patient.status == status)
    
    # Search by name
    if search:
        query = query.where(Patient.full_name.ilike(f"%{search}%"))
    
    # Sort
    if sort_by == "name":
        order_col = Patient.full_name
    elif sort_by == "age":
        order_col = Patient.age
    else:
        order_col = Patient.created_at
    
    if sort_order == "asc":
        query = query.order_by(order_col.asc())
    else:
        query = query.order_by(order_col.desc())
    
    rows = (await db.execute(query)).scalars().all()
    
    result = []
    for p in rows:
        # Get clinical history status
        ch = (await db.execute(
            select(ClinicalHistory).where(ClinicalHistory.patient_id == p.id)
        )).scalar_one_or_none()
        ch_status = ch.status if ch else "not_started"
        
        result.append(PatientListItem(
            id=p.id,
            full_name=p.full_name,
            age=p.age,
            gender=p.gender,
            status=p.status,
            avatar_id=getattr(p, "avatar_id", None),
            avatar_url=getattr(p, "avatar_url", None),
            created_at=p.created_at,
            clinical_history_status=ch_status,
        ))
    
    return result


@app.get("/api/patients/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get a single patient by ID. Only the assigned practitioner can access."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    
    # Ensure practitioner can only access their own patients
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    return PatientResponse(
        id=patient.id,
        practitioner_id=patient.practitioner_id,
        full_name=patient.full_name,
        date_of_birth=patient.date_of_birth,
        age=patient.age,
        gender=patient.gender,
        phone=patient.phone,
        email=patient.email,
        emergency_contact=patient.emergency_contact,
        referral_source=patient.referral_source,
        status=patient.status,
        avatar_id=getattr(patient, "avatar_id", None),
        avatar_url=getattr(patient, "avatar_url", None),
        created_at=patient.created_at,
        updated_at=patient.updated_at,
    )


@app.post("/api/patients", response_model=PatientResponse)
async def create_patient(
    data: PatientCreate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Create a new patient for the current practitioner."""
    import re
    
    # Validation
    if not data.full_name or not data.full_name.strip():
        raise HTTPException(400, "Full name is required")
    
    if not data.date_of_birth:
        raise HTTPException(400, "Date of birth is required")
    
    if data.date_of_birth > date.today():
        raise HTTPException(400, "Date of birth cannot be in the future")
    
    if not data.gender or not data.gender.strip():
        raise HTTPException(400, "Gender is required")
    
    # Validate email if provided
    if data.email:
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, data.email):
            raise HTTPException(400, "Please enter a valid email address")
    
    # Validate phone if provided
    if data.phone:
        phone_clean = re.sub(r'[\s\-\(\)]', '', data.phone)
        if not re.match(r'^[\+]?[0-9]{7,15}$', phone_clean):
            raise HTTPException(400, "Please enter a valid phone number")
    
    # Calculate age
    age = _compute_age(data.date_of_birth)
    if age < 0:
        raise HTTPException(400, "Invalid date of birth")
    
    patient = Patient(
        practitioner_id=prac.id,
        full_name=data.full_name.strip(),
        date_of_birth=data.date_of_birth,
        age=age,
        gender=data.gender.strip(),
        phone=data.phone.strip() if data.phone else None,
        email=data.email.strip().lower() if data.email else None,
        emergency_contact=data.emergency_contact.strip() if data.emergency_contact else None,
        referral_source=data.referral_source.strip() if data.referral_source else None,
        status="active",
    )
    db.add(patient)
    await db.commit()
    await db.refresh(patient)
    
    return PatientResponse(
        id=patient.id,
        practitioner_id=patient.practitioner_id,
        full_name=patient.full_name,
        date_of_birth=patient.date_of_birth,
        age=patient.age,
        gender=patient.gender,
        phone=patient.phone,
        email=patient.email,
        emergency_contact=patient.emergency_contact,
        referral_source=patient.referral_source,
        status=patient.status,
        avatar_id=getattr(patient, "avatar_id", None),
        avatar_url=getattr(patient, "avatar_url", None),
        created_at=patient.created_at,
        updated_at=patient.updated_at,
    )


@app.patch("/api/patients/{patient_id}", response_model=PatientResponse)
async def update_patient(
    patient_id: str,
    data: PatientUpdate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Update a patient. Only the assigned practitioner can update."""
    import re
    
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    # Update fields
    if data.full_name is not None:
        if not data.full_name.strip():
            raise HTTPException(400, "Full name cannot be empty")
        patient.full_name = data.full_name.strip()
    
    if data.date_of_birth is not None:
        if data.date_of_birth > date.today():
            raise HTTPException(400, "Date of birth cannot be in the future")
        patient.date_of_birth = data.date_of_birth
        patient.age = _compute_age(data.date_of_birth)
    
    if data.gender is not None:
        if not data.gender.strip():
            raise HTTPException(400, "Gender cannot be empty")
        patient.gender = data.gender.strip()
    
    if data.email is not None:
        if data.email:
            email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            if not re.match(email_pattern, data.email):
                raise HTTPException(400, "Please enter a valid email address")
            patient.email = data.email.strip().lower()
        else:
            patient.email = None
    
    if data.phone is not None:
        if data.phone:
            phone_clean = re.sub(r'[\s\-\(\)]', '', data.phone)
            if not re.match(r'^[\+]?[0-9]{7,15}$', phone_clean):
                raise HTTPException(400, "Please enter a valid phone number")
            patient.phone = data.phone.strip()
        else:
            patient.phone = None
    
    if data.emergency_contact is not None:
        patient.emergency_contact = data.emergency_contact.strip() if data.emergency_contact else None
    
    if data.referral_source is not None:
        patient.referral_source = data.referral_source.strip() if data.referral_source else None
    
    if data.status is not None:
        if data.status not in ["active", "archived"]:
            raise HTTPException(400, "Status must be 'active' or 'archived'")
        patient.status = data.status
    
    await db.commit()
    await db.refresh(patient)
    
    return PatientResponse(
        id=patient.id,
        practitioner_id=patient.practitioner_id,
        full_name=patient.full_name,
        date_of_birth=patient.date_of_birth,
        age=patient.age,
        gender=patient.gender,
        phone=patient.phone,
        email=patient.email,
        emergency_contact=patient.emergency_contact,
        referral_source=patient.referral_source,
        status=patient.status,
        avatar_id=getattr(patient, "avatar_id", None),
        avatar_url=getattr(patient, "avatar_url", None),
        created_at=patient.created_at,
        updated_at=patient.updated_at,
    )


@app.post("/api/patients/{patient_id}/archive")
async def archive_patient(
    patient_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Archive a patient (soft delete)."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    patient.status = "archived"
    await db.commit()
    
    return {"message": "Patient archived successfully"}


@app.post("/api/patients/{patient_id}/restore")
async def restore_patient(
    patient_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Restore an archived patient."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    patient.status = "active"
    await db.commit()

    return {"message": "Patient restored successfully"}


# ═════════════════════════════════════════════════════════════════════════════════
#  INTAKE SUBMISSIONS — public "Start Intake" leads awaiting practitioner review
# ═════════════════════════════════════════════════════════════════════════════════

@app.get("/api/intake-submissions", response_model=list[IntakeSubmissionResponse])
async def list_intake_submissions(
    status: str = Query("pending"),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """List public intake form submissions for the current practitioner."""
    query = select(IntakeSubmission).where(IntakeSubmission.practitioner_id == prac.id)
    if status and status != "all":
        query = query.where(IntakeSubmission.status == status)
    query = query.order_by(IntakeSubmission.created_at.desc())

    rows = (await db.execute(query)).scalars().all()

    return [
        IntakeSubmissionResponse(
            id=s.id,
            full_name=s.full_name,
            age=s.age,
            gender=s.gender,
            phone=s.phone,
            chief_complaint=s.chief_complaint,
            status=s.status,
            created_at=s.created_at,
        )
        for s in rows
    ]


@app.post("/api/intake-submissions/{submission_id}/accept", response_model=PatientResponse)
async def accept_intake_submission(
    submission_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Accept an intake submission, creating a real Patient record from it."""
    submission = await db.get(IntakeSubmission, submission_id)
    if not submission:
        raise HTTPException(404, "Intake submission not found")

    if submission.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")

    if submission.status != "pending":
        raise HTTPException(400, "This intake submission has already been resolved")

    # The public intake form only collects age, not an exact date of birth, but
    # Patient.date_of_birth is required elsewhere in the app. Seed an approximate
    # DOB (Jan 1 of the implied birth year); the practitioner can correct it via
    # the normal patient edit form. This only happens on an explicit accept — no
    # unverified visitor data reaches the patients table automatically.
    approx_dob = date(date.today().year - submission.age, 1, 1)

    patient = Patient(
        practitioner_id=submission.practitioner_id,
        full_name=submission.full_name,
        date_of_birth=approx_dob,
        age=submission.age,
        gender=submission.gender,
        phone=submission.phone,
        referral_source="Public intake form",
        status="active",
    )
    db.add(patient)
    await db.flush()

    # Seed the chief complaint into clinical history so it isn't lost on accept.
    db.add(ClinicalHistory(
        patient_id=patient.id,
        status="in_progress",
        presenting_complaint={"chief_complaint": submission.chief_complaint},
    ))

    submission.status = "accepted"
    submission.patient_id = patient.id
    submission.resolved_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(patient)

    return PatientResponse(
        id=patient.id,
        practitioner_id=patient.practitioner_id,
        full_name=patient.full_name,
        date_of_birth=patient.date_of_birth,
        age=patient.age,
        gender=patient.gender,
        phone=patient.phone,
        email=patient.email,
        emergency_contact=patient.emergency_contact,
        referral_source=patient.referral_source,
        status=patient.status,
        avatar_id=getattr(patient, "avatar_id", None),
        avatar_url=getattr(patient, "avatar_url", None),
        created_at=patient.created_at,
        updated_at=patient.updated_at,
    )


@app.post("/api/intake-submissions/{submission_id}/decline")
async def decline_intake_submission(
    submission_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Decline (remove) an intake submission without creating a patient."""
    submission = await db.get(IntakeSubmission, submission_id)
    if not submission:
        raise HTTPException(404, "Intake submission not found")

    if submission.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")

    if submission.status != "pending":
        raise HTTPException(400, "This intake submission has already been resolved")

    submission.status = "declined"
    submission.resolved_at = datetime.now(timezone.utc)
    await db.commit()

    return {"message": "Intake submission removed"}


# ═════════════════════════════════════════════════════════════════════════════════
#  CLINICAL HISTORY — Patient clinical intake and history
# ═════════════════════════════════════════════════════════════════════════════════

@app.get("/api/patients/{patient_id}/clinical-history", response_model=ClinicalHistoryResponse)
async def get_clinical_history(
    patient_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get or create clinical history for a patient."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    # Get or create clinical history
    ch = (await db.execute(
        select(ClinicalHistory).where(ClinicalHistory.patient_id == patient_id)
    )).scalar_one_or_none()
    
    if not ch:
        # Create new clinical history with basic info from patient
        ch = ClinicalHistory(
            patient_id=patient_id,
            status="not_started",
            current_step=1,
            basic_info={
                "full_name": patient.full_name,
                "date_of_birth": patient.date_of_birth.isoformat() if patient.date_of_birth else None,
                "age": patient.age,
                "gender": patient.gender,
                "phone": patient.phone,
                "email": patient.email,
                "emergency_contact": patient.emergency_contact,
                "referral_source": patient.referral_source,
            }
        )
        db.add(ch)
        await db.commit()
        await db.refresh(ch)
    
    return ClinicalHistoryResponse(
        id=ch.id,
        patient_id=ch.patient_id,
        status=ch.status,
        current_step=ch.current_step,
        basic_info=ch.basic_info,
        presenting_complaint=ch.presenting_complaint,
        history_present_illness=ch.history_present_illness,
        medical_history=ch.medical_history,
        family_history=ch.family_history,
        personal_history=ch.personal_history,
        relationship_history=ch.relationship_history,
        substance_use=ch.substance_use,
        trauma_history=ch.trauma_history,
        risk_assessment=ch.risk_assessment,
        therapist_notes=ch.therapist_notes,
        created_at=ch.created_at,
        updated_at=ch.updated_at,
        completed_at=ch.completed_at,
    )


@app.patch("/api/patients/{patient_id}/clinical-history", response_model=ClinicalHistoryResponse)
async def update_clinical_history(
    patient_id: str,
    data: ClinicalHistoryUpdate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Update clinical history (auto-save, save draft, or complete)."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    ch = (await db.execute(
        select(ClinicalHistory).where(ClinicalHistory.patient_id == patient_id)
    )).scalar_one_or_none()
    
    if not ch:
        raise HTTPException(404, "Clinical history not found. Please load the clinical history page first.")
    
    # Update fields if provided
    if data.current_step is not None:
        ch.current_step = data.current_step
    
    if data.basic_info is not None:
        ch.basic_info = data.basic_info
    
    if data.presenting_complaint is not None:
        ch.presenting_complaint = data.presenting_complaint
    
    if data.history_present_illness is not None:
        ch.history_present_illness = data.history_present_illness
    
    if data.medical_history is not None:
        ch.medical_history = data.medical_history
    
    if data.family_history is not None:
        ch.family_history = data.family_history
    
    if data.personal_history is not None:
        ch.personal_history = data.personal_history
    
    if data.relationship_history is not None:
        ch.relationship_history = data.relationship_history
    
    if data.substance_use is not None:
        ch.substance_use = data.substance_use
    
    if data.trauma_history is not None:
        ch.trauma_history = data.trauma_history
    
    if data.risk_assessment is not None:
        ch.risk_assessment = data.risk_assessment
    
    if data.therapist_notes is not None:
        ch.therapist_notes = data.therapist_notes
    
    if data.status is not None:
        ch.status = data.status
        if data.status == "completed" and ch.completed_at is None:
            ch.completed_at = datetime.now(timezone.utc)
        elif data.status != "completed":
            ch.completed_at = None
    
    # Auto-update status if we're editing but not explicitly setting it
    if data.status is None and ch.status == "not_started":
        ch.status = "in_progress"
    
    await db.commit()
    await db.refresh(ch)
    
    # Trigger Clinical Intelligence processing in background (if not just starting)
    if ch.status in ["in_progress", "completed"] and data.status != "not_started":
        try:
            from clinical_intelligence import process_clinical_history
            
            # Get or create clinical intelligence
            ci = (await db.execute(
                select(ClinicalIntelligence).where(ClinicalIntelligence.patient_id == patient_id)
            )).scalar_one_or_none()
            
            if not ci:
                from models import generate_uuid
                ci = ClinicalIntelligence(
                    id=generate_uuid(),
                    patient_id=patient_id,
                    version=1,
                )
                db.add(ci)
                await db.commit()
                await db.refresh(ci)
            
            ch_data = {
                "id": ch.id,
                "presenting_complaint": ch.presenting_complaint,
                "history_present_illness": ch.history_present_illness,
                "medical_history": ch.medical_history,
                "family_history": ch.family_history,
                "personal_history": ch.personal_history,
                "relationship_history": ch.relationship_history,
                "substance_use": ch.substance_use,
                "trauma_history": ch.trauma_history,
                "risk_assessment": ch.risk_assessment,
            }
            existing = {
                "patient_summary": ci.patient_summary,
                "psychological_profile": ci.psychological_profile,
                "symptoms": ci.symptoms,
                "diagnoses": ci.diagnoses,
            }
            updates = await process_clinical_history(patient_id, ch_data, existing)
            
            # Store updates for review
            from clinical_intelligence import merge_intelligence_update
            for update in updates:
                if update.get("auto_apply"):
                    ci_data = {
                        "patient_summary": ci.patient_summary,
                        "psychological_profile": ci.psychological_profile,
                        "symptoms": ci.symptoms or [],
                        "diagnoses": ci.diagnoses or [],
                        "treatment_goals": ci.treatment_goals or [],
                        "relationships": ci.relationships or [],
                        "life_events": ci.life_events or [],
                        "risk_factors": ci.risk_factors or [],
                        "timeline": ci.timeline or [],
                        "outstanding_questions": ci.outstanding_questions or [],
                    }
                    updated_data = merge_intelligence_update(ci_data, update)
                    ci.patient_summary = updated_data.get("patient_summary")
                    ci.psychological_profile = updated_data.get("psychological_profile")
                    ci.symptoms = updated_data.get("symptoms")
                    ci.diagnoses = updated_data.get("diagnoses")
                    ci.treatment_goals = updated_data.get("treatment_goals")
                    ci.relationships = updated_data.get("relationships")
                    ci.life_events = updated_data.get("life_events")
                    ci.risk_factors = updated_data.get("risk_factors")
                    ci.timeline = updated_data.get("timeline")
                    ci.outstanding_questions = updated_data.get("outstanding_questions")
                else:
                    from models import generate_uuid
                    ci_update = ClinicalIntelligenceUpdate(
                        id=generate_uuid(),
                        clinical_intelligence_id=ci.id,
                        update_type=update.get("update_type"),
                        section=update.get("section"),
                        operation=update.get("operation"),
                        proposed_changes=update.get("proposed_changes"),
                        source_type=update.get("source_type"),
                        source_id=update.get("source_id"),
                        source_excerpt=update.get("source_excerpt"),
                        confidence=update.get("confidence", "medium"),
                        reasoning=update.get("reasoning"),
                        review_status="pending",
                    )
                    db.add(ci_update)
            
            ci.last_processed_at = datetime.now(timezone.utc)
            ci.last_source_type = "clinical_history"
            ci.last_source_id = ch.id
            await db.commit()
        except Exception as e:
            print(f"Clinical Intelligence processing error: {e}")
    
    return ClinicalHistoryResponse(
        id=ch.id,
        patient_id=ch.patient_id,
        status=ch.status,
        current_step=ch.current_step,
        basic_info=ch.basic_info,
        presenting_complaint=ch.presenting_complaint,
        history_present_illness=ch.history_present_illness,
        medical_history=ch.medical_history,
        family_history=ch.family_history,
        personal_history=ch.personal_history,
        relationship_history=ch.relationship_history,
        substance_use=ch.substance_use,
        trauma_history=ch.trauma_history,
        risk_assessment=ch.risk_assessment,
        therapist_notes=ch.therapist_notes,
        created_at=ch.created_at,
        updated_at=ch.updated_at,
        completed_at=ch.completed_at,
    )


@app.get("/api/patients/{patient_id}/clinical-history/summary", response_model=ClinicalHistorySummary)
async def get_clinical_history_summary(
    patient_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get clinical history completion status summary."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    ch = (await db.execute(
        select(ClinicalHistory).where(ClinicalHistory.patient_id == patient_id)
    )).scalar_one_or_none()
    
    if not ch:
        return ClinicalHistorySummary(
            status="not_started",
            current_step=1,
            completed_at=None,
            updated_at=datetime.now(timezone.utc),
        )
    
    return ClinicalHistorySummary(
        status=ch.status,
        current_step=ch.current_step,
        completed_at=ch.completed_at,
        updated_at=ch.updated_at,
    )


# ═════════════════════════════════════════════════════════════════════════════════
#  CLINICAL DOCUMENTS — Document upload and management
# ═════════════════════════════════════════════════════════════════════════════════

@app.post("/api/patients/{patient_id}/documents", response_model=DocumentUploadResponse)
async def upload_document(
    patient_id: str,
    file: UploadFile = File(...),
    category: str = Form(...),
    notes: str = Form(None),
    parent_document_id: str = Form(None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Upload a clinical document for a patient."""
    # Verify patient access
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    # Validate category
    if category not in DOCUMENT_CATEGORIES:
        raise HTTPException(400, f"Invalid category. Must be one of: {', '.join(DOCUMENT_CATEGORIES)}")
    
    # Validate file type
    is_valid, error_msg = validate_file_type(file.filename, file.content_type)
    if not is_valid:
        raise HTTPException(400, error_msg)
    
    # Determine version
    version = 1
    if parent_document_id:
        parent_doc = await db.get(ClinicalDocument, parent_document_id)
        if not parent_doc or parent_doc.patient_id != patient_id:
            raise HTTPException(400, "Invalid parent document")
        version = parent_doc.version + 1
    
    # Create document record first to get ID
    from models import generate_uuid
    doc_id = generate_uuid()
    
    # Save file
    storage_path, file_size, file_hash = await save_file(file, patient_id, doc_id)
    
    # Create document record
    doc = ClinicalDocument(
        id=doc_id,
        patient_id=patient_id,
        uploaded_by=prac.id,
        category=category,
        original_filename=file.filename,
        display_name=file.filename,
        storage_path=storage_path,
        mime_type=file.content_type or get_mime_type(file.filename),
        file_size=file_size,
        file_hash=file_hash,
        version=version,
        parent_document_id=parent_document_id,
        notes=notes,
        processing_status="pending",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    
    # Trigger Clinical Intelligence processing for document upload
    try:
        from clinical_intelligence import process_document, merge_intelligence_update
        
        ci = (await db.execute(
            select(ClinicalIntelligence).where(ClinicalIntelligence.patient_id == patient_id)
        )).scalar_one_or_none()
        
        if not ci:
            from models import generate_uuid as gen_uuid
            ci = ClinicalIntelligence(
                id=gen_uuid(),
                patient_id=patient_id,
                version=1,
            )
            db.add(ci)
            await db.commit()
            await db.refresh(ci)
        
        doc_data = {
            "id": doc.id,
            "category": doc.category,
            "display_name": doc.display_name,
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
        }
        updates = await process_document(doc_data, None, None)
        
        for update in updates:
            if update.get("auto_apply"):
                ci_data = {
                    "patient_summary": ci.patient_summary,
                    "psychological_profile": ci.psychological_profile,
                    "symptoms": ci.symptoms or [],
                    "diagnoses": ci.diagnoses or [],
                    "treatment_goals": ci.treatment_goals or [],
                    "relationships": ci.relationships or [],
                    "life_events": ci.life_events or [],
                    "risk_factors": ci.risk_factors or [],
                    "timeline": ci.timeline or [],
                    "outstanding_questions": ci.outstanding_questions or [],
                }
                updated_data = merge_intelligence_update(ci_data, update)
                ci.patient_summary = updated_data.get("patient_summary")
                ci.psychological_profile = updated_data.get("psychological_profile")
                ci.symptoms = updated_data.get("symptoms")
                ci.diagnoses = updated_data.get("diagnoses")
                ci.treatment_goals = updated_data.get("treatment_goals")
                ci.relationships = updated_data.get("relationships")
                ci.life_events = updated_data.get("life_events")
                ci.risk_factors = updated_data.get("risk_factors")
                ci.timeline = updated_data.get("timeline")
                ci.outstanding_questions = updated_data.get("outstanding_questions")
        
        ci.last_processed_at = datetime.now(timezone.utc)
        ci.last_source_type = "clinical_document"
        ci.last_source_id = doc.id
        await db.commit()
    except Exception as e:
        print(f"Clinical Intelligence processing error: {e}")
    
    return DocumentUploadResponse(
        id=doc.id,
        patient_id=doc.patient_id,
        category=doc.category,
        display_name=doc.display_name,
        original_filename=doc.original_filename,
        mime_type=doc.mime_type,
        file_size=doc.file_size,
        version=doc.version,
        processing_status=doc.processing_status,
        uploaded_by_name=prac.name,
        notes=doc.notes,
        created_at=doc.created_at,
    )


@app.get("/api/patients/{patient_id}/documents", response_model=list[DocumentListItem])
async def list_documents_and_assessments(
    patient_id: str,
    search: str = Query(None),
    category: str = Query(None),
    file_type: str = Query(None),
    assessment_type: str = Query(None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """List all documents and assessments for a patient."""
    # Verify patient access
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    items = []
    
    # Get documents
    doc_query = select(ClinicalDocument).where(ClinicalDocument.patient_id == patient_id)
    if category:
        doc_query = doc_query.where(ClinicalDocument.category == category)
    if file_type:
        doc_query = doc_query.where(ClinicalDocument.mime_type.ilike(f"%{file_type}%"))
    if search:
        doc_query = doc_query.where(
            or_(
                ClinicalDocument.display_name.ilike(f"%{search}%"),
                ClinicalDocument.original_filename.ilike(f"%{search}%"),
            )
        )
    
    docs = (await db.execute(doc_query.order_by(ClinicalDocument.created_at.desc()))).scalars().all()
    
    for doc in docs:
        uploader = await db.get(Practitioner, doc.uploaded_by)
        items.append(DocumentListItem(
            id=doc.id,
            type="document",
            name=doc.display_name,
            category=doc.category,
            uploaded_by_name=uploader.name if uploader else "Unknown",
            date=doc.created_at,
            file_type=doc.mime_type,
            file_size=doc.file_size,
            status=doc.processing_status,
            version=doc.version,
        ))
    
    # Get assessments
    assess_query = select(Assessment).where(Assessment.patient_id == patient_id)
    if assessment_type:
        assess_query = assess_query.where(Assessment.assessment_type == assessment_type)
    if search:
        assess_query = assess_query.where(Assessment.display_name.ilike(f"%{search}%"))
    # Filter by category if it's an assessment-related category
    if category and category in ["psychological_assessment", "mmpi2_assessment", "personality_assessment", "cognitive_assessment"]:
        type_map = {
            "mmpi2_assessment": "mmpi2",
            "cognitive_assessment": "cognitive",
        }
        if category in type_map:
            assess_query = assess_query.where(Assessment.assessment_type == type_map[category])
    
    assessments = (await db.execute(assess_query.order_by(Assessment.created_at.desc()))).scalars().all()
    
    for assess in assessments:
        practitioner = await db.get(Practitioner, assess.practitioner_id)
        items.append(DocumentListItem(
            id=assess.id,
            type="assessment",
            name=assess.display_name,
            category=f"{assess.assessment_type}_assessment",
            uploaded_by_name=practitioner.name if practitioner else "Unknown",
            date=assess.completion_date or assess.created_at,
            status=assess.status,
            assessment_type=assess.assessment_type,
            reference_id=assess.reference_id,
        ))
    
    # Sort all items by date descending
    items.sort(key=lambda x: x.date, reverse=True)
    
    return items


@app.get("/api/patients/{patient_id}/documents/{document_id}", response_model=DocumentResponse)
async def get_document(
    patient_id: str,
    document_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get document details."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    doc = await db.get(ClinicalDocument, document_id)
    if not doc or doc.patient_id != patient_id:
        raise HTTPException(404, "Document not found")
    
    uploader = await db.get(Practitioner, doc.uploaded_by)
    
    return DocumentResponse(
        id=doc.id,
        patient_id=doc.patient_id,
        uploaded_by=doc.uploaded_by,
        uploaded_by_name=uploader.name if uploader else "Unknown",
        category=doc.category,
        original_filename=doc.original_filename,
        display_name=doc.display_name,
        mime_type=doc.mime_type,
        file_size=doc.file_size,
        version=doc.version,
        parent_document_id=doc.parent_document_id,
        notes=doc.notes,
        processing_status=doc.processing_status,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@app.get("/api/patients/{patient_id}/documents/{document_id}/download")
async def download_document(
    patient_id: str,
    document_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Download a document file."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    doc = await db.get(ClinicalDocument, document_id)
    if not doc or doc.patient_id != patient_id:
        raise HTTPException(404, "Document not found")
    
    file_path = await get_file_path(doc.storage_path)
    if not file_path:
        raise HTTPException(404, "File not found on server")
    
    return FileResponse(
        path=file_path,
        filename=doc.original_filename,
        media_type=doc.mime_type,
    )


@app.get("/api/patients/{patient_id}/documents/{document_id}/preview")
async def preview_document(
    patient_id: str,
    document_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get document content for preview (inline viewing)."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    doc = await db.get(ClinicalDocument, document_id)
    if not doc or doc.patient_id != patient_id:
        raise HTTPException(404, "Document not found")
    
    content = await read_file(doc.storage_path)
    if content is None:
        raise HTTPException(404, "File not found on server")
    
    # For inline preview
    return StreamingResponse(
        io.BytesIO(content),
        media_type=doc.mime_type,
        headers={
            "Content-Disposition": f"inline; filename=\"{doc.original_filename}\"",
        }
    )


@app.patch("/api/patients/{patient_id}/documents/{document_id}", response_model=DocumentResponse)
async def update_document(
    patient_id: str,
    document_id: str,
    data: DocumentUpdate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Update document metadata (rename, notes, category)."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    doc = await db.get(ClinicalDocument, document_id)
    if not doc or doc.patient_id != patient_id:
        raise HTTPException(404, "Document not found")
    
    if data.display_name is not None:
        doc.display_name = data.display_name.strip()
    if data.notes is not None:
        doc.notes = data.notes
    if data.category is not None:
        if data.category not in DOCUMENT_CATEGORIES:
            raise HTTPException(400, f"Invalid category")
        doc.category = data.category
    
    await db.commit()
    await db.refresh(doc)
    
    uploader = await db.get(Practitioner, doc.uploaded_by)
    
    return DocumentResponse(
        id=doc.id,
        patient_id=doc.patient_id,
        uploaded_by=doc.uploaded_by,
        uploaded_by_name=uploader.name if uploader else "Unknown",
        category=doc.category,
        original_filename=doc.original_filename,
        display_name=doc.display_name,
        mime_type=doc.mime_type,
        file_size=doc.file_size,
        version=doc.version,
        parent_document_id=doc.parent_document_id,
        notes=doc.notes,
        processing_status=doc.processing_status,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@app.delete("/api/patients/{patient_id}/documents/{document_id}")
async def delete_document_endpoint(
    patient_id: str,
    document_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Delete a document."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    doc = await db.get(ClinicalDocument, document_id)
    if not doc or doc.patient_id != patient_id:
        raise HTTPException(404, "Document not found")
    
    # Delete file from storage
    await delete_file(doc.storage_path)
    
    # Delete record
    await db.delete(doc)
    await db.commit()
    
    return {"message": "Document deleted successfully"}


@app.get("/api/patients/{patient_id}/documents/{document_id}/versions", response_model=list[DocumentResponse])
async def get_document_versions(
    patient_id: str,
    document_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get all versions of a document."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    doc = await db.get(ClinicalDocument, document_id)
    if not doc or doc.patient_id != patient_id:
        raise HTTPException(404, "Document not found")
    
    # Find the root document
    root_id = document_id
    current = doc
    while current.parent_document_id:
        root_id = current.parent_document_id
        current = await db.get(ClinicalDocument, current.parent_document_id)
    
    # Get all versions (root + children)
    versions_query = select(ClinicalDocument).where(
        or_(
            ClinicalDocument.id == root_id,
            ClinicalDocument.parent_document_id == root_id,
        )
    ).order_by(ClinicalDocument.version.desc())
    
    versions = (await db.execute(versions_query)).scalars().all()
    
    result = []
    for v in versions:
        uploader = await db.get(Practitioner, v.uploaded_by)
        result.append(DocumentResponse(
            id=v.id,
            patient_id=v.patient_id,
            uploaded_by=v.uploaded_by,
            uploaded_by_name=uploader.name if uploader else "Unknown",
            category=v.category,
            original_filename=v.original_filename,
            display_name=v.display_name,
            mime_type=v.mime_type,
            file_size=v.file_size,
            version=v.version,
            parent_document_id=v.parent_document_id,
            notes=v.notes,
            processing_status=v.processing_status,
            created_at=v.created_at,
            updated_at=v.updated_at,
        ))
    
    return result


# ═════════════════════════════════════════════════════════════════════════════════
#  ASSESSMENTS — Assessment management
# ═════════════════════════════════════════════════════════════════════════════════

def _parse_assessment_expires_at(notes, created_at: datetime):
    """Parse expires_at from assessment notes JSON, if present."""
    if not notes:
        return None
    try:
        data = json.loads(notes)
        if isinstance(data, dict) and data.get("expires_at"):
            return datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
        if isinstance(data, dict) and data.get("expiry_days"):
            return created_at + timedelta(days=int(data["expiry_days"]))
    except Exception:
        return None
    return None


def _compute_age_from_dob(dob) -> int:
    if not dob:
        return 0
    return _compute_age(dob)


@app.get("/api/assessments", response_model=list[AssessmentListItem])
async def list_practitioner_assessments(
    status: str = Query(None),
    assessment_type: str = Query(None),
    search: str = Query(None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """
    List all assessments for the current practitioner.
    Merges Assessment records with MMPI Session records so the Assessments
    workspace shows both generated links and patient-completed tests.
    """
    items: list[AssessmentListItem] = []
    seen_session_ids: set[str] = set()

    # 1) Assessment records
    query = select(Assessment).where(Assessment.practitioner_id == prac.id)
    if assessment_type:
        query = query.where(Assessment.assessment_type == assessment_type)
    assessments = (await db.execute(query.order_by(Assessment.created_at.desc()))).scalars().all()

    for a in assessments:
        patient = await db.get(Patient, a.patient_id)
        if not patient:
            continue

        effective_status = a.status
        expires_at = _parse_assessment_expires_at(a.notes, a.created_at)
        if effective_status in ("pending", "in_progress") and expires_at:
            now = datetime.now(timezone.utc)
            exp = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
            if exp < now:
                effective_status = "expired"

        if a.reference_type == "session" and a.reference_id:
            seen_session_ids.add(a.reference_id)

        if status and effective_status != status:
            continue
        if search:
            hay = f"{patient.full_name} {a.assessment_type} {a.display_name}".lower()
            if search.lower() not in hay:
                continue

        items.append(AssessmentListItem(
            id=a.id,
            patient_id=a.patient_id,
            patient_name=patient.full_name,
            patient_age=_compute_age_from_dob(patient.date_of_birth),
            patient_gender=patient.gender or "—",
            assessment_type=a.assessment_type,
            display_name=a.display_name,
            reference_type=a.reference_type,
            reference_id=a.reference_id,
            status=effective_status,
            completion_date=a.completion_date,
            expires_at=expires_at,
            created_at=a.created_at,
            source="assessment",
        ))

    # 2) MMPI Sessions not already linked to an Assessment record
    sessions = (await db.execute(
        select(Session).where(Session.practitioner_id == prac.id).order_by(Session.created_at.desc())
    )).scalars().all()

    for s in sessions:
        if s.id in seen_session_ids:
            continue

        answered = (await db.execute(
            select(func.count(Answer.id)).where(Answer.session_id == s.id)
        )).scalar() or 0

        if s.completed:
            sess_status = "completed"
        elif answered > 0:
            sess_status = "in_progress"
        else:
            sess_status = "pending"

        if status and sess_status != status:
            continue
        if assessment_type and assessment_type != "mmpi2":
            continue
        if search:
            hay = f"{s.name} mmpi2".lower()
            if search.lower() not in hay:
                continue

        # Best-effort patient match by name
        patient_match = (await db.execute(
            select(Patient).where(
                Patient.practitioner_id == prac.id,
                Patient.full_name == s.name,
            )
        )).scalar_one_or_none()

        items.append(AssessmentListItem(
            id=s.id,
            patient_id=patient_match.id if patient_match else s.id,
            patient_name=s.name,
            patient_age=_compute_age(s.dob),
            patient_gender=s.gender or "—",
            assessment_type="mmpi2",
            display_name=f"MMPI-2 — {s.name}",
            reference_type="session",
            reference_id=s.id,
            status=sess_status,
            completion_date=s.created_at if s.completed else None,
            expires_at=None,
            created_at=s.created_at,
            source="session",
        ))

    items.sort(key=lambda x: x.created_at, reverse=True)
    return items


@app.post("/api/patients/{patient_id}/assessments", response_model=AssessmentResponse)
async def create_assessment(
    patient_id: str,
    data: AssessmentCreate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Create a new assessment record."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    if data.assessment_type not in ASSESSMENT_TYPES:
        raise HTTPException(400, f"Invalid assessment type. Must be one of: {', '.join(ASSESSMENT_TYPES)}")
    
    assessment = Assessment(
        patient_id=patient_id,
        practitioner_id=prac.id,
        assessment_type=data.assessment_type,
        display_name=data.display_name,
        reference_type=data.reference_type,
        reference_id=data.reference_id,
        status="pending",
        notes=data.notes,
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    
    return AssessmentResponse(
        id=assessment.id,
        patient_id=assessment.patient_id,
        practitioner_id=assessment.practitioner_id,
        practitioner_name=prac.name,
        assessment_type=assessment.assessment_type,
        display_name=assessment.display_name,
        reference_type=assessment.reference_type,
        reference_id=assessment.reference_id,
        status=assessment.status,
        completion_date=assessment.completion_date,
        processing_status=assessment.processing_status,
        notes=assessment.notes,
        created_at=assessment.created_at,
        updated_at=assessment.updated_at,
    )


@app.get("/api/patients/{patient_id}/assessments", response_model=list[AssessmentResponse])
async def list_assessments(
    patient_id: str,
    assessment_type: str = Query(None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """List assessments for a patient."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    query = select(Assessment).where(Assessment.patient_id == patient_id)
    if assessment_type:
        query = query.where(Assessment.assessment_type == assessment_type)
    
    assessments = (await db.execute(query.order_by(Assessment.created_at.desc()))).scalars().all()
    
    result = []
    for a in assessments:
        practitioner = await db.get(Practitioner, a.practitioner_id)
        result.append(AssessmentResponse(
            id=a.id,
            patient_id=a.patient_id,
            practitioner_id=a.practitioner_id,
            practitioner_name=practitioner.name if practitioner else "Unknown",
            assessment_type=a.assessment_type,
            display_name=a.display_name,
            reference_type=a.reference_type,
            reference_id=a.reference_id,
            status=a.status,
            completion_date=a.completion_date,
            processing_status=a.processing_status,
            notes=a.notes,
            created_at=a.created_at,
            updated_at=a.updated_at,
        ))
    
    return result


@app.get("/api/patients/{patient_id}/assessments/{assessment_id}", response_model=AssessmentResponse)
async def get_assessment(
    patient_id: str,
    assessment_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get assessment details."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    assessment = await db.get(Assessment, assessment_id)
    if not assessment or assessment.patient_id != patient_id:
        raise HTTPException(404, "Assessment not found")
    
    practitioner = await db.get(Practitioner, assessment.practitioner_id)
    
    return AssessmentResponse(
        id=assessment.id,
        patient_id=assessment.patient_id,
        practitioner_id=assessment.practitioner_id,
        practitioner_name=practitioner.name if practitioner else "Unknown",
        assessment_type=assessment.assessment_type,
        display_name=assessment.display_name,
        reference_type=assessment.reference_type,
        reference_id=assessment.reference_id,
        status=assessment.status,
        completion_date=assessment.completion_date,
        processing_status=assessment.processing_status,
        notes=assessment.notes,
        created_at=assessment.created_at,
        updated_at=assessment.updated_at,
    )


@app.patch("/api/patients/{patient_id}/assessments/{assessment_id}", response_model=AssessmentResponse)
async def update_assessment(
    patient_id: str,
    assessment_id: str,
    data: AssessmentUpdate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Update assessment details."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    assessment = await db.get(Assessment, assessment_id)
    if not assessment or assessment.patient_id != patient_id:
        raise HTTPException(404, "Assessment not found")
    
    if data.display_name is not None:
        assessment.display_name = data.display_name.strip()
    if data.status is not None:
        assessment.status = data.status
        if data.status == "completed" and not assessment.completion_date:
            assessment.completion_date = datetime.now(timezone.utc)
    if data.notes is not None:
        assessment.notes = data.notes
    
    await db.commit()
    await db.refresh(assessment)
    
    practitioner = await db.get(Practitioner, assessment.practitioner_id)
    
    return AssessmentResponse(
        id=assessment.id,
        patient_id=assessment.patient_id,
        practitioner_id=assessment.practitioner_id,
        practitioner_name=practitioner.name if practitioner else "Unknown",
        assessment_type=assessment.assessment_type,
        display_name=assessment.display_name,
        reference_type=assessment.reference_type,
        reference_id=assessment.reference_id,
        status=assessment.status,
        completion_date=assessment.completion_date,
        processing_status=assessment.processing_status,
        notes=assessment.notes,
        created_at=assessment.created_at,
        updated_at=assessment.updated_at,
    )


@app.delete("/api/patients/{patient_id}/assessments/{assessment_id}")
async def delete_assessment(
    patient_id: str,
    assessment_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Delete an assessment."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    assessment = await db.get(Assessment, assessment_id)
    if not assessment or assessment.patient_id != patient_id:
        raise HTTPException(404, "Assessment not found")
    
    await db.delete(assessment)
    await db.commit()
    
    return {"message": "Assessment deleted successfully"}


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
    # Minimum 370 answers needed for validity + clinical scales (items go up to Q370)
    # Full 567 needed only for supplementary scales
    if len(rows) < 370:
        raise HTTPException(400, f"Only {len(rows)} of 370 minimum answers submitted")

    answers = {a.question_number: a.response for a in rows}
    result = full_scoring_pipeline(answers, session.gender)

    await db.execute(delete(Result).where(Result.session_id == session_id))
    db.add(Result(
        session_id=session_id,
        raw_scores=result["raw_scores"],
        k_corrected_scores=result["k_corrected_scores"],
        t_scores=result["t_scores"],
        harris_lingoes_subscales=result.get("harris_lingoes_subscales"),
        si_subscales=result.get("si_subscales"),
        supplementary_scales=result.get("supplementary_scales"),
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
        harris_lingoes_subscales=result.harris_lingoes_subscales,
        si_subscales=result.si_subscales,
        supplementary_scales=result.supplementary_scales,
        interpretation=result.interpretation,
        profile_data=profile,
    )


# Harris-Lingoes / Si subscale metadata: full name, parent clinical scale, and a
# one/two-sentence clinical statement used when the subscale is elevated (T>=65).
# Parent-scale grouping lets the report cluster subscales the way a manual does
# (e.g. all D-subscales together under Scale 2).
HL_SI_SUBSCALE_META = {
    "D1": ("Subjective Depression", "2_D", "reports feeling unhappy and lacking energy for daily life, with low self-confidence, poor appetite or sleep disturbance, difficulty concentrating, and a general sense of not functioning as well as others."),
    "D2": ("Psychomotor Retardation", "2_D", "reports low energy and a degree of immobilization, with a tendency to withdraw from social contact and avoid people."),
    "D3": ("Physical Malfunctioning", "2_D", "is preoccupied with her own physical functioning, denies good health, and may report a variety of specific somatic symptoms."),
    "D4": ("Mental Dullness", "2_D", "describes difficulty concentrating, poor memory, and low self-confidence; feels overwhelmed and lacks interest in daily activities."),
    "D5": ("Brooding", "2_D", "is ruminative and introspective, tends to brood and worry, feels easily overwhelmed by problems, and may feel that life is not worthwhile."),
    "Hy1": ("Denial of Social Anxiety", "3_Hy", "presents as socially confident and comfortable, denying shyness or undue concern about what others think."),
    "Hy2": ("Need for Affection", "3_Hy", "expresses strong needs for attention and affection from others and tends to avoid confrontation by denying negative feelings toward them."),
    "Hy3": ("Lassitude-Malaise", "3_Hy", "reports feeling generally unwell — fatigued, run down, and not in good physical or emotional health — with poor appetite, sleep disturbance, and difficulty concentrating."),
    "Hy4": ("Somatic Complaints", "3_Hy", "reports numerous, often vague, physical complaints across multiple body systems."),
    "Hy5": ("Inhibition of Aggression", "3_Hy", "describes herself as sensitive to the feelings of others and denies hostile or aggressive impulses."),
    "Pd1": ("Familial Discord", "4_Pd", "describes her home and family environment as lacking in love, understanding, and support."),
    "Pd2": ("Authority Problems", "4_Pd", "resents parental or societal standards and control, and asserts her own opinions and attitudes rather than deferring to others."),
    "Pd3": ("Social Imperturbability", "4_Pd", "is comfortable and confident in social situations, holds strong opinions, and is not troubled by others' opinions of her."),
    "Pd4": ("Social Alienation", "4_Pd", "feels alienated, isolated, and misunderstood by others, and tends to externalize blame for her own difficulties."),
    "Pd5": ("Self-Alienation", "4_Pd", "reports discomfort and unhappiness with herself, difficulty concentrating, and little enjoyment of life."),
    "Pa1": ("Persecutory Ideas", "6_Pa", "views the world as threatening and feels misunderstood, mistreated, or unfairly blamed by others; in more extreme elevations this may reflect frank persecutory or paranoid ideation."),
    "Pa2": ("Poignancy", "6_Pa", "describes herself as more sensitive and emotionally reactive than others, feeling misunderstood and drawn to excitement or stimulation."),
    "Pa3": ("Naivete", "6_Pa", "presents an overly optimistic, trusting view of others' motives and morality, denying hostile or suspicious feelings."),
    "Sc1": ("Social Alienation", "8_Sc", "feels mistreated, misunderstood, and unloved by others and isolated from her family; in extreme cases she may feel others are trying to harm her."),
    "Sc2": ("Emotional Alienation", "8_Sc", "describes feelings of apathy, despair, or emotional estrangement from herself."),
    "Sc3": ("Lack of Ego Mastery, Cognitive", "8_Sc", "reports difficulty with concentration, thinking, and memory, and fears she may be 'losing her mind.'"),
    "Sc4": ("Lack of Ego Mastery, Conative", "8_Sc", "reports that life is a strain, feels helpless and hopeless, and may withdraw into fantasy or daydreaming to cope."),
    "Sc5": ("Lack of Ego Mastery, Defective Inhibition", "8_Sc", "reports poor impulse control and feeling out of control, with episodes of behavior she cannot recall or explain."),
    "Sc6": ("Bizarre Sensory Experiences", "8_Sc", "reports unusual sensory experiences and perceptual disturbances and may describe changes in body or skin sensation."),
    "Ma1": ("Amorality", "9_Ma", "views others as selfish and dishonest and, seeing them this way, feels justified adopting a similarly self-serving stance."),
    "Ma2": ("Psychomotor Acceleration", "9_Ma", "reports acceleration of speech, thought, and motor activity, and feels tense, restless, and driven to keep busy."),
    "Ma3": ("Imperturbability", "9_Ma", "claims freedom from social anxiety, is indifferent to others' opinions and values, and may act impulsively in social situations."),
    "Ma4": ("Ego Inflation", "9_Ma", "holds unrealistic evaluations of her own abilities and self-worth and is resentful when others make demands on her."),
    "Si1": ("Shyness/Self-Consciousness", "0_Si", "reports feeling shy, easily embarrassed, and uncomfortable when meeting new people."),
    "Si2": ("Social Avoidance", "0_Si", "avoids and dislikes group activities and social events."),
    "Si3": ("Alienation — Self and Others", "0_Si", "reports low self-esteem, self-criticism, distrust of others, and interpersonal insecurity."),
}

# Subscales grouped under each parent clinical scale, in manual order, used to build
# per-parent Harris-Lingoes/Si tables in the report.
HL_SI_PARENT_GROUPS = [
    ("2_D", "D", ["D1", "D2", "D3", "D4", "D5"]),
    ("3_Hy", "Hy", ["Hy1", "Hy2", "Hy3", "Hy4", "Hy5"]),
    ("4_Pd", "Pd", ["Pd1", "Pd2", "Pd3", "Pd4", "Pd5"]),
    ("6_Pa", "Pa", ["Pa1", "Pa2", "Pa3"]),
    ("8_Sc", "Sc", ["Sc1", "Sc2", "Sc3", "Sc4", "Sc5", "Sc6"]),
    ("9_Ma", "Ma", ["Ma1", "Ma2", "Ma3", "Ma4"]),
    ("0_Si", "Si", ["Si1", "Si2", "Si3"]),
]


def _get_scale_value(scale_data, field="t_score"):
    """Extract value from scale data which may be a dict or direct value."""
    if scale_data is None:
        return None
    if isinstance(scale_data, dict):
        return scale_data.get(field)
    return scale_data if field == "raw" else None


def _build_mmpi_interpretation_prompt(session, age: int, result) -> str:
    """Build comprehensive MMPI interpretation prompt based on clinical manual."""
    t = result.t_scores
    supp = result.supplementary_scales or {}
    hl = result.harris_lingoes_subscales or {}
    si = result.si_subscales or {}
    
    # Gather validity scale data
    l_t = t.get("L", 50)
    f_t = t.get("F", 50)
    k_t = t.get("K", 50)
    vrin_t = _get_scale_value(supp.get("VRIN"), "t_score")
    trin_data = supp.get("TRIN", {})
    trin_t = _get_scale_value(trin_data, "t_score")
    trin_dir = trin_data.get("direction") if isinstance(trin_data, dict) else None
    fb_t = _get_scale_value(supp.get("Fb"), "t_score")
    
    # F-K index (raw scores)
    raw = result.raw_scores or {}
    f_minus_k = (raw.get("F", 0) or 0) - (raw.get("K", 0) or 0)
    
    # Clinical scales with T-scores
    clinical_t = [(s, t.get(s, 50)) for s in CLINICAL_SCALE_ORDER]
    elevated_clinical = [(s, ts) for s, ts in clinical_t if ts >= 65]
    extreme_clinical = [(s, ts) for s, ts in clinical_t if ts >= 80]
    
    # Determine code type
    sorted_clinical = sorted(clinical_t, key=lambda x: -x[1])
    high_point = sorted_clinical[0] if sorted_clinical else None
    second_high = sorted_clinical[1] if len(sorted_clinical) > 1 else None
    third_high = sorted_clinical[2] if len(sorted_clinical) > 2 else None
    
    # Build code type string (e.g., "2-8-7" or "28" or "287")
    code_scales = [s.split("_")[0] for s, ts in sorted_clinical[:3] if ts >= 65]
    two_point_code = "".join(code_scales[:2]) if len(code_scales) >= 2 else None
    three_point_code = "".join(code_scales[:3]) if len(code_scales) >= 3 else None
    
    # Build supplementary scales summary
    supp_scales = []
    for key in ["A", "R", "Es", "MAC-R", "OH", "Do", "Re", "Mt", "GM", "GF", "PK", "PS"]:
        val = _get_scale_value(supp.get(key), "t_score")
        if val is not None:
            supp_scales.append(f"{key}={val}")
    
    # Build Harris-Lingoes summary for elevated subscales
    hl_elevated = []
    for key, data in {**hl, **si}.items():
        val = _get_scale_value(data, "t_score")
        if val is not None and val >= 65:
            hl_elevated.append(f"{key}={val}")
    
    prompt = f"""You are an expert clinical psychologist interpreting an MMPI-2 profile using standard interpretation guidelines.

**PATIENT INFORMATION**
Name: {session.name}
Age: {age}
Gender: {session.gender}

**VALIDITY SCALES (T-Scores)**
L (Lie): {l_t}
F (Infrequency): {f_t}
K (Correction): {k_t}
F-K Index (Raw): {f_minus_k}
{f'VRIN: {vrin_t}' if vrin_t else ''}
{f'TRIN: {trin_t} ({trin_dir})' if trin_t else ''}
{f'Fb (Back F): {fb_t}' if fb_t else ''}

**CLINICAL SCALES (T-Scores)**
{chr(10).join(f"{SCALE_LABELS.get(s, s)}: {ts}" for s, ts in clinical_t)}

**SUPPLEMENTARY SCALES (T-Scores)**
{', '.join(supp_scales) if supp_scales else 'Not available'}

**ELEVATED HARRIS-LINGOES/Si SUBSCALES (T≥65)**
{', '.join(hl_elevated) if hl_elevated else 'None'}

**HIGH-POINT CODE**
Highest: {SCALE_LABELS.get(high_point[0], high_point[0])} (T={high_point[1]}) if high_point else 'N/A'
Second: {SCALE_LABELS.get(second_high[0], second_high[0])} (T={second_high[1]}) if second_high else 'N/A'
Third: {SCALE_LABELS.get(third_high[0], third_high[0])} (T={third_high[1]}) if third_high else 'N/A'
Two-Point Code: {two_point_code if two_point_code else 'Not applicable'}
Three-Point Code: {three_point_code if three_point_code else 'Not applicable'}

---

**INTERPRETATION INSTRUCTIONS**

Follow this systematic workflow:

**STEP 1 - PROFILE VALIDITY**
Evaluate validity scales to determine if the profile is:
- Valid
- Probably valid
- Invalid due to over-reporting
- Invalid due to under-reporting
- Random responding
- Inconsistent responding

Apply these rules:
- F > 80: Consider profile invalidity due to over-reporting, random responding, or severe psychopathology
- L > 65: Suggests excessive defensiveness or naive self-presentation
- K > 65: Suggests psychological defensiveness
- K < 40: Suggests openness or possible exaggeration
- F-K > +11: Suggests faking bad or cry for help
- F-K < -11: Suggests faking good or minimizing problems
- VRIN > 80: Random responding likely
- TRIN > 80: Fixed responding pattern (acquiescence or non-acquiescence)

**STEP 2 - APPLY CUT-OFF RULES**
- Clinical elevation = T ≥ 65
- Clinically significant elevation = T ≥ 70
- Extreme elevation = T ≥ 80
Only interpret scales meeting threshold criteria.

**STEP 3 - IDENTIFY CODE TYPE**
Use the two-point code ({two_point_code}) or three-point code ({three_point_code}) for interpretation.
If a specific code-type interpretation exists, use it. Code types are typically more informative than individual scale interpretations.

**STEP 4 - APPLY MODIFYING RULES**
Consider:
- High K modification (if K > 65)
- Low K modification (if K < 40)
- High 5 or Low 5 modifications (Scale 5 deviations)
- High 0 or Low 0 modifications (Scale 0 deviations)

**STEP 5 - AVOID DUPLICATION**
If the same characteristic appears in scale interpretation, two-point code, and three-point code, mention it only once.

---

**PRODUCE THE REPORT**

Generate a professional psychological report, formatted as bulleted, score-specific narrative statements (one bullet per scale/subscale, each naming the actual obtained T-score and stating what that score means for this patient — mirror the style of: "On the Lie scale (L), a T-score of 43 suggests..."), with these sections:

## 1. Validity Scales
One bullet per available validity indicator (L, F, K, F-K Index, Fb, VRIN, TRIN), each citing the obtained score and its interpretation. State the overall Profile Validity Status.

## 2. Clinical Scales
One bullet per clinically elevated scale (T≥65), each citing the T-score and covering core characteristics, emotional functioning, behavior, interpersonal style, and cognitive features. If no scale is elevated, say so plainly and note any notably low scores (T≤35) briefly.

## 3. Harris-Lingoes & Si Subscales
One bullet per elevated (T≥65) Harris-Lingoes/Si subscale, citing the T-score and its specific meaning, grouped under its parent clinical scale. If a subscale is elevated but its parent scale is not, say so explicitly. If none are elevated, say so.

## 4. Code Type Interpretation
Provide the full interpretation for the obtained code type ({two_point_code or three_point_code}). If fewer than two clinical scales are elevated, state plainly that no two-point or three-point code type is present rather than inventing one.

## 5. Modifying Variables
Address only the modifiers that actually apply (High/Low K, High/Low 5, High/Low 0). If none apply, say so.

## 6. Diagnostic Considerations
List only diagnostic hypotheses directly suggested by the elevated scales/subscales above. Do not invent diagnoses, and do not suggest diagnoses for scales that are not elevated.

## 7. Prognosis
Base this on the actual profile configuration (including Ego Strength/Es and K if available).

## 8. Treatment Implications
Provide specific, bulleted treatment recommendations tied to the elevations actually present.

## Summary
A short integrative paragraph tying the validity status, elevated scale(s)/code type, and key subscale findings together.

---

Write in a professional clinical tone, in the third person, using the patient's stated gender for pronouns. Never fabricate a score, code type, or elevation that is not present in the data above. Produce ONE integrated interpretation that reads like a professional psychological report rather than disconnected excerpts. Be specific and clinically relevant."""

    return prompt


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
    
    prompt = _build_mmpi_interpretation_prompt(session, age, result)

    if not OPENAI_API_KEY or OPENAI_API_KEY.startswith("sk-your"):
        interpretation = _generate_fallback_interpretation(session, age, result)
    else:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                    json={
                        "model": "gpt-4o",
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3,
                        "max_tokens": 4000,
                    },
                )
                resp.raise_for_status()
                interpretation = resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            interpretation = _generate_fallback_interpretation(session, age, result)

    result.interpretation = interpretation
    await db.commit()
    return {"interpretation": interpretation}


def _pronoun(gender: str) -> tuple:
    """Return (subject, possessive, object) pronouns, defaulting to they/them/their."""
    g = (gender or "").strip().lower()
    if g == "female":
        return ("she", "her", "her")
    if g == "male":
        return ("he", "his", "him")
    return ("they", "their", "them")


def _validity_section(result, gender: str) -> tuple:
    """Build the Validity Scales bullets and an overall validity status label."""
    t = result.t_scores or {}
    raw = result.raw_scores or {}
    supp = result.supplementary_scales or {}
    subj, poss, _ = _pronoun(gender)

    l_t, f_t, k_t = t.get("L", 50), t.get("F", 50), t.get("K", 50)
    f_raw, k_raw = raw.get("F", 0) or 0, raw.get("K", 0) or 0
    f_minus_k = f_raw - k_raw
    fb_t = _get_scale_value(supp.get("Fb"), "t_score")
    vrin_raw = _get_scale_value(supp.get("VRIN"), "raw")
    vrin_t = _get_scale_value(supp.get("VRIN"), "t_score")
    trin_data = supp.get("TRIN", {})
    trin_raw = _get_scale_value(trin_data, "raw")
    trin_t = _get_scale_value(trin_data, "t_score")
    trin_dir = trin_data.get("direction") if isinstance(trin_data, dict) else None

    bullets = []

    # L (Lie)
    if l_t >= 70:
        bullets.append(f"On the Lie scale (L), a T-score of {l_t:.0f} indicates a marked, unsophisticated attempt to present {poss} in an unrealistically favorable light, claiming excessive virtue and denying common human faults.")
    elif l_t >= 65:
        bullets.append(f"On the Lie scale (L), a T-score of {l_t:.0f} suggests a tendency toward naive, moralistic self-presentation and a conscious wish to appear virtuous.")
    elif l_t <= 40:
        bullets.append(f"On the Lie scale (L), a T-score of {l_t:.0f} suggests {subj} answered in an unusually candid, self-critical manner, with little concern about presenting {poss} favorably.")
    else:
        bullets.append(f"On the Lie scale (L), a T-score of {l_t:.0f} falls within normal limits, indicating an honest, non-defensive self-presentation without over-claiming of virtue.")

    # F (Infrequency)
    if f_t > 100:
        bullets.append(f"On the Infrequency scale (F), an extremely elevated T-score of {f_t:.0f} raises serious concerns about profile validity — random responding, severe/acute psychopathology, or deliberate over-reporting should all be considered before the clinical scales are interpreted.")
    elif f_t > 80:
        bullets.append(f"On the Infrequency scale (F), a T-score of {f_t:.0f} suggests probable over-reporting of symptoms, a 'cry for help,' or intense subjective distress; clinical scale elevations should be interpreted with caution.")
    elif f_t >= 65:
        bullets.append(f"On the Infrequency scale (F), a T-score of {f_t:.0f} suggests the profile is probably valid, though {subj} may be experiencing a degree of distress, unconventional thinking, or agitation; {subj} may feel misunderstood or in need of support.")
    elif f_t <= 39:
        bullets.append(f"On the Infrequency scale (F), a T-score of {f_t:.0f} is unusually low, consistent with a conventional, conforming response style and no exaggeration of symptoms.")
    else:
        bullets.append(f"On the Infrequency scale (F), a T-score of {f_t:.0f} falls within normal limits, indicating {subj} responded to the inventory in a consistent, non-random, and non-exaggerated manner.")

    # K (Correction)
    if k_t >= 70:
        bullets.append(f"On the K scale (K), a T-score of {k_t:.0f} suggests marked psychological defensiveness and reluctance to acknowledge personal difficulties or shortcomings.")
    elif k_t >= 61:
        bullets.append(f"On the K scale (K), a T-score of {k_t:.0f} suggests a moderate degree of defensiveness alongside good ego strength and adequate psychological resources.")
    elif k_t <= 40:
        bullets.append(f"On the K scale (K), a T-score of {k_t:.0f} suggests unusual openness in acknowledging problems, which may reflect limited psychological resources, significant distress, or a wish to be seen as needing help.")
    else:
        bullets.append(f"On the K scale (K), a T-score of {k_t:.0f} suggests a balance between self-protectiveness and self-disclosure; it also suggests {subj} has sufficient psychological resources to make use of intervention.")

    # F-K Index (raw-score based, per Gough)
    if f_minus_k >= 11:
        bullets.append(f"The F-K Index (raw F − raw K = {f_minus_k:.0f}) is elevated, a pattern associated with over-reporting or exaggeration of symptoms ('faking bad').")
    elif f_minus_k <= -11:
        bullets.append(f"The F-K Index (raw F − raw K = {f_minus_k:.0f}) is in the negative range associated with under-reporting or minimization of symptoms ('faking good'), so real difficulties may be understated by this profile.")
    else:
        bullets.append(f"The F-K Index (raw F − raw K = {f_minus_k:.0f}) falls within the normal range, showing no significant response distortion in either the exaggerating or the minimizing direction.")

    # Fb (Back F)
    if fb_t is not None:
        if fb_t > 80:
            bullets.append(f"On the F_B (Back F) scale, a T-score of {fb_t:.0f} suggests a change in test-taking attitude in the second half of the inventory — possible fatigue, carelessness, or increasing symptom over-reporting toward the end of testing.")
        elif fb_t < 45:
            bullets.append(f"On the F_B (Back F) scale, a T-score of {fb_t:.0f} suggests {subj} is a well-adjusted individual. Psychopathology, if present and reflected in the profile, tends to be longstanding, ego-syntonic, and non-psychotic in nature.")
        else:
            bullets.append(f"On the F_B (Back F) scale, a T-score of {fb_t:.0f} indicates {subj} maintained a consistent test-taking attitude through the second half of the inventory, comparable to the first half.")

    # VRIN
    if vrin_t is not None:
        if vrin_t >= 80:
            bullets.append(f"On the VRIN scale, a raw score of {vrin_raw:.0f} (T={vrin_t:.0f}) suggests a significant degree of inconsistent, possibly random responding; clinical scale elevations should be interpreted with substantial caution.")
        elif vrin_t >= 70:
            bullets.append(f"On the VRIN scale, a raw score of {vrin_raw:.0f} (T={vrin_t:.0f}) is borderline elevated, suggesting some inconsistency in item endorsement that warrants caution but does not itself invalidate the profile.")
        else:
            bullets.append(f"On the VRIN scale, a raw score of {vrin_raw:.0f} (T={vrin_t:.0f}) suggests the data obtained are significantly consistent, with no evidence of random responding.")

    # TRIN
    if trin_t is not None:
        dir_word = "acquiescent ('true')" if trin_dir == "T" else "nay-saying ('false')" if trin_dir == "F" else ""
        if trin_t >= 80:
            bullets.append(f"On the TRIN scale, a raw score of {trin_raw:.0f} (T={trin_t:.0f}, {dir_word} direction) indicates a significant fixed responding pattern; this raises concern about the validity of the clinical scales.")
        elif trin_t >= 65:
            bullets.append(f"On the TRIN scale, a raw score of {trin_raw:.0f} (T={trin_t:.0f}) shows a mild {dir_word} tendency, but this is well below the threshold associated with genuinely inconsistent responding and does not compromise profile validity.")
        else:
            bullets.append(f"On the TRIN scale, a raw score of {trin_raw:.0f} (T={trin_t:.0f}) is characterized as significantly consistent, meaning the data obtained are not inconsistent.")

    # Overall status
    if f_t > 100 or (vrin_t is not None and vrin_t >= 80):
        status = "Invalid — Random Responding"
    elif f_t > 80 and f_minus_k >= 11:
        status = "Invalid due to Over-Reporting"
    elif f_minus_k <= -11 and k_t >= 70:
        status = "Invalid due to Under-Reporting"
    elif trin_t is not None and trin_t >= 80:
        status = "Invalid — Inconsistent Responding"
    elif f_t > 65 or l_t > 65 or k_t > 70:
        status = "Probably Valid"
    else:
        status = "Valid"

    return status, bullets


def _clinical_scales_section(result, gender: str) -> tuple:
    """Build the Clinical Scales bullets and return (bullets, elevated list, sorted list)."""
    t = result.t_scores or {}
    clinical_t = [(s, t.get(s, 50)) for s in CLINICAL_SCALE_ORDER]
    elevated = [(s, ts) for s, ts in clinical_t if ts >= 65]
    sorted_clinical = sorted(clinical_t, key=lambda x: -x[1])

    bullets = []
    if elevated:
        for scale, ts in elevated:
            interp = _get_scale_brief_interpretation(scale, ts)
            bullets.append(f"**{SCALE_LABELS.get(scale, scale)} (T={ts:.0f}):** {interp}")
    else:
        bullets.append("No clinical scale reaches the T≥65 threshold for clinical significance. The profile suggests relatively typical psychological functioning without significant psychopathology on any single scale.")

    low = [(s, ts) for s, ts in clinical_t if ts <= 35]
    if low:
        desc = ", ".join(f"{SCALE_LABELS.get(s, s)} (T={ts:.0f})" for s, ts in low)
        bullets.append(f"Notably low scores were also obtained on {desc}. Very low scores on these scales are within normal limits but are worth noting: they are generally associated with an absence of the corresponding symptom domain (e.g., low anxiety, few unusual thought processes, or low somatic preoccupation) rather than a clinical concern in themselves.")

    return bullets, elevated, sorted_clinical


def _check_normal_high_k(t: dict) -> bool:
    """Detect the 'Normal Code with High K' configuration from the reference manual:
    no clinical scale above T=70, six or more clinical scales below T=60, F below T=60,
    L and K both above F, and K above F by at least 5 T-score points."""
    l_t, f_t, k_t = t.get("L", 50), t.get("F", 50), t.get("K", 50)
    clinical_ts = [t.get(s, 50) for s in CLINICAL_SCALE_ORDER]
    no_scale_above_70 = all(ts <= 70 for ts in clinical_ts)
    six_below_60 = sum(1 for ts in clinical_ts if ts < 60) >= 6
    return (no_scale_above_70 and six_below_60 and f_t < 60
            and l_t > f_t and k_t > f_t and (k_t - f_t) >= 5)


def _code_type_section(elevated: list, sorted_clinical: list, gender: str, t: dict) -> str:
    """Two-point / three-point code type section, matched against the practice's reference
    manual (code_type_interpretations.json). All ten clinical scales (including 5/Mf and 0/Si)
    are eligible for code-type derivation, since the manual has dedicated entries built around
    scales 5 and 0 (e.g. 20/02, 40/04, 58/85). Only if no entry matches with them included are
    they set aside and the remaining scales retried — mirroring the manual's own instruction
    under entries like 56/65 and 58/85 to omit scale 5 and interpret the underlying code."""
    all_candidates = [(s, ts) for s, ts in sorted_clinical if ts >= 65]

    def digits(pairs):
        return [s.split("_")[0] for s, _ in pairs]

    def try_lookup(candidates):
        if len(candidates) >= 3:
            key, match_text = _code_type_lookup(digits(candidates[:3]), gender)
            if match_text:
                label = "-".join(digits(candidates[:3]))
                two_point = "-".join(digits(candidates[:2]))
                header = f"**Three-Point Code: {label}**"
                if len(candidates) > 3:
                    header = f"**Three-Point Code: {label}** (two-point code: {two_point})"
                return header + "\n\n" + match_text
        if len(candidates) >= 2:
            key, match_text = _code_type_lookup(digits(candidates[:2]), gender)
            if match_text:
                label = "-".join(digits(candidates[:2]))
                return f"**Two-Point Code: {label}**\n\n" + match_text
        return None

    text = try_lookup(all_candidates)

    if text is None:
        reduced = [(s, ts) for s, ts in all_candidates if s not in ("5_Mf", "0_Si")]
        if reduced != all_candidates:
            text = try_lookup(reduced)
            if text is not None:
                text += ("\n\n*Note: Scale 5 (Mf) and/or Scale 0 (Si) were set aside for code-type "
                         "classification, per the reference manual's convention, and are addressed "
                         "separately under Modifying Variables above.*")

    if text is None:
        if len(all_candidates) >= 2:
            code_scales = digits(all_candidates[:3])
            two_point = "-".join(code_scales[:2])
            text = f"**Two-Point Code:** {two_point}\n\n"
            if len(all_candidates) >= 3:
                text += f"**Three-Point Code:** {'-'.join(code_scales[:3])}\n\n"
            text += ("This elevation pattern does not correspond to one of the classic two-point or three-point "
                     "code types described in the reference manual, so the elevated scales above have been "
                     "interpreted individually rather than as a named code type.")
        elif len(elevated) == 1:
            text = ("No two-point or three-point code type is present. The profile is characterized by a single, "
                    "isolated clinical elevation rather than a broad-based elevation pattern, so interpretation "
                    "is based on the individual scale above.")
        else:
            text = ("No two-point or three-point code type is present, as no clinical scales reached the T≥65 "
                    "elevation threshold. Interpretation is based on the overall scale-level pattern described above.")

    if _check_normal_high_k(t):
        text += ("\n\n**Normal Code with High K**\n\n" + load_code_type_library()["normal_high_k"]["generic"])

    return text


def _harris_lingoes_section(result) -> str:
    """Narrate elevated (T>=65) Harris-Lingoes / Si subscales, grouped by parent scale."""
    hl = result.harris_lingoes_subscales or {}
    si = result.si_subscales or {}
    combined = {**hl, **si}

    group_texts = []
    any_elevated = False
    for parent_scale, parent_label, subscale_keys in HL_SI_PARENT_GROUPS:
        elevated_in_group = []
        for key in subscale_keys:
            ts = _get_scale_value(combined.get(key), "t_score")
            if ts is not None and ts >= 65:
                elevated_in_group.append((key, ts))
        if not elevated_in_group:
            continue
        any_elevated = True
        parent_elevated = (result.t_scores or {}).get(parent_scale, 50) >= 65
        caveat = "" if parent_elevated else f" (note: the parent {parent_label} scale itself is not clinically elevated, so this reflects a narrower, subscale-level finding rather than the broader {parent_label} pattern)"
        for key, ts in elevated_in_group:
            full_name, _, statement = HL_SI_SUBSCALE_META[key]
            group_texts.append(f"- **{key} ({full_name}), T={ts:.0f}:** {statement}{caveat}")

    if not any_elevated:
        return "No Harris-Lingoes or Si subscale reaches the T≥65 threshold; subscale scores are consistent with the overall clinical scale profile."
    return "\n".join(group_texts)


def _modifying_variables_section(result, gender: str) -> str:
    """Note High/Low K, High/Low 5 (Mf), and High/Low 0 (Si) modifiers where applicable."""
    t = result.t_scores or {}
    k_t = t.get("K", 50)
    mf_t = t.get("5_Mf", 50)
    si_t = t.get("0_Si", 50)
    is_female = (gender or "").strip().lower() == "female"
    notes = []

    if k_t >= 65:
        notes.append(f"**High K (T={k_t:.0f}):** the profile may understate the degree of distress or psychopathology actually present; clinical scale elevations, if any, may be more clinically significant than the T-scores alone suggest.")
    elif k_t <= 40:
        notes.append(f"**Low K (T={k_t:.0f}):** the profile may somewhat overstate distress, and clinical scale elevations should be considered in light of reduced psychological defensiveness.")

    mf_low_cut = 40 if is_female else 35
    if mf_t <= mf_low_cut:
        notes.append(f"**Low 5 (Mf, T={mf_t:.0f}):** consistent with a traditionally feminine interest and role pattern for a woman; on its own this is a normal-range finding, not a pathological indicator.")
    elif mf_t >= 65:
        notes.append(f"**High 5 (Mf, T={mf_t:.0f}):** suggests interests and attitudes that diverge from traditional gender-role expectations, which may reflect broader interests, assertiveness, or unconventional self-presentation.")

    if si_t >= 65:
        notes.append(f"**High 0 (Si, T={si_t:.0f}):** suggests introversion, social discomfort, and a preference for solitary activity, which may temper the interpersonal expression of any clinical elevations above (e.g., withdrawal rather than acting out).")
    elif si_t <= 40:
        notes.append(f"**Low 0 (Si, T={si_t:.0f}):** suggests extroversion and social ease, which may lead any distress reflected in the clinical scales to be expressed more outwardly and interpersonally than a withdrawn presentation would suggest.")

    if not notes:
        return "No High/Low K, High/Low 5, or High/Low 0 modifying pattern is present; none of these modifying variables apply to this profile."
    return "\n\n".join(notes)


def _generate_fallback_interpretation(session, age: int, result) -> str:
    """Generate a comprehensive, deterministic clinical interpretation when the AI
    interpretation service is not available. Structured to mirror the practice's
    reference report format: per-scale validity/clinical narrative bullets followed
    by Harris-Lingoes/Si subscale narration, code type, modifying variables,
    diagnostic considerations, prognosis, treatment implications, and a summary."""
    gender = session.gender
    subj, poss, obj = _pronoun(gender)

    validity_status, validity_bullets = _validity_section(result, gender)
    clinical_bullets, elevated, sorted_clinical = _clinical_scales_section(result, gender)
    hl_text = _harris_lingoes_section(result)
    code_text = _code_type_section(elevated, sorted_clinical, gender, result.t_scores or {})
    modifiers_text = _modifying_variables_section(result, gender)

    sections = [
        "## MMPI-2 Clinical Interpretation Report",
        f"**Patient:** {session.name} | **Age:** {age} | **Gender:** {gender}",
        f"**Profile Validity Status:** {validity_status}",
        "## 1. Validity Scales\n\n" + "\n\n".join(f"- {b}" for b in validity_bullets),
        "## 2. Clinical Scales\n\n" + "\n\n".join(f"- {b}" for b in clinical_bullets),
        "## 3. Harris-Lingoes & Si Subscales\n\n" + hl_text,
        "## 4. Code Type Interpretation\n\n" + code_text,
        "## 5. Modifying Variables\n\n" + modifiers_text,
    ]

    # Diagnostic Considerations — only what the elevated scales/subscales actually suggest
    if elevated:
        diag_bits = []
        elevated_scales = {s for s, _ in elevated}
        if "2_D" in elevated_scales:
            diag_bits.append("depressive symptomatology (e.g., Major Depressive Disorder, Persistent Depressive Disorder, or an Adjustment Disorder with depressed mood, depending on chronicity and clinical interview)")
        if "7_Pt" in elevated_scales:
            diag_bits.append("an anxiety-spectrum presentation (e.g., Generalized Anxiety Disorder or Obsessive-Compulsive features)")
        if "8_Sc" in elevated_scales:
            diag_bits.append("difficulties with reality testing, social alienation, or unusual thought processes warranting further psychotic-spectrum screening")
        if "4_Pd" in elevated_scales:
            diag_bits.append("difficulties with impulse control, authority conflict, or antisocial features")
        if "6_Pa" in elevated_scales:
            diag_bits.append("interpersonal suspiciousness or, in extreme elevations, paranoid ideation")
        low_pt_sc = (result.t_scores or {}).get("7_Pt", 50) <= 35 and (result.t_scores or {}).get("8_Sc", 50) <= 35
        tail = (" The notably low Pt and Sc scores argue against a significant anxiety or psychotic-spectrum comorbidity." if low_pt_sc else "")
        diag_text = (f"The profile is consistent with hypotheses of {'; '.join(diag_bits)}." if diag_bits else "No diagnostic hypothesis is suggested by the clinical scales.") + tail
    else:
        diag_text = "No clinical scale elevation is present, so no diagnostic hypothesis is suggested by this profile."
    sections.append("## 6. Diagnostic Considerations\n\n" + diag_text +
                     "\n\nFormal diagnostic conclusions should integrate this MMPI-2 data with clinical interview findings, behavioral observations, and collateral information. The MMPI-2 provides diagnostic hypotheses, not definitive diagnoses.")

    # Prognosis
    es_t = _get_scale_value((result.supplementary_scales or {}).get("Es"), "t_score")
    k_t = (result.t_scores or {}).get("K", 50)
    prognosis_notes = []
    if es_t is not None:
        if es_t >= 45:
            prognosis_notes.append(f"Ego Strength (Es, T={es_t:.0f}) is in the average-to-adequate range, indicating {subj} has psychological resources to draw on in treatment — a favorable prognostic sign.")
        else:
            prognosis_notes.append(f"Ego Strength (Es, T={es_t:.0f}) is below average, suggesting more limited psychological resources at present, which may slow the pace of treatment gains.")
    if 50 <= k_t <= 65:
        prognosis_notes.append("Moderate K scores suggest adequate ego resources, a further positive prognostic indicator.")
    elif k_t > 70 or k_t < 40:
        prognosis_notes.append("Extreme K scores (in either direction) are associated with a somewhat poorer treatment prognosis and may warrant attention to engagement early in treatment.")
    extreme = [(s, ts) for s, ts in sorted_clinical if ts >= 80]
    if extreme:
        prognosis_notes.append("Extreme clinical scale elevation(s) (T≥80) suggest more severe pathology requiring more intensive intervention.")
    if not prognosis_notes:
        prognosis_notes.append("The profile configuration suggests a moderate-to-favorable prognosis with appropriate treatment.")
    sections.append("## 7. Prognosis\n\n" + " ".join(prognosis_notes))

    # Treatment Implications
    treat_bits = ["- Individual psychotherapy targeting the primary areas of elevation identified above"]
    elevated_scales = {s for s, _ in elevated}
    hl = {**(result.harris_lingoes_subscales or {}), **(result.si_subscales or {})}
    if "2_D" in elevated_scales:
        treat_bits.append("- A depression-focused approach (e.g., behavioral activation, cognitive restructuring) given the elevation on Scale 2")
    if _get_scale_value(hl.get("D5"), "t_score", ) and _get_scale_value(hl.get("D5"), "t_score") >= 65:
        treat_bits.append("- Specific attention to rumination and brooding (elevated D5), which can maintain depressive mood if unaddressed")
    if any(_get_scale_value(hl.get(k), "t_score") and _get_scale_value(hl.get(k), "t_score") >= 65 for k in ("D3", "Hy3", "Hy4")):
        treat_bits.append("- Monitoring for somatic/physical symptom overlay and coordination with medical providers as appropriate")
    treat_bits.append("- Regular reassessment of symptoms and treatment response")
    treat_bits.append("- Integration of this psychological testing with clinical observations and collateral history")
    sections.append("## 8. Treatment Implications\n\n" + "\n".join(treat_bits))

    # Summary
    if elevated:
        elev_desc = ", ".join(f"Scale {s.split('_')[0]} ({SCALE_LABELS.get(s, s).split('(')[-1].rstrip(')')}, T={ts:.0f})" for s, ts in elevated)
        summary = (f"The MMPI-2 profile was obtained under a {validity_status.lower()} response style, having approached the "
                   f"inventory in a consistent and non-defensive manner. The clinical profile shows an isolated elevation on {elev_desc}, "
                   f"without a broader multi-scale elevation pattern. ")
    else:
        summary = (f"The MMPI-2 profile was obtained under a {validity_status.lower()} response style. No clinical scale reaches "
                   f"clinically significant elevation, and the profile is broadly within normal limits. ")
    summary += "See the sections above for the specific subscale, diagnostic, prognostic, and treatment considerations that follow from this configuration."
    sections.append("## Summary\n\n" + summary)

    sections.append("\n---\n*Note: This is an automated preliminary interpretation. Code-type, validity, and clinical scale narratives are drawn from the practice's MMPI-2 interpretive reference manual; formal diagnostic and treatment decisions should integrate this with clinical interview and judgment.*")

    return "\n\n".join(sections)


def _get_scale_brief_interpretation(scale: str, t_score: int) -> str:
    """Return brief interpretation for elevated clinical scales."""
    interpretations = {
        "1_Hs": "Excessive somatic concern and preoccupation with bodily functions. May present with vague physical complaints without clear medical etiology. Often associated with pessimism and demanding interpersonal style.",
        "2_D": "Significant depressive symptomatology including dysphoria, hopelessness, and low self-esteem. May experience psychomotor retardation, social withdrawal, and difficulty with concentration.",
        "3_Hy": "Tendency to use psychological defenses of denial and repression. May present with conversion symptoms or somatic complaints. Often seeks attention and approval from others.",
        "4_Pd": "Difficulty conforming to social norms and expectations. May display impulsivity, poor frustration tolerance, and conflicts with authority figures. Interpersonal relationships may be superficial.",
        "5_Mf": "Interests and attitudes that differ from traditional gender role expectations. May reflect intellectual interests, aesthetic sensitivity, or passive interpersonal style.",
        "6_Pa": "Interpersonal sensitivity and suspiciousness. May perceive hostility in others' actions and feel misunderstood. In extreme elevations, may indicate paranoid ideation.",
        "7_Pt": "Significant anxiety, worry, and rumination. May experience obsessive thoughts, indecisiveness, and feelings of inadequacy. Often perfectionistic and self-critical.",
        "8_Sc": "Unusual thought processes, social alienation, and possible difficulties with reality testing. May experience confusion, feelings of unreality, or unusual perceptual experiences.",
        "9_Ma": "Elevated energy, activity level, and possible grandiosity. May display impulsivity, distractibility, and unrealistic goal-setting. Mood may be euphoric or irritable.",
        "0_Si": "Social discomfort and preference for solitary activities. May experience shyness, difficulty in social situations, and limited social support network.",
    }

    if t_score >= 80:
        prefix = "Extreme elevation indicates "
    elif t_score >= 70:
        prefix = "Clinically significant elevation suggests "
    else:
        prefix = "Moderate elevation indicates "

    base = interpretations.get(scale, "")
    if not base:
        return ""
    return prefix + base[0].lower() + base[1:]


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

        # Core Helvetica font only supports Windows-1252; transliterate the
        # few characters the generator emits (em/en dash, minus, curly
        # quotes, bullets) that fall outside that range.
        _PDF_CHAR_MAP = {
            "—": "-", "–": "-", "−": "-",
            "≥": ">=", "≤": "<=",
            "‘": "'", "’": "'", "“": '"', "”": '"',
            "•": "-",
        }

        def sanitize(text):
            for ch, rep in _PDF_CHAR_MAP.items():
                text = text.replace(ch, rep)
            return text

        def write_inline(text, base_style=""):
            """Render a line with **bold** spans, wrapping via write()."""
            for i, seg in enumerate(sanitize(text).split("**")):
                if not seg:
                    continue
                style = ("B" + base_style) if i % 2 == 1 else base_style
                pdf.set_font("Helvetica", style, 10)
                pdf.write(5, seg)
            pdf.ln(6)

        for raw_line in result.interpretation.split("\n"):
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("## "):
                pdf.ln(2)
                pdf.set_text_color(41, 98, 255)
                pdf.set_font("Helvetica", "B", 12)
                pdf.multi_cell(0, 7, sanitize(line[3:]))
                pdf.set_text_color(0, 0, 0)
                pdf.ln(1)
                continue
            if line.startswith("---"):
                continue
            if line.startswith("*") and line.endswith("*") and not line.startswith("**"):
                pdf.set_font("Helvetica", "I", 9)
                pdf.multi_cell(0, 5, sanitize(line.strip("*")))
                pdf.set_font("Helvetica", "", 10)
                continue
            if line.startswith("- "):
                pdf.set_x(pdf.l_margin)
                pdf.set_font("Helvetica", "", 10)
                pdf.write(5, "   -  ")
                write_inline(line[2:])
                continue
            write_inline(line)
        pdf.set_font("Helvetica", "", 10)

    buf = io.BytesIO()
    pdf.output(buf)
    buf.seek(0)

    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=MMPI2_Report_{session.name.replace(' ', '_')}_{session_id[:8]}.pdf"},
    )


# ═════════════════════════════════════════════════════════════════════════════════
#  SESSION INTELLIGENCE — Voice Profiles
# ═════════════════════════════════════════════════════════════════════════════════


@app.get("/api/practitioner/voice-profile/status", response_model=VoiceProfileStatus)
async def get_voice_profile_status(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get the current practitioner's voice profile status."""
    profile = (await db.execute(
        select(VoiceProfile).where(VoiceProfile.practitioner_id == prac.id)
    )).scalar_one_or_none()
    
    if not profile:
        return VoiceProfileStatus(has_voice_profile=False)
    
    return VoiceProfileStatus(
        has_voice_profile=True,
        status=profile.status,
        audio_duration=profile.audio_duration,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


@app.post("/api/practitioner/voice-profile", response_model=VoiceProfileResponse)
async def upload_voice_profile(
    file: UploadFile = File(...),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Upload or replace the practitioner's voice profile."""
    # Validate audio file
    is_valid, error_msg = validate_audio_file(file.filename, file.content_type)
    if not is_valid:
        raise HTTPException(400, error_msg)
    
    # Check if profile already exists
    existing = (await db.execute(
        select(VoiceProfile).where(VoiceProfile.practitioner_id == prac.id)
    )).scalar_one_or_none()
    
    from models import generate_uuid
    profile_id = existing.id if existing else generate_uuid()
    
    # Save audio file
    storage_path, file_size = await save_voice_profile(file, prac.id, profile_id)
    
    # Get audio duration
    from session_intelligence import generate_voice_embedding, get_audio_duration
    full_path = await get_file_path(storage_path)
    duration = await get_audio_duration(str(full_path)) if full_path else None
    
    if existing:
        # Update existing profile
        existing.audio_storage_path = storage_path
        existing.audio_duration = duration
        existing.status = "processing"
        existing.embedding = None
        await db.commit()
        await db.refresh(existing)
        profile = existing
    else:
        # Create new profile
        profile = VoiceProfile(
            id=profile_id,
            practitioner_id=prac.id,
            audio_storage_path=storage_path,
            audio_duration=duration,
            status="processing",
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    
    # Generate voice embedding in background
    # For now, just mark as ready (in production, use background task)
    embedding = await generate_voice_embedding(str(full_path)) if full_path else None
    profile.embedding = embedding
    profile.status = "ready"
    await db.commit()
    await db.refresh(profile)
    
    return VoiceProfileResponse(
        id=profile.id,
        practitioner_id=profile.practitioner_id,
        audio_duration=profile.audio_duration,
        status=profile.status,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


@app.delete("/api/practitioner/voice-profile")
async def delete_voice_profile(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Delete the practitioner's voice profile."""
    profile = (await db.execute(
        select(VoiceProfile).where(VoiceProfile.practitioner_id == prac.id)
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Voice profile not found")
    
    # Delete file
    await delete_file(profile.audio_storage_path)
    
    # Delete record
    await db.delete(profile)
    await db.commit()
    
    return {"message": "Voice profile deleted successfully"}


# ═════════════════════════════════════════════════════════════════════════════════
#  SESSION INTELLIGENCE — Therapy Sessions
# ═════════════════════════════════════════════════════════════════════════════════

@app.post("/api/patients/{patient_id}/therapy-sessions", response_model=TherapySessionResponse)
async def upload_therapy_session(
    patient_id: str,
    file: UploadFile = File(...),
    session_date: str = Form(...),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Upload a therapy session recording for processing."""
    # Verify patient access
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    # Validate audio file
    is_valid, error_msg = validate_audio_file(file.filename, file.content_type)
    if not is_valid:
        raise HTTPException(400, error_msg)
    
    # Parse session date
    try:
        parsed_date = datetime.fromisoformat(session_date.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, "Invalid session date format. Use ISO format.")
    
    from models import generate_uuid
    session_id = generate_uuid()
    
    # Save audio file
    storage_path, file_size = await save_therapy_session_audio(file, patient_id, session_id)
    
    # Get audio duration
    from session_intelligence import get_audio_duration
    full_path = await get_file_path(storage_path)
    duration = await get_audio_duration(str(full_path)) if full_path else None
    
    # Create therapy session record
    therapy_session = TherapySession(
        id=session_id,
        patient_id=patient_id,
        practitioner_id=prac.id,
        audio_storage_path=storage_path,
        audio_duration=duration,
        original_filename=file.filename,
        file_size=file_size,
        mime_type=file.content_type or get_audio_mime_type(file.filename),
        session_date=parsed_date,
        processing_status="pending",
    )
    db.add(therapy_session)
    await db.commit()
    await db.refresh(therapy_session)
    
    return TherapySessionResponse(
        id=therapy_session.id,
        patient_id=therapy_session.patient_id,
        practitioner_id=therapy_session.practitioner_id,
        audio_duration=therapy_session.audio_duration,
        original_filename=therapy_session.original_filename,
        file_size=therapy_session.file_size,
        session_date=therapy_session.session_date,
        detected_language=therapy_session.detected_language,
        transcript=therapy_session.transcript,
        transcript_text=therapy_session.transcript_text,
        translation=therapy_session.translation,
        translation_text=therapy_session.translation_text,
        summary=therapy_session.summary,
        soap_notes=therapy_session.soap_notes,
        processing_status=therapy_session.processing_status,
        processing_error=therapy_session.processing_error,
        created_at=therapy_session.created_at,
        updated_at=therapy_session.updated_at,
    )


@app.post("/api/patients/{patient_id}/therapy-sessions/{session_id}/process")
async def process_therapy_session(
    patient_id: str,
    session_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Start processing a therapy session recording."""
    # Verify patient access
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    therapy_session = await db.get(TherapySession, session_id)
    if not therapy_session or therapy_session.patient_id != patient_id:
        raise HTTPException(404, "Therapy session not found")
    
    if therapy_session.processing_status == "processing":
        raise HTTPException(400, "Session is already being processed")
    
    # Update status to processing
    therapy_session.processing_status = "processing"
    therapy_session.processing_error = None
    await db.commit()
    
    # Get voice profile for speaker identification
    voice_profile = (await db.execute(
        select(VoiceProfile).where(VoiceProfile.practitioner_id == prac.id)
    )).scalar_one_or_none()
    voice_embedding = voice_profile.embedding if voice_profile and voice_profile.status == "ready" else None
    
    # Get audio file path
    full_path = await get_file_path(therapy_session.audio_storage_path)
    if not full_path:
        therapy_session.processing_status = "failed"
        therapy_session.processing_error = "Audio file not found"
        await db.commit()
        raise HTTPException(404, "Audio file not found")
    
    # Process the session
    from session_intelligence import process_therapy_session as process_session
    try:
        result = await process_session(
            str(full_path),
            voice_embedding=voice_embedding,
            session_date=therapy_session.session_date,
        )
        
        # Update session with results
        therapy_session.transcript = result.get("transcript")
        therapy_session.transcript_text = result.get("transcript_text")
        therapy_session.detected_language = result.get("detected_language")
        therapy_session.translation = result.get("translation")
        therapy_session.translation_text = result.get("translation_text")
        therapy_session.summary = result.get("summary")
        therapy_session.soap_notes = result.get("soap_notes")
        therapy_session.processing_status = "completed"
        
        await db.commit()
        await db.refresh(therapy_session)
        
        # Trigger Clinical Intelligence processing
        try:
            from clinical_intelligence import process_therapy_session as ci_process_session, merge_intelligence_update
            
            ci = (await db.execute(
                select(ClinicalIntelligence).where(ClinicalIntelligence.patient_id == patient_id)
            )).scalar_one_or_none()
            
            if not ci:
                from models import generate_uuid
                ci = ClinicalIntelligence(
                    id=generate_uuid(),
                    patient_id=patient_id,
                    version=1,
                )
                db.add(ci)
                await db.commit()
                await db.refresh(ci)
            
            session_data = {
                "id": therapy_session.id,
                "session_date": therapy_session.session_date.isoformat() if therapy_session.session_date else None,
                "transcript_text": therapy_session.transcript_text,
                "translation_text": therapy_session.translation_text,
                "summary": therapy_session.summary,
                "soap_notes": therapy_session.soap_notes,
            }
            existing = {
                "patient_summary": ci.patient_summary,
                "symptoms": ci.symptoms,
                "treatment_goals": ci.treatment_goals,
                "outstanding_questions": ci.outstanding_questions,
            }
            updates = await ci_process_session(session_data, existing)
            
            for update in updates:
                if update.get("auto_apply"):
                    ci_data = {
                        "patient_summary": ci.patient_summary,
                        "psychological_profile": ci.psychological_profile,
                        "symptoms": ci.symptoms or [],
                        "diagnoses": ci.diagnoses or [],
                        "treatment_goals": ci.treatment_goals or [],
                        "relationships": ci.relationships or [],
                        "life_events": ci.life_events or [],
                        "risk_factors": ci.risk_factors or [],
                        "timeline": ci.timeline or [],
                        "outstanding_questions": ci.outstanding_questions or [],
                    }
                    updated_data = merge_intelligence_update(ci_data, update)
                    ci.patient_summary = updated_data.get("patient_summary")
                    ci.psychological_profile = updated_data.get("psychological_profile")
                    ci.symptoms = updated_data.get("symptoms")
                    ci.diagnoses = updated_data.get("diagnoses")
                    ci.treatment_goals = updated_data.get("treatment_goals")
                    ci.relationships = updated_data.get("relationships")
                    ci.life_events = updated_data.get("life_events")
                    ci.risk_factors = updated_data.get("risk_factors")
                    ci.timeline = updated_data.get("timeline")
                    ci.outstanding_questions = updated_data.get("outstanding_questions")
                else:
                    from models import generate_uuid
                    ci_update = ClinicalIntelligenceUpdate(
                        id=generate_uuid(),
                        clinical_intelligence_id=ci.id,
                        update_type=update.get("update_type"),
                        section=update.get("section"),
                        operation=update.get("operation"),
                        proposed_changes=update.get("proposed_changes"),
                        source_type=update.get("source_type"),
                        source_id=update.get("source_id"),
                        source_excerpt=update.get("source_excerpt"),
                        confidence=update.get("confidence", "medium"),
                        reasoning=update.get("reasoning"),
                        review_status="pending",
                    )
                    db.add(ci_update)
            
            ci.last_processed_at = datetime.now(timezone.utc)
            ci.last_source_type = "therapy_session"
            ci.last_source_id = therapy_session.id
            await db.commit()
        except Exception as e:
            print(f"Clinical Intelligence processing error: {e}")
        
        return {"message": "Processing completed successfully"}
    except Exception as e:
        therapy_session.processing_status = "failed"
        therapy_session.processing_error = str(e)
        await db.commit()
        raise HTTPException(500, f"Processing failed: {str(e)}")


@app.get("/api/patients/{patient_id}/therapy-sessions", response_model=list[TherapySessionListItem])
async def list_therapy_sessions(
    patient_id: str,
    language: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """List all therapy sessions for a patient."""
    # Verify patient access
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    query = select(TherapySession).where(TherapySession.patient_id == patient_id)
    
    # Filter by language
    if language:
        query = query.where(TherapySession.detected_language == language)
    
    # Filter by date range
    if start_date:
        try:
            start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            query = query.where(TherapySession.session_date >= start)
        except ValueError:
            pass
    
    if end_date:
        try:
            end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            query = query.where(TherapySession.session_date <= end)
        except ValueError:
            pass
    
    sessions = (await db.execute(
        query.order_by(TherapySession.session_date.desc())
    )).scalars().all()
    
    return [
        TherapySessionListItem(
            id=s.id,
            patient_id=s.patient_id,
            session_date=s.session_date,
            audio_duration=s.audio_duration,
            detected_language=s.detected_language,
            processing_status=s.processing_status,
            created_at=s.created_at,
        )
        for s in sessions
    ]


@app.get("/api/patients/{patient_id}/therapy-sessions/{session_id}", response_model=TherapySessionResponse)
async def get_therapy_session(
    patient_id: str,
    session_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get a therapy session by ID."""
    # Verify patient access
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    therapy_session = await db.get(TherapySession, session_id)
    if not therapy_session or therapy_session.patient_id != patient_id:
        raise HTTPException(404, "Therapy session not found")
    
    return TherapySessionResponse(
        id=therapy_session.id,
        patient_id=therapy_session.patient_id,
        practitioner_id=therapy_session.practitioner_id,
        audio_duration=therapy_session.audio_duration,
        original_filename=therapy_session.original_filename,
        file_size=therapy_session.file_size,
        session_date=therapy_session.session_date,
        detected_language=therapy_session.detected_language,
        transcript=therapy_session.transcript,
        transcript_text=therapy_session.transcript_text,
        translation=therapy_session.translation,
        translation_text=therapy_session.translation_text,
        summary=therapy_session.summary,
        soap_notes=therapy_session.soap_notes,
        processing_status=therapy_session.processing_status,
        processing_error=therapy_session.processing_error,
        created_at=therapy_session.created_at,
        updated_at=therapy_session.updated_at,
    )


@app.patch("/api/patients/{patient_id}/therapy-sessions/{session_id}/soap-notes")
async def update_soap_notes(
    patient_id: str,
    session_id: str,
    data: SOAPNotesUpdate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Update SOAP notes for a therapy session."""
    # Verify patient access
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    therapy_session = await db.get(TherapySession, session_id)
    if not therapy_session or therapy_session.patient_id != patient_id:
        raise HTTPException(404, "Therapy session not found")
    
    # Update SOAP notes
    current_notes = therapy_session.soap_notes or {}
    
    if data.subjective is not None:
        current_notes["subjective"] = data.subjective
    if data.objective is not None:
        current_notes["objective"] = data.objective
    if data.assessment is not None:
        current_notes["assessment"] = data.assessment
    if data.plan is not None:
        current_notes["plan"] = data.plan
    
    current_notes["edited"] = True
    
    therapy_session.soap_notes = current_notes
    await db.commit()
    
    return {"message": "SOAP notes updated successfully", "soap_notes": current_notes}


@app.get("/api/patients/{patient_id}/therapy-sessions/{session_id}/audio")
async def download_therapy_session_audio(
    patient_id: str,
    session_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Download therapy session audio file."""
    # Verify patient access
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    therapy_session = await db.get(TherapySession, session_id)
    if not therapy_session or therapy_session.patient_id != patient_id:
        raise HTTPException(404, "Therapy session not found")
    
    file_path = await get_file_path(therapy_session.audio_storage_path)
    if not file_path:
        raise HTTPException(404, "Audio file not found")
    
    return FileResponse(
        path=file_path,
        filename=therapy_session.original_filename,
        media_type=therapy_session.mime_type,
    )


@app.get("/api/patients/{patient_id}/therapy-sessions/{session_id}/transcript/download")
async def download_transcript(
    patient_id: str,
    session_id: str,
    format: str = Query("txt", description="Format: txt or json"),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Download therapy session transcript."""
    # Verify patient access
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    therapy_session = await db.get(TherapySession, session_id)
    if not therapy_session or therapy_session.patient_id != patient_id:
        raise HTTPException(404, "Therapy session not found")
    
    if not therapy_session.transcript_text:
        raise HTTPException(404, "Transcript not available")
    
    if format == "json":
        content = json.dumps({
            "session_id": session_id,
            "session_date": therapy_session.session_date.isoformat(),
            "language": therapy_session.detected_language,
            "transcript": therapy_session.transcript,
        }, indent=2)
        media_type = "application/json"
        filename = f"transcript_{session_id[:8]}.json"
    else:
        content = therapy_session.transcript_text
        media_type = "text/plain"
        filename = f"transcript_{session_id[:8]}.txt"
    
    import json
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""},
    )


@app.delete("/api/patients/{patient_id}/therapy-sessions/{session_id}")
async def delete_therapy_session(
    patient_id: str,
    session_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Delete a therapy session."""
    # Verify patient access
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    therapy_session = await db.get(TherapySession, session_id)
    if not therapy_session or therapy_session.patient_id != patient_id:
        raise HTTPException(404, "Therapy session not found")
    
    # Delete audio file
    await delete_file(therapy_session.audio_storage_path)
    
    # Delete record
    await db.delete(therapy_session)
    await db.commit()
    
    return {"message": "Therapy session deleted successfully"}


# ═════════════════════════════════════════════════════════════════════════════════
#  CLINICAL INTELLIGENCE — Unified Patient Intelligence Layer
# ═════════════════════════════════════════════════════════════════════════════════

@app.get("/api/patients/{patient_id}/clinical-intelligence", response_model=ClinicalIntelligenceResponse)
async def get_clinical_intelligence(
    patient_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get Clinical Intelligence for a patient."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    # Get or create clinical intelligence
    ci = (await db.execute(
        select(ClinicalIntelligence).where(ClinicalIntelligence.patient_id == patient_id)
    )).scalar_one_or_none()
    
    if not ci:
        from models import generate_uuid
        ci = ClinicalIntelligence(
            id=generate_uuid(),
            patient_id=patient_id,
            version=1,
        )
        db.add(ci)
        await db.commit()
        await db.refresh(ci)
    
    # Count pending updates
    pending_count = (await db.execute(
        select(func.count(ClinicalIntelligenceUpdate.id)).where(
            ClinicalIntelligenceUpdate.clinical_intelligence_id == ci.id,
            ClinicalIntelligenceUpdate.review_status == "pending",
        )
    )).scalar() or 0
    
    return ClinicalIntelligenceResponse(
        id=ci.id,
        patient_id=ci.patient_id,
        version=ci.version,
        patient_summary=ci.patient_summary,
        psychological_profile=ci.psychological_profile,
        symptoms=ci.symptoms,
        diagnoses=ci.diagnoses,
        treatment_goals=ci.treatment_goals,
        relationships=ci.relationships,
        life_events=ci.life_events,
        risk_factors=ci.risk_factors,
        timeline=ci.timeline,
        outstanding_questions=ci.outstanding_questions,
        last_processed_at=ci.last_processed_at,
        last_source_type=ci.last_source_type,
        last_source_id=ci.last_source_id,
        pending_updates_count=pending_count,
        created_at=ci.created_at,
        updated_at=ci.updated_at,
    )


@app.get("/api/patients/{patient_id}/clinical-intelligence/stats", response_model=ClinicalIntelligenceStats)
async def get_clinical_intelligence_stats(
    patient_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get Clinical Intelligence stats for dashboard display."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    ci = (await db.execute(
        select(ClinicalIntelligence).where(ClinicalIntelligence.patient_id == patient_id)
    )).scalar_one_or_none()
    
    if not ci:
        return ClinicalIntelligenceStats()
    
    # Count pending updates
    pending_count = (await db.execute(
        select(func.count(ClinicalIntelligenceUpdate.id)).where(
            ClinicalIntelligenceUpdate.clinical_intelligence_id == ci.id,
            ClinicalIntelligenceUpdate.review_status == "pending",
        )
    )).scalar() or 0
    
    symptoms = ci.symptoms or []
    diagnoses = ci.diagnoses or []
    goals = ci.treatment_goals or []
    risk_factors = ci.risk_factors or []
    questions = ci.outstanding_questions or []
    
    return ClinicalIntelligenceStats(
        total_symptoms=len(symptoms),
        active_symptoms=len([s for s in symptoms if s.get("current_status") == "active"]),
        total_diagnoses=len(diagnoses),
        current_diagnoses=len([d for d in diagnoses if d.get("status") == "current"]),
        total_goals=len(goals),
        current_goals=len([g for g in goals if g.get("status") == "current"]),
        completed_goals=len([g for g in goals if g.get("status") == "completed"]),
        total_relationships=len(ci.relationships or []),
        total_life_events=len(ci.life_events or []),
        current_risk_factors=len([r for r in risk_factors if r.get("status") == "current"]),
        outstanding_questions=len([q for q in questions if not q.get("resolved")]),
        pending_updates=pending_count,
        last_updated=ci.updated_at,
    )


@app.post("/api/patients/{patient_id}/clinical-intelligence/process")
async def trigger_clinical_intelligence_processing(
    patient_id: str,
    source_type: str = Query(None),
    source_id: str = Query(None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Trigger Clinical Intelligence processing for a patient."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    # Get or create clinical intelligence
    ci = (await db.execute(
        select(ClinicalIntelligence).where(ClinicalIntelligence.patient_id == patient_id)
    )).scalar_one_or_none()
    
    if not ci:
        from models import generate_uuid
        ci = ClinicalIntelligence(
            id=generate_uuid(),
            patient_id=patient_id,
            version=1,
        )
        db.add(ci)
        await db.commit()
        await db.refresh(ci)
    
    from clinical_intelligence import (
        process_clinical_history,
        process_therapy_session,
        process_assessment,
        process_document,
    )
    
    updates = []
    
    # Process based on source type or all sources
    if source_type == "clinical_history" or source_type is None:
        ch = (await db.execute(
            select(ClinicalHistory).where(ClinicalHistory.patient_id == patient_id)
        )).scalar_one_or_none()
        if ch and ch.status != "not_started":
            ch_data = {
                "id": ch.id,
                "presenting_complaint": ch.presenting_complaint,
                "history_present_illness": ch.history_present_illness,
                "medical_history": ch.medical_history,
                "family_history": ch.family_history,
                "personal_history": ch.personal_history,
                "relationship_history": ch.relationship_history,
                "substance_use": ch.substance_use,
                "trauma_history": ch.trauma_history,
                "risk_assessment": ch.risk_assessment,
            }
            existing = {
                "patient_summary": ci.patient_summary,
                "psychological_profile": ci.psychological_profile,
                "symptoms": ci.symptoms,
                "diagnoses": ci.diagnoses,
            }
            ch_updates = await process_clinical_history(patient_id, ch_data, existing)
            updates.extend(ch_updates)
    
    if source_type == "therapy_session" or source_type is None:
        sessions = (await db.execute(
            select(TherapySession).where(
                TherapySession.patient_id == patient_id,
                TherapySession.processing_status == "completed",
            )
        )).scalars().all()
        
        for session in sessions:
            if source_id and session.id != source_id:
                continue
            session_data = {
                "id": session.id,
                "session_date": session.session_date.isoformat() if session.session_date else None,
                "transcript_text": session.transcript_text,
                "translation_text": session.translation_text,
                "summary": session.summary,
                "soap_notes": session.soap_notes,
            }
            existing = {
                "patient_summary": ci.patient_summary,
                "symptoms": ci.symptoms,
                "treatment_goals": ci.treatment_goals,
                "outstanding_questions": ci.outstanding_questions,
            }
            session_updates = await process_therapy_session(session_data, existing)
            updates.extend(session_updates)
    
    # Store updates for review
    from models import generate_uuid
    for update in updates:
        # Check for auto-apply updates
        if update.get("auto_apply"):
            # Apply directly to intelligence
            from clinical_intelligence import merge_intelligence_update
            ci_data = {
                "patient_summary": ci.patient_summary,
                "psychological_profile": ci.psychological_profile,
                "symptoms": ci.symptoms or [],
                "diagnoses": ci.diagnoses or [],
                "treatment_goals": ci.treatment_goals or [],
                "relationships": ci.relationships or [],
                "life_events": ci.life_events or [],
                "risk_factors": ci.risk_factors or [],
                "timeline": ci.timeline or [],
                "outstanding_questions": ci.outstanding_questions or [],
            }
            updated_data = merge_intelligence_update(ci_data, update)
            
            # Update the model
            ci.patient_summary = updated_data.get("patient_summary")
            ci.psychological_profile = updated_data.get("psychological_profile")
            ci.symptoms = updated_data.get("symptoms")
            ci.diagnoses = updated_data.get("diagnoses")
            ci.treatment_goals = updated_data.get("treatment_goals")
            ci.relationships = updated_data.get("relationships")
            ci.life_events = updated_data.get("life_events")
            ci.risk_factors = updated_data.get("risk_factors")
            ci.timeline = updated_data.get("timeline")
            ci.outstanding_questions = updated_data.get("outstanding_questions")
        else:
            # Create pending update for review
            ci_update = ClinicalIntelligenceUpdate(
                id=generate_uuid(),
                clinical_intelligence_id=ci.id,
                update_type=update.get("update_type"),
                section=update.get("section"),
                operation=update.get("operation"),
                proposed_changes=update.get("proposed_changes"),
                source_type=update.get("source_type"),
                source_id=update.get("source_id"),
                source_excerpt=update.get("source_excerpt"),
                confidence=update.get("confidence", "medium"),
                reasoning=update.get("reasoning"),
                review_status="pending",
                auto_apply=False,
            )
            db.add(ci_update)
    
    # Update processing metadata
    ci.last_processed_at = datetime.now(timezone.utc)
    ci.last_source_type = source_type
    ci.last_source_id = source_id
    
    await db.commit()
    
    return {
        "message": f"Processing complete. Generated {len(updates)} updates.",
        "updates_count": len(updates),
        "auto_applied": len([u for u in updates if u.get("auto_apply")]),
        "pending_review": len([u for u in updates if not u.get("auto_apply")]),
    }


@app.get("/api/patients/{patient_id}/clinical-intelligence/updates", response_model=list[ClinicalIntelligenceUpdateResponse])
async def list_pending_updates(
    patient_id: str,
    status: str = Query("pending"),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """List pending Clinical Intelligence updates for review."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    ci = (await db.execute(
        select(ClinicalIntelligence).where(ClinicalIntelligence.patient_id == patient_id)
    )).scalar_one_or_none()
    
    if not ci:
        return []
    
    query = select(ClinicalIntelligenceUpdate).where(
        ClinicalIntelligenceUpdate.clinical_intelligence_id == ci.id,
    )
    
    if status != "all":
        query = query.where(ClinicalIntelligenceUpdate.review_status == status)
    
    updates = (await db.execute(
        query.order_by(ClinicalIntelligenceUpdate.created_at.desc())
    )).scalars().all()
    
    result = []
    for u in updates:
        reviewer = await db.get(Practitioner, u.reviewed_by) if u.reviewed_by else None
        result.append(ClinicalIntelligenceUpdateResponse(
            id=u.id,
            update_type=u.update_type,
            section=u.section,
            operation=u.operation,
            proposed_changes=u.proposed_changes,
            source_type=u.source_type,
            source_id=u.source_id,
            source_excerpt=u.source_excerpt,
            confidence=u.confidence,
            reasoning=u.reasoning,
            review_status=u.review_status,
            reviewed_by=u.reviewed_by,
            reviewed_by_name=reviewer.name if reviewer else None,
            reviewed_at=u.reviewed_at,
            review_notes=u.review_notes,
            auto_apply=u.auto_apply,
            created_at=u.created_at,
        ))
    
    return result


@app.post("/api/patients/{patient_id}/clinical-intelligence/updates/{update_id}/review")
async def review_update(
    patient_id: str,
    update_id: str,
    data: ReviewUpdateRequest,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject a Clinical Intelligence update."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    ci = (await db.execute(
        select(ClinicalIntelligence).where(ClinicalIntelligence.patient_id == patient_id)
    )).scalar_one_or_none()
    
    if not ci:
        raise HTTPException(404, "Clinical Intelligence not found")
    
    update = await db.get(ClinicalIntelligenceUpdate, update_id)
    if not update or update.clinical_intelligence_id != ci.id:
        raise HTTPException(404, "Update not found")
    
    if update.review_status != "pending":
        raise HTTPException(400, "Update has already been reviewed")
    
    if data.action not in ["approve", "reject"]:
        raise HTTPException(400, "Action must be 'approve' or 'reject'")
    
    update.review_status = "approved" if data.action == "approve" else "rejected"
    update.reviewed_by = prac.id
    update.reviewed_at = datetime.now(timezone.utc)
    update.review_notes = data.notes
    
    if data.action == "approve":
        # Apply the update
        from clinical_intelligence import merge_intelligence_update, create_intelligence_snapshot
        
        # Create version snapshot before applying
        from models import generate_uuid
        snapshot = create_intelligence_snapshot({
            "patient_summary": ci.patient_summary,
            "psychological_profile": ci.psychological_profile,
            "symptoms": ci.symptoms,
            "diagnoses": ci.diagnoses,
            "treatment_goals": ci.treatment_goals,
            "relationships": ci.relationships,
            "life_events": ci.life_events,
            "risk_factors": ci.risk_factors,
            "timeline": ci.timeline,
            "outstanding_questions": ci.outstanding_questions,
        })
        
        version = ClinicalIntelligenceVersion(
            id=generate_uuid(),
            clinical_intelligence_id=ci.id,
            version=ci.version,
            snapshot=snapshot,
            change_reason=f"Update approved: {update.update_type}",
            source_type=update.source_type,
            source_id=update.source_id,
            changed_by=prac.id,
        )
        db.add(version)
        
        # Apply update
        ci_data = {
            "patient_summary": ci.patient_summary,
            "psychological_profile": ci.psychological_profile,
            "symptoms": ci.symptoms or [],
            "diagnoses": ci.diagnoses or [],
            "treatment_goals": ci.treatment_goals or [],
            "relationships": ci.relationships or [],
            "life_events": ci.life_events or [],
            "risk_factors": ci.risk_factors or [],
            "timeline": ci.timeline or [],
            "outstanding_questions": ci.outstanding_questions or [],
        }
        updated_data = merge_intelligence_update(ci_data, {
            "section": update.section,
            "operation": update.operation,
            "proposed_changes": update.proposed_changes,
        })
        
        # Update the model
        ci.patient_summary = updated_data.get("patient_summary")
        ci.psychological_profile = updated_data.get("psychological_profile")
        ci.symptoms = updated_data.get("symptoms")
        ci.diagnoses = updated_data.get("diagnoses")
        ci.treatment_goals = updated_data.get("treatment_goals")
        ci.relationships = updated_data.get("relationships")
        ci.life_events = updated_data.get("life_events")
        ci.risk_factors = updated_data.get("risk_factors")
        ci.timeline = updated_data.get("timeline")
        ci.outstanding_questions = updated_data.get("outstanding_questions")
        ci.version += 1
    
    await db.commit()
    
    return {"message": f"Update {data.action}d successfully"}


@app.post("/api/patients/{patient_id}/clinical-intelligence/updates/bulk-review")
async def bulk_review_updates(
    patient_id: str,
    action: str = Query(...),
    update_ids: list[str] = Query(None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Bulk approve or reject Clinical Intelligence updates."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    if action not in ["approve", "reject"]:
        raise HTTPException(400, "Action must be 'approve' or 'reject'")
    
    ci = (await db.execute(
        select(ClinicalIntelligence).where(ClinicalIntelligence.patient_id == patient_id)
    )).scalar_one_or_none()
    
    if not ci:
        raise HTTPException(404, "Clinical Intelligence not found")
    
    # Get updates to process
    query = select(ClinicalIntelligenceUpdate).where(
        ClinicalIntelligenceUpdate.clinical_intelligence_id == ci.id,
        ClinicalIntelligenceUpdate.review_status == "pending",
    )
    
    if update_ids:
        query = query.where(ClinicalIntelligenceUpdate.id.in_(update_ids))
    
    updates = (await db.execute(query)).scalars().all()
    
    processed = 0
    for update in updates:
        update.review_status = "approved" if action == "approve" else "rejected"
        update.reviewed_by = prac.id
        update.reviewed_at = datetime.now(timezone.utc)
        
        if action == "approve":
            from clinical_intelligence import merge_intelligence_update
            ci_data = {
                "patient_summary": ci.patient_summary,
                "psychological_profile": ci.psychological_profile,
                "symptoms": ci.symptoms or [],
                "diagnoses": ci.diagnoses or [],
                "treatment_goals": ci.treatment_goals or [],
                "relationships": ci.relationships or [],
                "life_events": ci.life_events or [],
                "risk_factors": ci.risk_factors or [],
                "timeline": ci.timeline or [],
                "outstanding_questions": ci.outstanding_questions or [],
            }
            updated_data = merge_intelligence_update(ci_data, {
                "section": update.section,
                "operation": update.operation,
                "proposed_changes": update.proposed_changes,
            })
            
            ci.patient_summary = updated_data.get("patient_summary")
            ci.psychological_profile = updated_data.get("psychological_profile")
            ci.symptoms = updated_data.get("symptoms")
            ci.diagnoses = updated_data.get("diagnoses")
            ci.treatment_goals = updated_data.get("treatment_goals")
            ci.relationships = updated_data.get("relationships")
            ci.life_events = updated_data.get("life_events")
            ci.risk_factors = updated_data.get("risk_factors")
            ci.timeline = updated_data.get("timeline")
            ci.outstanding_questions = updated_data.get("outstanding_questions")
        
        processed += 1
    
    if action == "approve" and processed > 0:
        ci.version += 1
    
    await db.commit()
    
    return {"message": f"{processed} updates {action}d successfully", "processed": processed}


@app.get("/api/patients/{patient_id}/clinical-intelligence/versions", response_model=list[ClinicalIntelligenceVersionResponse])
async def list_versions(
    patient_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """List Clinical Intelligence version history."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    ci = (await db.execute(
        select(ClinicalIntelligence).where(ClinicalIntelligence.patient_id == patient_id)
    )).scalar_one_or_none()
    
    if not ci:
        return []
    
    versions = (await db.execute(
        select(ClinicalIntelligenceVersion)
        .where(ClinicalIntelligenceVersion.clinical_intelligence_id == ci.id)
        .order_by(ClinicalIntelligenceVersion.version.desc())
    )).scalars().all()
    
    result = []
    for v in versions:
        changer = await db.get(Practitioner, v.changed_by) if v.changed_by else None
        result.append(ClinicalIntelligenceVersionResponse(
            id=v.id,
            version=v.version,
            change_reason=v.change_reason,
            source_type=v.source_type,
            source_id=v.source_id,
            changed_by=v.changed_by,
            changed_by_name=changer.name if changer else None,
            created_at=v.created_at,
        ))
    
    return result


@app.get("/api/patients/{patient_id}/clinical-intelligence/versions/{version_id}")
async def get_version_snapshot(
    patient_id: str,
    version_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific version snapshot."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    ci = (await db.execute(
        select(ClinicalIntelligence).where(ClinicalIntelligence.patient_id == patient_id)
    )).scalar_one_or_none()
    
    if not ci:
        raise HTTPException(404, "Clinical Intelligence not found")
    
    version = await db.get(ClinicalIntelligenceVersion, version_id)
    if not version or version.clinical_intelligence_id != ci.id:
        raise HTTPException(404, "Version not found")
    
    return {
        "version": version.version,
        "snapshot": version.snapshot,
        "change_reason": version.change_reason,
        "created_at": version.created_at,
    }


@app.post("/api/patients/{patient_id}/clinical-intelligence/versions/{version_id}/restore")
async def restore_version(
    patient_id: str,
    version_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Restore Clinical Intelligence to a previous version."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if patient.practitioner_id != prac.id and prac.role != "owner":
        raise HTTPException(403, "Access denied")
    
    ci = (await db.execute(
        select(ClinicalIntelligence).where(ClinicalIntelligence.patient_id == patient_id)
    )).scalar_one_or_none()
    
    if not ci:
        raise HTTPException(404, "Clinical Intelligence not found")
    
    version = await db.get(ClinicalIntelligenceVersion, version_id)
    if not version or version.clinical_intelligence_id != ci.id:
        raise HTTPException(404, "Version not found")
    
    # Create snapshot of current state before restoring
    from clinical_intelligence import create_intelligence_snapshot
    from models import generate_uuid
    
    current_snapshot = create_intelligence_snapshot({
        "patient_summary": ci.patient_summary,
        "psychological_profile": ci.psychological_profile,
        "symptoms": ci.symptoms,
        "diagnoses": ci.diagnoses,
        "treatment_goals": ci.treatment_goals,
        "relationships": ci.relationships,
        "life_events": ci.life_events,
        "risk_factors": ci.risk_factors,
        "timeline": ci.timeline,
        "outstanding_questions": ci.outstanding_questions,
    })
    
    backup_version = ClinicalIntelligenceVersion(
        id=generate_uuid(),
        clinical_intelligence_id=ci.id,
        version=ci.version,
        snapshot=current_snapshot,
        change_reason=f"Backup before restore to version {version.version}",
        changed_by=prac.id,
    )
    db.add(backup_version)
    
    # Restore from snapshot
    snapshot = version.snapshot
    ci.patient_summary = snapshot.get("patient_summary")
    ci.psychological_profile = snapshot.get("psychological_profile")
    ci.symptoms = snapshot.get("symptoms")
    ci.diagnoses = snapshot.get("diagnoses")
    ci.treatment_goals = snapshot.get("treatment_goals")
    ci.relationships = snapshot.get("relationships")
    ci.life_events = snapshot.get("life_events")
    ci.risk_factors = snapshot.get("risk_factors")
    ci.timeline = snapshot.get("timeline")
    ci.outstanding_questions = snapshot.get("outstanding_questions")
    ci.version += 1
    
    await db.commit()
    
    return {"message": f"Restored to version {version.version}"}


# ═════════════════════════════════════════════════════════════════════════════════
#  CALENDAR & SCHEDULING
# ═════════════════════════════════════════════════════════════════════════════════

from models import Appointment, PractitionerAvailability, UnavailableDate
from schemas import (
    AppointmentCreate, AppointmentUpdate, AppointmentReschedule, AppointmentResponse, AppointmentListItem,
    CalendarEvent, AvailabilityCreate, AvailabilityUpdate, AvailabilityResponse,
    UnavailableDateCreate, UnavailableDateResponse, TimeSlot, DayAvailability,
    TodaySchedule, UpcomingAppointments,
    SESSION_TYPES as SCHEMA_SESSION_TYPES, SESSION_MODES, APPOINTMENT_STATUSES,
)


def _get_status_color(status: str) -> str:
    """Get color for calendar event based on status."""
    colors = {
        "scheduled": "#3b82f6",  # blue
        "completed": "#22c55e",  # green
        "cancelled": "#ef4444",  # red
        "no_show": "#f97316",  # orange
        "rescheduled": "#8b5cf6",  # purple
    }
    return colors.get(status, "#6b7280")


# ─── Appointments CRUD ─────────────────────────────────────────────────────────

@app.get("/api/appointments", response_model=list[AppointmentListItem])
async def list_appointments(
    start_date: date = Query(None),
    end_date: date = Query(None),
    patient_id: str = Query(None),
    practitioner_id: str = Query(None),
    status: str = Query(None),
    session_type: str = Query(None),
    session_mode: str = Query(None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """List appointments with filters."""
    query = select(Appointment)
    
    # Role-based filtering
    if prac.role != "owner":
        query = query.where(Appointment.practitioner_id == prac.id)
    elif practitioner_id:
        query = query.where(Appointment.practitioner_id == practitioner_id)
    
    # Date range filter
    if start_date:
        query = query.where(Appointment.date >= start_date)
    if end_date:
        query = query.where(Appointment.date <= end_date)
    
    # Other filters
    if patient_id:
        query = query.where(Appointment.patient_id == patient_id)
    if status:
        query = query.where(Appointment.status == status)
    if session_type:
        query = query.where(Appointment.session_type == session_type)
    if session_mode:
        query = query.where(Appointment.session_mode == session_mode)
    
    query = query.order_by(Appointment.start_time.asc())
    
    appointments = (await db.execute(query)).scalars().all()
    
    result = []
    for appt in appointments:
        patient = await db.get(Patient, appt.patient_id)
        practitioner = await db.get(Practitioner, appt.practitioner_id)
        result.append(AppointmentListItem(
            id=appt.id,
            practitioner_id=appt.practitioner_id,
            practitioner_name=practitioner.name if practitioner else "Unknown",
            patient_id=appt.patient_id,
            patient_name=patient.full_name if patient else "Unknown",
            date=appt.date,
            start_time=appt.start_time,
            end_time=appt.end_time,
            duration_minutes=appt.duration_minutes,
            session_type=appt.session_type,
            session_mode=appt.session_mode,
            status=appt.status,
            meeting_link=appt.meeting_link,
        ))
    
    return result


@app.get("/api/appointments/calendar", response_model=list[CalendarEvent])
async def get_calendar_events(
    start_date: date = Query(...),
    end_date: date = Query(...),
    practitioner_id: str = Query(None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get appointments formatted for calendar display."""
    query = select(Appointment).where(
        Appointment.date >= start_date,
        Appointment.date <= end_date,
    )
    
    # Role-based filtering
    if prac.role != "owner":
        query = query.where(Appointment.practitioner_id == prac.id)
    elif practitioner_id:
        query = query.where(Appointment.practitioner_id == practitioner_id)
    
    query = query.order_by(Appointment.start_time.asc())
    
    appointments = (await db.execute(query)).scalars().all()
    
    events = []
    for appt in appointments:
        patient = await db.get(Patient, appt.patient_id)
        events.append(CalendarEvent(
            id=appt.id,
            title=patient.full_name if patient else "Unknown Patient",
            start=appt.start_time,
            end=appt.end_time,
            patient_id=appt.patient_id,
            patient_name=patient.full_name if patient else "Unknown",
            session_type=appt.session_type,
            session_mode=appt.session_mode,
            status=appt.status,
            color=_get_status_color(appt.status),
        ))
    
    return events


@app.get("/api/appointments/today", response_model=TodaySchedule)
async def get_today_schedule(
    for_date: date = Query(None, alias="date"),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get today's schedule for dashboard.

    `date` should be the caller's local calendar date (the server may run in a
    different timezone than the practitioner, so relying on the server's own
    `date.today()` can miss/misplace appointments near midnight). Falls back
    to the server's date if not provided, for backward compatibility.
    """
    today = for_date or date.today()

    query = select(Appointment).where(
        Appointment.date == today,
        Appointment.practitioner_id == prac.id,
    ).order_by(Appointment.start_time.asc())
    
    appointments = (await db.execute(query)).scalars().all()
    
    items = []
    completed = 0
    upcoming = 0
    
    now = datetime.now(timezone.utc)
    
    for appt in appointments:
        patient = await db.get(Patient, appt.patient_id)
        practitioner = await db.get(Practitioner, appt.practitioner_id)
        
        items.append(AppointmentListItem(
            id=appt.id,
            practitioner_id=appt.practitioner_id,
            practitioner_name=practitioner.name if practitioner else "Unknown",
            patient_id=appt.patient_id,
            patient_name=patient.full_name if patient else "Unknown",
            date=appt.date,
            start_time=appt.start_time,
            end_time=appt.end_time,
            duration_minutes=appt.duration_minutes,
            session_type=appt.session_type,
            session_mode=appt.session_mode,
            status=appt.status,
            meeting_link=appt.meeting_link,
        ))

        if appt.status == "completed":
            completed += 1
        elif appt.status == "scheduled" and appt.start_time > now:
            upcoming += 1
    
    return TodaySchedule(
        appointments=items,
        total_count=len(items),
        completed_count=completed,
        upcoming_count=upcoming,
    )


@app.get("/api/appointments/upcoming", response_model=UpcomingAppointments)
async def get_upcoming_appointments(
    limit: int = Query(10, le=50),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get upcoming appointments for dashboard."""
    now = datetime.now(timezone.utc)
    
    query = select(Appointment).where(
        Appointment.start_time > now,
        Appointment.status == "scheduled",
        Appointment.practitioner_id == prac.id,
    ).order_by(Appointment.start_time.asc()).limit(limit)
    
    appointments = (await db.execute(query)).scalars().all()
    
    items = []
    for appt in appointments:
        patient = await db.get(Patient, appt.patient_id)
        practitioner = await db.get(Practitioner, appt.practitioner_id)
        
        items.append(AppointmentListItem(
            id=appt.id,
            practitioner_id=appt.practitioner_id,
            practitioner_name=practitioner.name if practitioner else "Unknown",
            patient_id=appt.patient_id,
            patient_name=patient.full_name if patient else "Unknown",
            date=appt.date,
            start_time=appt.start_time,
            end_time=appt.end_time,
            duration_minutes=appt.duration_minutes,
            session_type=appt.session_type,
            session_mode=appt.session_mode,
            status=appt.status,
            meeting_link=appt.meeting_link,
        ))
    
    # Get total count
    count_query = select(func.count(Appointment.id)).where(
        Appointment.start_time > now,
        Appointment.status == "scheduled",
        Appointment.practitioner_id == prac.id,
    )
    total_count = (await db.execute(count_query)).scalar() or 0
    
    return UpcomingAppointments(
        appointments=items,
        total_count=total_count,
    )


# ─── Therapist Daily Notes (Dashboard) ─────────────────────────────────────────

@app.get("/api/therapist-notes", response_model=TherapistNoteResponse)
async def get_therapist_note(
    note_date: date = Query(None, alias="date"),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get the practitioner's note for a given day (defaults to today). Fresh blank if none."""
    target = note_date or date.today()
    result = await db.execute(
        select(TherapistDailyNote).where(
            TherapistDailyNote.practitioner_id == prac.id,
            TherapistDailyNote.note_date == target,
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        return TherapistNoteResponse(id=None, note_date=target, content="", updated_at=None)
    return TherapistNoteResponse(
        id=note.id,
        note_date=note.note_date,
        content=note.content or "",
        updated_at=note.updated_at,
    )


@app.put("/api/therapist-notes", response_model=TherapistNoteResponse)
async def upsert_therapist_note(
    data: TherapistNoteUpsert,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Create or update the practitioner's note for a calendar day."""
    result = await db.execute(
        select(TherapistDailyNote).where(
            TherapistDailyNote.practitioner_id == prac.id,
            TherapistDailyNote.note_date == data.date,
        )
    )
    note = result.scalar_one_or_none()
    if note:
        note.content = data.content or ""
        note.updated_at = datetime.now(timezone.utc)
    else:
        note = TherapistDailyNote(
            id=generate_uuid(),
            practitioner_id=prac.id,
            note_date=data.date,
            content=data.content or "",
        )
        db.add(note)
    await db.commit()
    await db.refresh(note)
    return TherapistNoteResponse(
        id=note.id,
        note_date=note.note_date,
        content=note.content or "",
        updated_at=note.updated_at,
    )


@app.get("/api/appointments/{appointment_id}", response_model=AppointmentResponse)
async def get_appointment(
    appointment_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get appointment details."""
    appt = await db.get(Appointment, appointment_id)
    if not appt:
        raise HTTPException(404, "Appointment not found")
    
    # Access control
    if prac.role != "owner" and appt.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    patient = await db.get(Patient, appt.patient_id)
    practitioner = await db.get(Practitioner, appt.practitioner_id)
    
    return AppointmentResponse(
        id=appt.id,
        practitioner_id=appt.practitioner_id,
        practitioner_name=practitioner.name if practitioner else "Unknown",
        patient_id=appt.patient_id,
        patient_name=patient.full_name if patient else "Unknown",
        date=appt.date,
        start_time=appt.start_time,
        end_time=appt.end_time,
        duration_minutes=appt.duration_minutes,
        session_type=appt.session_type,
        session_mode=appt.session_mode,
        status=appt.status,
        notes=appt.notes,
        rescheduled_from_id=appt.rescheduled_from_id,
        rescheduled_to_id=appt.rescheduled_to_id,
        cancellation_reason=appt.cancellation_reason,
        meeting_link=appt.meeting_link,
        created_at=appt.created_at,
        updated_at=appt.updated_at,
    )


async def _create_calendar_event_for_appointment(
    db: AsyncSession,
    appt,
    practitioner,
    patient,
    target_prac_id: str,
):
    """Push an appointment to Google Calendar (in-person too, so the
    therapist's day is visible there), and attach a Meet link only for
    online sessions. Skip silently if Google Calendar isn't connected —
    that's an expected, common state, not an error worth logging.

    Mutates and commits appt.meeting_link on success.
    """
    from models import CalendarIntegration

    integration = (
        await db.execute(
            select(CalendarIntegration).where(
                CalendarIntegration.practitioner_id == target_prac_id
            )
        )
    ).scalar_one_or_none()

    if not (
        integration
        and integration.google_connected
        and integration.google_credentials
        and integration.google_refresh_token
    ):
        return

    try:
        from meeting_service import meeting_service

        meeting_config = {
            "google_credentials": integration.google_credentials,
            "google_refresh_token": integration.google_refresh_token,
        }
        meeting_result = await meeting_service.create_meeting_for_booking(
            booking_id=appt.id,
            therapist_name=practitioner.name if practitioner else "Therapist",
            patient_name=patient.full_name,
            start_time=appt.start_time,
            end_time=appt.end_time,
            session_type=appt.session_type,
            attendees=[patient.email] if getattr(patient, "email", None) else None,
            config=meeting_config,
            include_conference=(appt.session_mode == "online"),
        )
        appt.meeting_link = meeting_result.link or None
        await db.commit()
        await db.refresh(appt)
    except Exception as e:
        logger.error(f"Failed to create calendar event for appointment {appt.id}: {e}")


async def _email_meeting_link_to_patient(db: AsyncSession, appt, patient, practitioner):
    """Email the patient their Google Meet link. Best-effort: a failure here
    shouldn't fail the request, since the link itself was already generated
    and saved — the practitioner can still copy/share it manually.

    Returns (success, error_message) so callers that surface this as an
    explicit "send" action (rather than a fire-and-forget side effect) can
    tell the practitioner whether the patient was actually emailed."""
    from models import PractitionerAvailability
    import pytz
    from notification_service import notification_service, format_date, format_time

    availability = (
        await db.execute(
            select(PractitionerAvailability).where(
                PractitionerAvailability.practitioner_id == appt.practitioner_id
            )
        )
    ).scalar_one_or_none()
    tz = pytz.timezone(availability.timezone if availability else "Asia/Kolkata")

    # appt.start_time is stored UTC-aware; convert to the practitioner's
    # timezone so the emailed time matches what's shown in the dashboard.
    local_start = appt.start_time.astimezone(tz)

    try:
        result = await notification_service.send_email(
            recipient_email=patient.email,
            event_type="meeting_link_generated",
            placeholders={
                "patient_name": patient.full_name,
                "therapist_name": practitioner.name if practitioner else "Your therapist",
                "appointment_date": format_date(local_start.date()),
                "appointment_time": format_time(local_start),
                "meeting_link": appt.meeting_link,
            },
        )
        if not result.success:
            logger.error(
                f"Meeting link email to {patient.email} for appointment {appt.id} "
                f"did not send: {result.error}"
            )
            return False, result.error or "Email could not be sent"
        return True, None
    except Exception as e:
        logger.error(f"Failed to email meeting link for appointment {appt.id}: {e}")
        return False, str(e)


@app.post("/api/appointments", response_model=AppointmentResponse)
async def create_appointment(
    data: AppointmentCreate,
    for_practitioner_id: str = Query(None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Create a new appointment."""
    # Determine practitioner
    target_prac_id = prac.id
    if for_practitioner_id and prac.role == "owner":
        target_prac_id = for_practitioner_id
        target_prac = await db.get(Practitioner, target_prac_id)
        if not target_prac:
            raise HTTPException(404, "Practitioner not found")
    
    # Validate patient
    patient = await db.get(Patient, data.patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    
    # Validate times
    if data.end_time <= data.start_time:
        raise HTTPException(400, "End time must be after start time")
    
    duration = int((data.end_time - data.start_time).total_seconds() / 60)
    if duration < 5:
        raise HTTPException(400, "Session duration must be at least 5 minutes")
    
    # Validate session type and mode
    if data.session_type not in SCHEMA_SESSION_TYPES:
        raise HTTPException(400, f"Invalid session type. Must be one of: {', '.join(SCHEMA_SESSION_TYPES)}")
    if data.session_mode not in SESSION_MODES:
        raise HTTPException(400, f"Invalid session mode. Must be one of: {', '.join(SESSION_MODES)}")
    
    # Check for overlapping appointments
    overlap_query = select(Appointment).where(
        Appointment.practitioner_id == target_prac_id,
        Appointment.date == data.date,
        Appointment.status.in_(["scheduled", "rescheduled"]),
        or_(
            # New appointment starts during existing
            (Appointment.start_time <= data.start_time) & (Appointment.end_time > data.start_time),
            # New appointment ends during existing
            (Appointment.start_time < data.end_time) & (Appointment.end_time >= data.end_time),
            # New appointment contains existing
            (Appointment.start_time >= data.start_time) & (Appointment.end_time <= data.end_time),
        )
    )
    
    overlapping = (await db.execute(overlap_query)).scalar_one_or_none()
    if overlapping:
        raise HTTPException(409, "This time slot overlaps with an existing appointment")
    
    from models import generate_uuid
    
    appt = Appointment(
        id=generate_uuid(),
        practitioner_id=target_prac_id,
        patient_id=data.patient_id,
        date=data.date,
        start_time=data.start_time,
        end_time=data.end_time,
        duration_minutes=duration,
        session_type=data.session_type,
        session_mode=data.session_mode,
        notes=data.notes,
    )
    
    db.add(appt)
    await db.commit()
    await db.refresh(appt)

    practitioner = await db.get(Practitioner, appt.practitioner_id)

    await _create_calendar_event_for_appointment(db, appt, practitioner, patient, target_prac_id)

    return AppointmentResponse(
        id=appt.id,
        practitioner_id=appt.practitioner_id,
        practitioner_name=practitioner.name if practitioner else "Unknown",
        patient_id=appt.patient_id,
        patient_name=patient.full_name,
        date=appt.date,
        start_time=appt.start_time,
        end_time=appt.end_time,
        duration_minutes=appt.duration_minutes,
        session_type=appt.session_type,
        session_mode=appt.session_mode,
        status=appt.status,
        notes=appt.notes,
        rescheduled_from_id=appt.rescheduled_from_id,
        rescheduled_to_id=appt.rescheduled_to_id,
        cancellation_reason=appt.cancellation_reason,
        meeting_link=appt.meeting_link,
        created_at=appt.created_at,
        updated_at=appt.updated_at,
    )


@app.patch("/api/appointments/{appointment_id}", response_model=AppointmentResponse)
async def update_appointment(
    appointment_id: str,
    data: AppointmentUpdate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Update an appointment."""
    appt = await db.get(Appointment, appointment_id)
    if not appt:
        raise HTTPException(404, "Appointment not found")
    
    # Access control
    if prac.role != "owner" and appt.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    # Validate status
    if data.status and data.status not in APPOINTMENT_STATUSES:
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(APPOINTMENT_STATUSES)}")
    
    # Validate session type
    if data.session_type and data.session_type not in SCHEMA_SESSION_TYPES:
        raise HTTPException(400, f"Invalid session type")
    
    # Validate session mode
    if data.session_mode and data.session_mode not in SESSION_MODES:
        raise HTTPException(400, f"Invalid session mode")
    
    # Update time if provided
    if data.start_time or data.end_time:
        new_start = data.start_time or appt.start_time
        new_end = data.end_time or appt.end_time
        
        if new_end <= new_start:
            raise HTTPException(400, "End time must be after start time")
        
        # Check for overlaps (excluding self)
        new_date = data.date or appt.date
        overlap_query = select(Appointment).where(
            Appointment.id != appointment_id,
            Appointment.practitioner_id == appt.practitioner_id,
            Appointment.date == new_date,
            Appointment.status.in_(["scheduled", "rescheduled"]),
            or_(
                (Appointment.start_time <= new_start) & (Appointment.end_time > new_start),
                (Appointment.start_time < new_end) & (Appointment.end_time >= new_end),
                (Appointment.start_time >= new_start) & (Appointment.end_time <= new_end),
            )
        )
        
        overlapping = (await db.execute(overlap_query)).scalar_one_or_none()
        if overlapping:
            raise HTTPException(409, "This time slot overlaps with an existing appointment")
        
        appt.start_time = new_start
        appt.end_time = new_end
        appt.duration_minutes = int((new_end - new_start).total_seconds() / 60)
    
    # Update other fields
    if data.date:
        appt.date = data.date
    if data.session_type:
        appt.session_type = data.session_type
    if data.session_mode:
        appt.session_mode = data.session_mode
    if data.status:
        appt.status = data.status
    if data.notes is not None:
        appt.notes = data.notes
    if data.cancellation_reason is not None:
        appt.cancellation_reason = data.cancellation_reason

    if data.status == "cancelled":
        await _remove_unpaid_payment_for_appointment(db, appointment_id)

    await db.commit()
    await db.refresh(appt)

    patient = await db.get(Patient, appt.patient_id)
    practitioner = await db.get(Practitioner, appt.practitioner_id)

    return AppointmentResponse(
        id=appt.id,
        practitioner_id=appt.practitioner_id,
        practitioner_name=practitioner.name if practitioner else "Unknown",
        patient_id=appt.patient_id,
        patient_name=patient.full_name if patient else "Unknown",
        date=appt.date,
        start_time=appt.start_time,
        end_time=appt.end_time,
        duration_minutes=appt.duration_minutes,
        session_type=appt.session_type,
        session_mode=appt.session_mode,
        status=appt.status,
        notes=appt.notes,
        rescheduled_from_id=appt.rescheduled_from_id,
        rescheduled_to_id=appt.rescheduled_to_id,
        cancellation_reason=appt.cancellation_reason,
        meeting_link=appt.meeting_link,
        created_at=appt.created_at,
        updated_at=appt.updated_at,
    )


@app.post("/api/appointments/{appointment_id}/reschedule", response_model=AppointmentResponse)
async def reschedule_appointment(
    appointment_id: str,
    data: AppointmentReschedule,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Reschedule an appointment (creates new appointment, marks old as rescheduled)."""
    old_appt = await db.get(Appointment, appointment_id)
    if not old_appt:
        raise HTTPException(404, "Appointment not found")
    
    # Access control
    if prac.role != "owner" and old_appt.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    if old_appt.status not in ["scheduled"]:
        raise HTTPException(400, "Only scheduled appointments can be rescheduled")
    
    # Validate times
    if data.new_end_time <= data.new_start_time:
        raise HTTPException(400, "End time must be after start time")
    
    duration = int((data.new_end_time - data.new_start_time).total_seconds() / 60)
    
    # Check for overlaps
    overlap_query = select(Appointment).where(
        Appointment.id != appointment_id,
        Appointment.practitioner_id == old_appt.practitioner_id,
        Appointment.date == data.new_date,
        Appointment.status.in_(["scheduled", "rescheduled"]),
        or_(
            (Appointment.start_time <= data.new_start_time) & (Appointment.end_time > data.new_start_time),
            (Appointment.start_time < data.new_end_time) & (Appointment.end_time >= data.new_end_time),
            (Appointment.start_time >= data.new_start_time) & (Appointment.end_time <= data.new_end_time),
        )
    )
    
    overlapping = (await db.execute(overlap_query)).scalar_one_or_none()
    if overlapping:
        raise HTTPException(409, "This time slot overlaps with an existing appointment")
    
    from models import generate_uuid
    
    # Create new appointment
    new_appt = Appointment(
        id=generate_uuid(),
        practitioner_id=old_appt.practitioner_id,
        patient_id=old_appt.patient_id,
        date=data.new_date,
        start_time=data.new_start_time,
        end_time=data.new_end_time,
        duration_minutes=duration,
        session_type=old_appt.session_type,
        session_mode=old_appt.session_mode,
        notes=data.notes or old_appt.notes,
        rescheduled_from_id=old_appt.id,
    )
    
    db.add(new_appt)
    
    # Update old appointment
    old_appt.status = "rescheduled"
    old_appt.rescheduled_to_id = new_appt.id
    
    await db.commit()
    await db.refresh(new_appt)

    patient = await db.get(Patient, new_appt.patient_id)
    practitioner = await db.get(Practitioner, new_appt.practitioner_id)

    await _create_calendar_event_for_appointment(db, new_appt, practitioner, patient, new_appt.practitioner_id)

    return AppointmentResponse(
        id=new_appt.id,
        practitioner_id=new_appt.practitioner_id,
        practitioner_name=practitioner.name if practitioner else "Unknown",
        patient_id=new_appt.patient_id,
        patient_name=patient.full_name if patient else "Unknown",
        date=new_appt.date,
        start_time=new_appt.start_time,
        end_time=new_appt.end_time,
        duration_minutes=new_appt.duration_minutes,
        session_type=new_appt.session_type,
        session_mode=new_appt.session_mode,
        status=new_appt.status,
        notes=new_appt.notes,
        rescheduled_from_id=new_appt.rescheduled_from_id,
        rescheduled_to_id=new_appt.rescheduled_to_id,
        cancellation_reason=new_appt.cancellation_reason,
        meeting_link=new_appt.meeting_link,
        created_at=new_appt.created_at,
        updated_at=new_appt.updated_at,
    )


async def _remove_unpaid_payment_for_appointment(db: AsyncSession, appointment_id: str):
    """When an appointment is cancelled or deleted, its payment stub is only
    worth keeping if money actually changed hands. A pending/failed/expired/
    cancelled payment for a session that's not happening is noise, not a
    financial record — remove it so it stops showing up in the Payments list
    (and, for deletion, so it doesn't dangle as an FK reference). Paid/
    refunded payments are left alone since those represent a real
    transaction; this is deliberately an exclusion list so any future
    addition to PAYMENT_STATUSES defaults to being cleaned up rather than
    silently left behind.
    """
    payment_result = await db.execute(
        select(Payment).where(Payment.appointment_id == appointment_id)
    )
    payment = payment_result.scalar_one_or_none()
    if not payment or payment.status in ("paid", "refunded"):
        return

    await db.execute(delete(Receipt).where(Receipt.payment_id == payment.id))
    await db.delete(payment)


@app.post("/api/appointments/{appointment_id}/cancel")
async def cancel_appointment(
    appointment_id: str,
    reason: str = Query(None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an appointment."""
    appt = await db.get(Appointment, appointment_id)
    if not appt:
        raise HTTPException(404, "Appointment not found")
    
    # Access control
    if prac.role != "owner" and appt.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    if appt.status not in ["scheduled"]:
        raise HTTPException(400, "Only scheduled appointments can be cancelled")
    
    appt.status = "cancelled"
    appt.cancellation_reason = reason

    await _remove_unpaid_payment_for_appointment(db, appointment_id)

    await db.commit()

    return {"message": "Appointment cancelled successfully"}


@app.post("/api/appointments/{appointment_id}/meeting-link", response_model=AppointmentResponse)
async def generate_appointment_meeting_link(
    appointment_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Attach (or re-attach) a Google Meet link to an existing online
    appointment. Lets appointments created before Google Calendar was
    connected — or before this feature existed — pick up a join link
    without needing to be recreated."""
    appt = await db.get(Appointment, appointment_id)
    if not appt:
        raise HTTPException(404, "Appointment not found")

    if prac.role != "owner" and appt.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")

    if appt.session_mode != "online":
        raise HTTPException(400, "Meeting links are only available for online sessions")

    if appt.status != "scheduled":
        raise HTTPException(400, "Meeting links can only be created for scheduled appointments")

    patient = await db.get(Patient, appt.patient_id)
    practitioner = await db.get(Practitioner, appt.practitioner_id)

    # Only hit Google when there's no link yet — calling create_meeting_for_booking
    # again would create a second calendar event and a second invite for the
    # same appointment. If a link already exists (e.g. "Join Now" is already
    # showing), this call is just re-sending the existing link by email below.
    if not appt.meeting_link:
        await _create_calendar_event_for_appointment(db, appt, practitioner, patient, appt.practitioner_id)

    if not appt.meeting_link:
        raise HTTPException(
            409,
            "Couldn't create a meeting link. Connect Google Calendar in "
            "Settings > Integrations, then try again.",
        )

    email_sent = None
    email_error = None
    if patient and patient.email:
        email_sent, email_error = await _email_meeting_link_to_patient(db, appt, patient, practitioner)
    else:
        email_sent = False
        email_error = "Patient has no email on file"

    return AppointmentResponse(
        id=appt.id,
        practitioner_id=appt.practitioner_id,
        practitioner_name=practitioner.name if practitioner else "Unknown",
        patient_id=appt.patient_id,
        patient_name=patient.full_name if patient else "Unknown",
        date=appt.date,
        start_time=appt.start_time,
        end_time=appt.end_time,
        duration_minutes=appt.duration_minutes,
        session_type=appt.session_type,
        session_mode=appt.session_mode,
        status=appt.status,
        notes=appt.notes,
        rescheduled_from_id=appt.rescheduled_from_id,
        rescheduled_to_id=appt.rescheduled_to_id,
        cancellation_reason=appt.cancellation_reason,
        meeting_link=appt.meeting_link,
        created_at=appt.created_at,
        updated_at=appt.updated_at,
        email_sent=email_sent,
        email_error=email_error,
    )


@app.delete("/api/appointments/{appointment_id}")
async def delete_appointment(
    appointment_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Delete an appointment."""
    appt = await db.get(Appointment, appointment_id)
    if not appt:
        raise HTTPException(404, "Appointment not found")

    # Access control
    if prac.role != "owner" and appt.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")

    # A paid/refunded payment is a real financial/audit record and must not be
    # silently destroyed by deleting the appointment it's attached to — block
    # instead and tell the user how to proceed. Any other status (pending,
    # failed, expired, cancelled) never represented real money, so it's
    # cleaned up automatically (same rule as cancelling an appointment)
    # rather than blocking deletion or being left dangling as an FK
    # reference to an appointment that's about to be deleted.
    payment_result = await db.execute(
        select(Payment).where(Payment.appointment_id == appointment_id)
    )
    payment = payment_result.scalar_one_or_none()
    if payment and payment.status in ("paid", "refunded"):
        raise HTTPException(
            409,
            "This appointment has a payment record and can't be deleted. "
            "Cancel it instead, or remove the payment first.",
        )
    if payment:
        await _remove_unpaid_payment_for_appointment(db, appointment_id)

    # Reminders are disposable scheduling artifacts — safe to clean up.
    await db.execute(delete(ScheduledReminder).where(ScheduledReminder.appointment_id == appointment_id))

    # A booking request that led to this appointment should be kept (it holds
    # the original booking info), just detached from the appointment being removed.
    booking_result = await db.execute(
        select(BookingRequest).where(BookingRequest.appointment_id == appointment_id)
    )
    booking_request = booking_result.scalar_one_or_none()
    if booking_request:
        booking_request.appointment_id = None

    # Other appointments may point at this one through the reschedule chain
    # (rescheduled_from_id / rescheduled_to_id are self-referential FKs) —
    # detach them so deleting this row doesn't violate that constraint.
    linked_result = await db.execute(
        select(Appointment).where(
            or_(
                Appointment.rescheduled_from_id == appointment_id,
                Appointment.rescheduled_to_id == appointment_id,
            )
        )
    )
    for linked in linked_result.scalars().all():
        if linked.rescheduled_from_id == appointment_id:
            linked.rescheduled_from_id = None
        if linked.rescheduled_to_id == appointment_id:
            linked.rescheduled_to_id = None

    await db.delete(appt)
    await db.commit()

    return {"message": "Appointment deleted successfully"}


# ─── Patient Appointments ──────────────────────────────────────────────────────

@app.get("/api/patients/{patient_id}/appointments", response_model=list[AppointmentListItem])
async def get_patient_appointments(
    patient_id: str,
    status: str = Query(None),
    upcoming_only: bool = Query(False),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get appointments for a specific patient."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    
    # Access control
    if prac.role != "owner" and patient.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    query = select(Appointment).where(Appointment.patient_id == patient_id)
    
    if status:
        query = query.where(Appointment.status == status)
    
    if upcoming_only:
        now = datetime.now(timezone.utc)
        query = query.where(
            Appointment.start_time > now,
            Appointment.status == "scheduled",
        )
    
    query = query.order_by(Appointment.start_time.desc())
    
    appointments = (await db.execute(query)).scalars().all()
    
    result = []
    for appt in appointments:
        practitioner = await db.get(Practitioner, appt.practitioner_id)
        result.append(AppointmentListItem(
            id=appt.id,
            practitioner_id=appt.practitioner_id,
            practitioner_name=practitioner.name if practitioner else "Unknown",
            patient_id=appt.patient_id,
            patient_name=patient.full_name,
            date=appt.date,
            start_time=appt.start_time,
            end_time=appt.end_time,
            duration_minutes=appt.duration_minutes,
            session_type=appt.session_type,
            session_mode=appt.session_mode,
            status=appt.status,
            meeting_link=appt.meeting_link,
        ))
    
    return result


# ─── Availability Management ────────────────────────────────────────────────────

@app.get("/api/availability", response_model=AvailabilityResponse)
async def get_availability(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get practitioner's availability settings."""
    avail = (await db.execute(
        select(PractitionerAvailability).where(PractitionerAvailability.practitioner_id == prac.id)
    )).scalar_one_or_none()
    
    if not avail:
        # Return defaults
        from models import generate_uuid
        avail = PractitionerAvailability(
            id=generate_uuid(),
            practitioner_id=prac.id,
        )
        db.add(avail)
        await db.commit()
        await db.refresh(avail)
    
    return AvailabilityResponse(
        id=avail.id,
        practitioner_id=avail.practitioner_id,
        working_days=avail.working_days or [0, 1, 2, 3, 4],
        work_start_time=avail.work_start_time,
        work_end_time=avail.work_end_time,
        break_start_time=avail.break_start_time,
        break_end_time=avail.break_end_time,
        default_session_duration=avail.default_session_duration,
        buffer_minutes=avail.buffer_minutes,
        timezone=avail.timezone,
        created_at=avail.created_at,
        updated_at=avail.updated_at,
    )


@app.put("/api/availability", response_model=AvailabilityResponse)
async def update_availability(
    data: AvailabilityUpdate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Update practitioner's availability settings."""
    avail = (await db.execute(
        select(PractitionerAvailability).where(PractitionerAvailability.practitioner_id == prac.id)
    )).scalar_one_or_none()
    
    if not avail:
        from models import generate_uuid
        avail = PractitionerAvailability(
            id=generate_uuid(),
            practitioner_id=prac.id,
        )
        db.add(avail)
    
    # Update fields
    if data.working_days is not None:
        avail.working_days = data.working_days
    if data.work_start_time is not None:
        avail.work_start_time = data.work_start_time
    if data.work_end_time is not None:
        avail.work_end_time = data.work_end_time
    if data.break_start_time is not None:
        avail.break_start_time = data.break_start_time
    if data.break_end_time is not None:
        avail.break_end_time = data.break_end_time
    if data.default_session_duration is not None:
        avail.default_session_duration = data.default_session_duration
    if data.buffer_minutes is not None:
        avail.buffer_minutes = data.buffer_minutes
    if data.timezone is not None:
        avail.timezone = data.timezone
    
    await db.commit()
    await db.refresh(avail)
    
    return AvailabilityResponse(
        id=avail.id,
        practitioner_id=avail.practitioner_id,
        working_days=avail.working_days or [0, 1, 2, 3, 4],
        work_start_time=avail.work_start_time,
        work_end_time=avail.work_end_time,
        break_start_time=avail.break_start_time,
        break_end_time=avail.break_end_time,
        default_session_duration=avail.default_session_duration,
        buffer_minutes=avail.buffer_minutes,
        timezone=avail.timezone,
        created_at=avail.created_at,
        updated_at=avail.updated_at,
    )


# ─── Unavailable Dates ──────────────────────────────────────────────────────────

@app.get("/api/unavailable-dates", response_model=list[UnavailableDateResponse])
async def list_unavailable_dates(
    start_date: date = Query(None),
    end_date: date = Query(None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """List practitioner's unavailable dates."""
    query = select(UnavailableDate).where(UnavailableDate.practitioner_id == prac.id)
    
    if start_date:
        query = query.where(UnavailableDate.date >= start_date)
    if end_date:
        query = query.where(UnavailableDate.date <= end_date)
    
    query = query.order_by(UnavailableDate.date.asc())
    
    dates = (await db.execute(query)).scalars().all()
    
    return [
        UnavailableDateResponse(
            id=d.id,
            practitioner_id=d.practitioner_id,
            date=d.date,
            reason=d.reason,
            is_full_day=d.is_full_day,
            unavailable_start=d.unavailable_start,
            unavailable_end=d.unavailable_end,
            created_at=d.created_at,
        )
        for d in dates
    ]


@app.post("/api/unavailable-dates", response_model=UnavailableDateResponse)
async def add_unavailable_date(
    data: UnavailableDateCreate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Add an unavailable date."""
    from models import generate_uuid
    
    # Check if date already exists
    existing = (await db.execute(
        select(UnavailableDate).where(
            UnavailableDate.practitioner_id == prac.id,
            UnavailableDate.date == data.date,
        )
    )).scalar_one_or_none()
    
    if existing:
        raise HTTPException(409, "This date is already marked as unavailable")
    
    unavail = UnavailableDate(
        id=generate_uuid(),
        practitioner_id=prac.id,
        date=data.date,
        reason=data.reason,
        is_full_day=data.is_full_day,
        unavailable_start=data.unavailable_start,
        unavailable_end=data.unavailable_end,
    )
    
    db.add(unavail)
    await db.commit()
    await db.refresh(unavail)
    
    return UnavailableDateResponse(
        id=unavail.id,
        practitioner_id=unavail.practitioner_id,
        date=unavail.date,
        reason=unavail.reason,
        is_full_day=unavail.is_full_day,
        unavailable_start=unavail.unavailable_start,
        unavailable_end=unavail.unavailable_end,
        created_at=unavail.created_at,
    )


@app.delete("/api/unavailable-dates/{date_id}")
async def remove_unavailable_date(
    date_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Remove an unavailable date."""
    unavail = await db.get(UnavailableDate, date_id)
    if not unavail:
        raise HTTPException(404, "Unavailable date not found")
    
    if unavail.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    await db.delete(unavail)
    await db.commit()
    
    return {"message": "Unavailable date removed successfully"}


# ═════════════════════════════════════════════════════════════════════════════════
#  PAYMENTS
# ═════════════════════════════════════════════════════════════════════════════════

from models import generate_receipt_number


def _calculate_tax(amount: int, tax_percentage: int | None) -> int:
    """Calculate tax amount from percentage (percentage * 100)"""
    if not tax_percentage:
        return 0
    return int(amount * tax_percentage / 10000)


def _get_payment_link_url(token: str) -> str:
    """Generate payment link URL"""
    base_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    return f"{base_url}/pay/{token}"


async def _create_payment_notification(
    db: AsyncSession,
    practitioner_id: str,
    notification_type: str,
    title: str,
    message: str,
    reference_type: str = None,
    reference_id: str = None,
    extra_data: dict = None,
):
    """Create an internal notification"""
    from models import generate_uuid
    notification = InternalNotification(
        id=generate_uuid(),
        practitioner_id=practitioner_id,
        notification_type=notification_type,
        title=title,
        message=message,
        reference_type=reference_type,
        reference_id=reference_id,
        extra_data=extra_data,
    )
    db.add(notification)
    return notification


# ─── Payment Dashboard ─────────────────────────────────────────────────────────

@app.get("/api/payments/dashboard", response_model=PaymentDashboard)
async def get_payment_dashboard(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get payment dashboard statistics."""
    # Build base query with access control
    if prac.role == "owner":
        base_query = select(Payment)
    else:
        base_query = select(Payment).where(Payment.practitioner_id == prac.id)

    # Same rule as list_payments: a pending/failed/expired payment tied to a
    # cancelled appointment isn't real outstanding revenue, it's a leftover
    # stub — exclude it so it doesn't inflate pending/outstanding totals.
    base_query = base_query.join(Appointment).where(
        or_(
            Appointment.status != "cancelled",
            Payment.status.notin_(["pending", "failed", "expired"]),
        )
    )

    # Get all payments
    payments = (await db.execute(base_query)).scalars().all()
    
    # Calculate statistics
    pending_payments = [p for p in payments if p.status == "pending"]
    paid_payments = [p for p in payments if p.status == "paid"]
    failed_payments = [p for p in payments if p.status == "failed"]
    refunded_payments = [p for p in payments if p.status == "refunded"]
    cancelled_payments = [p for p in payments if p.status == "cancelled"]
    
    # Calculate monthly revenue (current month)
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_paid = [p for p in paid_payments if p.paid_at and p.paid_at >= month_start]
    monthly_revenue = sum(p.final_amount for p in monthly_paid)
    
    # Calculate today's revenue
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_paid = [p for p in paid_payments if p.paid_at and p.paid_at >= today_start]
    today_revenue = sum(p.final_amount for p in today_paid)
    
    return PaymentDashboard(
        pending_count=len(pending_payments),
        pending_amount=sum(p.final_amount for p in pending_payments),
        paid_count=len(paid_payments),
        paid_amount=sum(p.final_amount for p in paid_payments),
        failed_count=len(failed_payments),
        refunded_count=len(refunded_payments),
        refunded_amount=sum(p.refund_amount or 0 for p in refunded_payments),
        cancelled_count=len(cancelled_payments),
        monthly_revenue=monthly_revenue,
        today_revenue=today_revenue,
        outstanding_amount=sum(p.final_amount for p in pending_payments),
        currency="INR",
    )


@app.get("/api/payments/recent", response_model=list[RecentTransaction])
async def get_recent_transactions(
    limit: int = Query(10, ge=1, le=50),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get recent transactions for dashboard."""
    if prac.role == "owner":
        query = select(Payment)
    else:
        query = select(Payment).where(Payment.practitioner_id == prac.id)

    # Same rule as list_payments/dashboard: don't surface unpaid stubs left
    # behind by cancelled appointments.
    query = query.join(Appointment).where(
        or_(
            Appointment.status != "cancelled",
            Payment.status.notin_(["pending", "failed", "expired"]),
        )
    )

    query = query.order_by(Payment.updated_at.desc()).limit(limit)
    payments = (await db.execute(query)).scalars().all()
    
    result = []
    for p in payments:
        patient = await db.get(Patient, p.patient_id)
        appt = await db.get(Appointment, p.appointment_id)
        result.append(RecentTransaction(
            id=p.id,
            patient_name=patient.full_name if patient else "Unknown",
            amount=p.final_amount,
            currency=p.currency,
            status=p.status,
            payment_method=p.payment_method,
            date=p.paid_at or p.updated_at,
            appointment_date=appt.date if appt else date.today(),
        ))
    
    return result


# ─── Payment CRUD ──────────────────────────────────────────────────────────────

@app.get("/api/payments", response_model=list[PaymentListItem])
async def list_payments(
    status: str = Query(None),
    practitioner_id: str = Query(None),
    patient_id: str = Query(None),
    start_date: date = Query(None),
    end_date: date = Query(None),
    payment_method: str = Query(None),
    search: str = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """List payments with filters."""
    query = select(Payment).join(Appointment)

    # Access control
    if prac.role != "owner":
        query = query.where(Payment.practitioner_id == prac.id)
    elif practitioner_id:
        query = query.where(Payment.practitioner_id == practitioner_id)

    # A payment left behind by a cancelled appointment is noise, not a
    # financial record, unless money actually changed hands (paid/refunded).
    # This also covers rows that were cancelled before the cleanup-on-cancel
    # logic existed, since those are never retroactively deleted.
    query = query.where(
        or_(
            Appointment.status != "cancelled",
            Payment.status.notin_(["pending", "failed", "expired"]),
        )
    )

    # Filters
    if status:
        query = query.where(Payment.status == status)
    if patient_id:
        query = query.where(Payment.patient_id == patient_id)
    if start_date:
        query = query.where(Appointment.date >= start_date)
    if end_date:
        query = query.where(Appointment.date <= end_date)
    if payment_method:
        query = query.where(Payment.payment_method == payment_method)
    if search:
        # Search by patient name or receipt number
        query = query.join(Patient).outerjoin(Receipt)
        query = query.where(
            or_(
                Patient.full_name.ilike(f"%{search}%"),
                Receipt.receipt_number.ilike(f"%{search}%"),
            )
        )
    
    # Pagination and ordering
    query = query.order_by(Appointment.date.desc(), Payment.created_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)
    
    payments = (await db.execute(query)).scalars().all()
    
    result = []
    for p in payments:
        practitioner = await db.get(Practitioner, p.practitioner_id)
        patient = await db.get(Patient, p.patient_id)
        appt = await db.get(Appointment, p.appointment_id)
        receipt = (await db.execute(
            select(Receipt).where(Receipt.payment_id == p.id)
        )).scalar_one_or_none()
        
        result.append(PaymentListItem(
            id=p.id,
            appointment_id=p.appointment_id,
            practitioner_id=p.practitioner_id,
            practitioner_name=practitioner.name if practitioner else "Unknown",
            patient_id=p.patient_id,
            patient_name=patient.full_name if patient else "Unknown",
            final_amount=p.final_amount,
            currency=p.currency,
            status=p.status,
            payment_method=p.payment_method,
            appointment_date=appt.date if appt else date.today(),
            session_type=appt.session_type if appt else "therapy_session",
            paid_at=p.paid_at,
            refund_status=p.refund_status,
            receipt_number=receipt.receipt_number if receipt else None,
            created_at=p.created_at,
        ))
    
    return result


@app.get("/api/payments/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get payment details."""
    payment = await db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(404, "Payment not found")
    
    # Access control
    if prac.role != "owner" and payment.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    practitioner = await db.get(Practitioner, payment.practitioner_id)
    patient = await db.get(Patient, payment.patient_id)
    appt = await db.get(Appointment, payment.appointment_id)
    receipt = (await db.execute(
        select(Receipt).where(Receipt.payment_id == payment.id)
    )).scalar_one_or_none()
    
    return PaymentResponse(
        id=payment.id,
        appointment_id=payment.appointment_id,
        practitioner_id=payment.practitioner_id,
        practitioner_name=practitioner.name if practitioner else "Unknown",
        patient_id=payment.patient_id,
        patient_name=patient.full_name if patient else "Unknown",
        session_fee=payment.session_fee,
        discount_amount=payment.discount_amount,
        discount_reason=payment.discount_reason,
        tax_amount=payment.tax_amount,
        tax_percentage=payment.tax_percentage,
        final_amount=payment.final_amount,
        currency=payment.currency,
        status=payment.status,
        payment_link_token=payment.payment_link_token,
        payment_link_url=_get_payment_link_url(payment.payment_link_token) if payment.payment_link_token else None,
        payment_link_expires_at=payment.payment_link_expires_at,
        payment_method=payment.payment_method,
        paid_at=payment.paid_at,
        failed_at=payment.failed_at,
        failure_reason=payment.failure_reason,
        refund_status=payment.refund_status,
        refund_amount=payment.refund_amount,
        refund_reason=payment.refund_reason,
        refund_initiated_at=payment.refund_initiated_at,
        refund_completed_at=payment.refund_completed_at,
        notes=payment.notes,
        appointment_date=appt.date if appt else None,
        appointment_start_time=appt.start_time if appt else None,
        session_type=appt.session_type if appt else None,
        receipt_number=receipt.receipt_number if receipt else None,
        created_at=payment.created_at,
        updated_at=payment.updated_at,
    )


@app.patch("/api/payments/{payment_id}", response_model=PaymentResponse)
async def update_payment(
    payment_id: str,
    data: PaymentUpdate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Update payment details."""
    payment = await db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(404, "Payment not found")
    
    # Access control
    if prac.role != "owner" and payment.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    # Can only update pending payments
    if payment.status not in ["pending"] and data.session_fee is not None:
        raise HTTPException(400, "Cannot modify amount for non-pending payments")
    
    # Update fields
    if data.session_fee is not None:
        payment.session_fee = data.session_fee
    if data.discount_amount is not None:
        payment.discount_amount = data.discount_amount
    if data.discount_reason is not None:
        payment.discount_reason = data.discount_reason
    if data.tax_percentage is not None:
        payment.tax_percentage = data.tax_percentage
    if data.notes is not None:
        payment.notes = data.notes
    if data.payment_method is not None:
        payment.payment_method = data.payment_method
    
    # Recalculate final amount
    taxable_amount = payment.session_fee - payment.discount_amount
    payment.tax_amount = _calculate_tax(taxable_amount, payment.tax_percentage)
    payment.final_amount = taxable_amount + payment.tax_amount
    
    await db.commit()
    await db.refresh(payment)
    
    # Re-fetch for response
    return await get_payment(payment_id, prac, db)


@app.post("/api/payments/{payment_id}/mark-paid", response_model=PaymentResponse)
async def mark_payment_paid(
    payment_id: str,
    data: PaymentStatusUpdate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Manually mark payment as paid (for cash/offline payments)."""
    payment = await db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(404, "Payment not found")
    
    # Access control
    if prac.role != "owner" and payment.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    if payment.status != "pending":
        raise HTTPException(400, "Only pending payments can be marked as paid")
    
    payment.status = "paid"
    payment.payment_method = data.payment_method or "cash"
    payment.paid_at = datetime.now(timezone.utc)
    if data.notes:
        payment.notes = data.notes
    
    await db.commit()
    
    # Generate receipt
    await _generate_receipt(db, payment)
    
    # Create notification
    patient = await db.get(Patient, payment.patient_id)
    await _create_payment_notification(
        db,
        payment.practitioner_id,
        "payment_received",
        "Payment Received",
        f"Payment of ₹{payment.final_amount / 100:.2f} received from {patient.full_name if patient else 'patient'}",
        reference_type="payment",
        reference_id=payment.id,
        extra_data={"amount": payment.final_amount, "patient_name": patient.full_name if patient else None},
    )
    await db.commit()
    
    return await get_payment(payment_id, prac, db)


@app.post("/api/payments/{payment_id}/regenerate-link")
async def regenerate_payment_link(
    payment_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Regenerate payment link for a pending payment."""
    payment = await db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(404, "Payment not found")
    
    # Access control
    if prac.role != "owner" and payment.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    if payment.status != "pending":
        raise HTTPException(400, "Can only regenerate link for pending payments")
    
    # Generate new token and expiry
    from datetime import timedelta
    payment.payment_link_token = generate_payment_link_token()
    payment.payment_link_expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    await db.commit()
    
    return {
        "payment_link_url": _get_payment_link_url(payment.payment_link_token),
        "expires_at": payment.payment_link_expires_at.isoformat(),
    }


@app.post("/api/payments/{payment_id}/send-reminder")
async def send_payment_reminder(
    payment_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Send payment reminder (creates internal notification for future email integration)."""
    payment = await db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(404, "Payment not found")
    
    # Access control
    if prac.role != "owner" and payment.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    if payment.status != "pending":
        raise HTTPException(400, "Can only send reminders for pending payments")
    
    patient = await db.get(Patient, payment.patient_id)
    appt = await db.get(Appointment, payment.appointment_id)
    
    # Create notification (placeholder for future email)
    await _create_payment_notification(
        db,
        payment.practitioner_id,
        "appointment_awaiting_payment",
        "Payment Reminder Sent",
        f"Payment reminder sent to {patient.full_name if patient else 'patient'} for appointment on {appt.date if appt else 'scheduled date'}",
        reference_type="payment",
        reference_id=payment.id,
        extra_data={
            "patient_id": payment.patient_id,
            "patient_name": patient.full_name if patient else None,
            "patient_email": patient.email if patient else None,
            "amount": payment.final_amount,
            "payment_link": _get_payment_link_url(payment.payment_link_token) if payment.payment_link_token else None,
        },
    )
    await db.commit()
    
    return {"message": "Payment reminder triggered successfully"}


# ─── Refunds ────────────────────────────────────────────────────────────────────

@app.post("/api/payments/{payment_id}/refund/initiate", response_model=PaymentResponse)
async def initiate_refund(
    payment_id: str,
    data: RefundRequest,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Initiate refund for a paid payment."""
    payment = await db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(404, "Payment not found")
    
    # Access control
    if prac.role != "owner" and payment.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    if payment.status != "paid":
        raise HTTPException(400, "Can only refund paid payments")
    
    if payment.refund_status != "not_applicable":
        raise HTTPException(400, "Refund already initiated for this payment")
    
    refund_amount = data.refund_amount if data.refund_amount else payment.final_amount
    if refund_amount > payment.final_amount:
        raise HTTPException(400, "Refund amount cannot exceed payment amount")
    
    payment.refund_status = "initiated"
    payment.refund_amount = refund_amount
    payment.refund_reason = data.reason
    payment.refund_initiated_at = datetime.now(timezone.utc)
    payment.refund_initiated_by = prac.id
    
    await db.commit()
    
    return await get_payment(payment_id, prac, db)


@app.post("/api/payments/{payment_id}/refund/complete", response_model=PaymentResponse)
async def complete_refund(
    payment_id: str,
    data: RefundComplete = None,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Mark refund as completed."""
    payment = await db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(404, "Payment not found")
    
    # Access control
    if prac.role != "owner" and payment.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    if payment.refund_status != "initiated":
        raise HTTPException(400, "Refund must be initiated before completing")
    
    payment.refund_status = "completed"
    payment.status = "refunded"
    payment.refund_completed_at = datetime.now(timezone.utc)
    if data and data.notes:
        payment.notes = f"{payment.notes or ''}\nRefund notes: {data.notes}".strip()
    
    await db.commit()
    
    # Create notification
    patient = await db.get(Patient, payment.patient_id)
    await _create_payment_notification(
        db,
        payment.practitioner_id,
        "refund_completed",
        "Refund Completed",
        f"Refund of ₹{payment.refund_amount / 100:.2f} completed for {patient.full_name if patient else 'patient'}",
        reference_type="payment",
        reference_id=payment.id,
        extra_data={"refund_amount": payment.refund_amount, "patient_name": patient.full_name if patient else None},
    )
    await db.commit()
    
    return await get_payment(payment_id, prac, db)


# ─── Receipts ───────────────────────────────────────────────────────────────────

async def _generate_receipt(db: AsyncSession, payment: Payment) -> Receipt:
    """Generate receipt for a paid payment."""
    from models import generate_uuid
    
    # Check if receipt already exists
    existing = (await db.execute(
        select(Receipt).where(Receipt.payment_id == payment.id)
    )).scalar_one_or_none()
    if existing:
        return existing
    
    patient = await db.get(Patient, payment.patient_id)
    practitioner = await db.get(Practitioner, payment.practitioner_id)
    appt = await db.get(Appointment, payment.appointment_id)
    
    receipt = Receipt(
        id=generate_uuid(),
        payment_id=payment.id,
        patient_name=patient.full_name if patient else "Unknown",
        patient_email=patient.email if patient else None,
        practitioner_name=practitioner.name if practitioner else "Unknown",
        session_fee=payment.session_fee,
        discount_amount=payment.discount_amount,
        tax_amount=payment.tax_amount,
        final_amount=payment.final_amount,
        currency=payment.currency,
        appointment_date=appt.date if appt else date.today(),
        session_type=appt.session_type if appt else "therapy_session",
        payment_method=payment.payment_method,
        payment_date=payment.paid_at or datetime.now(timezone.utc),
    )
    
    db.add(receipt)
    await db.commit()
    await db.refresh(receipt)
    
    return receipt


@app.get("/api/payments/{payment_id}/receipt", response_model=ReceiptResponse)
async def get_receipt(
    payment_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get receipt for a payment."""
    payment = await db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(404, "Payment not found")
    
    # Access control
    if prac.role != "owner" and payment.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    if payment.status != "paid" and payment.status != "refunded":
        raise HTTPException(400, "Receipt only available for paid payments")
    
    receipt = (await db.execute(
        select(Receipt).where(Receipt.payment_id == payment.id)
    )).scalar_one_or_none()
    
    if not receipt:
        # Generate receipt if not exists
        receipt = await _generate_receipt(db, payment)
    
    return ReceiptResponse(
        id=receipt.id,
        payment_id=receipt.payment_id,
        receipt_number=receipt.receipt_number,
        patient_name=receipt.patient_name,
        patient_email=receipt.patient_email,
        practitioner_name=receipt.practitioner_name,
        session_fee=receipt.session_fee,
        discount_amount=receipt.discount_amount,
        tax_amount=receipt.tax_amount,
        final_amount=receipt.final_amount,
        currency=receipt.currency,
        appointment_date=receipt.appointment_date,
        session_type=receipt.session_type,
        payment_method=receipt.payment_method,
        payment_date=receipt.payment_date,
        generated_at=receipt.generated_at,
    )


# ─── Patient Payment History ───────────────────────────────────────────────────

@app.get("/api/patients/{patient_id}/payments", response_model=list[PaymentHistoryItem])
async def get_patient_payment_history(
    patient_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get payment history for a patient."""
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    
    # Access control
    if prac.role != "owner" and patient.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    query = (
        select(Payment)
        .where(Payment.patient_id == patient_id)
        .join(Appointment)
        .order_by(Appointment.date.desc())
    )
    payments = (await db.execute(query)).scalars().all()
    
    result = []
    for p in payments:
        appt = await db.get(Appointment, p.appointment_id)
        receipt = (await db.execute(
            select(Receipt).where(Receipt.payment_id == p.id)
        )).scalar_one_or_none()
        
        result.append(PaymentHistoryItem(
            id=p.id,
            appointment_id=p.appointment_id,
            appointment_date=appt.date if appt else date.today(),
            session_type=appt.session_type if appt else "therapy_session",
            amount=p.final_amount,
            currency=p.currency,
            status=p.status,
            payment_method=p.payment_method,
            paid_at=p.paid_at,
            receipt_number=receipt.receipt_number if receipt else None,
        ))
    
    return result


# ─── Appointment with Payment ──────────────────────────────────────────────────

@app.post("/api/appointments/with-payment", response_model=AppointmentResponseWithPayment)
async def create_appointment_with_payment(
    data: AppointmentWithPaymentCreate,
    for_practitioner_id: str = Query(None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Create appointment with associated payment record."""
    from models import generate_uuid
    from datetime import timedelta
    
    # Determine practitioner
    target_practitioner_id = prac.id
    if for_practitioner_id and prac.role == "owner":
        target_practitioner_id = for_practitioner_id
        target_prac = await db.get(Practitioner, for_practitioner_id)
        if not target_prac:
            raise HTTPException(404, "Practitioner not found")
    
    # Verify patient exists and belongs to practitioner
    patient = await db.get(Patient, data.patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    if prac.role != "owner" and patient.practitioner_id != prac.id:
        raise HTTPException(403, "Patient does not belong to this practitioner")
    
    # Check for overlapping appointments
    existing = (await db.execute(
        select(Appointment).where(
            Appointment.practitioner_id == target_practitioner_id,
            Appointment.date == data.date,
            Appointment.status == "scheduled",
            or_(
                (Appointment.start_time <= data.start_time) & (Appointment.end_time > data.start_time),
                (Appointment.start_time < data.end_time) & (Appointment.end_time >= data.end_time),
                (Appointment.start_time >= data.start_time) & (Appointment.end_time <= data.end_time),
            ),
        )
    )).scalars().all()
    
    if existing:
        raise HTTPException(409, "Time slot overlaps with existing appointment")
    
    # Calculate duration
    duration = int((data.end_time - data.start_time).total_seconds() / 60)
    
    # Create appointment
    appt_id = generate_uuid()
    appointment = Appointment(
        id=appt_id,
        practitioner_id=target_practitioner_id,
        patient_id=data.patient_id,
        date=data.date,
        start_time=data.start_time,
        end_time=data.end_time,
        duration_minutes=duration,
        session_type=data.session_type,
        session_mode=data.session_mode,
        notes=data.notes,
    )
    db.add(appointment)
    
    # Calculate payment amounts
    taxable_amount = data.session_fee - data.discount_amount
    tax_amount = _calculate_tax(taxable_amount, data.tax_percentage)
    final_amount = taxable_amount + tax_amount
    
    # Create payment record
    payment_id = generate_uuid()
    payment = Payment(
        id=payment_id,
        appointment_id=appt_id,
        practitioner_id=target_practitioner_id,
        patient_id=data.patient_id,
        session_fee=data.session_fee,
        discount_amount=data.discount_amount,
        discount_reason=data.discount_reason,
        tax_amount=tax_amount,
        tax_percentage=data.tax_percentage,
        final_amount=final_amount,
        payment_link_token=generate_payment_link_token(),
        payment_link_expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(payment)
    
    # Link payment to appointment
    appointment.payment_id = payment_id
    
    await db.commit()
    await db.refresh(appointment)
    await db.refresh(payment)

    practitioner = await db.get(Practitioner, target_practitioner_id)

    await _create_calendar_event_for_appointment(db, appointment, practitioner, patient, target_practitioner_id)

    return AppointmentResponseWithPayment(
        id=appointment.id,
        practitioner_id=appointment.practitioner_id,
        practitioner_name=practitioner.name if practitioner else "Unknown",
        patient_id=appointment.patient_id,
        patient_name=patient.full_name,
        date=appointment.date,
        start_time=appointment.start_time,
        end_time=appointment.end_time,
        duration_minutes=appointment.duration_minutes,
        session_type=appointment.session_type,
        session_mode=appointment.session_mode,
        status=appointment.status,
        notes=appointment.notes,
        rescheduled_from_id=appointment.rescheduled_from_id,
        rescheduled_to_id=appointment.rescheduled_to_id,
        cancellation_reason=appointment.cancellation_reason,
        meeting_link=appointment.meeting_link,
        created_at=appointment.created_at,
        updated_at=appointment.updated_at,
        payment_id=payment.id,
        payment_status=payment.status,
        payment_amount=payment.final_amount,
        payment_currency=payment.currency,
        payment_link_url=_get_payment_link_url(payment.payment_link_token),
        receipt_number=None,
    )


@app.get("/api/appointments/{appointment_id}/payment", response_model=PaymentResponse)
async def get_appointment_payment(
    appointment_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get payment for an appointment."""
    appt = await db.get(Appointment, appointment_id)
    if not appt:
        raise HTTPException(404, "Appointment not found")
    
    # Access control
    if prac.role != "owner" and appt.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    payment = (await db.execute(
        select(Payment).where(Payment.appointment_id == appointment_id)
    )).scalar_one_or_none()
    
    if not payment:
        raise HTTPException(404, "No payment found for this appointment")
    
    return await get_payment(payment.id, prac, db)


@app.post("/api/appointments/{appointment_id}/payment", response_model=PaymentResponse)
async def create_appointment_payment(
    appointment_id: str,
    data: PaymentCreate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Create payment for an existing appointment."""
    from models import generate_uuid
    from datetime import timedelta
    
    appt = await db.get(Appointment, appointment_id)
    if not appt:
        raise HTTPException(404, "Appointment not found")
    
    # Access control
    if prac.role != "owner" and appt.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    # Check if payment already exists
    existing = (await db.execute(
        select(Payment).where(Payment.appointment_id == appointment_id)
    )).scalar_one_or_none()
    
    if existing:
        raise HTTPException(409, "Payment already exists for this appointment")
    
    # Calculate amounts
    taxable_amount = data.session_fee - data.discount_amount
    tax_amount = _calculate_tax(taxable_amount, data.tax_percentage)
    final_amount = taxable_amount + tax_amount
    
    # Create payment
    payment = Payment(
        id=generate_uuid(),
        appointment_id=appointment_id,
        practitioner_id=appt.practitioner_id,
        patient_id=appt.patient_id,
        session_fee=data.session_fee,
        discount_amount=data.discount_amount,
        discount_reason=data.discount_reason,
        tax_amount=tax_amount,
        tax_percentage=data.tax_percentage,
        final_amount=final_amount,
        notes=data.notes,
        payment_link_token=generate_payment_link_token(),
        payment_link_expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(payment)
    
    # Link to appointment
    appt.payment_id = payment.id
    
    await db.commit()
    await db.refresh(payment)
    
    return await get_payment(payment.id, prac, db)


# ─── Internal Notifications ────────────────────────────────────────────────────

@app.get("/api/notifications", response_model=NotificationList)
async def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """List internal notifications."""
    query = select(InternalNotification).where(
        InternalNotification.practitioner_id == prac.id
    )
    
    if unread_only:
        query = query.where(InternalNotification.is_read == False)
    
    query = query.order_by(InternalNotification.created_at.desc()).limit(limit)
    notifications = (await db.execute(query)).scalars().all()
    
    # Get total and unread counts
    total_count = (await db.execute(
        select(func.count(InternalNotification.id)).where(
            InternalNotification.practitioner_id == prac.id
        )
    )).scalar() or 0
    
    unread_count = (await db.execute(
        select(func.count(InternalNotification.id)).where(
            InternalNotification.practitioner_id == prac.id,
            InternalNotification.is_read == False,
        )
    )).scalar() or 0
    
    return NotificationList(
        notifications=[
            NotificationResponse(
                id=n.id,
                notification_type=n.notification_type,
                title=n.title,
                message=n.message,
                reference_type=n.reference_type,
                reference_id=n.reference_id,
                is_read=n.is_read,
                read_at=n.read_at,
                extra_data=n.extra_data,
                created_at=n.created_at,
            )
            for n in notifications
        ],
        total_count=total_count,
        unread_count=unread_count,
    )


@app.post("/api/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Mark notification as read."""
    notification = await db.get(InternalNotification, notification_id)
    if not notification:
        raise HTTPException(404, "Notification not found")
    
    if notification.practitioner_id != prac.id:
        raise HTTPException(403, "Access denied")
    
    notification.is_read = True
    notification.read_at = datetime.now(timezone.utc)
    
    await db.commit()
    
    return {"message": "Notification marked as read"}


@app.post("/api/notifications/read-all")
async def mark_all_notifications_read(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Mark all notifications as read."""
    await db.execute(
        InternalNotification.__table__.update()
        .where(InternalNotification.practitioner_id == prac.id)
        .where(InternalNotification.is_read == False)
        .values(is_read=True, read_at=datetime.now(timezone.utc))
    )
    await db.commit()
    
    return {"message": "All notifications marked as read"}


# ═════════════════════════════════════════════════════════════════════════════════
#  PUBLIC PROFILE — Therapist Public Profile & Patient Onboarding
# ═════════════════════════════════════════════════════════════════════════════════

# ─── Helper Functions ────────────────────────────────────────────────────────────

def _get_file_url(storage_path: str | None) -> str | None:
    """Convert storage path to URL."""
    if not storage_path:
        return None
    return f"/api/files/{storage_path}"


def _profile_to_response(profile: PractitionerProfile) -> PractitionerProfileResponse:
    """Convert profile model to response."""
    return PractitionerProfileResponse(
        id=profile.id,
        practitioner_id=profile.practitioner_id,
        slug=profile.slug,
        is_public=profile.is_public,
        is_admin_approved=profile.is_admin_approved,
        display_name=profile.display_name,
        title=profile.title,
        tagline=profile.tagline,
        bio=profile.bio,
        qualifications=profile.qualifications,
        certifications=profile.certifications,
        license_number=profile.license_number,
        professional_memberships=profile.professional_memberships,
        years_of_experience=profile.years_of_experience,
        areas_of_expertise=profile.areas_of_expertise,
        specializations=profile.specializations,
        therapy_approaches=profile.therapy_approaches,
        languages=profile.languages,
        consultation_fee=profile.consultation_fee,
        consultation_fee_currency=profile.consultation_fee_currency,
        fee_notes=profile.fee_notes,
        public_email=profile.public_email,
        public_phone=profile.public_phone,
        clinic_address=profile.clinic_address,
        website_url=profile.website_url,
        instagram_handle=profile.instagram_handle,
        profile_photo_url=_get_file_url(profile.profile_photo_path),
        cover_image_url=_get_file_url(profile.cover_image_path),
        clinic_logo_url=_get_file_url(profile.clinic_logo_path),
        welcome_message=profile.welcome_message,
        what_to_expect=profile.what_to_expect,
        how_therapy_works=profile.how_therapy_works,
        preparation_guidelines=profile.preparation_guidelines,
        faq_content=profile.faq_content,
        emergency_disclaimer=profile.emergency_disclaimer,
        consent_info=profile.consent_info,
        meta_title=profile.meta_title,
        meta_description=profile.meta_description,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
        published_at=profile.published_at,
    )


def _profile_to_public_response(profile: PractitionerProfile) -> PublicProfileResponse:
    """Convert profile model to public response (no sensitive data)."""
    return PublicProfileResponse(
        slug=profile.slug,
        display_name=profile.display_name,
        title=profile.title,
        tagline=profile.tagline,
        bio=profile.bio,
        qualifications=profile.qualifications,
        certifications=profile.certifications,
        license_number=profile.license_number,
        professional_memberships=profile.professional_memberships,
        years_of_experience=profile.years_of_experience,
        areas_of_expertise=profile.areas_of_expertise,
        specializations=profile.specializations,
        therapy_approaches=profile.therapy_approaches,
        languages=profile.languages,
        consultation_fee=profile.consultation_fee,
        consultation_fee_currency=profile.consultation_fee_currency,
        fee_notes=profile.fee_notes,
        public_email=profile.public_email,
        public_phone=profile.public_phone,
        clinic_address=profile.clinic_address,
        website_url=profile.website_url,
        instagram_handle=profile.instagram_handle,
        profile_photo_url=_get_file_url(profile.profile_photo_path),
        cover_image_url=_get_file_url(profile.cover_image_path),
        clinic_logo_url=_get_file_url(profile.clinic_logo_path),
        meta_title=profile.meta_title,
        meta_description=profile.meta_description,
    )


def _resource_to_response(resource: PractitionerResource) -> ResourceResponse:
    """Convert resource model to response."""
    return ResourceResponse(
        id=resource.id,
        profile_id=resource.profile_id,
        resource_type=resource.resource_type,
        title=resource.title,
        description=resource.description,
        content=resource.content,
        file_url=_get_file_url(resource.storage_path),
        original_filename=resource.original_filename,
        mime_type=resource.mime_type,
        file_size=resource.file_size,
        is_public=resource.is_public,
        display_order=resource.display_order,
        created_at=resource.created_at,
        updated_at=resource.updated_at,
    )


def _testimonial_to_response(testimonial: Testimonial) -> TestimonialResponse:
    """Convert testimonial model to response."""
    return TestimonialResponse(
        id=testimonial.id,
        profile_id=testimonial.profile_id,
        display_name=testimonial.display_name,
        feedback=testimonial.feedback,
        rating=testimonial.rating,
        is_public=testimonial.is_public,
        display_order=testimonial.display_order,
        created_at=testimonial.created_at,
        updated_at=testimonial.updated_at,
    )


# ─── Public Endpoints (No Auth Required) ─────────────────────────────────────────

@app.get("/api/public/profile/{slug}", response_model=PublicProfileResponse)
async def get_public_profile(slug: str, db: AsyncSession = Depends(get_db)):
    """Get public profile by slug."""
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.slug == slug,
            PractitionerProfile.is_public == True,
            PractitionerProfile.is_admin_approved == True,
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    return _profile_to_public_response(profile)


@app.get("/api/public/profile/{slug}/onboarding", response_model=PublicOnboardingResponse)
async def get_public_onboarding(slug: str, db: AsyncSession = Depends(get_db)):
    """Get onboarding content for a public profile."""
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.slug == slug,
            PractitionerProfile.is_public == True,
            PractitionerProfile.is_admin_approved == True,
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    return PublicOnboardingResponse(
        slug=profile.slug,
        display_name=profile.display_name,
        title=profile.title,
        profile_photo_url=_get_file_url(profile.profile_photo_path),
        welcome_message=profile.welcome_message,
        what_to_expect=profile.what_to_expect,
        how_therapy_works=profile.how_therapy_works,
        preparation_guidelines=profile.preparation_guidelines,
        faq_content=profile.faq_content,
        emergency_disclaimer=profile.emergency_disclaimer,
        consent_info=profile.consent_info,
    )


@app.get("/api/public/profile/{slug}/resources", response_model=list[PublicResourceResponse])
async def get_public_resources(slug: str, db: AsyncSession = Depends(get_db)):
    """Get public resources for a profile."""
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.slug == slug,
            PractitionerProfile.is_public == True,
            PractitionerProfile.is_admin_approved == True,
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    resources = (await db.execute(
        select(PractitionerResource)
        .where(
            PractitionerResource.profile_id == profile.id,
            PractitionerResource.is_public == True,
        )
        .order_by(PractitionerResource.display_order)
    )).scalars().all()
    
    return [
        PublicResourceResponse(
            id=r.id,
            resource_type=r.resource_type,
            title=r.title,
            description=r.description,
            content=r.content,
            file_url=_get_file_url(r.storage_path),
            original_filename=r.original_filename,
            mime_type=r.mime_type,
        )
        for r in resources
    ]


@app.get("/api/public/profile/{slug}/testimonials", response_model=list[PublicTestimonialResponse])
async def get_public_testimonials(slug: str, db: AsyncSession = Depends(get_db)):
    """Get public testimonials for a profile."""
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.slug == slug,
            PractitionerProfile.is_public == True,
            PractitionerProfile.is_admin_approved == True,
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    testimonials = (await db.execute(
        select(Testimonial)
        .where(
            Testimonial.profile_id == profile.id,
            Testimonial.is_public == True,
        )
        .order_by(Testimonial.display_order)
    )).scalars().all()
    
    return [
        PublicTestimonialResponse(
            id=t.id,
            display_name=t.display_name,
            feedback=t.feedback,
            rating=t.rating,
        )
        for t in testimonials
    ]


@app.get("/api/public/profile/{slug}/availability", response_model=AvailabilityPreviewResponse)
async def get_public_availability(
    slug: str,
    days: int = Query(14, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
):
    """Get availability preview for a public profile."""
    from models import PractitionerAvailability, UnavailableDate, Appointment
    from datetime import timedelta
    import pytz
    
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.slug == slug,
            PractitionerProfile.is_public == True,
            PractitionerProfile.is_admin_approved == True,
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    # Get availability settings
    availability = (await db.execute(
        select(PractitionerAvailability).where(
            PractitionerAvailability.practitioner_id == profile.practitioner_id
        )
    )).scalar_one_or_none()
    
    if not availability:
        return AvailabilityPreviewResponse(
            practitioner_slug=slug,
            timezone="Asia/Kolkata",
            days=[],
        )
    
    tz = pytz.timezone(availability.timezone)
    today = datetime.now(tz).date()
    
    # Get unavailable dates
    unavailable_dates = (await db.execute(
        select(UnavailableDate).where(
            UnavailableDate.practitioner_id == profile.practitioner_id,
            UnavailableDate.date >= today,
            UnavailableDate.date <= today + timedelta(days=days),
        )
    )).scalars().all()
    unavailable_set = {ud.date for ud in unavailable_dates}
    
    # Get existing appointments
    appointments = (await db.execute(
        select(Appointment).where(
            Appointment.practitioner_id == profile.practitioner_id,
            Appointment.date >= today,
            Appointment.date <= today + timedelta(days=days),
            Appointment.status.in_(["scheduled", "rescheduled"]),
        )
    )).scalars().all()
    
    # Build appointment lookup
    appt_by_date = {}
    for appt in appointments:
        if appt.date not in appt_by_date:
            appt_by_date[appt.date] = []
        appt_by_date[appt.date].append((appt.start_time, appt.end_time))
    
    # Build day availability
    day_previews = []
    for i in range(days):
        current_date = today + timedelta(days=i)
        weekday = current_date.weekday()
        
        is_working_day = weekday in availability.working_days
        is_unavailable = current_date in unavailable_set
        
        if not is_working_day or is_unavailable:
            day_previews.append(DayAvailabilityPreview(
                date=current_date,
                is_available=False,
                slots=[],
            ))
            continue
        
        # Generate slots
        work_start = datetime.strptime(availability.work_start_time, "%H:%M")
        work_end = datetime.strptime(availability.work_end_time, "%H:%M")
        break_start = datetime.strptime(availability.break_start_time, "%H:%M") if availability.break_start_time else None
        break_end = datetime.strptime(availability.break_end_time, "%H:%M") if availability.break_end_time else None
        
        slots = []
        current_time = tz.localize(datetime.combine(current_date, work_start.time()))
        end_time = tz.localize(datetime.combine(current_date, work_end.time()))
        
        session_duration = timedelta(minutes=availability.default_session_duration)
        buffer = timedelta(minutes=availability.buffer_minutes)
        
        day_appointments = appt_by_date.get(current_date, [])
        
        while current_time + session_duration <= end_time:
            slot_end = current_time + session_duration
            
            # Skip break time
            if break_start and break_end:
                break_start_dt = tz.localize(datetime.combine(current_date, break_start.time()))
                break_end_dt = tz.localize(datetime.combine(current_date, break_end.time()))
                if current_time < break_end_dt and slot_end > break_start_dt:
                    current_time = break_end_dt
                    continue
            
            # Check if slot conflicts with existing appointment
            is_free = True
            for appt_start, appt_end in day_appointments:
                if current_time < appt_end and slot_end > appt_start:
                    is_free = False
                    break
            
            if is_free:
                slots.append(AvailabilitySlotPreview(
                    start=current_time,
                    end=slot_end,
                ))
            
            current_time = slot_end + buffer
        
        day_previews.append(DayAvailabilityPreview(
            date=current_date,
            is_available=len(slots) > 0,
            slots=slots,
        ))
    
    return AvailabilityPreviewResponse(
        practitioner_slug=slug,
        timezone=availability.timezone,
        days=day_previews,
    )


# ─── Practitioner Profile Management (Auth Required) ─────────────────────────────

@app.get("/api/profile/me", response_model=PractitionerProfileResponse)
async def get_my_profile(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get current practitioner's profile."""
    from models import generate_uuid
    
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.practitioner_id == prac.id
        )
    )).scalar_one_or_none()
    
    # Auto-create profile if doesn't exist
    if not profile:
        slug = generate_profile_slug(prac.name)
        # Ensure unique slug
        base_slug = slug
        counter = 1
        while (await db.execute(
            select(PractitionerProfile).where(PractitionerProfile.slug == slug)
        )).scalar_one_or_none():
            slug = f"{base_slug}-{counter}"
            counter += 1
        
        profile = PractitionerProfile(
            id=generate_uuid(),
            practitioner_id=prac.id,
            slug=slug,
            display_name=prac.name,
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    
    return _profile_to_response(profile)


@app.put("/api/profile/me", response_model=PractitionerProfileResponse)
async def update_my_profile(
    data: PractitionerProfileUpdate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Update current practitioner's profile."""
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.practitioner_id == prac.id
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found. Please call GET /api/profile/me first to create it.")
    
    # Update slug if provided
    if data.slug is not None and data.slug != profile.slug:
        existing = (await db.execute(
            select(PractitionerProfile).where(
                PractitionerProfile.slug == data.slug,
                PractitionerProfile.id != profile.id,
            )
        )).scalar_one_or_none()
        if existing:
            raise HTTPException(409, "This URL slug is already taken")
        profile.slug = data.slug
    
    # Update other fields
    update_fields = [
        "display_name", "title", "tagline", "bio",
        "qualifications", "certifications", "license_number", "professional_memberships",
        "years_of_experience", "areas_of_expertise", "specializations", "therapy_approaches",
        "languages",
        "consultation_fee", "consultation_fee_currency", "fee_notes",
        "public_email", "public_phone", "clinic_address", "website_url", "instagram_handle",
        "welcome_message", "what_to_expect", "how_therapy_works", "preparation_guidelines",
        "faq_content", "emergency_disclaimer", "consent_info",
        "meta_title", "meta_description",
    ]
    
    for field in update_fields:
        value = getattr(data, field, None)
        if value is not None:
            # Convert Pydantic models to dicts for JSON fields
            if isinstance(value, list):
                value = [v.model_dump() if hasattr(v, 'model_dump') else v for v in value]
            setattr(profile, field, value)
    
    # Handle is_public separately (track published_at)
    if data.is_public is not None:
        profile.is_public = data.is_public
        if data.is_public and not profile.published_at:
            profile.published_at = datetime.now(timezone.utc)

    # Once the mandatory fields are filled in, mark profile setup complete so
    # the practitioner lands on the dashboard (not this page) on future logins.
    mandatory_fields = [profile.slug, profile.title, profile.display_name, profile.tagline, profile.bio]
    if not prac.profile_setup_complete and all(f and f.strip() for f in mandatory_fields):
        prac.profile_setup_complete = True

    await db.commit()
    await db.refresh(profile)

    return _profile_to_response(profile)


@app.post("/api/profile/me/photo")
async def upload_profile_photo(
    file: UploadFile = File(...),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Upload profile photo."""
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.practitioner_id == prac.id
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/jpg", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(400, f"Invalid file type. Allowed: {', '.join(allowed_types)}")
    
    # Save file
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(400, "File size exceeds 5MB limit")
    
    storage_path = await save_file(content, f"profiles/{profile.id}", file.filename)
    
    # Delete old photo if exists
    if profile.profile_photo_path:
        await delete_file(profile.profile_photo_path)
    
    profile.profile_photo_path = storage_path
    await db.commit()
    
    return {"message": "Photo uploaded", "url": _get_file_url(storage_path)}


@app.post("/api/profile/me/cover")
async def upload_cover_image(
    file: UploadFile = File(...),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Upload cover image."""
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.practitioner_id == prac.id
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    allowed_types = ["image/jpeg", "image/png", "image/jpg", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(400, f"Invalid file type. Allowed: {', '.join(allowed_types)}")
    
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(400, "File size exceeds 10MB limit")
    
    storage_path = await save_file(content, f"profiles/{profile.id}", file.filename)
    
    if profile.cover_image_path:
        await delete_file(profile.cover_image_path)
    
    profile.cover_image_path = storage_path
    await db.commit()
    
    return {"message": "Cover image uploaded", "url": _get_file_url(storage_path)}


@app.post("/api/profile/me/logo")
async def upload_clinic_logo(
    file: UploadFile = File(...),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Upload clinic logo."""
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.practitioner_id == prac.id
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    allowed_types = ["image/jpeg", "image/png", "image/jpg", "image/webp", "image/svg+xml"]
    if file.content_type not in allowed_types:
        raise HTTPException(400, f"Invalid file type. Allowed: {', '.join(allowed_types)}")
    
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:  # 2MB limit
        raise HTTPException(400, "File size exceeds 2MB limit")
    
    storage_path = await save_file(content, f"profiles/{profile.id}", file.filename)
    
    if profile.clinic_logo_path:
        await delete_file(profile.clinic_logo_path)
    
    profile.clinic_logo_path = storage_path
    await db.commit()
    
    return {"message": "Clinic logo uploaded", "url": _get_file_url(storage_path)}


# ─── Resource Management ─────────────────────────────────────────────────────────

@app.get("/api/profile/me/resources", response_model=list[ResourceResponse])
async def list_my_resources(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """List all resources for current practitioner's profile."""
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.practitioner_id == prac.id
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    resources = (await db.execute(
        select(PractitionerResource)
        .where(PractitionerResource.profile_id == profile.id)
        .order_by(PractitionerResource.display_order)
    )).scalars().all()
    
    return [_resource_to_response(r) for r in resources]


@app.post("/api/profile/me/resources", response_model=ResourceResponse)
async def create_resource(
    data: ResourceCreate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Create a new resource."""
    from models import generate_uuid
    
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.practitioner_id == prac.id
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    if data.resource_type not in RESOURCE_TYPES:
        raise HTTPException(400, f"Invalid resource type. Allowed: {', '.join(RESOURCE_TYPES)}")
    
    resource = PractitionerResource(
        id=generate_uuid(),
        profile_id=profile.id,
        resource_type=data.resource_type,
        title=data.title,
        description=data.description,
        content=data.content,
        is_public=data.is_public,
        display_order=data.display_order,
    )
    db.add(resource)
    await db.commit()
    await db.refresh(resource)
    
    return _resource_to_response(resource)


@app.post("/api/profile/me/resources/upload", response_model=ResourceResponse)
async def upload_resource(
    resource_type: str = Form(...),
    title: str = Form(...),
    description: str = Form(None),
    is_public: bool = Form(True),
    display_order: int = Form(0),
    file: UploadFile = File(...),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Upload a resource file (PDF, DOC, etc.)."""
    from models import generate_uuid
    
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.practitioner_id == prac.id
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    if resource_type not in RESOURCE_TYPES:
        raise HTTPException(400, f"Invalid resource type. Allowed: {', '.join(RESOURCE_TYPES)}")
    
    # Validate file type
    allowed_types = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "image/jpeg",
        "image/png",
    ]
    if file.content_type not in allowed_types:
        raise HTTPException(400, f"Invalid file type. Allowed types: PDF, DOC, DOCX, TXT, JPG, PNG")
    
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(400, "File size exceeds 10MB limit")
    
    storage_path = await save_file(content, f"resources/{profile.id}", file.filename)
    
    resource = PractitionerResource(
        id=generate_uuid(),
        profile_id=profile.id,
        resource_type=resource_type,
        title=title,
        description=description,
        storage_path=storage_path,
        original_filename=file.filename,
        mime_type=file.content_type,
        file_size=len(content),
        is_public=is_public,
        display_order=display_order,
    )
    db.add(resource)
    await db.commit()
    await db.refresh(resource)
    
    return _resource_to_response(resource)


@app.put("/api/profile/me/resources/{resource_id}", response_model=ResourceResponse)
async def update_resource(
    resource_id: str,
    data: ResourceUpdate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Update a resource."""
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.practitioner_id == prac.id
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    resource = await db.get(PractitionerResource, resource_id)
    if not resource or resource.profile_id != profile.id:
        raise HTTPException(404, "Resource not found")
    
    if data.resource_type is not None:
        if data.resource_type not in RESOURCE_TYPES:
            raise HTTPException(400, f"Invalid resource type")
        resource.resource_type = data.resource_type
    
    if data.title is not None:
        resource.title = data.title
    if data.description is not None:
        resource.description = data.description
    if data.content is not None:
        resource.content = data.content
    if data.is_public is not None:
        resource.is_public = data.is_public
    if data.display_order is not None:
        resource.display_order = data.display_order
    
    await db.commit()
    await db.refresh(resource)
    
    return _resource_to_response(resource)


@app.delete("/api/profile/me/resources/{resource_id}")
async def delete_resource(
    resource_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Delete a resource."""
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.practitioner_id == prac.id
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    resource = await db.get(PractitionerResource, resource_id)
    if not resource or resource.profile_id != profile.id:
        raise HTTPException(404, "Resource not found")
    
    # Delete file if exists
    if resource.storage_path:
        await delete_file(resource.storage_path)
    
    await db.delete(resource)
    await db.commit()
    
    return {"message": "Resource deleted"}


# ─── Testimonial Management ──────────────────────────────────────────────────────

@app.get("/api/profile/me/testimonials", response_model=list[TestimonialResponse])
async def list_my_testimonials(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """List all testimonials for current practitioner's profile."""
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.practitioner_id == prac.id
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    testimonials = (await db.execute(
        select(Testimonial)
        .where(Testimonial.profile_id == profile.id)
        .order_by(Testimonial.display_order)
    )).scalars().all()
    
    return [_testimonial_to_response(t) for t in testimonials]


@app.post("/api/profile/me/testimonials", response_model=TestimonialResponse)
async def create_testimonial(
    data: TestimonialCreate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Create a new testimonial."""
    from models import generate_uuid
    
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.practitioner_id == prac.id
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    if data.rating is not None and (data.rating < 1 or data.rating > 5):
        raise HTTPException(400, "Rating must be between 1 and 5")
    
    testimonial = Testimonial(
        id=generate_uuid(),
        profile_id=profile.id,
        display_name=data.display_name,
        feedback=data.feedback,
        rating=data.rating,
        is_public=data.is_public,
        display_order=data.display_order,
    )
    db.add(testimonial)
    await db.commit()
    await db.refresh(testimonial)
    
    return _testimonial_to_response(testimonial)


@app.put("/api/profile/me/testimonials/{testimonial_id}", response_model=TestimonialResponse)
async def update_testimonial(
    testimonial_id: str,
    data: TestimonialUpdate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Update a testimonial."""
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.practitioner_id == prac.id
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    testimonial = await db.get(Testimonial, testimonial_id)
    if not testimonial or testimonial.profile_id != profile.id:
        raise HTTPException(404, "Testimonial not found")
    
    if data.display_name is not None:
        testimonial.display_name = data.display_name
    if data.feedback is not None:
        testimonial.feedback = data.feedback
    if data.rating is not None:
        if data.rating < 1 or data.rating > 5:
            raise HTTPException(400, "Rating must be between 1 and 5")
        testimonial.rating = data.rating
    if data.is_public is not None:
        testimonial.is_public = data.is_public
    if data.display_order is not None:
        testimonial.display_order = data.display_order
    
    await db.commit()
    await db.refresh(testimonial)
    
    return _testimonial_to_response(testimonial)


@app.delete("/api/profile/me/testimonials/{testimonial_id}")
async def delete_testimonial(
    testimonial_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Delete a testimonial."""
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.practitioner_id == prac.id
        )
    )).scalar_one_or_none()
    
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    testimonial = await db.get(Testimonial, testimonial_id)
    if not testimonial or testimonial.profile_id != profile.id:
        raise HTTPException(404, "Testimonial not found")
    
    await db.delete(testimonial)
    await db.commit()
    
    return {"message": "Testimonial deleted"}


# ─── Admin Profile Management (Owner Only) ───────────────────────────────────────

@app.get("/api/admin/profiles", response_model=list[ProfileListItem])
async def list_all_profiles(
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """List all practitioner profiles (admin only)."""
    profiles = (await db.execute(
        select(PractitionerProfile, Practitioner)
        .join(Practitioner, PractitionerProfile.practitioner_id == Practitioner.id)
        .order_by(PractitionerProfile.created_at.desc())
    )).all()
    
    return [
        ProfileListItem(
            id=p.id,
            practitioner_id=p.practitioner_id,
            practitioner_name=prac_obj.name,
            practitioner_email=prac_obj.email,
            slug=p.slug,
            display_name=p.display_name,
            is_public=p.is_public,
            is_admin_approved=p.is_admin_approved,
            created_at=p.created_at,
            updated_at=p.updated_at,
            published_at=p.published_at,
        )
        for p, prac_obj in profiles
    ]


@app.get("/api/admin/profiles/{profile_id}", response_model=PractitionerProfileResponse)
async def get_profile_admin(
    profile_id: str,
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific profile (admin only)."""
    profile = await db.get(PractitionerProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    return _profile_to_response(profile)


@app.put("/api/admin/profiles/{profile_id}", response_model=PractitionerProfileResponse)
async def update_profile_admin(
    profile_id: str,
    data: AdminProfileUpdate,
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Update profile admin settings (admin only)."""
    profile = await db.get(PractitionerProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    
    if data.is_admin_approved is not None:
        profile.is_admin_approved = data.is_admin_approved
    if data.is_public is not None:
        profile.is_public = data.is_public
        if data.is_public and not profile.published_at:
            profile.published_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(profile)
    
    return _profile_to_response(profile)


# ═════════════════════════════════════════════════════════════════════════════════
#  PHASE 5 — PUBLIC BOOKING & APPOINTMENTS
# ═════════════════════════════════════════════════════════════════════════════════

from booking_service import booking_service
from notification_service import notification_service, format_date, format_time, format_amount


@app.get("/api/public/profile/{slug}/booking/slots", response_model=PublicAvailableSlotsResponse)
async def get_public_booking_slots(
    slug: str,
    start_date: date = Query(default=None),
    days: int = Query(default=14, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
):
    """Get available booking slots for a practitioner's public profile."""
    profile = (await db.execute(
        select(PractitionerProfile).where(PractitionerProfile.slug == slug)
    )).scalar_one_or_none()
    
    if not profile or not profile.is_public or not profile.is_admin_approved:
        raise HTTPException(404, "Profile not found or not public")
    
    if start_date is None:
        start_date = date.today()
    
    result = await booking_service.get_available_slots(
        db=db,
        practitioner_id=profile.practitioner_id,
        start_date=start_date,
        days=days,
    )
    
    if not result:
        raise HTTPException(404, "Practitioner not found")
    
    days_data = []
    for day in result["days"]:
        slots = [
            PublicBookingSlot(
                start=s["start"],
                end=s["end"],
                duration_minutes=s["duration_minutes"],
            )
            for s in day["slots"]
        ]
        days_data.append(PublicBookingDay(
            date=day["date"],
            is_available=day["is_available"],
            slots=slots,
        ))
    
    return PublicAvailableSlotsResponse(
        practitioner_slug=slug,
        practitioner_name=result["practitioner_name"],
        timezone=result["timezone"],
        session_types=result["session_types"],
        days=days_data,
    )


@app.post("/api/public/profile/{slug}/booking", response_model=BookingRequestResponse)
async def create_public_booking(
    slug: str,
    data: BookingRequestCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new booking request from public profile."""
    profile = (await db.execute(
        select(PractitionerProfile).where(PractitionerProfile.slug == slug)
    )).scalar_one_or_none()
    
    if not profile or not profile.is_public or not profile.is_admin_approved:
        raise HTTPException(404, "Profile not found or not public")
    
    practitioner = (await db.execute(
        select(Practitioner).where(Practitioner.id == profile.practitioner_id)
    )).scalar_one_or_none()
    
    if not practitioner:
        raise HTTPException(404, "Practitioner not found")
    
    availability = (await db.execute(
        select(PractitionerAvailability).where(
            PractitionerAvailability.practitioner_id == profile.practitioner_id
        )
    )).scalar_one_or_none()
    
    duration_minutes = availability.default_session_duration if availability else 50
    
    try:
        result = await booking_service.create_booking_request(
            db=db,
            practitioner_id=profile.practitioner_id,
            patient_name=data.patient_name,
            patient_email=data.patient_email,
            patient_phone=data.patient_phone,
            requested_date=data.requested_date,
            requested_start_time=data.requested_start_time,
            session_type=data.session_type,
            session_mode=data.session_mode,
            patient_notes=data.patient_notes,
            duration_minutes=duration_minutes,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    
    booking = result["booking"]
    payment = result["payment"]
    
    return BookingRequestResponse(
        id=booking.id,
        booking_token=booking.booking_token,
        practitioner_id=booking.practitioner_id,
        practitioner_name=practitioner.name,
        patient_name=booking.patient_name,
        patient_email=booking.patient_email,
        patient_phone=booking.patient_phone,
        requested_date=booking.requested_date,
        requested_start_time=booking.requested_start_time,
        requested_end_time=booking.requested_end_time,
        duration_minutes=booking.duration_minutes,
        session_type=booking.session_type,
        session_mode=booking.session_mode,
        status=booking.status,
        patient_notes=booking.patient_notes,
        payment_id=payment.id if payment else None,
        payment_status=payment.status if payment else None,
        payment_amount=payment.final_amount if payment else None,
        payment_currency=payment.currency if payment else None,
        payment_link_url=result["payment_link_url"],
        expires_at=booking.expires_at,
        created_at=booking.created_at,
    )


@app.post("/api/public/profile/{slug}/intake", response_model=IntakeSubmissionResponse)
async def create_public_intake(
    slug: str,
    data: IntakeSubmissionCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Submit the public "Start Intake" form (name, age, gender, chief complaint)
    for the introductory call. Deliberately does NOT create a Patient record —
    it lands in a review queue (IntakeSubmission) that the practitioner accepts
    or removes from the Patients list. Unauthenticated, so inputs are validated
    and length-capped defensively; the RateLimitMiddleware also throttles this
    path (unlike other /api/public/* GET endpoints) since it writes to the DB.
    """
    profile = (await db.execute(
        select(PractitionerProfile).where(PractitionerProfile.slug == slug)
    )).scalar_one_or_none()

    if not profile or not profile.is_public or not profile.is_admin_approved:
        raise HTTPException(404, "Profile not found or not public")

    full_name = (data.full_name or "").strip()
    if not full_name:
        raise HTTPException(400, "Name is required")
    if len(full_name) > 200:
        raise HTTPException(400, "Name must be less than 200 characters")

    if data.age is None or data.age < 1 or data.age > 120:
        raise HTTPException(400, "Please enter a valid age")

    gender = (data.gender or "").strip()
    if not gender:
        raise HTTPException(400, "Gender is required")

    phone = (data.phone or "").strip()
    if not phone:
        raise HTTPException(400, "Phone number is required")
    if len(phone) > 25:
        raise HTTPException(400, "Phone number must be less than 25 characters")

    chief_complaint = (data.chief_complaint or "").strip()
    if not chief_complaint:
        raise HTTPException(400, "Please briefly describe the reason for your visit")
    if len(chief_complaint) > 2000:
        raise HTTPException(400, "Chief complaint must be less than 2000 characters")

    submission = IntakeSubmission(
        practitioner_id=profile.practitioner_id,
        full_name=full_name,
        age=data.age,
        gender=gender,
        phone=phone,
        chief_complaint=chief_complaint,
        status="pending",
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)

    return IntakeSubmissionResponse(
        id=submission.id,
        full_name=submission.full_name,
        age=submission.age,
        gender=submission.gender,
        phone=submission.phone,
        chief_complaint=submission.chief_complaint,
        status=submission.status,
        created_at=submission.created_at,
    )


@app.get("/api/public/booking/{booking_token}", response_model=PatientAppointmentView)
async def get_public_booking_status(
    booking_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Get booking status by token (patient view, no authentication)."""
    result = await booking_service.get_booking_by_token(db, booking_token)
    
    if not result:
        raise HTTPException(404, "Booking not found")
    
    return PatientAppointmentView(**result)


@app.post("/api/public/booking/{booking_token}/cancel")
async def cancel_public_booking(
    booking_token: str,
    reason: str = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a booking request (patient can cancel before confirmation)."""
    booking = (await db.execute(
        select(BookingRequest).where(BookingRequest.booking_token == booking_token)
    )).scalar_one_or_none()
    
    if not booking:
        raise HTTPException(404, "Booking not found")
    
    if booking.status in ["confirmed", "cancelled", "expired"]:
        raise HTTPException(400, f"Cannot cancel booking with status: {booking.status}")
    
    try:
        await booking_service.cancel_booking(
            db=db,
            booking_id=booking.id,
            reason=reason,
            cancelled_by="patient",
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    
    return {"message": "Booking cancelled successfully"}


# ─── Payment Confirmation (Public) ────────────────────────────────────────────────

@app.get("/api/public/pay/{payment_token}")
async def get_payment_details(
    payment_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Get payment details by payment link token (public)."""
    payment = (await db.execute(
        select(Payment).where(Payment.payment_link_token == payment_token)
    )).scalar_one_or_none()
    
    if not payment:
        raise HTTPException(404, "Payment not found")
    
    if payment.status != "pending":
        raise HTTPException(400, f"Payment is not pending (status: {payment.status})")
    
    if payment.payment_link_expires_at and payment.payment_link_expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "Payment link has expired")
    
    booking = (await db.execute(
        select(BookingRequest).where(BookingRequest.payment_id == payment.id)
    )).scalar_one_or_none()
    
    practitioner = (await db.execute(
        select(Practitioner).where(Practitioner.id == payment.practitioner_id)
    )).scalar_one_or_none()
    
    profile = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.practitioner_id == payment.practitioner_id
        )
    )).scalar_one_or_none()
    
    return {
        "payment_id": payment.id,
        "amount": payment.final_amount,
        "currency": payment.currency,
        "session_fee": payment.session_fee,
        "discount_amount": payment.discount_amount,
        "tax_amount": payment.tax_amount,
        "practitioner_name": practitioner.name if practitioner else None,
        "practitioner_title": profile.title if profile else None,
        "patient_name": booking.patient_name if booking else None,
        "appointment_date": booking.requested_date if booking else None,
        "appointment_time": booking.requested_start_time if booking else None,
        "session_type": booking.session_type if booking else None,
        "session_mode": booking.session_mode if booking else None,
        "expires_at": payment.payment_link_expires_at,
    }


@app.post("/api/public/pay/{payment_token}/confirm")
async def confirm_payment(
    payment_token: str,
    payment_method: str = Query(default="payment_link"),
    db: AsyncSession = Depends(get_db),
):
    """
    Confirm payment for a booking (simulated payment gateway).
    In production, this would be called by a webhook from the payment provider.
    """
    payment = (await db.execute(
        select(Payment).where(Payment.payment_link_token == payment_token)
    )).scalar_one_or_none()
    
    if not payment:
        raise HTTPException(404, "Payment not found")
    
    if payment.status != "pending":
        raise HTTPException(400, f"Payment is not pending (status: {payment.status})")
    
    booking = (await db.execute(
        select(BookingRequest).where(BookingRequest.payment_id == payment.id)
    )).scalar_one_or_none()
    
    if not booking:
        raise HTTPException(404, "Associated booking not found")
    
    try:
        result = await booking_service.confirm_booking_payment(
            db=db,
            booking_id=booking.id,
            payment_method=payment_method,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    
    return {
        "success": True,
        "booking_token": booking.booking_token,
        "appointment_id": result["appointment"].id if result.get("appointment") else None,
        "meeting_link": result.get("meeting_link"),
        "message": "Payment confirmed and appointment created",
    }


# ─── Receipt (Public) ─────────────────────────────────────────────────────────────

@app.get("/api/public/booking/{booking_token}/receipt", response_model=PatientReceiptView)
async def get_booking_receipt(
    booking_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Get receipt for a confirmed booking (patient view)."""
    booking = (await db.execute(
        select(BookingRequest).where(BookingRequest.booking_token == booking_token)
    )).scalar_one_or_none()
    
    if not booking:
        raise HTTPException(404, "Booking not found")
    
    if booking.status != "confirmed":
        raise HTTPException(400, "Booking is not confirmed")
    
    if not booking.payment_id:
        raise HTTPException(404, "No payment associated with this booking")
    
    payment = (await db.execute(
        select(Payment).where(Payment.id == booking.payment_id)
    )).scalar_one_or_none()
    
    if not payment or payment.status != "paid":
        raise HTTPException(404, "Payment not found or not completed")
    
    receipt = (await db.execute(
        select(Receipt).where(Receipt.payment_id == payment.id)
    )).scalar_one_or_none()
    
    if not receipt:
        raise HTTPException(404, "Receipt not found")
    
    return PatientReceiptView(
        receipt_number=receipt.receipt_number,
        patient_name=receipt.patient_name,
        practitioner_name=receipt.practitioner_name,
        appointment_date=receipt.appointment_date,
        session_type=receipt.session_type,
        session_fee=receipt.session_fee,
        discount_amount=receipt.discount_amount,
        tax_amount=receipt.tax_amount,
        final_amount=receipt.final_amount,
        currency=receipt.currency,
        payment_method=receipt.payment_method,
        payment_date=receipt.payment_date,
        generated_at=receipt.generated_at,
    )


# ─── Therapist Booking Management ─────────────────────────────────────────────────

@app.get("/api/bookings", response_model=list[BookingListItem])
async def list_booking_requests(
    status: str = Query(default=None),
    start_date: date = Query(default=None),
    end_date: date = Query(default=None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """List booking requests for the practitioner."""
    query = select(BookingRequest).where(
        BookingRequest.practitioner_id == prac.id
    )
    
    if status:
        query = query.where(BookingRequest.status == status)
    if start_date:
        query = query.where(BookingRequest.requested_date >= start_date)
    if end_date:
        query = query.where(BookingRequest.requested_date <= end_date)
    
    query = query.order_by(BookingRequest.created_at.desc())
    
    bookings = (await db.execute(query)).scalars().all()
    
    result = []
    for b in bookings:
        payment_status = None
        if b.payment_id:
            payment = await db.get(Payment, b.payment_id)
            payment_status = payment.status if payment else None
        
        result.append(BookingListItem(
            id=b.id,
            booking_token=b.booking_token,
            patient_name=b.patient_name,
            patient_email=b.patient_email,
            patient_phone=b.patient_phone,
            requested_date=b.requested_date,
            requested_start_time=b.requested_start_time,
            duration_minutes=b.duration_minutes,
            session_type=b.session_type,
            session_mode=b.session_mode,
            status=b.status,
            payment_status=payment_status,
            created_at=b.created_at,
        ))
    
    return result


@app.get("/api/bookings/{booking_id}", response_model=BookingRequestResponse)
async def get_booking_request(
    booking_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific booking request."""
    booking = await db.get(BookingRequest, booking_id)
    
    if not booking or booking.practitioner_id != prac.id:
        raise HTTPException(404, "Booking not found")
    
    payment = None
    payment_link_url = None
    if booking.payment_id:
        payment = await db.get(Payment, booking.payment_id)
        if payment and payment.payment_link_token and payment.status == "pending":
            payment_link_url = f"{os.getenv('SITE_URL', 'http://localhost:5173')}/pay/{payment.payment_link_token}"
    
    return BookingRequestResponse(
        id=booking.id,
        booking_token=booking.booking_token,
        practitioner_id=booking.practitioner_id,
        practitioner_name=prac.name,
        patient_name=booking.patient_name,
        patient_email=booking.patient_email,
        patient_phone=booking.patient_phone,
        requested_date=booking.requested_date,
        requested_start_time=booking.requested_start_time,
        requested_end_time=booking.requested_end_time,
        duration_minutes=booking.duration_minutes,
        session_type=booking.session_type,
        session_mode=booking.session_mode,
        status=booking.status,
        patient_notes=booking.patient_notes,
        payment_id=payment.id if payment else None,
        payment_status=payment.status if payment else None,
        payment_amount=payment.final_amount if payment else None,
        payment_currency=payment.currency if payment else None,
        payment_link_url=payment_link_url,
        appointment_id=booking.appointment_id,
        meeting_link=booking.meeting_link,
        meeting_provider=booking.meeting_provider,
        expires_at=booking.expires_at,
        created_at=booking.created_at,
        confirmed_at=booking.confirmed_at,
    )


@app.post("/api/bookings/{booking_id}/cancel")
async def cancel_booking_therapist(
    booking_id: str,
    reason: str = Query(default=None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a booking request (therapist action)."""
    booking = await db.get(BookingRequest, booking_id)
    
    if not booking or booking.practitioner_id != prac.id:
        raise HTTPException(404, "Booking not found")
    
    try:
        await booking_service.cancel_booking(
            db=db,
            booking_id=booking.id,
            reason=reason,
            cancelled_by="therapist",
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    
    return {"message": "Booking cancelled successfully"}


@app.post("/api/bookings/{booking_id}/confirm-manual")
async def confirm_booking_manually(
    booking_id: str,
    payment_method: str = Query(default="cash"),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Manually confirm a booking (mark payment as received)."""
    booking = await db.get(BookingRequest, booking_id)
    
    if not booking or booking.practitioner_id != prac.id:
        raise HTTPException(404, "Booking not found")
    
    if booking.status not in ["pending_payment", "payment_processing", "requested"]:
        raise HTTPException(400, f"Cannot confirm booking with status: {booking.status}")
    
    try:
        result = await booking_service.confirm_booking_payment(
            db=db,
            booking_id=booking.id,
            payment_method=payment_method,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    
    return {
        "success": True,
        "appointment_id": result["appointment"].id if result.get("appointment") else None,
        "meeting_link": result.get("meeting_link"),
        "message": "Booking confirmed manually",
    }


# ─── Inbox / Notifications (Extended) ─────────────────────────────────────────────

@app.get("/api/inbox", response_model=InboxNotificationList)
async def get_inbox_notifications(
    unread_only: bool = Query(default=False),
    notification_type: str = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get inbox notifications with extended details."""
    query = select(InternalNotification).where(
        InternalNotification.practitioner_id == prac.id
    )
    
    if unread_only:
        query = query.where(InternalNotification.is_read == False)
    if notification_type:
        query = query.where(InternalNotification.notification_type == notification_type)
    
    query = query.order_by(InternalNotification.created_at.desc()).limit(limit)
    
    notifications = (await db.execute(query)).scalars().all()
    
    total_count = (await db.execute(
        select(func.count(InternalNotification.id)).where(
            InternalNotification.practitioner_id == prac.id
        )
    )).scalar()
    
    unread_count = (await db.execute(
        select(func.count(InternalNotification.id)).where(
            InternalNotification.practitioner_id == prac.id,
            InternalNotification.is_read == False,
        )
    )).scalar()
    
    counts_result = (await db.execute(
        select(
            InternalNotification.notification_type,
            func.count(InternalNotification.id)
        ).where(
            InternalNotification.practitioner_id == prac.id
        ).group_by(InternalNotification.notification_type)
    )).all()
    counts_by_type = {row[0]: row[1] for row in counts_result}
    
    result_notifications = []
    for n in notifications:
        extra = n.extra_data or {}
        result_notifications.append(InboxNotificationResponse(
            id=n.id,
            notification_type=n.notification_type,
            title=n.title,
            message=n.message,
            reference_type=n.reference_type,
            reference_id=n.reference_id,
            is_read=n.is_read,
            read_at=n.read_at,
            extra_data=n.extra_data,
            patient_name=extra.get("patient_name"),
            patient_id=extra.get("patient_id"),
            appointment_date=date.fromisoformat(extra["appointment_date"]) if extra.get("appointment_date") else None,
            amount=extra.get("amount"),
            currency=extra.get("currency"),
            created_at=n.created_at,
        ))
    
    return InboxNotificationList(
        notifications=result_notifications,
        total_count=total_count or 0,
        unread_count=unread_count or 0,
        counts_by_type=counts_by_type,
    )


# ═════════════════════════════════════════════════════════════════════════════════
#  PHASE 6 — PRACTICE ANALYTICS & REPORTING
# ═════════════════════════════════════════════════════════════════════════════════

import analytics_service
from schemas import (
    PracticeOverviewResponse, PatientAnalyticsResponse, AppointmentAnalyticsResponse,
    RevenueAnalyticsResponse, AssessmentAnalyticsResponse, PractitionerAnalyticsResponse,
    PractitionerAnalyticsItem, HomeDashboardSummary, DateRange, MonthlyCount,
    AppointmentTrendItem, MonthlyRevenue, PaymentMethodStats, AssessmentTypeStats,
    AssessmentTrendItem, AnalyticsExportRequest,
)


@app.get("/api/analytics/overview", response_model=PracticeOverviewResponse)
async def get_practice_overview(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get practice overview metrics."""
    is_admin = prac.role == "owner"
    result = await analytics_service.get_practice_overview(
        db=db,
        practitioner_id=prac.id,
        is_admin=is_admin,
    )
    return PracticeOverviewResponse(**result)


@app.get("/api/analytics/patients", response_model=PatientAnalyticsResponse)
async def get_patient_analytics(
    period: str = Query(default="this_year"),
    start_date: date = Query(default=None),
    end_date: date = Query(default=None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get patient analytics with trends."""
    is_admin = prac.role == "owner"
    result = await analytics_service.get_patient_analytics(
        db=db,
        practitioner_id=prac.id,
        is_admin=is_admin,
        period=period,
        custom_start=start_date,
        custom_end=end_date,
    )
    
    return PatientAnalyticsResponse(
        active_patients=result["active_patients"],
        inactive_patients=result["inactive_patients"],
        new_patients_by_month=[MonthlyCount(**m) for m in result["new_patients_by_month"]],
        patients_at_period_start=result["patients_at_period_start"],
        avg_sessions_per_patient=result["avg_sessions_per_patient"],
        retention_rate=result["retention_rate"],
        period=DateRange(
            start=date.fromisoformat(result["period"]["start"]),
            end=date.fromisoformat(result["period"]["end"]),
        ),
    )


@app.get("/api/analytics/appointments", response_model=AppointmentAnalyticsResponse)
async def get_appointment_analytics(
    period: str = Query(default="this_month"),
    start_date: date = Query(default=None),
    end_date: date = Query(default=None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get appointment analytics."""
    is_admin = prac.role == "owner"
    result = await analytics_service.get_appointment_analytics(
        db=db,
        practitioner_id=prac.id,
        is_admin=is_admin,
        period=period,
        custom_start=start_date,
        custom_end=end_date,
    )
    
    return AppointmentAnalyticsResponse(
        total=result["total"],
        completed=result["completed"],
        cancelled=result["cancelled"],
        rescheduled=result["rescheduled"],
        no_shows=result["no_shows"],
        scheduled=result["scheduled"],
        attendance_rate=result["attendance_rate"],
        avg_duration_minutes=result["avg_duration_minutes"],
        appointments_by_day=result["appointments_by_day"],
        appointments_by_type=result["appointments_by_type"],
        appointment_trend=[AppointmentTrendItem(**t) for t in result["appointment_trend"]],
        period=DateRange(
            start=date.fromisoformat(result["period"]["start"]),
            end=date.fromisoformat(result["period"]["end"]),
        ),
    )


@app.get("/api/analytics/revenue", response_model=RevenueAnalyticsResponse)
async def get_revenue_analytics(
    period: str = Query(default="this_year"),
    start_date: date = Query(default=None),
    end_date: date = Query(default=None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get revenue analytics."""
    is_admin = prac.role == "owner"
    result = await analytics_service.get_revenue_analytics(
        db=db,
        practitioner_id=prac.id,
        is_admin=is_admin,
        period=period,
        custom_start=start_date,
        custom_end=end_date,
    )
    
    return RevenueAnalyticsResponse(
        total_revenue=result["total_revenue"],
        monthly_revenue=result["monthly_revenue"],
        yearly_revenue=result["yearly_revenue"],
        outstanding_payments=result["outstanding_payments"],
        total_refunds=result["total_refunds"],
        avg_session_fee=result["avg_session_fee"],
        revenue_by_month=[MonthlyRevenue(**m) for m in result["revenue_by_month"]],
        revenue_by_method={k: PaymentMethodStats(**v) for k, v in result["revenue_by_method"].items()},
        currency=result["currency"],
        period=DateRange(
            start=date.fromisoformat(result["period"]["start"]),
            end=date.fromisoformat(result["period"]["end"]),
        ),
    )


@app.get("/api/analytics/assessments", response_model=AssessmentAnalyticsResponse)
async def get_assessment_analytics(
    period: str = Query(default="this_year"),
    start_date: date = Query(default=None),
    end_date: date = Query(default=None),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get assessment analytics."""
    is_admin = prac.role == "owner"
    result = await analytics_service.get_assessment_analytics(
        db=db,
        practitioner_id=prac.id,
        is_admin=is_admin,
        period=period,
        custom_start=start_date,
        custom_end=end_date,
    )
    
    return AssessmentAnalyticsResponse(
        total_sent=result["total_sent"],
        total_completed=result["total_completed"],
        pending=result["pending"],
        completion_rate=result["completion_rate"],
        assessments_by_type={k: AssessmentTypeStats(**v) for k, v in result["assessments_by_type"].items()},
        assessment_trend=[AssessmentTrendItem(**t) for t in result["assessment_trend"]],
        period=DateRange(
            start=date.fromisoformat(result["period"]["start"]),
            end=date.fromisoformat(result["period"]["end"]),
        ),
    )


@app.get("/api/analytics/practitioners", response_model=PractitionerAnalyticsResponse)
async def get_practitioner_analytics(
    period: str = Query(default="this_month"),
    start_date: date = Query(default=None),
    end_date: date = Query(default=None),
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Get practitioner analytics (admin only)."""
    result = await analytics_service.get_practitioner_analytics(
        db=db,
        period=period,
        custom_start=start_date,
        custom_end=end_date,
    )
    
    start_d, end_d = analytics_service.get_date_range(period, start_date, end_date)
    
    return PractitionerAnalyticsResponse(
        practitioners=[PractitionerAnalyticsItem(**p) for p in result],
        period=DateRange(start=start_d, end=end_d),
    )


@app.get("/api/analytics/home-summary", response_model=HomeDashboardSummary)
async def get_home_dashboard_summary(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get summary metrics for home dashboard widgets."""
    is_admin = prac.role == "owner"
    result = await analytics_service.get_home_dashboard_summary(
        db=db,
        practitioner_id=prac.id,
        is_admin=is_admin,
    )
    return HomeDashboardSummary(**result)


@app.get("/api/analytics/export")
async def export_analytics_report(
    report_type: str = Query(..., description="overview, patients, appointments, revenue, assessments, practitioners"),
    period: str = Query(default="this_month"),
    start_date: date = Query(default=None),
    end_date: date = Query(default=None),
    format: str = Query(default="csv", description="csv, excel"),
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Export analytics report as CSV or Excel."""
    import csv
    
    is_admin = prac.role == "owner"
    
    if report_type == "practitioners" and not is_admin:
        raise HTTPException(403, "Admin access required")
    
    # Get the data based on report type
    if report_type == "overview":
        data = await analytics_service.get_practice_overview(db, prac.id, is_admin)
        rows = [["Metric", "Value"]]
        for key, value in data.items():
            rows.append([key.replace("_", " ").title(), str(value)])
    
    elif report_type == "patients":
        data = await analytics_service.get_patient_analytics(db, prac.id, is_admin, period, start_date, end_date)
        rows = [["Metric", "Value"]]
        rows.append(["Active Patients", data["active_patients"]])
        rows.append(["Inactive Patients", data["inactive_patients"]])
        rows.append(["Avg Sessions Per Patient", data["avg_sessions_per_patient"]])
        rows.append(["Retention Rate", f"{data['retention_rate']}%"])
        rows.append([])
        rows.append(["New Patients by Month"])
        rows.append(["Year", "Month", "Count"])
        for m in data["new_patients_by_month"]:
            rows.append([m["year"], m["month"], m["count"]])
    
    elif report_type == "appointments":
        data = await analytics_service.get_appointment_analytics(db, prac.id, is_admin, period, start_date, end_date)
        rows = [["Metric", "Value"]]
        rows.append(["Total Appointments", data["total"]])
        rows.append(["Completed", data["completed"]])
        rows.append(["Cancelled", data["cancelled"]])
        rows.append(["Rescheduled", data["rescheduled"]])
        rows.append(["No Shows", data["no_shows"]])
        rows.append(["Attendance Rate", f"{data['attendance_rate']}%"])
        rows.append(["Avg Duration (min)", data["avg_duration_minutes"]])
    
    elif report_type == "revenue":
        data = await analytics_service.get_revenue_analytics(db, prac.id, is_admin, period, start_date, end_date)
        rows = [["Metric", "Value"]]
        rows.append(["Total Revenue", f"₹{data['total_revenue'] / 100:,.2f}"])
        rows.append(["Monthly Revenue", f"₹{data['monthly_revenue'] / 100:,.2f}"])
        rows.append(["Yearly Revenue", f"₹{data['yearly_revenue'] / 100:,.2f}"])
        rows.append(["Outstanding Payments", f"₹{data['outstanding_payments'] / 100:,.2f}"])
        rows.append(["Total Refunds", f"₹{data['total_refunds'] / 100:,.2f}"])
        rows.append(["Avg Session Fee", f"₹{data['avg_session_fee'] / 100:,.2f}"])
        rows.append([])
        rows.append(["Revenue by Month"])
        rows.append(["Year", "Month", "Amount", "Count"])
        for m in data["revenue_by_month"]:
            rows.append([m["year"], m["month"], f"₹{m['amount'] / 100:,.2f}", m["count"]])
    
    elif report_type == "assessments":
        data = await analytics_service.get_assessment_analytics(db, prac.id, is_admin, period, start_date, end_date)
        rows = [["Metric", "Value"]]
        rows.append(["Total Sent", data["total_sent"]])
        rows.append(["Total Completed", data["total_completed"]])
        rows.append(["Pending", data["pending"]])
        rows.append(["Completion Rate", f"{data['completion_rate']}%"])
        rows.append([])
        rows.append(["By Assessment Type"])
        rows.append(["Type", "Total", "Completed"])
        for atype, stats in data["assessments_by_type"].items():
            rows.append([atype.upper(), stats["total"], stats["completed"]])
    
    elif report_type == "practitioners":
        data = await analytics_service.get_practitioner_analytics(db, period, start_date, end_date)
        rows = [["Name", "Email", "Patients", "Appointments", "Completed", "Revenue", "Attendance Rate", "Cancellation Rate"]]
        for p in data:
            rows.append([
                p["name"],
                p["email"],
                p["patients_managed"],
                p["appointments_total"],
                p["appointments_completed"],
                f"₹{p['revenue'] / 100:,.2f}",
                f"{p['attendance_rate']}%",
                f"{p['cancellation_rate']}%",
            ])
    
    else:
        raise HTTPException(400, f"Invalid report type: {report_type}")
    
    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerows(rows)
    content = output.getvalue()
    
    if format == "excel":
        # For Excel, we'll just use CSV with .xlsx extension (basic)
        # A proper implementation would use openpyxl
        filename = f"analytics_{report_type}_{period}.xlsx"
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        filename = f"analytics_{report_type}_{period}.csv"
        media_type = "text/csv"
    
    return StreamingResponse(
        io.BytesIO(content.encode('utf-8')),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ═════════════════════════════════════════════════════════════════════════════════
#  PHASE 7 — SETTINGS & CONFIGURATION
# ═════════════════════════════════════════════════════════════════════════════════

import settings_service
from schemas import (
    ClinicSettingsUpdate, ClinicSettingsResponse,
    AppointmentConfigUpdate, AppointmentConfigResponse, HolidayItem,
    EmailConfigUpdate, EmailConfigResponse, TestEmailRequest, TestEmailResponse,
    PaymentGatewayConfigUpdate, PaymentGatewayConfigResponse, TestPaymentGatewayResponse,
    BrandingUpdate, BrandingResponse,
    SecuritySettingsUpdate, SecuritySettingsResponse,
    RoleCreate, RoleUpdate, RoleResponse, RoleListItem, PermissionItem,
    AuditLogResponse, AuditLogFilters, AuditLogListResponse,
    SystemPreferencesUpdate, SystemPreferencesResponse,
    CalendarIntegrationUpdate, CalendarIntegrationResponse, GoogleCalendarConnectRequest, CalendarSyncResponse,
    GoogleAuthUrlResponse,
    NotificationPreferencesUpdate, NotificationPreferencesResponse,
    ActiveSessionResponse, ActiveSessionsListResponse,
    DataExportRequest, DataExportResponse, DataImportResponse,
    SettingsSectionItem, SettingsNavigation,
)


# ─── Settings Navigation ───────────────────────────────────────────────────────

@app.get("/api/settings/navigation")
async def get_settings_navigation(
    prac=Depends(get_current_practitioner),
):
    """Get settings navigation based on user role."""
    if prac.role == "owner":
        sections = settings_service.get_admin_settings_sections()
    else:
        sections = settings_service.get_practitioner_settings_sections()
    
    return SettingsNavigation(
        role=prac.role,
        sections=[SettingsSectionItem(**s) for s in sections]
    )


# ─── Clinic Settings (Admin Only) ──────────────────────────────────────────────

@app.get("/api/settings/clinic", response_model=ClinicSettingsResponse)
async def get_clinic_settings(
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Get clinic settings (admin only)."""
    settings = await settings_service.get_clinic_settings(db)
    return ClinicSettingsResponse(
        id=settings.id,
        clinic_name=settings.clinic_name,
        clinic_description=settings.clinic_description,
        clinic_email=settings.clinic_email,
        clinic_phone=settings.clinic_phone,
        clinic_website=settings.clinic_website,
        clinic_address=settings.clinic_address,
        instagram_handle=settings.instagram_handle,
        timezone=settings.timezone,
        currency=settings.currency,
        date_format=settings.date_format,
        time_format=settings.time_format,
        logo_url=f"/api/uploads/{settings.logo_path}" if settings.logo_path else None,
        created_at=settings.created_at,
        updated_at=settings.updated_at,
    )


@app.put("/api/settings/clinic", response_model=ClinicSettingsResponse)
async def update_clinic_settings(
    data: ClinicSettingsUpdate,
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Update clinic settings (admin only)."""
    settings = await settings_service.update_clinic_settings(db, data.model_dump(exclude_none=True))
    
    await settings_service.create_audit_log(
        db=db,
        action="settings_update",
        description="Updated clinic settings",
        practitioner=prac,
        resource_type="clinic_settings",
        resource_id=settings.id,
    )
    
    return ClinicSettingsResponse(
        id=settings.id,
        clinic_name=settings.clinic_name,
        clinic_description=settings.clinic_description,
        clinic_email=settings.clinic_email,
        clinic_phone=settings.clinic_phone,
        clinic_website=settings.clinic_website,
        clinic_address=settings.clinic_address,
        instagram_handle=settings.instagram_handle,
        timezone=settings.timezone,
        currency=settings.currency,
        date_format=settings.date_format,
        time_format=settings.time_format,
        logo_url=f"/api/uploads/{settings.logo_path}" if settings.logo_path else None,
        created_at=settings.created_at,
        updated_at=settings.updated_at,
    )


@app.post("/api/settings/clinic/logo")
async def upload_clinic_logo(
    file: UploadFile = File(...),
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Upload clinic logo."""
    if file.content_type not in ["image/jpeg", "image/png", "image/jpg", "image/svg+xml"]:
        raise HTTPException(400, "Invalid file type. Use JPG, PNG, or SVG.")
    
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "File too large. Max 5MB.")
    
    path = await storage.save_file(content, file.filename, "branding")
    settings = await settings_service.get_clinic_settings(db)
    settings.logo_path = path
    await db.commit()
    
    return {"success": True, "logo_url": f"/api/uploads/{path}"}


# ─── Appointment Configuration (Admin Only) ────────────────────────────────────

@app.get("/api/settings/appointments", response_model=AppointmentConfigResponse)
async def get_appointment_config(
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Get appointment configuration (admin only)."""
    config = await settings_service.get_appointment_config(db)
    return AppointmentConfigResponse(
        id=config.id,
        default_duration_minutes=config.default_duration_minutes,
        available_durations=config.available_durations or [30, 45, 50, 60, 90],
        buffer_time_minutes=config.buffer_time_minutes,
        default_working_days=config.default_working_days or [0, 1, 2, 3, 4],
        default_work_start_time=config.default_work_start_time,
        default_work_end_time=config.default_work_end_time,
        default_break_start_time=config.default_break_start_time,
        default_break_end_time=config.default_break_end_time,
        holidays=[HolidayItem(**h) for h in (config.holidays or [])],
        max_advance_booking_days=config.max_advance_booking_days,
        min_booking_notice_hours=config.min_booking_notice_hours,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@app.put("/api/settings/appointments", response_model=AppointmentConfigResponse)
async def update_appointment_config(
    data: AppointmentConfigUpdate,
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Update appointment configuration (admin only)."""
    update_data = data.model_dump(exclude_none=True)
    if "holidays" in update_data:
        update_data["holidays"] = [h.model_dump() for h in update_data["holidays"]]
    
    config = await settings_service.update_appointment_config(db, update_data)
    
    await settings_service.create_audit_log(
        db=db,
        action="settings_update",
        description="Updated appointment configuration",
        practitioner=prac,
        resource_type="appointment_config",
        resource_id=config.id,
    )
    
    return AppointmentConfigResponse(
        id=config.id,
        default_duration_minutes=config.default_duration_minutes,
        available_durations=config.available_durations or [30, 45, 50, 60, 90],
        buffer_time_minutes=config.buffer_time_minutes,
        default_working_days=config.default_working_days or [0, 1, 2, 3, 4],
        default_work_start_time=config.default_work_start_time,
        default_work_end_time=config.default_work_end_time,
        default_break_start_time=config.default_break_start_time,
        default_break_end_time=config.default_break_end_time,
        holidays=[HolidayItem(**h) for h in (config.holidays or [])],
        max_advance_booking_days=config.max_advance_booking_days,
        min_booking_notice_hours=config.min_booking_notice_hours,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


# ─── Email Configuration (Admin Only) ──────────────────────────────────────────

@app.get("/api/settings/email", response_model=EmailConfigResponse)
async def get_email_config(
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Get email configuration (admin only)."""
    config = await settings_service.get_email_config(db)
    return EmailConfigResponse(
        id=config.id,
        provider=config.provider,
        is_enabled=config.is_enabled,
        sender_name=config.sender_name,
        sender_email=config.sender_email,
        reply_to_email=config.reply_to_email,
        smtp_host=config.smtp_host,
        smtp_port=config.smtp_port,
        smtp_username=config.smtp_username,
        smtp_use_tls=config.smtp_use_tls,
        has_api_key=bool(config.api_key),
        last_test_at=config.last_test_at,
        last_test_status=config.last_test_status,
        last_test_error=config.last_test_error,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@app.put("/api/settings/email", response_model=EmailConfigResponse)
async def update_email_config(
    data: EmailConfigUpdate,
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Update email configuration (admin only)."""
    config = await settings_service.update_email_config(db, data.model_dump(exclude_none=True))
    
    await settings_service.create_audit_log(
        db=db,
        action="settings_update",
        description="Updated email configuration",
        practitioner=prac,
        resource_type="email_config",
        resource_id=config.id,
    )
    
    return EmailConfigResponse(
        id=config.id,
        provider=config.provider,
        is_enabled=config.is_enabled,
        sender_name=config.sender_name,
        sender_email=config.sender_email,
        reply_to_email=config.reply_to_email,
        smtp_host=config.smtp_host,
        smtp_port=config.smtp_port,
        smtp_username=config.smtp_username,
        smtp_use_tls=config.smtp_use_tls,
        has_api_key=bool(config.api_key),
        last_test_at=config.last_test_at,
        last_test_status=config.last_test_status,
        last_test_error=config.last_test_error,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@app.post("/api/settings/email/test", response_model=TestEmailResponse)
async def test_email_config(
    data: TestEmailRequest,
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Test email configuration by sending a test email."""
    result = await settings_service.test_email_config(db, data.recipient_email)
    return TestEmailResponse(**result)


# ─── Payment Gateway Configuration (Admin Only) ────────────────────────────────

@app.get("/api/settings/payment-gateway", response_model=PaymentGatewayConfigResponse)
async def get_payment_gateway_config(
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Get payment gateway configuration (admin only)."""
    config = await settings_service.get_payment_gateway_config(db)
    return PaymentGatewayConfigResponse(
        id=config.id,
        provider=config.provider,
        is_enabled=config.is_enabled,
        is_test_mode=config.is_test_mode,
        has_api_key=bool(config.api_key),
        has_api_secret=bool(config.api_secret),
        has_webhook_secret=bool(config.webhook_secret),
        currency=config.currency,
        tax_enabled=config.tax_enabled,
        default_tax_percentage=config.default_tax_percentage,
        invoice_prefix=config.invoice_prefix,
        receipt_prefix=config.receipt_prefix,
        last_test_at=config.last_test_at,
        last_test_status=config.last_test_status,
        last_test_error=config.last_test_error,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@app.put("/api/settings/payment-gateway", response_model=PaymentGatewayConfigResponse)
async def update_payment_gateway_config(
    data: PaymentGatewayConfigUpdate,
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Update payment gateway configuration (admin only)."""
    config = await settings_service.update_payment_gateway_config(db, data.model_dump(exclude_none=True))
    
    await settings_service.create_audit_log(
        db=db,
        action="settings_update",
        description="Updated payment gateway configuration",
        practitioner=prac,
        resource_type="payment_gateway_config",
        resource_id=config.id,
    )
    
    return PaymentGatewayConfigResponse(
        id=config.id,
        provider=config.provider,
        is_enabled=config.is_enabled,
        is_test_mode=config.is_test_mode,
        has_api_key=bool(config.api_key),
        has_api_secret=bool(config.api_secret),
        has_webhook_secret=bool(config.webhook_secret),
        currency=config.currency,
        tax_enabled=config.tax_enabled,
        default_tax_percentage=config.default_tax_percentage,
        invoice_prefix=config.invoice_prefix,
        receipt_prefix=config.receipt_prefix,
        last_test_at=config.last_test_at,
        last_test_status=config.last_test_status,
        last_test_error=config.last_test_error,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@app.post("/api/settings/payment-gateway/test", response_model=TestPaymentGatewayResponse)
async def test_payment_gateway(
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Test payment gateway connection."""
    result = await settings_service.test_payment_gateway(db)
    return TestPaymentGatewayResponse(**result)


# ─── Branding (Admin Only) ─────────────────────────────────────────────────────

@app.get("/api/settings/branding", response_model=BrandingResponse)
async def get_branding(
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Get branding settings (admin only)."""
    branding = await settings_service.get_branding(db)
    return BrandingResponse(
        id=branding.id,
        platform_name=branding.platform_name,
        logo_url=f"/api/uploads/{branding.logo_path}" if branding.logo_path else None,
        favicon_url=f"/api/uploads/{branding.favicon_path}" if branding.favicon_path else None,
        email_logo_url=f"/api/uploads/{branding.email_logo_path}" if branding.email_logo_path else None,
        footer_text=branding.footer_text,
        created_at=branding.created_at,
        updated_at=branding.updated_at,
    )


@app.put("/api/settings/branding", response_model=BrandingResponse)
async def update_branding(
    data: BrandingUpdate,
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Update branding settings (admin only)."""
    branding = await settings_service.update_branding(db, data.model_dump(exclude_none=True))
    
    await settings_service.create_audit_log(
        db=db,
        action="settings_update",
        description="Updated branding settings",
        practitioner=prac,
        resource_type="branding",
        resource_id=branding.id,
    )
    
    return BrandingResponse(
        id=branding.id,
        platform_name=branding.platform_name,
        logo_url=f"/api/uploads/{branding.logo_path}" if branding.logo_path else None,
        favicon_url=f"/api/uploads/{branding.favicon_path}" if branding.favicon_path else None,
        email_logo_url=f"/api/uploads/{branding.email_logo_path}" if branding.email_logo_path else None,
        footer_text=branding.footer_text,
        created_at=branding.created_at,
        updated_at=branding.updated_at,
    )


@app.post("/api/settings/branding/logo")
async def upload_branding_logo(
    file: UploadFile = File(...),
    logo_type: str = Query(default="logo", description="logo, favicon, or email_logo"),
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Upload branding logo."""
    valid_types = ["image/jpeg", "image/png", "image/jpg", "image/svg+xml", "image/x-icon"]
    if file.content_type not in valid_types:
        raise HTTPException(400, "Invalid file type.")
    
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(400, "File too large. Max 2MB.")
    
    path = await storage.save_file(content, file.filename, "branding")
    branding = await settings_service.get_branding(db)
    
    if logo_type == "logo":
        branding.logo_path = path
    elif logo_type == "favicon":
        branding.favicon_path = path
    elif logo_type == "email_logo":
        branding.email_logo_path = path
    
    await db.commit()
    
    return {"success": True, "url": f"/api/uploads/{path}"}


# ─── Security Settings (Admin Only) ────────────────────────────────────────────

@app.get("/api/settings/security", response_model=SecuritySettingsResponse)
async def get_security_settings(
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Get security settings (admin only)."""
    settings = await settings_service.get_security_settings(db)
    return SecuritySettingsResponse(
        id=settings.id,
        min_password_length=settings.min_password_length,
        require_uppercase=settings.require_uppercase,
        require_lowercase=settings.require_lowercase,
        require_numbers=settings.require_numbers,
        require_special_chars=settings.require_special_chars,
        password_expiry_days=settings.password_expiry_days,
        session_timeout_minutes=settings.session_timeout_minutes,
        max_login_attempts=settings.max_login_attempts,
        lockout_duration_minutes=settings.lockout_duration_minutes,
        two_factor_enabled=settings.two_factor_enabled,
        two_factor_required=settings.two_factor_required,
        created_at=settings.created_at,
        updated_at=settings.updated_at,
    )


@app.put("/api/settings/security", response_model=SecuritySettingsResponse)
async def update_security_settings(
    data: SecuritySettingsUpdate,
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Update security settings (admin only)."""
    settings = await settings_service.update_security_settings(db, data.model_dump(exclude_none=True))
    
    await settings_service.create_audit_log(
        db=db,
        action="settings_update",
        description="Updated security settings",
        practitioner=prac,
        resource_type="security_settings",
        resource_id=settings.id,
    )
    
    return SecuritySettingsResponse(
        id=settings.id,
        min_password_length=settings.min_password_length,
        require_uppercase=settings.require_uppercase,
        require_lowercase=settings.require_lowercase,
        require_numbers=settings.require_numbers,
        require_special_chars=settings.require_special_chars,
        password_expiry_days=settings.password_expiry_days,
        session_timeout_minutes=settings.session_timeout_minutes,
        max_login_attempts=settings.max_login_attempts,
        lockout_duration_minutes=settings.lockout_duration_minutes,
        two_factor_enabled=settings.two_factor_enabled,
        two_factor_required=settings.two_factor_required,
        created_at=settings.created_at,
        updated_at=settings.updated_at,
    )


# ─── Roles & Permissions (Admin Only) ──────────────────────────────────────────

@app.get("/api/settings/roles", response_model=list[RoleListItem])
async def get_roles(
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Get all roles (admin only)."""
    roles = await settings_service.get_all_roles(db)
    return [
        RoleListItem(
            id=r.id,
            name=r.name,
            display_name=r.display_name,
            description=r.description,
            is_system=r.is_system,
            is_active=r.is_active,
            permissions_count=len(r.permissions) if hasattr(r, 'permissions') else 0,
            created_at=r.created_at,
        )
        for r in roles
    ]


@app.get("/api/settings/roles/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: str,
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific role with permissions (admin only)."""
    role = await settings_service.get_role_by_id(db, role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    
    return RoleResponse(
        id=role.id,
        name=role.name,
        display_name=role.display_name,
        description=role.description,
        is_system=role.is_system,
        is_active=role.is_active,
        permissions=[PermissionItem(resource=p.resource, action=p.action) for p in role.permissions],
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


@app.post("/api/settings/roles", response_model=RoleResponse)
async def create_role(
    data: RoleCreate,
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Create a new role (admin only)."""
    existing = await settings_service.get_role_by_name(db, data.name)
    if existing:
        raise HTTPException(400, "Role with this name already exists")
    
    role_data = data.model_dump()
    role_data["permissions"] = [p.model_dump() for p in data.permissions]
    
    role = await settings_service.create_role(db, role_data)
    
    await settings_service.create_audit_log(
        db=db,
        action="role_update",
        description=f"Created role: {role.display_name}",
        practitioner=prac,
        resource_type="role",
        resource_id=role.id,
    )
    
    role = await settings_service.get_role_by_id(db, role.id)
    
    return RoleResponse(
        id=role.id,
        name=role.name,
        display_name=role.display_name,
        description=role.description,
        is_system=role.is_system,
        is_active=role.is_active,
        permissions=[PermissionItem(resource=p.resource, action=p.action) for p in role.permissions],
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


@app.put("/api/settings/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: str,
    data: RoleUpdate,
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Update a role (admin only). System roles cannot be modified."""
    role_data = data.model_dump(exclude_none=True)
    if "permissions" in role_data and data.permissions:
        role_data["permissions"] = [p.model_dump() for p in data.permissions]
    
    role = await settings_service.update_role(db, role_id, role_data)
    if not role:
        raise HTTPException(400, "Role not found or cannot be modified")
    
    await settings_service.create_audit_log(
        db=db,
        action="role_update",
        description=f"Updated role: {role.display_name}",
        practitioner=prac,
        resource_type="role",
        resource_id=role.id,
    )
    
    role = await settings_service.get_role_by_id(db, role.id)
    
    return RoleResponse(
        id=role.id,
        name=role.name,
        display_name=role.display_name,
        description=role.description,
        is_system=role.is_system,
        is_active=role.is_active,
        permissions=[PermissionItem(resource=p.resource, action=p.action) for p in role.permissions],
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


@app.delete("/api/settings/roles/{role_id}")
async def delete_role(
    role_id: str,
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Delete a role (admin only). System roles cannot be deleted."""
    role = await settings_service.get_role_by_id(db, role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    
    success = await settings_service.delete_role(db, role_id)
    if not success:
        raise HTTPException(400, "Cannot delete system role")
    
    await settings_service.create_audit_log(
        db=db,
        action="role_update",
        description=f"Deleted role: {role.display_name}",
        practitioner=prac,
        resource_type="role",
        resource_id=role_id,
    )
    
    return {"success": True, "message": "Role deleted"}


# ─── Audit Logs (Admin Only) ───────────────────────────────────────────────────

@app.get("/api/settings/audit-logs", response_model=AuditLogListResponse)
async def get_audit_logs(
    action: str = Query(default=None),
    resource_type: str = Query(default=None),
    practitioner_id: str = Query(default=None),
    start_date: date = Query(default=None),
    end_date: date = Query(default=None),
    search: str = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Get audit logs (admin only)."""
    filters = {
        "action": action,
        "resource_type": resource_type,
        "practitioner_id": practitioner_id,
        "start_date": start_date,
        "end_date": end_date,
        "search": search,
    }
    
    logs, total = await settings_service.get_audit_logs(db, filters, page, page_size)
    
    return AuditLogListResponse(
        logs=[
            AuditLogResponse(
                id=log.id,
                practitioner_id=log.practitioner_id,
                practitioner_name=log.practitioner_name,
                practitioner_email=log.practitioner_email,
                action=log.action,
                resource_type=log.resource_type,
                resource_id=log.resource_id,
                description=log.description,
                old_values=log.old_values,
                new_values=log.new_values,
                ip_address=log.ip_address,
                user_agent=log.user_agent,
                created_at=log.created_at,
            )
            for log in logs
        ],
        total_count=total,
        page=page,
        page_size=page_size,
    )


# ─── System Preferences (Admin Only) ───────────────────────────────────────────

@app.get("/api/settings/system", response_model=SystemPreferencesResponse)
async def get_system_preferences(
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Get system preferences (admin only)."""
    prefs = await settings_service.get_system_preferences(db)
    return SystemPreferencesResponse(
        id=prefs.id,
        default_language=prefs.default_language,
        default_timezone=prefs.default_timezone,
        default_date_format=prefs.default_date_format,
        default_time_format=prefs.default_time_format,
        default_currency=prefs.default_currency,
        number_format=prefs.number_format,
        audit_log_retention_days=prefs.audit_log_retention_days,
        notification_log_retention_days=prefs.notification_log_retention_days,
        created_at=prefs.created_at,
        updated_at=prefs.updated_at,
    )


@app.put("/api/settings/system", response_model=SystemPreferencesResponse)
async def update_system_preferences(
    data: SystemPreferencesUpdate,
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Update system preferences (admin only)."""
    prefs = await settings_service.update_system_preferences(db, data.model_dump(exclude_none=True))
    
    await settings_service.create_audit_log(
        db=db,
        action="settings_update",
        description="Updated system preferences",
        practitioner=prac,
        resource_type="system_preferences",
        resource_id=prefs.id,
    )
    
    return SystemPreferencesResponse(
        id=prefs.id,
        default_language=prefs.default_language,
        default_timezone=prefs.default_timezone,
        default_date_format=prefs.default_date_format,
        default_time_format=prefs.default_time_format,
        default_currency=prefs.default_currency,
        number_format=prefs.number_format,
        audit_log_retention_days=prefs.audit_log_retention_days,
        notification_log_retention_days=prefs.notification_log_retention_days,
        created_at=prefs.created_at,
        updated_at=prefs.updated_at,
    )


# ─── Calendar Integration (Practitioner) ───────────────────────────────────────

@app.get("/api/settings/calendar-integration", response_model=CalendarIntegrationResponse)
async def get_calendar_integration(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get calendar integration settings for current practitioner."""
    integration = await settings_service.get_calendar_integration(db, prac.id)
    return CalendarIntegrationResponse(
        id=integration.id,
        practitioner_id=integration.practitioner_id,
        google_connected=integration.google_connected,
        google_calendar_id=integration.google_calendar_id,
        google_sync_direction=integration.google_sync_direction,
        google_last_sync_at=integration.google_last_sync_at,
        google_sync_error=integration.google_sync_error,
        outlook_connected=integration.outlook_connected,
        apple_connected=integration.apple_connected,
        created_at=integration.created_at,
        updated_at=integration.updated_at,
    )


@app.put("/api/settings/calendar-integration", response_model=CalendarIntegrationResponse)
async def update_calendar_integration(
    data: CalendarIntegrationUpdate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Update calendar integration settings."""
    integration = await settings_service.update_calendar_integration(db, prac.id, data.model_dump(exclude_none=True))
    return CalendarIntegrationResponse(
        id=integration.id,
        practitioner_id=integration.practitioner_id,
        google_connected=integration.google_connected,
        google_calendar_id=integration.google_calendar_id,
        google_sync_direction=integration.google_sync_direction,
        google_last_sync_at=integration.google_last_sync_at,
        google_sync_error=integration.google_sync_error,
        outlook_connected=integration.outlook_connected,
        apple_connected=integration.apple_connected,
        created_at=integration.created_at,
        updated_at=integration.updated_at,
    )


@app.get("/api/settings/calendar-integration/google/auth-url", response_model=GoogleAuthUrlResponse)
async def get_google_auth_url(
    redirect_uri: str,
    prac=Depends(get_current_practitioner),
):
    """Build the Google OAuth consent URL. Powers both the Google Calendar and
    Google Meet 'Connect' buttons — Meet links are created via the Calendar API,
    so both share one OAuth grant."""
    try:
        auth_url = settings_service.build_google_auth_url(redirect_uri)
    except settings_service.GoogleOAuthNotConfigured as e:
        raise HTTPException(status_code=400, detail=str(e))
    return GoogleAuthUrlResponse(auth_url=auth_url)


@app.post("/api/settings/calendar-integration/google/connect")
async def connect_google_calendar(
    data: GoogleCalendarConnectRequest,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Connect Google Calendar using OAuth authorization code."""
    result = await settings_service.connect_google_calendar(
        db, prac.id, data.authorization_code, data.redirect_uri
    )
    
    if result["success"]:
        await settings_service.create_audit_log(
            db=db,
            action="integration_connect",
            description="Connected Google Calendar",
            practitioner=prac,
            resource_type="calendar_integration",
        )
    
    return result


@app.post("/api/settings/calendar-integration/google/disconnect")
async def disconnect_google_calendar(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect Google Calendar."""
    result = await settings_service.disconnect_google_calendar(db, prac.id)
    
    await settings_service.create_audit_log(
        db=db,
        action="integration_disconnect",
        description="Disconnected Google Calendar",
        practitioner=prac,
        resource_type="calendar_integration",
    )
    
    return result


@app.post("/api/settings/calendar-integration/sync", response_model=CalendarSyncResponse)
async def sync_calendar(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Manually sync calendar events."""
    result = await settings_service.sync_calendar(db, prac.id)
    return CalendarSyncResponse(**result)


# ─── Notification Preferences (Practitioner) ───────────────────────────────────

@app.get("/api/settings/notification-preferences", response_model=NotificationPreferencesResponse)
async def get_notification_preferences(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get notification preferences for current practitioner."""
    prefs = await settings_service.get_notification_preferences(db, prac.id)
    return NotificationPreferencesResponse(
        id=prefs.id,
        practitioner_id=prefs.practitioner_id,
        email_new_booking=prefs.email_new_booking,
        email_booking_cancelled=prefs.email_booking_cancelled,
        email_booking_rescheduled=prefs.email_booking_rescheduled,
        email_payment_received=prefs.email_payment_received,
        email_daily_summary=prefs.email_daily_summary,
        inapp_new_booking=prefs.inapp_new_booking,
        inapp_booking_cancelled=prefs.inapp_booking_cancelled,
        inapp_booking_rescheduled=prefs.inapp_booking_rescheduled,
        inapp_payment_received=prefs.inapp_payment_received,
        inapp_reminder_upcoming=prefs.inapp_reminder_upcoming,
        created_at=prefs.created_at,
        updated_at=prefs.updated_at,
    )


@app.put("/api/settings/notification-preferences", response_model=NotificationPreferencesResponse)
async def update_notification_preferences(
    data: NotificationPreferencesUpdate,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Update notification preferences."""
    prefs = await settings_service.update_notification_preferences(db, prac.id, data.model_dump(exclude_none=True))
    return NotificationPreferencesResponse(
        id=prefs.id,
        practitioner_id=prefs.practitioner_id,
        email_new_booking=prefs.email_new_booking,
        email_booking_cancelled=prefs.email_booking_cancelled,
        email_booking_rescheduled=prefs.email_booking_rescheduled,
        email_payment_received=prefs.email_payment_received,
        email_daily_summary=prefs.email_daily_summary,
        inapp_new_booking=prefs.inapp_new_booking,
        inapp_booking_cancelled=prefs.inapp_booking_cancelled,
        inapp_booking_rescheduled=prefs.inapp_booking_rescheduled,
        inapp_payment_received=prefs.inapp_payment_received,
        inapp_reminder_upcoming=prefs.inapp_reminder_upcoming,
        created_at=prefs.created_at,
        updated_at=prefs.updated_at,
    )


# ─── Active Sessions (Practitioner Security) ───────────────────────────────────

@app.get("/api/settings/sessions", response_model=ActiveSessionsListResponse)
async def get_active_sessions(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Get active sessions for current practitioner."""
    sessions = await settings_service.get_active_sessions(db, prac.id)
    return ActiveSessionsListResponse(
        sessions=[
            ActiveSessionResponse(
                id=s.id,
                device_info=s.device_info,
                ip_address=s.ip_address,
                location=s.location,
                is_current=s.is_current,
                created_at=s.created_at,
                last_active_at=s.last_active_at,
            )
            for s in sessions
        ],
        total_count=len(sessions),
    )


@app.delete("/api/settings/sessions/{session_id}")
async def terminate_session(
    session_id: str,
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Terminate a specific session."""
    success = await settings_service.terminate_session(db, prac.id, session_id)
    if not success:
        raise HTTPException(404, "Session not found")
    
    await settings_service.create_audit_log(
        db=db,
        action="logout",
        description="Terminated session",
        practitioner=prac,
        resource_type="session",
        resource_id=session_id,
    )
    
    return {"success": True, "message": "Session terminated"}


@app.post("/api/settings/sessions/logout-all")
async def logout_all_other_sessions(
    prac=Depends(get_current_practitioner),
    db: AsyncSession = Depends(get_db),
):
    """Logout all other sessions except current."""
    # Get current session (would need to pass through middleware)
    # For now, we'll log out all sessions
    sessions = await settings_service.get_active_sessions(db, prac.id)
    current_session = next((s for s in sessions if s.is_current), None)
    current_session_id = current_session.id if current_session else ""
    
    count = await settings_service.terminate_other_sessions(db, prac.id, current_session_id)
    
    await settings_service.create_audit_log(
        db=db,
        action="logout",
        description=f"Logged out {count} other sessions",
        practitioner=prac,
    )
    
    return {"success": True, "message": f"Logged out {count} other sessions"}


# ─── Data Management (Admin Only) ──────────────────────────────────────────────

@app.post("/api/settings/data/export", response_model=DataExportResponse)
async def export_data(
    data: DataExportRequest,
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Export platform data (admin only)."""
    # Placeholder - in production would generate actual export
    await settings_service.create_audit_log(
        db=db,
        action="settings_update",
        description=f"Exported {data.export_type} data",
        practitioner=prac,
    )
    
    return DataExportResponse(
        success=True,
        message=f"Export of {data.export_type} data initiated",
        file_name=f"export_{data.export_type}_{datetime.now().strftime('%Y%m%d')}.{data.format}",
    )


@app.post("/api/settings/data/import", response_model=DataImportResponse)
async def import_data(
    file: UploadFile = File(...),
    import_type: str = Query(..., description="patients, appointments"),
    prac=Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Import data from file (admin only)."""
    # Placeholder - in production would process actual import
    await settings_service.create_audit_log(
        db=db,
        action="settings_update",
        description=f"Imported {import_type} data from {file.filename}",
        practitioner=prac,
    )
    
    return DataImportResponse(
        success=True,
        records_imported=0,
        records_failed=0,
        errors=[],
        message=f"Import of {import_type} data initiated",
    )


# ═════════════════════════════════════════════════════════════════════════════════
#  STATIC FILES
# ═════════════════════════════════════════════════════════════════════════════════

@app.get("/api/files/{file_path:path}")
async def serve_file(
    file_path: str,
    token: str = Query(None),
    prac=Depends(get_current_practitioner),
):
    """Serve static files from uploads directory (authenticated)."""
    import os
    
    full_path = os.path.join("uploads", file_path)
    
    if not os.path.exists(full_path):
        raise HTTPException(404, "File not found")
    
    if ".." in file_path or file_path.startswith("/"):
        raise HTTPException(403, "Invalid file path")
    
    return FileResponse(full_path)


@app.get("/api/uploads/{file_path:path}")
async def serve_upload(file_path: str):
    """Serve public uploads (branding, logos)."""
    import os
    
    full_path = os.path.join("uploads", file_path)
    
    if not os.path.exists(full_path):
        raise HTTPException(404, "File not found")
    
    if ".." in file_path or file_path.startswith("/"):
        raise HTTPException(403, "Invalid file path")
    
    allowed_prefixes = ["branding/", "clinic/", "profiles/"]
    if not any(file_path.startswith(prefix) for prefix in allowed_prefixes):
        raise HTTPException(403, "Access denied")
    
    return FileResponse(full_path)


# ═════════════════════════════════════════════════════════════════════════════════
#  SCORING DATA — one-time upload of the T-score workbooks onto a deploy volume
#  (they're copyrighted and intentionally excluded from git; see scoring.py's
#  SCORING_DATA_DIR). Owner-only. Safe to leave in place after seeding — it can
#  only overwrite these four known filenames, nowhere else.
# ═════════════════════════════════════════════════════════════════════════════════

SCORING_WORKBOOK_FILENAMES = {
    "T-score MMPI-2.xlsx",
    "Subscale T1 score.xlsx",
    "Si Subscale T-conversion.xlsx",
    "Supplementary scales T score.xlsx",
    "MMPI - 2 - Questionnaire.xlsx",  # question text, read once by seed.py --xlsx
}

@app.post("/api/admin/scoring-data")
async def upload_scoring_workbook(
    file: UploadFile = File(...),
    owner=Depends(require_owner),
):
    if file.filename not in SCORING_WORKBOOK_FILENAMES:
        raise HTTPException(400, f"filename must be one of: {', '.join(sorted(SCORING_WORKBOOK_FILENAMES))}")
    os.makedirs(scoring_module.SCORING_DATA_DIR, exist_ok=True)
    dest = os.path.join(scoring_module.SCORING_DATA_DIR, file.filename)
    with open(dest, "wb") as f:
        f.write(await file.read())
    return {"status": "ok", "saved_to": dest}


# ═════════════════════════════════════════════════════════════════════════════════
#  HEALTH
# ═════════════════════════════════════════════════════════════════════════════════

@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}
