"""
Notification Service — Phase 5

Handles all notifications including:
- Email notifications with templates
- WhatsApp notifications (Business API)
- Template management with placeholders
- Notification logging
"""

import os
import re
import smtplib
import logging
import httpx
from datetime import datetime, timezone, date
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Any
from abc import ABC, abstractmethod
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

# Configuration from environment
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SITE_URL = os.getenv("SITE_URL", "http://localhost:5173")
OWNER_NAME = os.getenv("OWNER_NAME", "MMPI-2 Assessment Platform")

# WhatsApp Business API
# Graph API versions are retired ~2 years after release (v18.0 went dark Jan 2026) —
# bump this periodically; see https://developers.facebook.com/docs/graph-api/changelog
WHATSAPP_API_URL = "https://graph.facebook.com/v23.0"


class NotificationResult:
    """Result of sending a notification."""
    
    def __init__(
        self,
        success: bool,
        provider_message_id: Optional[str] = None,
        error: Optional[str] = None,
        provider_response: Optional[dict] = None,
    ):
        self.success = success
        self.provider_message_id = provider_message_id
        self.error = error
        self.provider_response = provider_response


class NotificationChannel(ABC):
    """Abstract base class for notification channels."""
    
    @property
    @abstractmethod
    def channel_name(self) -> str:
        pass
    
    @abstractmethod
    async def send(
        self,
        recipient: str,
        subject: Optional[str],
        body: str,
        template_id: Optional[str] = None,
        template_params: Optional[dict] = None,
    ) -> NotificationResult:
        pass
    
    @abstractmethod
    def is_configured(self) -> bool:
        pass


class EmailChannel(NotificationChannel):
    """Email notification channel using SMTP.

    Each field falls back independently to the SMTP_* env var default when
    not supplied — see NotificationService.send_email, which builds one of
    these per send from the live EmailConfiguration DB row (Settings >
    Messaging), rather than a channel permanently bound to the env vars this
    module was imported with. That's what makes the enable/disable toggle
    and saved SMTP credentials in Settings actually take effect.
    """

    def __init__(
        self,
        smtp_host: Optional[str] = None,
        smtp_port: Optional[int] = None,
        smtp_email: Optional[str] = None,
        smtp_password: Optional[str] = None,
        sender_name: Optional[str] = None,
    ):
        self.smtp_host = smtp_host or SMTP_HOST
        self.smtp_port = smtp_port or SMTP_PORT
        self.smtp_email = smtp_email or SMTP_EMAIL
        self.smtp_password = smtp_password or SMTP_PASSWORD
        self.sender_name = sender_name or OWNER_NAME

    @property
    def channel_name(self) -> str:
        return "email"

    def is_configured(self) -> bool:
        return bool(self.smtp_email and self.smtp_password and not self.smtp_password.startswith("your-"))

    async def send(
        self,
        recipient: str,
        subject: Optional[str],
        body: str,
        template_id: Optional[str] = None,
        template_params: Optional[dict] = None,
    ) -> NotificationResult:
        if not self.is_configured():
            log.warning("SMTP not configured — skipping email to %s", recipient)
            return NotificationResult(success=False, error="SMTP not configured")

        msg = MIMEMultipart("alternative")
        msg["From"] = f"{self.sender_name} <{self.smtp_email}>"
        msg["To"] = recipient
        msg["Subject"] = subject or "Notification"
        msg.attach(MIMEText(body, "html"))

        try:
            with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=15) as server:
                server.starttls()
                server.login(self.smtp_email, self.smtp_password)
                server.sendmail(self.smtp_email, recipient, msg.as_string())

            log.info("Email sent to %s", recipient)
            return NotificationResult(success=True)
        except Exception as e:
            log.error("Failed to send email to %s: %s", recipient, e)
            return NotificationResult(success=False, error=str(e))


