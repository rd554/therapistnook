"""
Practice Analytics Service
Provides aggregated analytics data for practitioners and administrators.
"""

from datetime import datetime, date, timedelta, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import select, func, and_, or_, extract, case
from sqlalchemy.ext.asyncio import AsyncSession
from models import (
    Patient, Appointment, Payment, Assessment, Session, 
    Practitioner, TherapySession
)


# ═══════════════════════════════════════════════════════════════════════════════
#  DATE RANGE HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def get_date_range(period: str, custom_start: Optional[date] = None, custom_end: Optional[date] = None) -> tuple[date, date]:
    """
    Get date range based on period filter.
    
    Periods: today, this_week, this_month, last_month, this_quarter, this_year, custom
    """
    today = date.today()
    
    if period == "today":
        return today, today
    
    elif period == "this_week":
        start = today - timedelta(days=today.weekday())
        return start, today
    
    elif period == "this_month":
        start = today.replace(day=1)
        return start, today
    
    elif period == "last_month":
        first_of_this_month = today.replace(day=1)
        last_of_last_month = first_of_this_month - timedelta(days=1)
        first_of_last_month = last_of_last_month.replace(day=1)
        return first_of_last_month, last_of_last_month
    
    elif period == "this_quarter":
        quarter = (today.month - 1) // 3
        start_month = quarter * 3 + 1
        start = today.replace(month=start_month, day=1)
        return start, today
    
    elif period == "this_year":
        start = today.replace(month=1, day=1)
        return start, today
    
    elif period == "custom" and custom_start and custom_end:
        return custom_start, custom_end
    
    else:
        # Default: this month
        start = today.replace(day=1)
        return start, today


def date_to_datetime(d: date, end_of_day: bool = False) -> datetime:
    """Convert date to datetime with timezone."""
    if end_of_day:
        return datetime.combine(d, datetime.max.time()).replace(tzinfo=timezone.utc)
    return datetime.combine(d, datetime.min.time()).replace(tzinfo=timezone.utc)


# ═══════════════════════════════════════════════════════════════════════════════
#  ACTIVE / INACTIVE PATIENT CLASSIFICATION
#
#  A patient counts as "active" while they're still showing up for therapy.
#  "Inactive" means a straight month (30 rolling days) has passed since their
#  last completed appointment with no completed appointment since. Patients
#  who were only just onboarded (no completed appointment yet) get a 30-day
#  grace period from their creation date before being counted inactive.
#  This is independent of Patient.status ("active"/"archived"), which is a
#  separate, manually-set record-keeping flag (see models.py) — archived
#  patients are excluded from the pool entirely rather than counted inactive.
# ═══════════════════════════════════════════════════════════════════════════════

async def get_active_inactive_counts(
    db: AsyncSession,
    practitioner_id: Optional[str] = None,
    is_admin: bool = False,
) -> tuple[int, int]:
    """Count active vs. inactive patients based on 30-day attendance recency."""

    base_filter = []
    if not is_admin and practitioner_id:
        base_filter.append(Patient.practitioner_id == practitioner_id)

    cutoff_date = date.today() - timedelta(days=30)

    last_completed_appt = (
        select(
            Appointment.patient_id,
            func.max(Appointment.date).label("last_appt_date"),
        )
        .where(Appointment.status == "completed")
        .group_by(Appointment.patient_id)
        .subquery()
    )

    patients_query = (
        select(Patient.id, Patient.created_at, last_completed_appt.c.last_appt_date)
        .outerjoin(last_completed_appt, Patient.id == last_completed_appt.c.patient_id)
        .where(and_(Patient.status == "active", *base_filter) if base_filter else Patient.status == "active")
    )
    rows = (await db.execute(patients_query)).all()

    active_count = 0
    inactive_count = 0
    for row in rows:
        if row.last_appt_date is not None:
            reference_date = row.last_appt_date
        elif row.created_at is not None:
            reference_date = row.created_at.date() if hasattr(row.created_at, "date") else row.created_at
        else:
            reference_date = None

        if reference_date is not None and reference_date < cutoff_date:
            inactive_count += 1
        else:
            active_count += 1

    return active_count, inactive_count


