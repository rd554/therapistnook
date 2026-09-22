"""
Reminder Scheduling Service — Phase 5

Schedules a single appointment reminder per booking, at the offset
configured in Settings > Messaging (MessagingPreferences.reminder_offset_minutes,
default 1440 = 24h). Also handles reminder cancellation when appointments
are cancelled/rescheduled.

Prior to the Settings rebuild, this scheduled three fixed reminders per
booking (24h / 2h / 30min before) with no way to configure or disable them
individually. Collapsed to one configurable reminder; see
schedule_reminders_for_booking / schedule_reminders_for_appointment.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

# Legacy reminder timing constants (in minutes before appointment). No longer
# read by the scheduling functions below (those now use
# MessagingPreferences.reminder_offset_minutes) — kept only because the
# "reminder_24h"/"reminder_2h"/"reminder_30min" type strings are still valid
# ScheduledReminder.reminder_type values for rows scheduled before this
# change, and still have matching entries in notification_service.py's
# DEFAULT_EMAIL_TEMPLATES/DEFAULT_WHATSAPP_MESSAGES for backward compat.
# New reminders use reminder_type="reminder" instead (see REMINDER_TIMINGS
# usage removed below).
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
    ) -> list[str]:
        """
        Schedule the reminder for a booking request, at the single offset
        configured in Settings > Messaging (MessagingPreferences.reminder_offset_minutes),
        on whichever channel(s) are enabled there for the "reminder" event.

        Previously scheduled three fixed reminders (24h/2h/30min before) and
        took a `settings` dict of enable flags that no caller actually
        passed — dropped along with the collapse to one configurable
        reminder as part of the Settings rebuild — see
        settings-phase1-plan.md. ScheduledReminder rows created before this
        change keep their original 24h/2h/30min offsets; this only changes
        reminders scheduled from here on.
        """
        from models import ScheduledReminder, generate_uuid
        import settings_service

        prefs = await settings_service.get_messaging_preferences(db)
        offset_minutes = prefs.reminder_offset_minutes
        email_reminders = prefs.reminder_email
        whatsapp_reminders = prefs.reminder_whatsapp

        now = datetime.now(timezone.utc)
        created_ids = []

        scheduled_for = appointment_time - timedelta(minutes=offset_minutes)

        if scheduled_for > now:
            if email_reminders and patient_email:
                reminder = ScheduledReminder(
                    id=generate_uuid(),
                    booking_request_id=booking_request_id,
                    reminder_type="reminder",
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
                    reminder_type="reminder",
                    channel="whatsapp",
                    recipient_type="patient",
                    recipient_phone=patient_phone,
                    scheduled_for=scheduled_for,
                    status="scheduled",
                )
                db.add(reminder)
                created_ids.append(reminder.id)

        await db.commit()
        log.info(f"Scheduled {len(created_ids)} reminder(s) for booking {booking_request_id}")
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
        Schedule the reminder for an appointment (for existing patients), at
        the single configured offset — see schedule_reminders_for_booking's
        docstring for the collapse-to-one-reminder rationale. Note: this
        function currently has no callers anywhere in the codebase; kept
        consistent with the booking-flow version rather than left stale.
        Returns list of created reminder IDs.
        """
        from models import ScheduledReminder, generate_uuid
        import settings_service

        settings = settings or {}
        notify_therapist = settings.get("notify_therapist", True)

        prefs = await settings_service.get_messaging_preferences(db)
        offset_minutes = prefs.reminder_offset_minutes
        email_reminders = prefs.reminder_email
        whatsapp_reminders = prefs.reminder_whatsapp

        now = datetime.now(timezone.utc)
        created_ids = []

        scheduled_for = appointment_time - timedelta(minutes=offset_minutes)

        if scheduled_for > now:
            if email_reminders and patient_email:
                reminder = ScheduledReminder(
                    id=generate_uuid(),
                    appointment_id=appointment_id,
                    reminder_type="reminder",
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
                    reminder_type="reminder",
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
                    reminder_type="reminder",
                    channel="email",
                    recipient_type="therapist",
                    recipient_email=therapist_email,
                    scheduled_for=scheduled_for,
                    status="scheduled",
                )
                db.add(reminder)
                created_ids.append(reminder.id)

        await db.commit()
        log.info(f"Scheduled {len(created_ids)} reminder(s) for appointment {appointment_id}")
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

                whatsapp_config = None
                if reminder.channel == "whatsapp":
                    from models import WhatsAppConfig
                    wa_result = await db.execute(select(WhatsAppConfig).limit(1))
                    wa_config = wa_result.scalar_one_or_none()
                    if wa_config and wa_config.is_enabled:
                        whatsapp_config = {
                            "phone_number_id": wa_config.phone_number_id,
                            "access_token": wa_config.access_token,
                        }

                # gate_event="reminder" applies to both the new single-offset
                # rows (reminder_type == "reminder") and any older
                # reminder_24h/2h/30min rows still in flight from before the
                # collapse — they're all "reminder" for messaging-preferences
                # purposes even though reminder_type still picks the template.
                result = await notification_service.send_notification(
                    channel=reminder.channel,
                    recipient=recipient,
                    event_type=reminder.reminder_type,
                    placeholders=placeholders,
                    whatsapp_config=whatsapp_config,
                    db=db,
                    gate_event="reminder",
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