class WhatsAppChannel(NotificationChannel):
    """WhatsApp Business API notification channel."""
    
    def __init__(
        self,
        phone_number_id: Optional[str] = None,
        access_token: Optional[str] = None,
    ):
        self.phone_number_id = phone_number_id
        self.access_token = access_token
    
    @property
    def channel_name(self) -> str:
        return "whatsapp"
    
    def is_configured(self) -> bool:
        return bool(self.phone_number_id and self.access_token)
    
    def _format_phone_number(self, phone: str) -> str:
        """Format phone number for WhatsApp API (remove +, spaces, etc.).

        A leading '0' is always a local trunk prefix, never part of a country
        code, so that normalization runs first regardless of length (e.g.
        Indian numbers are sometimes typed as "0" + 10 digits = 11 digits,
        which would otherwise be mistaken for an already-has-country-code
        number by the length check below). Once there's no leading zero,
        numbers that already carry a country code (leading '+', or more than
        10 digits once cleaned) are trusted as-is — the India-only 91-prefix
        heuristic only applies to bare 10-digit local numbers, so this
        doesn't mangle e.g. US test numbers (+1...).
        """
        cleaned = re.sub(r'[^\d]', '', phone)
        if not phone.strip().startswith('+') and cleaned.startswith('0'):
            return '91' + cleaned[1:]
        if phone.strip().startswith('+') or len(cleaned) > 10:
            return cleaned
        if len(cleaned) == 10:
            cleaned = '91' + cleaned
        return cleaned

    async def send(
        self,
        recipient: str,
        subject: Optional[str],
        body: str,
        template_id: Optional[str] = None,
        template_params: Optional[dict] = None,
        language_code: str = "en_US",
    ) -> NotificationResult:
        if not self.is_configured():
            log.warning("WhatsApp not configured — skipping message to %s", recipient)
            return NotificationResult(success=False, error="WhatsApp not configured")
        
        phone = self._format_phone_number(recipient)
        
        try:
            async with httpx.AsyncClient() as client:
                if template_id:
                    payload = {
                        "messaging_product": "whatsapp",
                        "to": phone,
                        "type": "template",
                        "template": {
                            "name": template_id,
                            "language": {"code": language_code},
                        }
                    }
                    
                    if template_params:
                        components = []
                        if "body_params" in template_params:
                            components.append({
                                "type": "body",
                                "parameters": [
                                    {"type": "text", "text": str(p)}
                                    for p in template_params["body_params"]
                                ]
                            })
                        if components:
                            payload["template"]["components"] = components
                else:
                    payload = {
                        "messaging_product": "whatsapp",
                        "to": phone,
                        "type": "text",
                        "text": {"body": body}
                    }
                
                response = await client.post(
                    f"{WHATSAPP_API_URL}/{self.phone_number_id}/messages",
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=30,
                )
                
                response_data = response.json()
                
                if response.status_code == 200:
                    message_id = response_data.get("messages", [{}])[0].get("id")
                    log.info("WhatsApp message sent to %s, id: %s", phone, message_id)
                    return NotificationResult(
                        success=True,
                        provider_message_id=message_id,
                        provider_response=response_data,
                    )
                else:
                    error = response_data.get("error", {}).get("message", "Unknown error")
                    log.error("WhatsApp API error: %s", error)
                    return NotificationResult(
                        success=False,
                        error=error,
                        provider_response=response_data,
                    )
        except Exception as e:
            log.error("Failed to send WhatsApp message to %s: %s", phone, e)
            return NotificationResult(success=False, error=str(e))


class TemplatePlaceholders:
    """Supported template placeholders."""
    
    PATIENT_NAME = "{{patient_name}}"
    THERAPIST_NAME = "{{therapist_name}}"
    APPOINTMENT_DATE = "{{appointment_date}}"
    APPOINTMENT_TIME = "{{appointment_time}}"
    MEETING_LINK = "{{meeting_link}}"
    PAYMENT_LINK = "{{payment_link}}"
    PAYMENT_AMOUNT = "{{payment_amount}}"
    SESSION_TYPE = "{{session_type}}"
    BOOKING_TOKEN = "{{booking_token}}"
    RECEIPT_NUMBER = "{{receipt_number}}"
    CLINIC_ADDRESS = "{{clinic_address}}"
    THERAPIST_PHONE = "{{therapist_phone}}"
    THERAPIST_EMAIL = "{{therapist_email}}"
    CANCELLATION_REASON = "{{cancellation_reason}}"
    BOOKING_URL = "{{booking_url}}"


def render_template(template: str, placeholders: dict) -> str:
    """Render a template with placeholder values."""
    result = template
    for key, value in placeholders.items():
        placeholder = "{{" + key + "}}"
        result = result.replace(placeholder, str(value) if value else "")
    return result


def format_date(d: date) -> str:
    """Format date for display."""
    return d.strftime("%A, %B %d, %Y")


def format_time(dt: datetime) -> str:
    """Format time for display."""
    return dt.strftime("%I:%M %p")


