"""
Reminder Scheduling Service — Phase 5

Handles scheduling and sending appointment reminders at:
- 24 hours before
- 2 hours before
- 30 minutes before

Also handles reminder cancellation when appointments are cancelled/rescheduled.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

# Reminder timing constants (in minutes before appointment)
REMINDER_24H = 1440  # 24 hours
REMINDER_2H = 120    # 2 hours
REMINDER_30MIN = 30  # 30 minutes

REMINDER_TIMINGS = {
    "reminder_24h": REMINDER_24H,
    "reminder_2h": REMINDER_2H,
    "reminder_30min": REMINDER_30MIN,
}


class ReminderScheduler:
    """Handles scheduling and processing of appointment reminders."""
    
    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None
    
    async def schedule_reminders_for_booking(
        self,
        db: AsyncSession,
        booking_request_id: str,
        appointment_time: datetime,
        patient_email: str,
        patient_phone: Optional[str],
        settings: Optional[dict] = None,
    ) -> list[str]:
        """
        Schedule all reminders for a booking request.
        Returns list of created reminder IDs.
        """
        from models import ScheduledReminder, generate_uuid
        
        settings = settings or {}
        enable_24h = settings.get("enable_24h_reminder", True)
        enable_2h = settings.get("enable_2h_reminder", True)
        enable_30min = settings.get("enable_30min_reminder", True)
        email_reminders = settings.get("email_reminders", True)
        whatsapp_reminders = settings.get("whatsapp_reminders", False)
        
        now = datetime.now(timezone.utc)
        created_ids = []
        
        reminders_config = []
        if enable_24h:
            reminders_config.append(("reminder_24h", REMINDER_24H))
        if enable_2h:
            reminders_config.append(("reminder_2h", REMINDER_2H))
        if enable_30min:
            reminders_config.append(("reminder_30min", REMINDER_30MIN))
        
        for reminder_type, minutes_before in reminders_config:
            scheduled_for = appointment_time - timedelta(minutes=minutes_before)
            
            if scheduled_for <= now:
                continue
            
            if email_reminders and patient_email:
                reminder = ScheduledReminder(
                    id=generate_uuid(),
                    booking_request_id=booking_request_id,
                    reminder_type=reminder_type,
                    channel="email",
                    recipient_type="patient",
                    recipient_email=patient_email,
                    scheduled_for=scheduled_for,
                    status="scheduled",
                )
                db.add(reminder)
                created_ids.append(reminder.id)
            
            if whatsapp_reminders and patient_phone:
                reminder = ScheduledReminder(
                    id=generate_uuid(),
                    booking_request_id=booking_request_id,
                    reminder_type=reminder_type,
                    channel="whatsapp",
                    recipient_type="patient",
                    recipient_phone=patient_phone,
                    scheduled_for=scheduled_for,
                    status="scheduled",
                )
                db.add(reminder)
                created_ids.append(reminder.id)
        
        await db.commit()
        log.info(f"Scheduled {len(created_ids)} reminders for booking {booking_request_id}")
        return created_ids
    
    async def schedule_reminders_for_appointment(
        self,
        db: AsyncSession,
        appointment_id: str,
        appointment_time: datetime,
        patient_email: str,
        patient_phone: Optional[str],
        therapist_email: Optional[str] = None,
        therapist_phone: Optional[str] = None,
        settings: Optional[dict] = None,
    ) -> list[str]:
        """
        Schedule all reminders for an appointment (for existing patients).
        Returns list of created reminder IDs.
        """
        from models import ScheduledReminder, generate_uuid
        
        settings = settings or {}
        enable_24h = settings.get("enable_24h_reminder", True)
        enable_2h = settings.get("enable_2h_reminder", True)
        enable_30min = settings.get("enable_30min_reminder", True)
        email_reminders = settings.get("email_reminders", True)
        whatsapp_reminders = settings.get("whatsapp_reminders", False)
        notify_therapist = settings.get("notify_therapist", True)
        
        now = datetime.now(timezone.utc)
        created_ids = []
        
        reminders_config = []
        if enable_24h:
            reminders_config.append(("reminder_24h", REMINDER_24H))
        if enable_2h:
            reminders_config.append(("reminder_2h", REMINDER_2H))
        if enable_30min:
            reminders_config.append(("reminder_30min", REMINDER_30MIN))
        
        for reminder_type, minutes_before in reminders_config:
            scheduled_for = appointment_time - timedelta(minutes=minutes_before)
            
            if scheduled_for <= now:
                continue
            
            if email_reminders and patient_email:
                reminder = ScheduledReminder(
                    id=generate_uuid(),
                    appointment_id=appointment_id,
                    reminder_type=reminder_type,
                    channel="email",
                    recipient_type="patient",
                    recipient_email=patient_email,
                    scheduled_for=scheduled_for,
                    status="scheduled",
                )
                db.add(reminder)
                created_ids.append(reminder.id)
            
            if whatsapp_reminders and patient_phone:
                reminder = ScheduledReminder(
                    id=generate_uuid(),
                    appointment_id=appointment_id,
                    reminder_type=reminder_type,
                    channel="whatsapp",
                    recipient_type="patient",
                    recipient_phone=patient_phone,
                    scheduled_for=scheduled_for,
                    status="scheduled",
                )
                db.add(reminder)
                created_ids.append(reminder.id)
            
            if notify_therapist and therapist_email:
                reminder = ScheduledReminder(
                    id=generate_uuid(),
                    appointment_id=appointment_id,
                    reminder_type=reminder_type,
                    channel="email",
                    recipient_type="therapist",
                    recipient_email=therapist_email,
                    scheduled_for=scheduled_for,
                    status="scheduled",
                )
                db.add(reminder)
                created_ids.append(reminder.id)
        
        await db.commit()
        log.info(f"Scheduled {len(created_ids)} reminders for appointment {appointment_id}")
        return created_ids
    
    async def cancel_reminders_for_booking(
        self,
        db: AsyncSession,
        booking_request_id: str,
    ) -> int:
        """Cancel all pending reminders for a booking request."""
        from models import ScheduledReminder
        
        result = await db.execute(
            select(ScheduledReminder).where(
                and_(
                    ScheduledReminder.booking_request_id == booking_request_id,
                    ScheduledReminder.status == "scheduled",
                )
            )
        )
        reminders = result.scalars().all()
        
        cancelled_count = 0
        for reminder in reminders:
            reminder.status = "cancelled"
            reminder.cancelled_at = datetime.now(timezone.utc)
            cancelled_count += 1
        
        await db.commit()
        log.info(f"Cancelled {cancelled_count} reminders for booking {booking_request_id}")
        return cancelled_count
    
    async def cancel_reminders_for_appointment(
        self,
        db: AsyncSession,
        appointment_id: str,
    ) -> int:
        """Cancel all pending reminders for an appointment."""
        from models import ScheduledReminder
        
        result = await db.execute(
            select(ScheduledReminder).where(
                and_(
                    ScheduledReminder.appointment_id == appointment_id,
                    ScheduledReminder.status == "scheduled",
                )
            )
        )
        reminders = result.scalars().all()
        
        cancelled_count = 0
        for reminder in reminders:
            reminder.status = "cancelled"
            reminder.cancelled_at = datetime.now(timezone.utc)
            cancelled_count += 1
        
        await db.commit()
        log.info(f"Cancelled {cancelled_count} reminders for appointment {appointment_id}")
        return cancelled_count
    
    async def reschedule_reminders(
        self,
        db: AsyncSession,
        booking_request_id: Optional[str] = None,
        appointment_id: Optional[str] = None,
        new_appointment_time: datetime = None,
    ) -> int:
        """Reschedule all reminders for a new appointment time."""
        if booking_request_id:
            await self.cancel_reminders_for_booking(db, booking_request_id)
        elif appointment_id:
            await self.cancel_reminders_for_appointment(db, appointment_id)
        
        return 0
    
    async def get_due_reminders(
        self,
        db: AsyncSession,
        limit: int = 100,
    ) -> list:
        """Get all reminders that are due to be sent."""
        from models import ScheduledReminder
        
        now = datetime.now(timezone.utc)
        
        result = await db.execute(
            select(ScheduledReminder).where(
                and_(
                    ScheduledReminder.status == "scheduled",
                    ScheduledReminder.scheduled_for <= now,
                )
            ).limit(limit)
        )
        
        return result.scalars().all()
    
    async def process_due_reminders(self, db: AsyncSession) -> int:
        """Process all due reminders and send notifications."""
        from models import (
            ScheduledReminder, BookingRequest, Appointment, 
            Patient, Practitioner, PractitionerProfile, NotificationLog, generate_uuid
        )
        from notification_service import notification_service, format_date, format_time
        
        reminders = await self.get_due_reminders(db)
        processed_count = 0
        
        for reminder in reminders:
            try:
                placeholders = {}
                
                if reminder.booking_request_id:
                    booking_result = await db.execute(
                        select(BookingRequest).where(BookingRequest.id == reminder.booking_request_id)
                    )
                    booking = booking_result.scalar_one_or_none()
                    
                    if not booking or booking.status in ["cancelled", "expired"]:
                        reminder.status = "cancelled"
                        reminder.cancelled_at = datetime.now(timezone.utc)
                        continue
                    
                    prac_result = await db.execute(
                        select(Practitioner).where(Practitioner.id == booking.practitioner_id)
                    )
                    practitioner = prac_result.scalar_one_or_none()
                    
                    placeholders = {
                        "patient_name": booking.patient_name,
                        "therapist_name": practitioner.name if practitioner else "",
                        "appointment_date": format_date(booking.requested_date),
                        "appointment_time": format_time(booking.requested_start_time),
                        "meeting_link": booking.meeting_link or "",
                    }
                    
                elif reminder.appointment_id:
                    appt_result = await db.execute(
                        select(Appointment).where(Appointment.id == reminder.appointment_id)
                    )
                    appointment = appt_result.scalar_one_or_none()
                    
                    if not appointment or appointment.status in ["cancelled", "completed", "no_show"]:
                        reminder.status = "cancelled"
                        reminder.cancelled_at = datetime.now(timezone.utc)
                        continue
                    
                    patient_result = await db.execute(
                        select(Patient).where(Patient.id == appointment.patient_id)
                    )
                    patient = patient_result.scalar_one_or_none()
                    
                    prac_result = await db.execute(
                        select(Practitioner).where(Practitioner.id == appointment.practitioner_id)
                    )
                    practitioner = prac_result.scalar_one_or_none()
                    
                    placeholders = {
                        "patient_name": patient.full_name if patient else "",
                        "therapist_name": practitioner.name if practitioner else "",
                        "appointment_date": format_date(appointment.date),
                        "appointment_time": format_time(appointment.start_time),
                        "meeting_link": appointment.meeting_link or "",
                    }
                
                recipient = reminder.recipient_email or reminder.recipient_phone
                
                result = await notification_service.send_notification(
                    channel=reminder.channel,
                    recipient=recipient,
                    event_type=reminder.reminder_type,
                    placeholders=placeholders,
                )
                
                if result.success:
                    reminder.status = "sent"
                    reminder.sent_at = datetime.now(timezone.utc)
                    
                    notification_log = NotificationLog(
                        id=generate_uuid(),
                        practitioner_id=booking.practitioner_id if reminder.booking_request_id else appointment.practitioner_id,
                        recipient_type=reminder.recipient_type,
                        recipient_email=reminder.recipient_email,
                        recipient_phone=reminder.recipient_phone,
                        channel=reminder.channel,
                        event_type=reminder.reminder_type,
                        subject=f"Reminder: {reminder.reminder_type}",
                        body=str(placeholders),
                        reference_type="booking_request" if reminder.booking_request_id else "appointment",
                        reference_id=reminder.booking_request_id or reminder.appointment_id,
                        status="sent",
                        sent_at=datetime.now(timezone.utc),
                        provider_message_id=result.provider_message_id,
                        provider_response=result.provider_response,
                    )
                    db.add(notification_log)
                    reminder.notification_log_id = notification_log.id
                else:
                    reminder.status = "failed"
                    reminder.failure_reason = result.error
                
                processed_count += 1
                
            except Exception as e:
                log.error(f"Error processing reminder {reminder.id}: {e}")
                reminder.status = "failed"
                reminder.failure_reason = str(e)
        
        await db.commit()
        log.info(f"Processed {processed_count} reminders")
        return processed_count
    
    async def start_background_processor(
        self,
        get_db_func,
        interval_seconds: int = 60,
    ):
        """Start background task to process reminders periodically."""
        self._running = True
        
        async def processor():
            while self._running:
                try:
                    async for db in get_db_func():
                        await self.process_due_reminders(db)
                        break
                except Exception as e:
                    log.error(f"Error in reminder processor: {e}")
                
                await asyncio.sleep(interval_seconds)
        
        self._task = asyncio.create_task(processor())
        log.info(f"Started reminder processor with {interval_seconds}s interval")
    
    def stop_background_processor(self):
        """Stop the background reminder processor."""
        self._running = False
        if self._task:
            self._task.cancel()
        log.info("Stopped reminder processor")


reminder_scheduler = ReminderScheduler()
