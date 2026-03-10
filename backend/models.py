import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, Text, Date, DateTime, JSON, ForeignKey
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
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    sessions = relationship("Session", back_populates="practitioner")


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
    interpretation = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    session = relationship("Session", back_populates="results")
