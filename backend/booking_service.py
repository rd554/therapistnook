"""
Booking Service — Phase 5

Handles the complete public booking workflow:
1. Generate available slots from availability settings
2. Create booking requests
3. Generate payment links
4. Process payment confirmation
5. Create appointments and meeting links
6. Send notifications
"""

import os
import logging
from datetime import datetime, date, time, timedelta, timezone
from typing import Optional

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

SITE_URL = os.getenv("SITE_URL", "http://localhost:5173")
BOOKING_EXPIRY_HOURS = 24


class SlotGenerator:
    """Generates available time slots based on practitioner availability."""
    
    @staticmethod
    def generate_slots_for_day(
        target_date: date,
        work_start: time,
        work_end: time,
        break_start: Optional[time],
        break_end: Optional[time],
        duration_minutes: int,
        buffer_minutes: int,
        existing_appointments: list[tuple[datetime, datetime]],
        unavailable_periods: list[tuple[time, time]],
        tz_offset_hours: float = 5.5,
    ) -> list[dict]:
        """
        Generate available slots for a specific day.
        
        Args:
            target_date: The date to generate slots for
            work_start: Work start time
            work_end: Work end time
            break_start: Break start time (optional)
            break_end: Break end time (optional)
            duration_minutes: Session duration
            buffer_minutes: Buffer between sessions
            existing_appointments: List of (start, end) tuples for existing appointments
            unavailable_periods: List of (start_time, end_time) tuples for partial unavailability
            tz_offset_hours: Timezone offset from UTC (default IST = 5.5)
        
        Returns:
            List of available slot dictionaries with start, end, duration_minutes
        """
        slots = []
        
        slot_length = duration_minutes + buffer_minutes
        
        work_start_dt = datetime.combine(target_date, work_start)
        work_end_dt = datetime.combine(target_date, work_end)
        
        current_time = work_start_dt
        
        while current_time + timedelta(minutes=duration_minutes) <= work_end_dt:
            slot_end = current_time + timedelta(minutes=duration_minutes)
            
            if break_start and break_end:
                break_start_dt = datetime.combine(target_date, break_start)
                break_end_dt = datetime.combine(target_date, break_end)
                
                if (current_time < break_end_dt and slot_end > break_start_dt):
                    current_time = break_end_dt
                    continue
            
            is_unavailable = False
            for unavail_start, unavail_end in unavailable_periods:
                unavail_start_dt = datetime.combine(target_date, unavail_start)
                unavail_end_dt = datetime.combine(target_date, unavail_end)
                
                if (current_time < unavail_end_dt and slot_end > unavail_start_dt):
                    is_unavailable = True
                    current_time = unavail_end_dt
                    break
            
            if is_unavailable:
                continue
            
            is_booked = False
            for appt_start, appt_end in existing_appointments:
                if appt_start.tzinfo:
                    appt_start = appt_start.replace(tzinfo=None)
                if appt_end.tzinfo:
                    appt_end = appt_end.replace(tzinfo=None)
                
                if (current_time < appt_end and slot_end > appt_start):
                    is_booked = True
                    break
            
            if not is_booked:
                tz = timezone(timedelta(hours=tz_offset_hours))
                slots.append({
                    "start": current_time.replace(tzinfo=tz),
                    "end": slot_end.replace(tzinfo=tz),
                    "duration_minutes": duration_minutes,
                })
            
            current_time += timedelta(minutes=slot_length)
        
        return slots