def format_amount(amount: int, currency: str = "INR") -> str:
    """Format amount from paise to display string."""
    if currency == "INR":
        return f"₹{amount / 100:,.2f}"
    return f"{currency} {amount / 100:,.2f}"


DEFAULT_EMAIL_TEMPLATES = {
    "booking_created": {
        # This fires for the public "Book a session" CTA, which requests a
        # free introductory call — not a paid session. No payment is taken
        # or owed at this step; the therapist reviews the request and calls
        # to confirm. See accept_booking_request in main.py.
        "subject": "Request Received - {{therapist_name}}",
        "body": """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
    <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #ecfdf5; border-radius: 16px; padding: 16px;">
            <span style="font-size: 28px;">📅</span>
        </div>
        <h1 style="font-size: 24px; color: #111827; margin: 16px 0 4px;">Request Received</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 0;">Your introductory call request has been submitted</p>
    </div>

    <p style="font-size: 15px; line-height: 1.7;">Hi <strong>{{patient_name}}</strong>,</p>

    <p style="font-size: 15px; line-height: 1.7;">
        Thank you for requesting an introductory call with <strong>{{therapist_name}}</strong>. There's nothing to pay for this call — {{therapist_name}} will review your request and call you to confirm a time.
    </p>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 14px; color: #374151; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.05em;">Requested Time</h3>
        <table style="width: 100%; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #6b7280; width: 120px;">Date:</td><td style="padding: 6px 0; font-weight: 600; color: #111827;">{{appointment_date}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Time:</td><td style="padding: 6px 0; font-weight: 600; color: #111827;">{{appointment_time}}</td></tr>
        </table>
    </div>

    <p style="font-size: 13px; color: #6b7280; text-align: center;">
        View your request status anytime at:<br>
        <a href="{{booking_url}}" style="color: #2563eb;">{{booking_url}}</a>
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        This email was sent by {{therapist_name}}'s practice.
    </p>
</div>
"""
    },
    
    "payment_pending": {
        "subject": "Payment Reminder - {{therapist_name}}",
        "body": """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
    <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #fef3c7; border-radius: 16px; padding: 16px;">
            <span style="font-size: 28px;">💳</span>
        </div>
        <h1 style="font-size: 24px; color: #111827; margin: 16px 0 4px;">Payment Reminder</h1>
    </div>

    <p style="font-size: 15px; line-height: 1.7;">Hi <strong>{{patient_name}}</strong>,</p>
    
    <p style="font-size: 15px; line-height: 1.7;">
        Your appointment with <strong>{{therapist_name}}</strong> is pending payment confirmation.
    </p>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <table style="width: 100%; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #6b7280;">Date:</td><td style="padding: 6px 0; font-weight: 600;">{{appointment_date}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Time:</td><td style="padding: 6px 0; font-weight: 600;">{{appointment_time}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Amount:</td><td style="padding: 6px 0; font-weight: 600;">{{payment_amount}}</td></tr>
        </table>
    </div>

    <div style="text-align: center; margin: 24px 0;">
        <a href="{{payment_link}}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600;">
            Complete Payment →
        </a>
    </div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        This email was sent by {{therapist_name}}'s practice.
    </p>
</div>
"""
    },
    
    "payment_successful": {
        "subject": "Payment Confirmed - {{therapist_name}}",
        "body": """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
    <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #d1fae5; border-radius: 16px; padding: 16px;">
            <span style="font-size: 28px;">✅</span>
        </div>
        <h1 style="font-size: 24px; color: #111827; margin: 16px 0 4px;">Payment Confirmed!</h1>
    </div>

    <p style="font-size: 15px; line-height: 1.7;">Hi <strong>{{patient_name}}</strong>,</p>
    
    <p style="font-size: 15px; line-height: 1.7;">
        Your payment of <strong>{{payment_amount}}</strong> has been received. Your appointment is now confirmed!
    </p>

    <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 14px; color: #065f46; margin: 0 0 12px;">Payment Invoice</h3>
        <p style="font-size: 14px; color: #065f46; margin: 0;">Invoice #: <strong>{{receipt_number}}</strong></p>
    </div>

    <p style="font-size: 13px; color: #6b7280; text-align: center;">
        <a href="{{booking_url}}" style="color: #2563eb;">View your appointment details</a>
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        This email was sent by {{therapist_name}}'s practice.
    </p>
</div>
"""
    },
    
    "appointment_confirmed": {
        "subject": "Appointment Confirmed - {{appointment_date}}",
        "body": """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
    <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #dbeafe; border-radius: 16px; padding: 16px;">
            <span style="font-size: 28px;">🎉</span>
        </div>
        <h1 style="font-size: 24px; color: #111827; margin: 16px 0 4px;">Appointment Confirmed!</h1>
    </div>

    <p style="font-size: 15px; line-height: 1.7;">Hi <strong>{{patient_name}}</strong>,</p>
    
    <p style="font-size: 15px; line-height: 1.7;">
        Your appointment with <strong>{{therapist_name}}</strong> is confirmed!
    </p>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 14px; color: #374151; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.05em;">Appointment Details</h3>
        <table style="width: 100%; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #6b7280; width: 120px;">Date:</td><td style="padding: 6px 0; font-weight: 600; color: #111827;">{{appointment_date}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Time:</td><td style="padding: 6px 0; font-weight: 600; color: #111827;">{{appointment_time}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Session Type:</td><td style="padding: 6px 0; font-weight: 600; color: #111827;">{{session_type}}</td></tr>
        </table>
    </div>

    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 14px; color: #1e40af; margin: 0 0 8px;">📹 Meeting Link</h3>
        <p style="font-size: 14px; color: #374151; margin: 0 0 12px;">
            Join your session using this link:
        </p>
        <div style="background: #ffffff; border: 1px solid #93c5fd; border-radius: 8px; padding: 12px; word-break: break-all;">
            <a href="{{meeting_link}}" style="color: #2563eb; font-size: 14px; text-decoration: none;">
                {{meeting_link}}
            </a>
        </div>
    </div>

    <p style="font-size: 13px; color: #6b7280; text-align: center;">
        <a href="{{booking_url}}" style="color: #2563eb;">View appointment details</a>
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        This email was sent by {{therapist_name}}'s practice.
    </p>
</div>
"""
    },
    
    "meeting_link_generated": {
        "subject": "Your Meeting Link - {{therapist_name}}",
        "body": """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
    <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #eff6ff; border-radius: 16px; padding: 16px;">
            <span style="font-size: 28px;">📹</span>
        </div>
        <h1 style="font-size: 24px; color: #111827; margin: 16px 0 4px;">Your Meeting Link</h1>
    </div>

    <p style="font-size: 15px; line-height: 1.7;">Hi <strong>{{patient_name}}</strong>,</p>
    
    <p style="font-size: 15px; line-height: 1.7;">
        Here's your meeting link for your session with <strong>{{therapist_name}}</strong>:
    </p>

    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <p style="font-size: 14px; color: #374151; margin: 0 0 12px;"><strong>{{appointment_date}}</strong> at <strong>{{appointment_time}}</strong></p>
        <div style="background: #ffffff; border: 1px solid #93c5fd; border-radius: 8px; padding: 12px; word-break: break-all;">
            <a href="{{meeting_link}}" style="color: #2563eb; font-size: 14px; text-decoration: none;">
                {{meeting_link}}
            </a>
        </div>
    </div>

    <div style="text-align: center; margin: 24px 0;">
        <a href="{{meeting_link}}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600;">
            Join Meeting →
        </a>
    </div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        This email was sent by {{therapist_name}}'s practice.
    </p>
</div>
"""
    },
    
    "reminder": {
        "subject": "Reminder: Upcoming Appointment with {{therapist_name}}",
        "body": """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
    <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #fef3c7; border-radius: 16px; padding: 16px;">
            <span style="font-size: 28px;">⏰</span>
        </div>
        <h1 style="font-size: 24px; color: #111827; margin: 16px 0 4px;">Appointment Reminder</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 0;">You have an upcoming session</p>
    </div>

    <p style="font-size: 15px; line-height: 1.7;">Hi <strong>{{patient_name}}</strong>,</p>

    <p style="font-size: 15px; line-height: 1.7;">
        This is a reminder that you have an upcoming appointment with <strong>{{therapist_name}}</strong>.
    </p>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <table style="width: 100%; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #6b7280;">Date:</td><td style="padding: 6px 0; font-weight: 600;">{{appointment_date}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Time:</td><td style="padding: 6px 0; font-weight: 600;">{{appointment_time}}</td></tr>
        </table>
    </div>

    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; margin: 24px 0;">
        <p style="font-size: 14px; color: #1e40af; margin: 0;">
            <strong>Meeting Link:</strong><br>
            <a href="{{meeting_link}}" style="color: #2563eb;">{{meeting_link}}</a>
        </p>
    </div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        This email was sent by {{therapist_name}}'s practice.
    </p>
</div>
"""
    },

    "reminder_24h": {
        "subject": "Reminder: Appointment Tomorrow with {{therapist_name}}",
        "body": """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
    <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #fef3c7; border-radius: 16px; padding: 16px;">
            <span style="font-size: 28px;">⏰</span>
        </div>
        <h1 style="font-size: 24px; color: #111827; margin: 16px 0 4px;">Appointment Reminder</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 0;">Your session is tomorrow!</p>
    </div>

    <p style="font-size: 15px; line-height: 1.7;">Hi <strong>{{patient_name}}</strong>,</p>
    
    <p style="font-size: 15px; line-height: 1.7;">
        This is a friendly reminder that you have an appointment tomorrow with <strong>{{therapist_name}}</strong>.
    </p>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <table style="width: 100%; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #6b7280;">Date:</td><td style="padding: 6px 0; font-weight: 600;">{{appointment_date}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Time:</td><td style="padding: 6px 0; font-weight: 600;">{{appointment_time}}</td></tr>
        </table>
    </div>

    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; margin: 24px 0;">
        <p style="font-size: 14px; color: #1e40af; margin: 0;">
            <strong>Meeting Link:</strong><br>
            <a href="{{meeting_link}}" style="color: #2563eb;">{{meeting_link}}</a>
        </p>
    </div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        This email was sent by {{therapist_name}}'s practice.
    </p>
</div>
"""
    },
    
    "reminder_2h": {
        "subject": "Reminder: Appointment in 2 Hours with {{therapist_name}}",
        "body": """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
    <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #fef3c7; border-radius: 16px; padding: 16px;">
            <span style="font-size: 28px;">⏰</span>
        </div>
        <h1 style="font-size: 24px; color: #111827; margin: 16px 0 4px;">2 Hours to Go!</h1>
    </div>

    <p style="font-size: 15px; line-height: 1.7;">Hi <strong>{{patient_name}}</strong>,</p>
    
    <p style="font-size: 15px; line-height: 1.7;">
        Your appointment with <strong>{{therapist_name}}</strong> is in 2 hours at <strong>{{appointment_time}}</strong>.
    </p>

    <div style="text-align: center; margin: 24px 0;">
        <a href="{{meeting_link}}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600;">
            Join Meeting →
        </a>
    </div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        This email was sent by {{therapist_name}}'s practice.
    </p>
</div>
"""
    },
    
    "reminder_30min": {
        "subject": "Starting Soon: Appointment in 30 Minutes",
        "body": """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
    <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #fee2e2; border-radius: 16px; padding: 16px;">
            <span style="font-size: 28px;">🔔</span>
        </div>
        <h1 style="font-size: 24px; color: #111827; margin: 16px 0 4px;">Starting in 30 Minutes!</h1>
    </div>

    <p style="font-size: 15px; line-height: 1.7;">Hi <strong>{{patient_name}}</strong>,</p>
    
    <p style="font-size: 15px; line-height: 1.7;">
        Your appointment with <strong>{{therapist_name}}</strong> starts in 30 minutes.
    </p>

    <div style="text-align: center; margin: 24px 0;">
        <a href="{{meeting_link}}" style="display: inline-block; background: #dc2626; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600;">
            Join Meeting Now →
        </a>
    </div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        This email was sent by {{therapist_name}}'s practice.
    </p>
</div>
"""
    },
    
    "appointment_cancelled": {
        "subject": "Appointment Cancelled - {{therapist_name}}",
        "body": """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
    <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #fee2e2; border-radius: 16px; padding: 16px;">
            <span style="font-size: 28px;">❌</span>
        </div>
        <h1 style="font-size: 24px; color: #111827; margin: 16px 0 4px;">Appointment Cancelled</h1>
    </div>

    <p style="font-size: 15px; line-height: 1.7;">Hi <strong>{{patient_name}}</strong>,</p>
    
    <p style="font-size: 15px; line-height: 1.7;">
        Your appointment with <strong>{{therapist_name}}</strong> on <strong>{{appointment_date}}</strong> at <strong>{{appointment_time}}</strong> has been cancelled.
    </p>

    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; margin: 24px 0;">
        <p style="font-size: 14px; color: #991b1b; margin: 0;">
            <strong>Reason:</strong> {{cancellation_reason}}
        </p>
    </div>

    <p style="font-size: 14px; color: #6b7280;">
        If you have any questions, please contact us at {{therapist_email}} or {{therapist_phone}}.
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        This email was sent by {{therapist_name}}'s practice.
    </p>
</div>
"""
    },
    
    "appointment_rescheduled": {
        "subject": "Appointment Rescheduled - {{therapist_name}}",
        "body": """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
    <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #fef3c7; border-radius: 16px; padding: 16px;">
            <span style="font-size: 28px;">🔄</span>
        </div>
        <h1 style="font-size: 24px; color: #111827; margin: 16px 0 4px;">Appointment Rescheduled</h1>
    </div>

    <p style="font-size: 15px; line-height: 1.7;">Hi <strong>{{patient_name}}</strong>,</p>
    
    <p style="font-size: 15px; line-height: 1.7;">
        Your appointment with <strong>{{therapist_name}}</strong> has been rescheduled.
    </p>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 14px; color: #374151; margin: 0 0 12px;">New Appointment Time</h3>
        <table style="width: 100%; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #6b7280;">Date:</td><td style="padding: 6px 0; font-weight: 600;">{{appointment_date}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Time:</td><td style="padding: 6px 0; font-weight: 600;">{{appointment_time}}</td></tr>
        </table>
    </div>

    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; margin: 24px 0;">
        <p style="font-size: 14px; color: #1e40af; margin: 0;">
            <strong>Meeting Link:</strong><br>
            <a href="{{meeting_link}}" style="color: #2563eb;">{{meeting_link}}</a>
        </p>
    </div>

    <p style="font-size: 13px; color: #6b7280; text-align: center;">
        <a href="{{booking_url}}" style="color: #2563eb;">View appointment details</a>
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        This email was sent by {{therapist_name}}'s practice.
    </p>
</div>
"""
    },
    
    "new_booking_therapist": {
        "subject": "New Booking Request from {{patient_name}}",
        "body": """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
    <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #dbeafe; border-radius: 16px; padding: 16px;">
            <span style="font-size: 28px;">📥</span>
        </div>
        <h1 style="font-size: 24px; color: #111827; margin: 16px 0 4px;">New Booking Request</h1>
    </div>

    <p style="font-size: 15px; line-height: 1.7;">
        You have a new booking request from <strong>{{patient_name}}</strong>.
    </p>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <table style="width: 100%; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #6b7280;">Patient:</td><td style="padding: 6px 0; font-weight: 600;">{{patient_name}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Date:</td><td style="padding: 6px 0; font-weight: 600;">{{appointment_date}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Time:</td><td style="padding: 6px 0; font-weight: 600;">{{appointment_time}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Session Type:</td><td style="padding: 6px 0; font-weight: 600;">{{session_type}}</td></tr>
        </table>
    </div>

    <p style="font-size: 14px; color: #6b7280;">
        The appointment will be automatically confirmed once payment is received.
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        You received this notification because you have a public profile.
    </p>
</div>
"""
    },
    
    "payment_received_therapist": {
        "subject": "Payment Received - {{patient_name}}",
        "body": """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
    <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #d1fae5; border-radius: 16px; padding: 16px;">
            <span style="font-size: 28px;">💰</span>
        </div>
        <h1 style="font-size: 24px; color: #111827; margin: 16px 0 4px;">Payment Received</h1>
    </div>

    <p style="font-size: 15px; line-height: 1.7;">
        Payment of <strong>{{payment_amount}}</strong> has been received from <strong>{{patient_name}}</strong>.
    </p>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <table style="width: 100%; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #6b7280;">Patient:</td><td style="padding: 6px 0; font-weight: 600;">{{patient_name}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Amount:</td><td style="padding: 6px 0; font-weight: 600;">{{payment_amount}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Appointment:</td><td style="padding: 6px 0; font-weight: 600;">{{appointment_date}} at {{appointment_time}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Invoice:</td><td style="padding: 6px 0; font-weight: 600;">{{receipt_number}}</td></tr>
        </table>
    </div>

    <p style="font-size: 14px; color: #065f46;">
        ✅ The appointment has been automatically confirmed and a meeting link has been generated.
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        View your dashboard for more details.
    </p>
</div>
"""
    },
}


