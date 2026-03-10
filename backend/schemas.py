from pydantic import BaseModel, EmailStr
from typing import Optional
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


class ResultResponse(BaseModel):
    session_id: str
    patient_name: str
    patient_dob: date
    patient_age: int
    patient_gender: str
    raw_scores: dict[str, float]
    k_corrected_scores: dict[str, float]
    t_scores: dict[str, float]
    interpretation: Optional[str] = None
    profile_data: list[dict]
