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

log = logging.getLogger(__name__)

# Configuration from environment
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SITE_URL = os.getenv("SITE_URL", "http://localhost:5173")
OWNER_NAME = os.getenv("OWNER_NAME", "MMPI-2 Assessment Platform")

# WhatsApp Business API
WHATSAPP_API_URL = "https://graph.facebook.com/v18.0"


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
    """Email notification channel using SMTP."""
    
    @property
    def channel_name(self) -> str:
        return "email"
    
    def is_configured(self) -> bool:
        return bool(SMTP_EMAIL and SMTP_PASSWORD and not SMTP_PASSWORD.startswith("your-"))
    
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
        msg["From"] = f"{OWNER_NAME} <{SMTP_EMAIL}>"
        msg["To"] = recipient
        msg["Subject"] = subject or "Notification"
        msg.attach(MIMEText(body, "html"))
        
        try:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
                server.starttls()
                server.login(SMTP_EMAIL, SMTP_PASSWORD)
                server.sendmail(SMTP_EMAIL, recipient, msg.as_string())
            
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
        """Format phone number for WhatsApp API (remove +, spaces, etc.)."""
        cleaned = re.sub(r'[^\d]', '', phone)
        if cleaned.startswith('0'):
            cleaned = '91' + cleaned[1:]
        elif not cleaned.startswith('91') and len(cleaned) == 10:
            cleaned = '91' + cleaned
        return cleaned
    
    async def send(
        self,
        recipient: str,
        subject: Optional[str],
        body: str,
        template_id: Optional[str] = None,
        template_params: Optional[dict] = None,
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
                            "language": {"code": "en"},
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
        "subject": "Booking Request Received - {{therapist_name}}",
        "body": """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
    <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #ecfdf5; border-radius: 16px; padding: 16px;">
            <span style="font-size: 28px;">📅</span>
        </div>
        <h1 style="font-size: 24px; color: #111827; margin: 16px 0 4px;">Booking Request Received</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 0;">Your appointment request has been submitted</p>
    </div>

    <p style="font-size: 15px; line-height: 1.7;">Hi <strong>{{patient_name}}</strong>,</p>
    
    <p style="font-size: 15px; line-height: 1.7;">
        Thank you for requesting an appointment with <strong>{{therapist_name}}</strong>.
    </p>

    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 14px; color: #374151; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.05em;">Appointment Details</h3>
        <table style="width: 100%; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #6b7280; width: 120px;">Date:</td><td style="padding: 6px 0; font-weight: 600; color: #111827;">{{appointment_date}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Time:</td><td style="padding: 6px 0; font-weight: 600; color: #111827;">{{appointment_time}}</td></tr>
            <tr><td style="padding: 6px 0; color: #6b7280;">Session Type:</td><td style="padding: 6px 0; font-weight: 600; color: #111827;">{{session_type}}</td></tr>
        </table>
    </div>

    <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 12px; padding: 16px; margin: 24px 0;">
        <p style="font-size: 14px; color: #92400e; margin: 0;">
            <strong>⏳ Payment Required:</strong> Please complete your payment to confirm this appointment.
        </p>
    </div>

    <div style="text-align: center; margin: 24px 0;">
        <a href="{{payment_link}}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600;">
            Complete Payment →
        </a>
    </div>

    <p style="font-size: 13px; color: #6b7280; text-align: center;">
        View your booking status anytime at:<br>
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
        <h3 style="font-size: 14px; color: #065f46; margin: 0 0 12px;">Payment Receipt</h3>
        <p style="font-size: 14px; color: #065f46; margin: 0;">Receipt #: <strong>{{receipt_number}}</strong></p>
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
            <tr><td style="padding: 6px 0; color: #6b7280;">Receipt:</td><td style="padding: 6px 0; font-weight: 600;">{{receipt_number}}</td></tr>
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
    "booking_created": "Hi {{patient_name}}! Your appointment request with {{therapist_name}} on {{appointment_date}} at {{appointment_time}} has been received. Please complete payment to confirm: {{payment_link}}",
    
    "payment_pending": "Reminder: Your appointment with {{therapist_name}} on {{appointment_date}} is pending payment. Complete payment here: {{payment_link}}",
    
    "payment_successful": "Payment confirmed! Your appointment with {{therapist_name}} on {{appointment_date}} at {{appointment_time}} is now confirmed. Receipt: {{receipt_number}}",
    
    "appointment_confirmed": "✅ Appointment Confirmed!\n\n👨‍⚕️ {{therapist_name}}\n📅 {{appointment_date}}\n⏰ {{appointment_time}}\n\n📹 Meeting Link: {{meeting_link}}",
    
    "meeting_link_generated": "Your meeting link for {{appointment_date}} at {{appointment_time}}:\n\n{{meeting_link}}\n\nSee you soon!",
    
    "reminder_24h": "⏰ Reminder: Your appointment with {{therapist_name}} is tomorrow at {{appointment_time}}.\n\n📹 Join: {{meeting_link}}",
    
    "reminder_2h": "⏰ 2 Hour Reminder: Your session with {{therapist_name}} starts at {{appointment_time}}.\n\n📹 Join: {{meeting_link}}",
    
    "reminder_30min": "🔔 Starting Soon: Your session with {{therapist_name}} begins in 30 minutes!\n\n📹 Join now: {{meeting_link}}",
    
    "appointment_cancelled": "❌ Your appointment with {{therapist_name}} on {{appointment_date}} has been cancelled.\n\nReason: {{cancellation_reason}}\n\nContact: {{therapist_email}}",
    
    "appointment_rescheduled": "🔄 Appointment Rescheduled\n\nNew Time: {{appointment_date}} at {{appointment_time}}\n\n📹 Meeting Link: {{meeting_link}}",
}


class NotificationService:
    """Main notification service managing all channels and templates."""
    
    def __init__(self):
        self._email_channel = EmailChannel()
        self._whatsapp_configs: dict[str, WhatsAppChannel] = {}
    
    def get_whatsapp_channel(
        self,
        phone_number_id: Optional[str] = None,
        access_token: Optional[str] = None,
    ) -> WhatsAppChannel:
        """Get or create a WhatsApp channel with specific config."""
        if phone_number_id:
            key = phone_number_id
            if key not in self._whatsapp_configs:
                self._whatsapp_configs[key] = WhatsAppChannel(phone_number_id, access_token)
            return self._whatsapp_configs[key]
        return WhatsAppChannel()
    
    def get_email_template(self, event_type: str) -> Optional[dict]:
        """Get default email template for an event type."""
        return DEFAULT_EMAIL_TEMPLATES.get(event_type)
    
    def get_whatsapp_template(self, event_type: str) -> Optional[str]:
        """Get default WhatsApp message template for an event type."""
        return DEFAULT_WHATSAPP_MESSAGES.get(event_type)
    
    async def send_email(
        self,
        recipient_email: str,
        event_type: str,
        placeholders: dict,
        custom_template: Optional[dict] = None,
    ) -> NotificationResult:
        """Send an email notification."""
        template = custom_template or self.get_email_template(event_type)
        
        if not template:
            return NotificationResult(success=False, error=f"No template for {event_type}")
        
        subject = render_template(template.get("subject", ""), placeholders)
        body = render_template(template.get("body", ""), placeholders)
        
        return await self._email_channel.send(recipient_email, subject, body)
    
    async def send_whatsapp(
        self,
        recipient_phone: str,
        event_type: str,
        placeholders: dict,
        phone_number_id: Optional[str] = None,
        access_token: Optional[str] = None,
        whatsapp_template_id: Optional[str] = None,
        template_params: Optional[dict] = None,
    ) -> NotificationResult:
        """Send a WhatsApp notification."""
        channel = self.get_whatsapp_channel(phone_number_id, access_token)
        
        if whatsapp_template_id:
            return await channel.send(
                recipient_phone,
                None,
                "",
                template_id=whatsapp_template_id,
                template_params=template_params,
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
    ) -> NotificationResult:
        """Send a notification via the specified channel."""
        if channel == "email":
            return await self.send_email(recipient, event_type, placeholders, custom_template)
        elif channel == "whatsapp":
            return await self.send_whatsapp(
                recipient,
                event_type,
                placeholders,
                phone_number_id=whatsapp_config.get("phone_number_id") if whatsapp_config else None,
                access_token=whatsapp_config.get("access_token") if whatsapp_config else None,
            )
        else:
            return NotificationResult(success=False, error=f"Unknown channel: {channel}")


notification_service = NotificationService()