DEFAULT_WHATSAPP_MESSAGES = {
    "booking_created": "Hi {{patient_name}}! Your introductory call request with {{therapist_name}} on {{appointment_date}} at {{appointment_time}} has been received — nothing to pay. {{therapist_name}} will call you to confirm: {{booking_url}}",
    
    "payment_pending": "Reminder: Your appointment with {{therapist_name}} on {{appointment_date}} is pending payment. Complete payment here: {{payment_link}}",
    
    "payment_successful": "Payment confirmed! Your appointment with {{therapist_name}} on {{appointment_date}} at {{appointment_time}} is now confirmed. Invoice: {{receipt_number}}",
    
    "appointment_confirmed": "✅ Appointment Confirmed!\n\n👨‍⚕️ {{therapist_name}}\n📅 {{appointment_date}}\n⏰ {{appointment_time}}\n\n📹 Meeting Link: {{meeting_link}}",
    
    "meeting_link_generated": "Your meeting link for {{appointment_date}} at {{appointment_time}}:\n\n{{meeting_link}}\n\nSee you soon!",
    
    "reminder": "⏰ Reminder: Your appointment with {{therapist_name}} is on {{appointment_date}} at {{appointment_time}}.\n\n📹 Join: {{meeting_link}}",

    "reminder_24h": "⏰ Reminder: Your appointment with {{therapist_name}} is tomorrow at {{appointment_time}}.\n\n📹 Join: {{meeting_link}}",
    
    "reminder_2h": "⏰ 2 Hour Reminder: Your session with {{therapist_name}} starts at {{appointment_time}}.\n\n📹 Join: {{meeting_link}}",
    
    "reminder_30min": "🔔 Starting Soon: Your session with {{therapist_name}} begins in 30 minutes!\n\n📹 Join now: {{meeting_link}}",
    
    "appointment_cancelled": "❌ Your appointment with {{therapist_name}} on {{appointment_date}} has been cancelled.\n\nReason: {{cancellation_reason}}\n\nContact: {{therapist_email}}",
    
    "appointment_rescheduled": "🔄 Appointment Rescheduled\n\nNew Time: {{appointment_date}} at {{appointment_time}}\n\n📹 Meeting Link: {{meeting_link}}",
}