class BookingService:
    """Main booking service handling the complete booking workflow."""
    
    def __init__(self):
        self.slot_generator = SlotGenerator()
    
    async def get_available_slots(
        self,
        db: AsyncSession,
        practitioner_id: str,
        start_date: date,
        days: int = 14,
    ) -> dict:
        """
        Get available slots for a practitioner for the specified date range.
        
        Returns:
            {
                "practitioner_id": str,
                "practitioner_name": str,
                "timezone": str,
                "session_types": [...],
                "days": [...]
            }
        """
        from models import (
            Practitioner, PractitionerAvailability, UnavailableDate,
            Appointment, BookingRequest, PractitionerProfile, AppointmentConfiguration
        )

        prac_result = await db.execute(
            select(Practitioner).where(Practitioner.id == practitioner_id)
        )
        practitioner = prac_result.scalar_one_or_none()

        if not practitioner:
            return None

        # Clinic-wide booking policy (max advance window, minimum notice, holidays).
        # These are the fields on AppointmentConfiguration that aren't already
        # covered by the per-practitioner PractitionerAvailability row above.
        # Read-only lookup (unlike settings_service.get_appointment_config, this
        # must not write/commit — it runs on every public, unauthenticated slot
        # request) and tolerant of zero or duplicate rows.
        appt_config = (
            await db.execute(select(AppointmentConfiguration).limit(1))
        ).scalars().first()
        max_advance_days = appt_config.max_advance_booking_days if appt_config else None
        min_notice_hours = appt_config.min_booking_notice_hours if appt_config else None
        holiday_dates = set()
        for h in ((appt_config.holidays if appt_config else None) or []):
            h_date = h.get("date") if isinstance(h, dict) else None
            if h_date:
                try:
                    holiday_dates.add(datetime.strptime(h_date, "%Y-%m-%d").date())
                except ValueError:
                    pass

        avail_result = await db.execute(
            select(PractitionerAvailability).where(
                PractitionerAvailability.practitioner_id == practitioner_id
            )
        )
        availability = avail_result.scalar_one_or_none()
        
        if not availability:
            working_days = [0, 1, 2, 3, 4]
            work_start = time(9, 0)
            work_end = time(18, 0)
            break_start = time(13, 0)
            break_end = time(14, 0)
            duration_minutes = 50
            buffer_minutes = 10
            tz_name = "Asia/Kolkata"
        else:
            working_days = availability.working_days or [0, 1, 2, 3, 4]
            work_start = datetime.strptime(availability.work_start_time, "%H:%M").time()
            work_end = datetime.strptime(availability.work_end_time, "%H:%M").time()
            break_start = datetime.strptime(availability.break_start_time, "%H:%M").time() if availability.break_start_time else None
            break_end = datetime.strptime(availability.break_end_time, "%H:%M").time() if availability.break_end_time else None
            duration_minutes = availability.default_session_duration
            buffer_minutes = availability.buffer_minutes
            tz_name = availability.timezone
        
        end_date = start_date + timedelta(days=days)
        
        unavail_result = await db.execute(
            select(UnavailableDate).where(
                and_(
                    UnavailableDate.practitioner_id == practitioner_id,
                    UnavailableDate.date >= start_date,
                    UnavailableDate.date <= end_date,
                )
            )
        )
        unavailable_dates = {ud.date: ud for ud in unavail_result.scalars().all()}
        
        appt_result = await db.execute(
            select(Appointment).where(
                and_(
                    Appointment.practitioner_id == practitioner_id,
                    Appointment.date >= start_date,
                    Appointment.date <= end_date,
                    Appointment.status.in_(["scheduled", "rescheduled"]),
                )
            )
        )
        appointments_by_date = {}
        for appt in appt_result.scalars().all():
            if appt.date not in appointments_by_date:
                appointments_by_date[appt.date] = []
            appointments_by_date[appt.date].append((appt.start_time, appt.end_time))
        
        booking_result = await db.execute(
            select(BookingRequest).where(
                and_(
                    BookingRequest.practitioner_id == practitioner_id,
                    BookingRequest.requested_date >= start_date,
                    BookingRequest.requested_date <= end_date,
                    BookingRequest.status.in_(["requested", "pending_payment", "payment_processing", "paid"]),
                )
            )
        )
        for booking in booking_result.scalars().all():
            if booking.requested_date not in appointments_by_date:
                appointments_by_date[booking.requested_date] = []
            appointments_by_date[booking.requested_date].append(
                (booking.requested_start_time, booking.requested_end_time)
            )
        
        profile_result = await db.execute(
            select(PractitionerProfile).where(
                PractitionerProfile.practitioner_id == practitioner_id
            )
        )
        profile = profile_result.scalar_one_or_none()
        
        consultation_fee = profile.consultation_fee if profile else 0
        fee_currency = profile.consultation_fee_currency if profile else "INR"
        
        session_types = [
            {
                "id": "therapy_session",
                "name": "Therapy Session",
                "duration_minutes": duration_minutes,
                "fee": consultation_fee,
                "currency": fee_currency,
            },
            {
                "id": "consultation",
                "name": "Initial Consultation",
                "duration_minutes": duration_minutes,
                "fee": consultation_fee,
                "currency": fee_currency,
            },
            {
                "id": "follow_up",
                "name": "Follow-up Session",
                "duration_minutes": duration_minutes,
                "fee": consultation_fee,
                "currency": fee_currency,
            },
        ]
        
        days_data = []
        current_date = start_date
        today = date.today()
        max_bookable_date = (
            today + timedelta(days=max_advance_days) if max_advance_days else None
        )

        while current_date <= end_date:
            if current_date < today:
                current_date += timedelta(days=1)
                continue

            weekday = current_date.weekday()
            is_working_day = weekday in working_days

            unavail = unavailable_dates.get(current_date)
            is_fully_unavailable = unavail and unavail.is_full_day
            is_holiday = current_date in holiday_dates
            is_beyond_advance_window = (
                max_bookable_date is not None and current_date > max_bookable_date
            )

            if not is_working_day or is_fully_unavailable or is_holiday or is_beyond_advance_window:
                days_data.append({
                    "date": current_date,
                    "is_available": False,
                    "slots": [],
                })
                current_date += timedelta(days=1)
                continue
            
            unavailable_periods = []
            if unavail and not unavail.is_full_day:
                try:
                    unavail_start = datetime.strptime(unavail.unavailable_start, "%H:%M").time()
                    unavail_end = datetime.strptime(unavail.unavailable_end, "%H:%M").time()
                    unavailable_periods.append((unavail_start, unavail_end))
                except:
                    pass
            
            existing_appts = appointments_by_date.get(current_date, [])
            
            tz_offset = 5.5
            if "Kolkata" in tz_name:
                tz_offset = 5.5
            elif "UTC" in tz_name:
                tz_offset = 0
            
            slots = self.slot_generator.generate_slots_for_day(
                target_date=current_date,
                work_start=work_start,
                work_end=work_end,
                break_start=break_start,
                break_end=break_end,
                duration_minutes=duration_minutes,
                buffer_minutes=buffer_minutes,
                existing_appointments=existing_appts,
                unavailable_periods=unavailable_periods,
                tz_offset_hours=tz_offset,
            )

            if min_notice_hours and slots:
                tz = timezone(timedelta(hours=tz_offset))
                notice_cutoff = datetime.now(tz) + timedelta(hours=min_notice_hours)
                slots = [s for s in slots if s["start"] >= notice_cutoff]

            days_data.append({
                "date": current_date,
                "is_available": len(slots) > 0,
                "slots": slots,
            })
            
            current_date += timedelta(days=1)
        
        return {
            "practitioner_id": practitioner_id,
            "practitioner_name": practitioner.name,
            "timezone": tz_name,
            "session_types": session_types,
            "days": days_data,
        }
    
    async def create_booking_request(
        self,
        db: AsyncSession,
        practitioner_id: str,
        patient_name: str,
        patient_email: str,
        patient_phone: Optional[str],
        requested_date: date,
        requested_start_time: datetime,
        session_type: str,
        session_mode: str,
        patient_notes: Optional[str],
        duration_minutes: int,
    ) -> dict:
        """
        Create a new booking request and generate payment link.
        
        Returns booking request with payment details.
        """
        from models import (
            BookingRequest, Payment, Practitioner, PractitionerProfile,
            PractitionerAvailability, generate_uuid, generate_booking_token, generate_payment_link_token
        )
        from notification_service import notification_service, format_date, format_time, format_amount
        
        prac_result = await db.execute(
            select(Practitioner).where(Practitioner.id == practitioner_id)
        )
        practitioner = prac_result.scalar_one_or_none()
        
        if not practitioner:
            raise ValueError("Practitioner not found")
        
        profile_result = await db.execute(
            select(PractitionerProfile).where(
                PractitionerProfile.practitioner_id == practitioner_id
            )
        )
        profile = profile_result.scalar_one_or_none()
        
        avail_result = await db.execute(
            select(PractitionerAvailability).where(
                PractitionerAvailability.practitioner_id == practitioner_id
            )
        )
        availability = avail_result.scalar_one_or_none()
        
        if not duration_minutes:
            duration_minutes = availability.default_session_duration if availability else 50
        
        requested_end_time = requested_start_time + timedelta(minutes=duration_minutes)
        
        booking_id = generate_uuid()
        booking_token = generate_booking_token()
        
        consultation_fee = profile.consultation_fee if profile else 0
        fee_currency = profile.consultation_fee_currency if profile else "INR"
        
        booking = BookingRequest(
            id=booking_id,
            practitioner_id=practitioner_id,
            booking_token=booking_token,
            patient_name=patient_name,
            patient_email=patient_email,
            patient_phone=patient_phone,
            requested_date=requested_date,
            requested_start_time=requested_start_time,
            requested_end_time=requested_end_time,
            duration_minutes=duration_minutes,
            session_type=session_type,
            session_mode=session_mode,
            status="pending_payment",
            patient_notes=patient_notes,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=BOOKING_EXPIRY_HOURS),
        )
        db.add(booking)
        
        payment_id = generate_uuid()
        payment_token = generate_payment_link_token()
        
        from models import Payment
        payment = Payment(
            id=payment_id,
            appointment_id=None,
            practitioner_id=practitioner_id,
            patient_id=None,
            session_fee=consultation_fee,
            discount_amount=0,
            tax_amount=0,
            final_amount=consultation_fee,
            currency=fee_currency,
            status="pending",
            payment_link_token=payment_token,
            payment_link_expires_at=datetime.now(timezone.utc) + timedelta(hours=BOOKING_EXPIRY_HOURS),
        )
        db.add(payment)
        
        booking.payment_id = payment_id
        
        await db.commit()
        await db.refresh(booking)
        await db.refresh(payment)
        
        payment_link_url = f"{SITE_URL}/pay/{payment_token}"
        booking_url = f"{SITE_URL}/booking/{booking_token}"
        
        placeholders = {
            "patient_name": patient_name,
            "therapist_name": practitioner.name,
            "appointment_date": format_date(requested_date),
            "appointment_time": format_time(requested_start_time),
            "session_type": session_type.replace("_", " ").title(),
            "payment_link": payment_link_url,
            "payment_amount": format_amount(consultation_fee, fee_currency),
            "booking_url": booking_url,
        }
        
        await notification_service.send_email(
            recipient_email=patient_email,
            event_type="booking_created",
            placeholders=placeholders,
        )
        
        if profile and profile.public_email:
            therapist_placeholders = {
                "patient_name": patient_name,
                "appointment_date": format_date(requested_date),
                "appointment_time": format_time(requested_start_time),
                "session_type": session_type.replace("_", " ").title(),
            }
            await notification_service.send_email(
                recipient_email=profile.public_email,
                event_type="new_booking_therapist",
                placeholders=therapist_placeholders,
            )
        
        return {
            "booking": booking,
            "payment": payment,
            "payment_link_url": payment_link_url,
            "booking_url": booking_url,
        }
    
    async def confirm_booking_payment(
        self,
        db: AsyncSession,
        booking_id: str,
        payment_method: str = "payment_link",
    ) -> dict:
        """
        Confirm payment for a booking request.
        Creates the appointment, generates meeting link, sends confirmations.
        """
        from models import (
            BookingRequest, Payment, Appointment, Patient, Receipt,
            InternalNotification, generate_uuid, generate_receipt_number
        )
        from meeting_service import meeting_service
        from notification_service import notification_service, format_date, format_time, format_amount
        from reminder_service import reminder_scheduler
        
        booking_result = await db.execute(
            select(BookingRequest).where(BookingRequest.id == booking_id)
        )
        booking = booking_result.scalar_one_or_none()
        
        if not booking:
            raise ValueError("Booking not found")
        
        if booking.status not in ["pending_payment", "payment_processing"]:
            raise ValueError(f"Booking is not awaiting payment (status: {booking.status})")
        
        payment_result = await db.execute(
            select(Payment).where(Payment.id == booking.payment_id)
        )
        payment = payment_result.scalar_one_or_none()
        
        if payment:
            payment.status = "paid"
            payment.payment_method = payment_method
            payment.paid_at = datetime.now(timezone.utc)
        
        from models import Practitioner, PractitionerProfile
        prac_result = await db.execute(
            select(Practitioner).where(Practitioner.id == booking.practitioner_id)
        )
        practitioner = prac_result.scalar_one_or_none()
        
        profile_result = await db.execute(
            select(PractitionerProfile).where(
                PractitionerProfile.practitioner_id == booking.practitioner_id
            )
        )
        profile = profile_result.scalar_one_or_none()
        
        meeting_link = None
        meeting_provider = None
        meeting_id_str = None

        # Push every booking to Google Calendar (in-person too, so the
        # therapist's day is visible there), attaching a Meet link only for
        # online sessions. Skip silently if Google Calendar isn't connected.
        from models import CalendarIntegration
        integration_result = await db.execute(
            select(CalendarIntegration).where(
                CalendarIntegration.practitioner_id == booking.practitioner_id
            )
        )
        integration = integration_result.scalar_one_or_none()

        if integration and integration.google_connected and integration.google_credentials and integration.google_refresh_token:
            try:
                meeting_config = {
                    "google_credentials": integration.google_credentials,
                    "google_refresh_token": integration.google_refresh_token,
                }

                meeting_result = await meeting_service.create_meeting_for_booking(
                    booking_id=booking.id,
                    therapist_name=practitioner.name if practitioner else "Therapist",
                    patient_name=booking.patient_name,
                    start_time=booking.requested_start_time,
                    end_time=booking.requested_end_time,
                    session_type=booking.session_type,
                    attendees=[booking.patient_email],
                    config=meeting_config,
                    include_conference=(booking.session_mode == "online"),
                )
                meeting_link = meeting_result.link or None
                meeting_provider = meeting_result.provider
                meeting_id_str = meeting_result.meeting_id
            except Exception as e:
                log.error(f"Failed to create calendar event for booking {booking.id}: {e}")
        
        booking.meeting_link = meeting_link
        booking.meeting_provider = meeting_provider
        booking.meeting_id = meeting_id_str
        
        patient_id = None
        patient_result = await db.execute(
            select(Patient).where(
                and_(
                    Patient.practitioner_id == booking.practitioner_id,
                    Patient.email == booking.patient_email,
                )
            )
        )
        patient = patient_result.scalar_one_or_none()
        
        if patient:
            patient_id = patient.id
            booking.patient_id = patient_id
        
        appointment_id = generate_uuid()
        appointment = Appointment(
            id=appointment_id,
            practitioner_id=booking.practitioner_id,
            patient_id=patient_id,
            date=booking.requested_date,
            start_time=booking.requested_start_time,
            end_time=booking.requested_end_time,
            duration_minutes=booking.duration_minutes,
            session_type=booking.session_type,
            session_mode=booking.session_mode,
            status="scheduled",
            meeting_link=meeting_link,
            notes=booking.patient_notes,
        )
        db.add(appointment)
        
        booking.appointment_id = appointment_id
        booking.status = "confirmed"
        booking.confirmed_at = datetime.now(timezone.utc)
        
        if payment:
            payment.appointment_id = appointment_id
            payment.patient_id = patient_id
            
            receipt = Receipt(
                id=generate_uuid(),
                payment_id=payment.id,
                receipt_number=generate_receipt_number(),
                patient_name=booking.patient_name,
                patient_email=booking.patient_email,
                patient_dob=patient.date_of_birth if patient else None,
                practitioner_name=practitioner.name if practitioner else "",
                session_fee=payment.session_fee,
                discount_amount=payment.discount_amount,
                tax_amount=payment.tax_amount,
                final_amount=payment.final_amount,
                currency=payment.currency,
                appointment_date=booking.requested_date,
                session_type=booking.session_type,
                payment_method=payment_method,
                payment_date=datetime.now(timezone.utc),
            )
            db.add(receipt)
        
        notification = InternalNotification(
            id=generate_uuid(),
            practitioner_id=booking.practitioner_id,
            notification_type="payment_received",
            title="Payment Received",
            message=f"Payment of {format_amount(payment.final_amount, payment.currency) if payment else 'N/A'} received from {booking.patient_name}",
            reference_type="booking_request",
            reference_id=booking.id,
            extra_data={
                "patient_name": booking.patient_name,
                "amount": payment.final_amount if payment else 0,
                "currency": payment.currency if payment else "INR",
                "appointment_date": str(booking.requested_date),
            },
        )
        db.add(notification)
        
        if meeting_link:
            meeting_notification = InternalNotification(
                id=generate_uuid(),
                practitioner_id=booking.practitioner_id,
                notification_type="meeting_link_generated",
                title="Meeting Link Generated",
                message=f"Meeting link created for session with {booking.patient_name}",
                reference_type="booking_request",
                reference_id=booking.id,
                extra_data={
                    "meeting_link": meeting_link,
                    "meeting_provider": meeting_provider,
                    "appointment_date": str(booking.requested_date),
                },
            )
            db.add(meeting_notification)
        
        await db.commit()
        await db.refresh(booking)
        
        booking_url = f"{SITE_URL}/booking/{booking.booking_token}"
        
        placeholders = {
            "patient_name": booking.patient_name,
            "therapist_name": practitioner.name if practitioner else "",
            "appointment_date": format_date(booking.requested_date),
            "appointment_time": format_time(booking.requested_start_time),
            "session_type": booking.session_type.replace("_", " ").title(),
            "meeting_link": meeting_link or "",
            "payment_amount": format_amount(payment.final_amount, payment.currency) if payment else "",
            "receipt_number": receipt.receipt_number if payment else "",
            "booking_url": booking_url,
            "therapist_email": profile.public_email if profile else "",
            "therapist_phone": profile.public_phone if profile else "",
            "clinic_address": profile.clinic_address if profile else "",
        }
        
        await notification_service.send_email(
            recipient_email=booking.patient_email,
            event_type="appointment_confirmed",
            placeholders=placeholders,
        )
        
        if profile and profile.public_email:
            therapist_placeholders = {
                "patient_name": booking.patient_name,
                "payment_amount": format_amount(payment.final_amount, payment.currency) if payment else "",
                "receipt_number": receipt.receipt_number if payment else "",
                "appointment_date": format_date(booking.requested_date),
                "appointment_time": format_time(booking.requested_start_time),
            }
            await notification_service.send_email(
                recipient_email=profile.public_email,
                event_type="payment_received_therapist",
                placeholders=therapist_placeholders,
            )
        
        await reminder_scheduler.schedule_reminders_for_booking(
            db=db,
            booking_request_id=booking.id,
            appointment_time=booking.requested_start_time,
            patient_email=booking.patient_email,
            patient_phone=booking.patient_phone,
        )
        
        return {
            "booking": booking,
            "appointment": appointment,
            "payment": payment,
            "meeting_link": meeting_link,
        }
    
    async def cancel_booking(
        self,
        db: AsyncSession,
        booking_id: str,
        reason: Optional[str] = None,
        cancelled_by: str = "patient",
    ) -> dict:
        """Cancel a booking request."""
        from models import BookingRequest, Payment, Appointment, InternalNotification, generate_uuid
        from notification_service import notification_service, format_date, format_time
        from reminder_service import reminder_scheduler
        
        booking_result = await db.execute(
            select(BookingRequest).where(BookingRequest.id == booking_id)
        )
        booking = booking_result.scalar_one_or_none()
        
        if not booking:
            raise ValueError("Booking not found")
        
        if booking.status in ["cancelled", "expired"]:
            raise ValueError("Booking is already cancelled or expired")
        
        booking.status = "cancelled"
        booking.cancelled_at = datetime.now(timezone.utc)
        booking.cancellation_reason = reason or f"Cancelled by {cancelled_by}"
        
        if booking.payment_id:
            payment_result = await db.execute(
                select(Payment).where(Payment.id == booking.payment_id)
            )
            payment = payment_result.scalar_one_or_none()
            if payment and payment.status == "pending":
                payment.status = "cancelled"
        
        if booking.appointment_id:
            appt_result = await db.execute(
                select(Appointment).where(Appointment.id == booking.appointment_id)
            )
            appointment = appt_result.scalar_one_or_none()
            if appointment:
                appointment.status = "cancelled"
                appointment.cancellation_reason = reason
        
        await reminder_scheduler.cancel_reminders_for_booking(db, booking.id)
        
        notification = InternalNotification(
            id=generate_uuid(),
            practitioner_id=booking.practitioner_id,
            notification_type="booking_cancelled",
            title="Booking Cancelled",
            message=f"Booking with {booking.patient_name} for {booking.requested_date} has been cancelled",
            reference_type="booking_request",
            reference_id=booking.id,
            extra_data={
                "patient_name": booking.patient_name,
                "appointment_date": str(booking.requested_date),
                "cancellation_reason": reason,
                "cancelled_by": cancelled_by,
            },
        )
        db.add(notification)
        
        await db.commit()
        
        from models import Practitioner, PractitionerProfile
        prac_result = await db.execute(
            select(Practitioner).where(Practitioner.id == booking.practitioner_id)
        )
        practitioner = prac_result.scalar_one_or_none()
        
        profile_result = await db.execute(
            select(PractitionerProfile).where(
                PractitionerProfile.practitioner_id == booking.practitioner_id
            )
        )
        profile = profile_result.scalar_one_or_none()
        
        placeholders = {
            "patient_name": booking.patient_name,
            "therapist_name": practitioner.name if practitioner else "",
            "appointment_date": format_date(booking.requested_date),
            "appointment_time": format_time(booking.requested_start_time),
            "cancellation_reason": reason or "No reason provided",
            "therapist_email": profile.public_email if profile else "",
            "therapist_phone": profile.public_phone if profile else "",
        }
        
        await notification_service.send_email(
            recipient_email=booking.patient_email,
            event_type="appointment_cancelled",
            placeholders=placeholders,
        )
        
        return {"booking": booking}
    
    async def get_booking_by_token(
        self,
        db: AsyncSession,
        booking_token: str,
    ) -> Optional[dict]:
        """Get booking details by token (for patient view)."""
        from models import BookingRequest, Payment, Practitioner, PractitionerProfile
        
        booking_result = await db.execute(
            select(BookingRequest).where(BookingRequest.booking_token == booking_token)
        )
        booking = booking_result.scalar_one_or_none()
        
        if not booking:
            return None
        
        prac_result = await db.execute(
            select(Practitioner).where(Practitioner.id == booking.practitioner_id)
        )
        practitioner = prac_result.scalar_one_or_none()
        
        profile_result = await db.execute(
            select(PractitionerProfile).where(
                PractitionerProfile.practitioner_id == booking.practitioner_id
            )
        )
        profile = profile_result.scalar_one_or_none()
        
        payment = None
        if booking.payment_id:
            payment_result = await db.execute(
                select(Payment).where(Payment.id == booking.payment_id)
            )
            payment = payment_result.scalar_one_or_none()
        
        receipt_number = None
        if payment and payment.status == "paid":
            from models import Receipt
            receipt_result = await db.execute(
                select(Receipt).where(Receipt.payment_id == payment.id)
            )
            receipt = receipt_result.scalar_one_or_none()
            if receipt:
                receipt_number = receipt.receipt_number
        
        profile_photo_url = None
        if profile and profile.profile_photo_path:
            profile_photo_url = f"/api/files/{profile.profile_photo_path}"
        
        payment_link_url = None
        if payment and payment.payment_link_token and payment.status == "pending":
            payment_link_url = f"{SITE_URL}/pay/{payment.payment_link_token}"
        
        return {
            "booking_token": booking.booking_token,
            "status": booking.status,
            "practitioner_name": practitioner.name if practitioner else "",
            "practitioner_title": profile.title if profile else None,
            "practitioner_photo_url": profile_photo_url,
            "clinic_address": profile.clinic_address if profile else None,
            "patient_name": booking.patient_name,
            "appointment_date": booking.requested_date,
            "appointment_time": booking.requested_start_time,
            "duration_minutes": booking.duration_minutes,
            "session_type": booking.session_type,
            "session_mode": booking.session_mode,
            "meeting_link": booking.meeting_link if booking.status == "confirmed" else None,
            "meeting_provider": booking.meeting_provider,
            "payment_status": payment.status if payment else None,
            "payment_amount": payment.final_amount if payment else None,
            "payment_currency": payment.currency if payment else None,
            "payment_link_url": payment_link_url,
            "receipt_number": receipt_number,
            "therapist_email": profile.public_email if profile else None,
            "therapist_phone": profile.public_phone if profile else None,
        }


booking_service = BookingService()