# ═══════════════════════════════════════════════════════════════════════════════
#  PRACTICE OVERVIEW
# ═══════════════════════════════════════════════════════════════════════════════

async def get_practice_overview(
    db: AsyncSession,
    practitioner_id: Optional[str] = None,
    is_admin: bool = False
) -> Dict[str, Any]:
    """Get practice overview metrics."""
    
    # Build base filters
    patient_filter = []
    appointment_filter = []
    payment_filter = []
    
    if not is_admin and practitioner_id:
        patient_filter.append(Patient.practitioner_id == practitioner_id)
        appointment_filter.append(Appointment.practitioner_id == practitioner_id)
        payment_filter.append(Payment.practitioner_id == practitioner_id)
    
    # Total patients
    total_patients_query = select(func.count(Patient.id)).where(
        and_(*patient_filter) if patient_filter else True
    )
    total_patients = (await db.execute(total_patients_query)).scalar() or 0
    
    # Active patients (attended within the last 30 days — see get_active_inactive_counts)
    active_patients, _inactive_patients = await get_active_inactive_counts(db, practitioner_id, is_admin)
    
    # New patients this month
    first_of_month = date.today().replace(day=1)
    new_patients_query = select(func.count(Patient.id)).where(
        and_(
            func.date(Patient.created_at) >= first_of_month,
            *patient_filter
        ) if patient_filter else func.date(Patient.created_at) >= first_of_month
    )
    new_patients = (await db.execute(new_patients_query)).scalar() or 0
    
    # Returning patients (patients with more than 1 completed appointment)
    returning_subquery = (
        select(Appointment.patient_id)
        .where(
            and_(
                Appointment.status == "completed",
                *appointment_filter
            ) if appointment_filter else Appointment.status == "completed"
        )
        .group_by(Appointment.patient_id)
        .having(func.count(Appointment.id) > 1)
    )
    returning_patients_query = select(func.count()).select_from(returning_subquery.subquery())
    returning_patients = (await db.execute(returning_patients_query)).scalar() or 0
    
    # Total appointments
    total_appointments_query = select(func.count(Appointment.id)).where(
        and_(*appointment_filter) if appointment_filter else True
    )
    total_appointments = (await db.execute(total_appointments_query)).scalar() or 0
    
    # Completed sessions
    completed_sessions_query = select(func.count(Appointment.id)).where(
        and_(Appointment.status == "completed", *appointment_filter)
        if appointment_filter else Appointment.status == "completed"
    )
    completed_sessions = (await db.execute(completed_sessions_query)).scalar() or 0
    
    # Upcoming appointments
    today = date.today()
    upcoming_query = select(func.count(Appointment.id)).where(
        and_(
            Appointment.date >= today,
            Appointment.status == "scheduled",
            *appointment_filter
        ) if appointment_filter else and_(
            Appointment.date >= today,
            Appointment.status == "scheduled"
        )
    )
    upcoming_appointments = (await db.execute(upcoming_query)).scalar() or 0
    
    # Pending payments
    pending_payments_query = select(func.count(Payment.id)).where(
        and_(Payment.status == "pending", *payment_filter)
        if payment_filter else Payment.status == "pending"
    )
    pending_payments = (await db.execute(pending_payments_query)).scalar() or 0
    
    return {
        "total_patients": total_patients,
        "active_patients": active_patients,
        "new_patients_this_month": new_patients,
        "returning_patients": returning_patients,
        "total_appointments": total_appointments,
        "sessions_completed": completed_sessions,
        "upcoming_appointments": upcoming_appointments,
        "pending_payments": pending_payments,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  PATIENT ANALYTICS
# ═══════════════════════════════════════════════════════════════════════════════

async def get_patient_analytics(
    db: AsyncSession,
    practitioner_id: Optional[str] = None,
    is_admin: bool = False,
    period: str = "this_year",
    custom_start: Optional[date] = None,
    custom_end: Optional[date] = None
) -> Dict[str, Any]:
    """Get patient analytics with trends."""
    
    start_date, end_date = get_date_range(period, custom_start, custom_end)
    
    # Build base filter
    base_filter = []
    if not is_admin and practitioner_id:
        base_filter.append(Patient.practitioner_id == practitioner_id)
    
    # Active vs Inactive patients — active means a completed appointment within
    # the last 30 days; inactive means a straight month with no attendance
    # (see get_active_inactive_counts). This is separate from Patient.status,
    # which only tracks whether a record has been manually archived.
    active_count, inactive_count = await get_active_inactive_counts(db, practitioner_id, is_admin)
    
    # New patients by month — full calendar year, January through December,
    # zero-filled so the chart always renders all 12 equal-width bars.
    current_year = date.today().year
    jan_1 = date(current_year, 1, 1)
    dec_31 = date(current_year, 12, 31)
    monthly_query = (
        select(
            extract('month', Patient.created_at).label('month'),
            func.count(Patient.id).label('count')
        )
        .where(
            and_(
                func.date(Patient.created_at) >= jan_1,
                func.date(Patient.created_at) <= dec_31,
                *base_filter
            ) if base_filter else and_(
                func.date(Patient.created_at) >= jan_1,
                func.date(Patient.created_at) <= dec_31,
            )
        )
        .group_by(extract('month', Patient.created_at))
    )
    monthly_result = await db.execute(monthly_query)
    counts_by_month = {int(row.month): row.count for row in monthly_result}
    new_patients_by_month = [
        {"year": current_year, "month": m, "count": counts_by_month.get(m, 0)}
        for m in range(1, 13)
    ]
    
    # Patient growth trend (cumulative)
    total_before_period = select(func.count(Patient.id)).where(
        and_(
            func.date(Patient.created_at) < start_date,
            *base_filter
        ) if base_filter else func.date(Patient.created_at) < start_date
    )
    patients_before = (await db.execute(total_before_period)).scalar() or 0
    
    # Average sessions per patient
    appt_filter = []
    if not is_admin and practitioner_id:
        appt_filter.append(Appointment.practitioner_id == practitioner_id)
    
    avg_sessions_query = (
        select(func.avg(func.count(Appointment.id)))
        .select_from(Appointment)
        .where(
            and_(Appointment.status == "completed", *appt_filter)
            if appt_filter else Appointment.status == "completed"
        )
        .group_by(Appointment.patient_id)
    )
    # This needs subquery approach
    sessions_per_patient = (
        select(
            Appointment.patient_id,
            func.count(Appointment.id).label('session_count')
        )
        .where(
            and_(Appointment.status == "completed", *appt_filter)
            if appt_filter else Appointment.status == "completed"
        )
        .group_by(Appointment.patient_id)
        .subquery()
    )
    avg_sessions_result = await db.execute(
        select(func.avg(sessions_per_patient.c.session_count))
    )
    avg_sessions_per_patient = round(avg_sessions_result.scalar() or 0, 1)
    
    # Patient retention rate (patients with 2+ appointments / all patients with appointments)
    patients_with_appts = (
        select(Appointment.patient_id)
        .where(
            and_(Appointment.status == "completed", *appt_filter)
            if appt_filter else Appointment.status == "completed"
        )
        .group_by(Appointment.patient_id)
    )
    total_with_appts = (await db.execute(select(func.count()).select_from(patients_with_appts.subquery()))).scalar() or 0
    
    returning_patients = (
        select(Appointment.patient_id)
        .where(
            and_(Appointment.status == "completed", *appt_filter)
            if appt_filter else Appointment.status == "completed"
        )
        .group_by(Appointment.patient_id)
        .having(func.count(Appointment.id) >= 2)
    )
    returning_count = (await db.execute(select(func.count()).select_from(returning_patients.subquery()))).scalar() or 0
    
    retention_rate = round((returning_count / total_with_appts * 100) if total_with_appts > 0 else 0, 1)
    
    return {
        "active_patients": active_count,
        "inactive_patients": inactive_count,
        "new_patients_by_month": new_patients_by_month,
        "patients_at_period_start": patients_before,
        "avg_sessions_per_patient": avg_sessions_per_patient,
        "retention_rate": retention_rate,
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        }
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  APPOINTMENT ANALYTICS
# ═══════════════════════════════════════════════════════════════════════════════

async def get_appointment_analytics(
    db: AsyncSession,
    practitioner_id: Optional[str] = None,
    is_admin: bool = False,
    period: str = "this_month",
    custom_start: Optional[date] = None,
    custom_end: Optional[date] = None
) -> Dict[str, Any]:
    """Get appointment analytics."""
    
    start_date, end_date = get_date_range(period, custom_start, custom_end)
    
    # Build base filter
    base_filter = [
        Appointment.date >= start_date,
        Appointment.date <= end_date,
    ]
    if not is_admin and practitioner_id:
        base_filter.append(Appointment.practitioner_id == practitioner_id)
    
    # Total appointments in period
    total_query = select(func.count(Appointment.id)).where(and_(*base_filter))
    total = (await db.execute(total_query)).scalar() or 0
    
    # Status breakdown
    status_query = (
        select(
            Appointment.status,
            func.count(Appointment.id).label('count')
        )
        .where(and_(*base_filter))
        .group_by(Appointment.status)
    )
    status_result = await db.execute(status_query)
    status_counts = {row.status: row.count for row in status_result}
    
    completed = status_counts.get("completed", 0)
    cancelled = status_counts.get("cancelled", 0)
    rescheduled = status_counts.get("rescheduled", 0)
    no_shows = status_counts.get("no_show", 0)
    scheduled = status_counts.get("scheduled", 0)
    
    # Attendance rate
    total_past = completed + cancelled + no_shows
    attendance_rate = round((completed / total_past * 100) if total_past > 0 else 0, 1)
    
    # Average appointment duration
    avg_duration_query = select(func.avg(Appointment.duration_minutes)).where(
        and_(*base_filter, Appointment.status == "completed")
    )
    avg_duration = round((await db.execute(avg_duration_query)).scalar() or 0, 0)
    
    # Appointments by day of week
    by_day_query = (
        select(
            extract('dow', Appointment.date).label('day'),
            func.count(Appointment.id).label('count')
        )
        .where(and_(*base_filter))
        .group_by(extract('dow', Appointment.date))
        .order_by(extract('dow', Appointment.date))
    )
    by_day_result = await db.execute(by_day_query)
    appointments_by_day = {int(row.day): row.count for row in by_day_result}
    
    # Appointments by session type
    by_type_query = (
        select(
            Appointment.session_type,
            func.count(Appointment.id).label('count')
        )
        .where(and_(*base_filter))
        .group_by(Appointment.session_type)
    )
    by_type_result = await db.execute(by_type_query)
    appointments_by_type = {row.session_type: row.count for row in by_type_result}
    
    # Appointments trend (daily/weekly based on period length)
    delta_days = (end_date - start_date).days
    
    if delta_days <= 31:
        # Daily trend
        trend_query = (
            select(
                Appointment.date,
                func.count(Appointment.id).label('count')
            )
            .where(and_(*base_filter))
            .group_by(Appointment.date)
            .order_by(Appointment.date)
        )
        trend_result = await db.execute(trend_query)
        appointment_trend = [
            {"date": row.date.isoformat(), "count": row.count}
            for row in trend_result
        ]
    else:
        # Weekly trend
        trend_query = (
            select(
                extract('year', Appointment.date).label('year'),
                extract('week', Appointment.date).label('week'),
                func.count(Appointment.id).label('count')
            )
            .where(and_(*base_filter))
            .group_by(
                extract('year', Appointment.date),
                extract('week', Appointment.date)
            )
            .order_by(
                extract('year', Appointment.date),
                extract('week', Appointment.date)
            )
        )
        trend_result = await db.execute(trend_query)
        appointment_trend = [
            {"year": int(row.year), "week": int(row.week), "count": row.count}
            for row in trend_result
        ]
    
    return {
        "total": total,
        "completed": completed,
        "cancelled": cancelled,
        "rescheduled": rescheduled,
        "no_shows": no_shows,
        "scheduled": scheduled,
        "attendance_rate": attendance_rate,
        "avg_duration_minutes": int(avg_duration),
        "appointments_by_day": appointments_by_day,
        "appointments_by_type": appointments_by_type,
        "appointment_trend": appointment_trend,
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        }
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  REVENUE ANALYTICS
# ═══════════════════════════════════════════════════════════════════════════════

async def get_revenue_analytics(
    db: AsyncSession,
    practitioner_id: Optional[str] = None,
    is_admin: bool = False,
    period: str = "this_year",
    custom_start: Optional[date] = None,
    custom_end: Optional[date] = None
) -> Dict[str, Any]:
    """Get revenue analytics."""
    
    start_date, end_date = get_date_range(period, custom_start, custom_end)
    start_dt = date_to_datetime(start_date)
    end_dt = date_to_datetime(end_date, end_of_day=True)
    
    # Build base filter
    base_filter = [
        Payment.created_at >= start_dt,
        Payment.created_at <= end_dt,
    ]
    if not is_admin and practitioner_id:
        base_filter.append(Payment.practitioner_id == practitioner_id)
    
    # Total revenue (paid payments)
    paid_filter = base_filter + [Payment.status == "paid"]
    total_revenue_query = select(func.sum(Payment.final_amount)).where(and_(*paid_filter))
    total_revenue = (await db.execute(total_revenue_query)).scalar() or 0
    
    # Outstanding payments
    outstanding_filter = []
    if not is_admin and practitioner_id:
        outstanding_filter.append(Payment.practitioner_id == practitioner_id)
    outstanding_filter.append(Payment.status == "pending")
    
    outstanding_query = select(func.sum(Payment.final_amount)).where(and_(*outstanding_filter))
    outstanding = (await db.execute(outstanding_query)).scalar() or 0
    
    # Total refunds
    refund_filter = base_filter + [Payment.refund_status == "completed"]
    refunds_query = select(func.sum(Payment.refund_amount)).where(and_(*refund_filter))
    total_refunds = (await db.execute(refunds_query)).scalar() or 0
    
    # Average session fee
    avg_fee_query = select(func.avg(Payment.session_fee)).where(and_(*paid_filter))
    avg_session_fee = round((await db.execute(avg_fee_query)).scalar() or 0, 0)
    
    # Monthly revenue breakdown
    monthly_query = (
        select(
            extract('year', Payment.paid_at).label('year'),
            extract('month', Payment.paid_at).label('month'),
            func.sum(Payment.final_amount).label('amount'),
            func.count(Payment.id).label('count')
        )
        .where(and_(*paid_filter, Payment.paid_at.isnot(None)))
        .group_by(
            extract('year', Payment.paid_at),
            extract('month', Payment.paid_at)
        )
        .order_by(
            extract('year', Payment.paid_at),
            extract('month', Payment.paid_at)
        )
    )
    monthly_result = await db.execute(monthly_query)
    revenue_by_month = [
        {
            "year": int(row.year),
            "month": int(row.month),
            "amount": row.amount,
            "count": row.count
        }
        for row in monthly_result
    ]
    
    # Revenue by payment method
    by_method_query = (
        select(
            Payment.payment_method,
            func.sum(Payment.final_amount).label('amount'),
            func.count(Payment.id).label('count')
        )
        .where(and_(*paid_filter))
        .group_by(Payment.payment_method)
    )
    by_method_result = await db.execute(by_method_query)
    revenue_by_method = {
        (row.payment_method or "unknown"): {
            "amount": row.amount,
            "count": row.count
        }
        for row in by_method_result
    }
    
    # This month's revenue
    first_of_month = date.today().replace(day=1)
    this_month_filter = [
        Payment.paid_at >= date_to_datetime(first_of_month),
        Payment.status == "paid",
    ]
    if not is_admin and practitioner_id:
        this_month_filter.append(Payment.practitioner_id == practitioner_id)
    
    monthly_revenue_query = select(func.sum(Payment.final_amount)).where(and_(*this_month_filter))
    monthly_revenue = (await db.execute(monthly_revenue_query)).scalar() or 0
    
    # This year's revenue
    first_of_year = date.today().replace(month=1, day=1)
    this_year_filter = [
        Payment.paid_at >= date_to_datetime(first_of_year),
        Payment.status == "paid",
    ]
    if not is_admin and practitioner_id:
        this_year_filter.append(Payment.practitioner_id == practitioner_id)
    
    yearly_revenue_query = select(func.sum(Payment.final_amount)).where(and_(*this_year_filter))
    yearly_revenue = (await db.execute(yearly_revenue_query)).scalar() or 0
    
    return {
        "total_revenue": total_revenue,
        "monthly_revenue": monthly_revenue,
        "yearly_revenue": yearly_revenue,
        "outstanding_payments": outstanding,
        "total_refunds": total_refunds or 0,
        "avg_session_fee": int(avg_session_fee),
        "revenue_by_month": revenue_by_month,
        "revenue_by_method": revenue_by_method,
        "currency": "INR",
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        }
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  ASSESSMENT ANALYTICS
# ═══════════════════════════════════════════════════════════════════════════════

async def get_assessment_analytics(
    db: AsyncSession,
    practitioner_id: Optional[str] = None,
    is_admin: bool = False,
    period: str = "this_year",
    custom_start: Optional[date] = None,
    custom_end: Optional[date] = None
) -> Dict[str, Any]:
    """Get assessment analytics including MMPI sessions."""
    
    start_date, end_date = get_date_range(period, custom_start, custom_end)
    start_dt = date_to_datetime(start_date)
    end_dt = date_to_datetime(end_date, end_of_day=True)
    
    # Build base filter for assessments
    assessment_filter = [
        Assessment.created_at >= start_dt,
        Assessment.created_at <= end_dt,
    ]
    if not is_admin and practitioner_id:
        assessment_filter.append(Assessment.practitioner_id == practitioner_id)
    
    # Build base filter for MMPI sessions
    session_filter = [
        Session.created_at >= start_dt,
        Session.created_at <= end_dt,
    ]
    if not is_admin and practitioner_id:
        session_filter.append(Session.practitioner_id == practitioner_id)
    
    # Total assessments sent (Assessment records)
    total_assessments_query = select(func.count(Assessment.id)).where(and_(*assessment_filter))
    total_assessments = (await db.execute(total_assessments_query)).scalar() or 0
    
    # Completed assessments
    completed_assessments_query = select(func.count(Assessment.id)).where(
        and_(*assessment_filter, Assessment.status == "completed")
    )
    completed_assessments = (await db.execute(completed_assessments_query)).scalar() or 0
    
    # Pending assessments
    pending_assessments_query = select(func.count(Assessment.id)).where(
        and_(*assessment_filter, Assessment.status.in_(["pending", "in_progress"]))
    )
    pending_assessments = (await db.execute(pending_assessments_query)).scalar() or 0
    
    # MMPI Sessions (direct test takers)
    total_mmpi_query = select(func.count(Session.id)).where(and_(*session_filter))
    total_mmpi = (await db.execute(total_mmpi_query)).scalar() or 0
    
    completed_mmpi_query = select(func.count(Session.id)).where(
        and_(*session_filter, Session.completed == True)
    )
    completed_mmpi = (await db.execute(completed_mmpi_query)).scalar() or 0
    
    # Total sent = assessments + mmpi sessions
    total_sent = total_assessments + total_mmpi
    total_completed = completed_assessments + completed_mmpi
    
    # Completion rate
    completion_rate = round((total_completed / total_sent * 100) if total_sent > 0 else 0, 1)
    
    # Assessments by type
    by_type_query = (
        select(
            Assessment.assessment_type,
            func.count(Assessment.id).label('total'),
            func.sum(case((Assessment.status == "completed", 1), else_=0)).label('completed')
        )
        .where(and_(*assessment_filter))
        .group_by(Assessment.assessment_type)
    )
    by_type_result = await db.execute(by_type_query)
    assessments_by_type = {
        row.assessment_type: {
            "total": row.total,
            "completed": row.completed
        }
        for row in by_type_result
    }
    
    # Add MMPI stats
    assessments_by_type["mmpi2"] = {
        "total": assessments_by_type.get("mmpi2", {}).get("total", 0) + total_mmpi,
        "completed": assessments_by_type.get("mmpi2", {}).get("completed", 0) + completed_mmpi,
    }
    
    # Monthly trend
    monthly_query = (
        select(
            extract('year', Session.created_at).label('year'),
            extract('month', Session.created_at).label('month'),
            func.count(Session.id).label('total'),
            func.sum(case((Session.completed == True, 1), else_=0)).label('completed')
        )
        .where(and_(*session_filter))
        .group_by(
            extract('year', Session.created_at),
            extract('month', Session.created_at)
        )
        .order_by(
            extract('year', Session.created_at),
            extract('month', Session.created_at)
        )
    )
    monthly_result = await db.execute(monthly_query)
    assessment_trend = [
        {
            "year": int(row.year),
            "month": int(row.month),
            "total": row.total,
            "completed": row.completed
        }
        for row in monthly_result
    ]
    
    return {
        "total_sent": total_sent,
        "total_completed": total_completed,
        "pending": pending_assessments + (total_mmpi - completed_mmpi),
        "completion_rate": completion_rate,
        "assessments_by_type": assessments_by_type,
        "assessment_trend": assessment_trend,
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        }
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  PRACTITIONER ANALYTICS (Admin Only)
# ═══════════════════════════════════════════════════════════════════════════════

async def get_practitioner_analytics(
    db: AsyncSession,
    period: str = "this_month",
    custom_start: Optional[date] = None,
    custom_end: Optional[date] = None
) -> List[Dict[str, Any]]:
    """Get analytics for all practitioners (admin only)."""
    
    start_date, end_date = get_date_range(period, custom_start, custom_end)
    start_dt = date_to_datetime(start_date)
    end_dt = date_to_datetime(end_date, end_of_day=True)
    
    # Get all active practitioners
    practitioners_query = select(Practitioner).where(Practitioner.is_active == True)
    practitioners_result = await db.execute(practitioners_query)
    practitioners = practitioners_result.scalars().all()
    
    analytics = []
    
    for prac in practitioners:
        # Patients managed
        patients_query = select(func.count(Patient.id)).where(
            Patient.practitioner_id == prac.id
        )
        patients_count = (await db.execute(patients_query)).scalar() or 0
        
        # Appointments in period
        appt_filter = [
            Appointment.practitioner_id == prac.id,
            Appointment.date >= start_date,
            Appointment.date <= end_date,
        ]
        
        total_appts = (await db.execute(
            select(func.count(Appointment.id)).where(and_(*appt_filter))
        )).scalar() or 0
        
        completed_appts = (await db.execute(
            select(func.count(Appointment.id)).where(
                and_(*appt_filter, Appointment.status == "completed")
            )
        )).scalar() or 0
        
        cancelled_appts = (await db.execute(
            select(func.count(Appointment.id)).where(
                and_(*appt_filter, Appointment.status == "cancelled")
            )
        )).scalar() or 0
        
        no_shows = (await db.execute(
            select(func.count(Appointment.id)).where(
                and_(*appt_filter, Appointment.status == "no_show")
            )
        )).scalar() or 0
        
        # Attendance rate
        total_past = completed_appts + cancelled_appts + no_shows
        attendance_rate = round((completed_appts / total_past * 100) if total_past > 0 else 0, 1)
        
        # Cancellation rate
        cancellation_rate = round((cancelled_appts / total_appts * 100) if total_appts > 0 else 0, 1)
        
        # Revenue
        payment_filter = [
            Payment.practitioner_id == prac.id,
            Payment.paid_at >= start_dt,
            Payment.paid_at <= end_dt,
            Payment.status == "paid",
        ]
        revenue = (await db.execute(
            select(func.sum(Payment.final_amount)).where(and_(*payment_filter))
        )).scalar() or 0
        
        # Assessment completion
        session_filter = [
            Session.practitioner_id == prac.id,
            Session.created_at >= start_dt,
            Session.created_at <= end_dt,
        ]
        total_sessions = (await db.execute(
            select(func.count(Session.id)).where(and_(*session_filter))
        )).scalar() or 0
        
        completed_sessions = (await db.execute(
            select(func.count(Session.id)).where(
                and_(*session_filter, Session.completed == True)
            )
        )).scalar() or 0
        
        assessment_completion = round(
            (completed_sessions / total_sessions * 100) if total_sessions > 0 else 0, 1
        )
        
        analytics.append({
            "practitioner_id": prac.id,
            "name": prac.name,
            "email": prac.email,
            "role": prac.role,
            "patients_managed": patients_count,
            "appointments_total": total_appts,
            "appointments_completed": completed_appts,
            "revenue": revenue,
            "attendance_rate": attendance_rate,
            "cancellation_rate": cancellation_rate,
            "assessment_completion_rate": assessment_completion,
        })
    
    return analytics


# ═══════════════════════════════════════════════════════════════════════════════
#  HOME DASHBOARD SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

async def get_home_dashboard_summary(
    db: AsyncSession,
    practitioner_id: Optional[str] = None,
    is_admin: bool = False
) -> Dict[str, Any]:
    """Get summary metrics for home dashboard widgets."""
    
    today = date.today()
    first_of_month = today.replace(day=1)
    
    # Build filters
    patient_filter = []
    appt_filter = []
    payment_filter = []
    
    if not is_admin and practitioner_id:
        patient_filter.append(Patient.practitioner_id == practitioner_id)
        appt_filter.append(Appointment.practitioner_id == practitioner_id)
        payment_filter.append(Payment.practitioner_id == practitioner_id)
    
    # Revenue this month
    monthly_revenue_filter = payment_filter + [
        Payment.paid_at >= date_to_datetime(first_of_month),
        Payment.status == "paid",
    ]
    monthly_revenue = (await db.execute(
        select(func.sum(Payment.final_amount)).where(and_(*monthly_revenue_filter))
    )).scalar() or 0
    
    # Today's appointments
    today_appts_filter = appt_filter + [Appointment.date == today]
    today_appointments = (await db.execute(
        select(func.count(Appointment.id)).where(and_(*today_appts_filter))
    )).scalar() or 0
    
    # Pending payments
    pending_filter = payment_filter + [Payment.status == "pending"]
    pending_payments = (await db.execute(
        select(func.count(Payment.id)).where(and_(*pending_filter))
    )).scalar() or 0
    
    pending_amount = (await db.execute(
        select(func.sum(Payment.final_amount)).where(and_(*pending_filter))
    )).scalar() or 0
    
    # New patients this month
    new_patients_filter = patient_filter + [
        func.date(Patient.created_at) >= first_of_month
    ]
    new_patients = (await db.execute(
        select(func.count(Patient.id)).where(and_(*new_patients_filter))
    )).scalar() or 0
    
    # Attendance rate (last 30 days)
    thirty_days_ago = today - timedelta(days=30)
    attendance_filter = appt_filter + [
        Appointment.date >= thirty_days_ago,
        Appointment.date <= today,
        Appointment.status.in_(["completed", "cancelled", "no_show"])
    ]
    
    completed = (await db.execute(
        select(func.count(Appointment.id)).where(
            and_(*appt_filter, Appointment.date >= thirty_days_ago,
                 Appointment.date <= today, Appointment.status == "completed")
        )
    )).scalar() or 0
    
    total_past = (await db.execute(
        select(func.count(Appointment.id)).where(and_(*attendance_filter))
    )).scalar() or 0
    
    attendance_rate = round((completed / total_past * 100) if total_past > 0 else 0, 1)
    
    return {
        "revenue_this_month": monthly_revenue,
        "today_appointments": today_appointments,
        "pending_payments_count": pending_payments,
        "pending_payments_amount": pending_amount,
        "new_patients_this_month": new_patients,
        "attendance_rate": attendance_rate,
        "currency": "INR",
    }