class NotificationService:
    """Main notification service managing all channels and templates."""

    def __init__(self):
        pass

    def get_whatsapp_channel(
        self,
        phone_number_id: Optional[str] = None,
        access_token: Optional[str] = None,
    ) -> WhatsAppChannel:
        """Build a WhatsApp channel for the given config.

        No caching here: access tokens (especially the 24h temporary ones from
        Meta's quickstart) rotate, and a module-level NotificationService
        singleton previously cached channels keyed only on phone_number_id —
        so a freshly saved token would keep hitting Meta with the stale one
        until the process restarted. WhatsAppChannel construction is cheap
        (two strings) and send() opens its own httpx client per call, so
        there's nothing worth caching.
        """
        if phone_number_id:
            return WhatsAppChannel(phone_number_id, access_token)
        return WhatsAppChannel()

    def get_email_channel(
        self,
        smtp_host: Optional[str] = None,
        smtp_port: Optional[int] = None,
        smtp_email: Optional[str] = None,
        smtp_password: Optional[str] = None,
        sender_name: Optional[str] = None,
    ) -> EmailChannel:
        """Build an email channel for the given config. Same no-caching
        reasoning as get_whatsapp_channel — DB credentials (Settings >
        Messaging) can change at any time, so nothing is cached across sends.
        """
        return EmailChannel(smtp_host, smtp_port, smtp_email, smtp_password, sender_name)

    def get_email_template(self, event_type: str) -> Optional[dict]:
        """Get default email template for an event type."""
        return DEFAULT_EMAIL_TEMPLATES.get(event_type)
    
    def get_whatsapp_template(self, event_type: str) -> Optional[str]:
        """Get default WhatsApp message template for an event type."""
        return DEFAULT_WHATSAPP_MESSAGES.get(event_type)
    
    async def _is_gated_off(self, db, gate_event: Optional[str], channel: str) -> bool:
        """True if a patient-facing send should be skipped because Settings >
        Messaging has this event/channel combination turned off.

        `gate_event` is one of MessagingPreferences' six event names
        (session_booked/reminder/session_rescheduled/session_cancelled/
        payment_request/payment_received) — callers pass it explicitly only
        for the patient-facing sends the Messaging section actually governs.
        Practitioner-facing notifications (e.g. "new booking" alerts to the
        therapist) and one-off explicit actions (e.g. "email meeting link"
        from the Appointments list) pass no gate_event and are never blocked
        here — that's a different, pre-existing preference surface.

        Fails open (never gates off) on a lookup error — send_email/
        send_whatsapp are otherwise designed to never raise (the underlying
        channel.send() calls are themselves try/excepted into a
        NotificationResult), and callers like booking_service.py call these
        with no try/except of their own. A messaging_preferences read
        failure here must not turn into a 500 on the public booking path;
        better to send an email that a broken preferences read couldn't
        confirm was wanted than to break booking creation entirely.
        """
        if not gate_event or db is None:
            return False
        import settings_service
        try:
            return not await settings_service.is_message_enabled(db, gate_event, channel)
        except Exception as e:
            log.warning("Messaging preferences lookup failed for gate_event=%s channel=%s — failing open: %s", gate_event, channel, e)
            return False

    async def send_email(
        self,
        recipient_email: str,
        event_type: str,
        placeholders: dict,
        custom_template: Optional[dict] = None,
        db: Optional[AsyncSession] = None,
        gate_event: Optional[str] = None,
    ) -> NotificationResult:
        """Send an email notification.

        `db`, when provided, is used to read the live EmailConfiguration row
        (Settings > Messaging) — is_enabled is honored (a disabled config
        blocks the send outright) and each SMTP field falls back
        independently to the SMTP_* env vars when the DB field is empty.
        Without `db`, this falls back to pure env-var behavior.
        """
        if await self._is_gated_off(db, gate_event, "email"):
            log.info("Email to %s for %s skipped — disabled in messaging preferences", recipient_email, event_type)
            return NotificationResult(success=False, error="Disabled in messaging preferences")

        template = custom_template or self.get_email_template(event_type)

        if not template:
            return NotificationResult(success=False, error=f"No template for {event_type}")

        subject = render_template(template.get("subject", ""), placeholders)
        body = render_template(template.get("body", ""), placeholders)

        channel = EmailChannel()
        if db is not None:
            import settings_service
            config = await settings_service.get_email_config(db)
            if not config.is_enabled:
                log.info("Email to %s for %s skipped — disabled in Settings", recipient_email, event_type)
                return NotificationResult(success=False, error="Email disabled in Settings")
            channel = self.get_email_channel(
                smtp_host=config.smtp_host or None,
                smtp_port=config.smtp_port or None,
                smtp_email=config.smtp_username or None,
                smtp_password=config.smtp_password or None,
                sender_name=config.sender_name or None,
            )

        return await channel.send(recipient_email, subject, body)

    async def send_whatsapp(
        self,
        recipient_phone: str,
        event_type: str,
        placeholders: dict,
        phone_number_id: Optional[str] = None,
        access_token: Optional[str] = None,
        whatsapp_template_id: Optional[str] = None,
        template_params: Optional[dict] = None,
        language_code: str = "en_US",
        db: Optional[AsyncSession] = None,
        gate_event: Optional[str] = None,
    ) -> NotificationResult:
        """Send a WhatsApp notification."""
        if await self._is_gated_off(db, gate_event, "whatsapp"):
            log.info("WhatsApp to %s for %s skipped — disabled in messaging preferences", recipient_phone, event_type)
            return NotificationResult(success=False, error="Disabled in messaging preferences")

        channel = self.get_whatsapp_channel(phone_number_id, access_token)

        if whatsapp_template_id:
            return await channel.send(
                recipient_phone,
                None,
                "",
                template_id=whatsapp_template_id,
                template_params=template_params,
                language_code=language_code,
            )

        message_template = self.get_whatsapp_template(event_type)
        if not message_template:
            return NotificationResult(success=False, error=f"No template for {event_type}")

        body = render_template(message_template, placeholders)
        return await channel.send(recipient_phone, None, body)

    async def send_notification(
        self,
        channel: str,
        recipient: str,
        event_type: str,
        placeholders: dict,
        whatsapp_config: Optional[dict] = None,
        custom_template: Optional[dict] = None,
        db: Optional[AsyncSession] = None,
        gate_event: Optional[str] = None,
    ) -> NotificationResult:
        """Send a notification via the specified channel."""
        if channel == "email":
            return await self.send_email(recipient, event_type, placeholders, custom_template, db=db, gate_event=gate_event)
        elif channel == "whatsapp":
            return await self.send_whatsapp(
                recipient,
                event_type,
                placeholders,
                phone_number_id=whatsapp_config.get("phone_number_id") if whatsapp_config else None,
                access_token=whatsapp_config.get("access_token") if whatsapp_config else None,
                db=db,
                gate_event=gate_event,
            )
        else:
            return NotificationResult(success=False, error=f"Unknown channel: {channel}")


notification_service = NotificationService()
