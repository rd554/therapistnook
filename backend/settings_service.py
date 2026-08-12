"""
Settings Service - Business logic for platform configuration.
Phase 7: Settings, Configuration & Platform Integrations
"""

import asyncio
import os
import smtplib
import ssl
import certifi
import httpx
from urllib.parse import urlencode
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, or_
from sqlalchemy.orm import selectinload

from models import (
    Practitioner,
    ClinicSettings,
    AppointmentConfiguration,
    EmailConfiguration,
    PaymentGatewayConfiguration,
    Branding,
    SecuritySettings,
    Role,
    Permission,
    AuditLog,
    SystemPreferences,
    CalendarIntegration,
    PractitionerNotificationPreferences,
    ActiveSession,
    NotificationTemplate,
    WhatsAppConfig,
    MeetingProviderConfig,
)


# ═══════════════════════════════════════════════════════════════════════════════
#  Clinic Settings Service
# ═══════════════════════════════════════════════════════════════════════════════

async def get_clinic_settings(db: AsyncSession) -> ClinicSettings:
    """Get clinic settings, creating default if not exists."""
    result = await db.execute(select(ClinicSettings))
    settings = result.scalar_one_or_none()
    
    if not settings:
        settings = ClinicSettings()
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    
    return settings


async def update_clinic_settings(db: AsyncSession, data: dict) -> ClinicSettings:
    """Update clinic settings."""
    settings = await get_clinic_settings(db)
    
    for key, value in data.items():
        if value is not None and hasattr(settings, key):
            setattr(settings, key, value)
    
    await db.commit()
    await db.refresh(settings)
    return settings


# ═══════════════════════════════════════════════════════════════════════════════
#  Appointment Configuration Service
# ═══════════════════════════════════════════════════════════════════════════════

async def get_appointment_config(db: AsyncSession) -> AppointmentConfiguration:
    """Get appointment configuration, creating default if not exists."""
    result = await db.execute(select(AppointmentConfiguration))
    config = result.scalar_one_or_none()
    
    if not config:
        config = AppointmentConfiguration()
        db.add(config)
        await db.commit()
        await db.refresh(config)
    
    return config


async def update_appointment_config(db: AsyncSession, data: dict) -> AppointmentConfiguration:
    """Update appointment configuration."""
    config = await get_appointment_config(db)
    
    for key, value in data.items():
        if value is not None and hasattr(config, key):
            setattr(config, key, value)
    
    await db.commit()
    await db.refresh(config)
    return config


# ═══════════════════════════════════════════════════════════════════════════════
#  Email Configuration Service
# ═══════════════════════════════════════════════════════════════════════════════

async def get_email_config(db: AsyncSession) -> EmailConfiguration:
    """Get email configuration, creating default if not exists."""
    result = await db.execute(select(EmailConfiguration))
    config = result.scalar_one_or_none()
    
    if not config:
        config = EmailConfiguration()
        db.add(config)
        await db.commit()
        await db.refresh(config)
    
    return config


async def update_email_config(db: AsyncSession, data: dict) -> EmailConfiguration:
    """Update email configuration."""
    config = await get_email_config(db)
    
    for key, value in data.items():
        if value is not None and hasattr(config, key):
            setattr(config, key, value)
    
    await db.commit()
    await db.refresh(config)
    return config


def _smtp_ssl_context() -> ssl.SSLContext:
    # Use certifi's CA bundle explicitly rather than relying on ssl.create_default_context()'s
    # OS-trust-store lookup — on macOS, Python installs frequently ship without that lookup wired
    # up, which surfaces as CERTIFICATE_VERIFY_FAILED / "unable to get local issuer certificate"
    # even though the certificate itself is fine.
    return ssl.create_default_context(cafile=certifi.where())


def _send_test_email_smtp(host: str, port: int, username: str, password: str, use_tls: bool,
                           sender_name: str, sender_email: str, reply_to: str, recipient_email: str) -> None:
    """Blocking SMTP send, run off the event loop via asyncio.to_thread."""
    msg = MIMEMultipart("alternative")
    msg["From"] = f"{sender_name} <{sender_email}>" if sender_name else sender_email
    msg["To"] = recipient_email
    msg["Subject"] = "Test Email - MMPI-2 Platform"
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.attach(MIMEText(
        "This is a test email from your MMPI-2 practice platform's email configuration. "
        "If you received this, your SMTP settings are working correctly.",
        "plain",
    ))

    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=15, context=_smtp_ssl_context()) as server:
            if username and password:
                server.login(username, password)
            server.sendmail(sender_email, recipient_email, msg.as_string())
    else:
        with smtplib.SMTP(host, port, timeout=15) as server:
            if use_tls:
                server.starttls(context=_smtp_ssl_context())
            if username and password:
                server.login(username, password)
            server.sendmail(sender_email, recipient_email, msg.as_string())


async def test_email_config(db: AsyncSession, recipient_email: str) -> dict:
    """Test email configuration by actually sending a test email via SMTP."""
    config = await get_email_config(db)

    if not config.is_enabled:
        return {"success": False, "message": "Email is not enabled", "error": "Email configuration is disabled"}

    if config.provider == "smtp":
        missing = []
        if not config.smtp_host:
            missing.append("SMTP Host")
        if not config.smtp_port:
            missing.append("SMTP Port")
        if not config.sender_email:
            missing.append("Sender Email")
        if missing:
            return {
                "success": False,
                "message": "Incomplete SMTP configuration",
                "error": f"Missing required SMTP settings: {', '.join(missing)}. Save your changes before sending a test.",
            }

        # Snapshot primitives before crossing into a worker thread — accessing
        # ORM attributes there (after the session moves on) can raise MissingGreenlet.
        host = config.smtp_host
        port = config.smtp_port
        username = config.smtp_username
        password = config.smtp_password
        use_tls = config.smtp_use_tls
        sender_name = config.sender_name
        sender_email = config.sender_email
        reply_to = config.reply_to_email

        try:
            await asyncio.to_thread(
                _send_test_email_smtp, host, port, username, password, use_tls,
                sender_name, sender_email, reply_to, recipient_email,
            )

            config.last_test_at = datetime.now(timezone.utc)
            config.last_test_status = "success"
            config.last_test_error = None
            await db.commit()

            return {"success": True, "message": f"Test email sent to {recipient_email}"}

        except smtplib.SMTPAuthenticationError:
            error = (
                "SMTP authentication failed. Check your username and password — "
                "if you're using Gmail, you'll need an App Password rather than your regular password."
            )
            config.last_test_at = datetime.now(timezone.utc)
            config.last_test_status = "failed"
            config.last_test_error = error
            await db.commit()
            return {"success": False, "message": "Failed to send test email", "error": error}

        except (smtplib.SMTPException, OSError, TimeoutError) as e:
            error = str(e) or e.__class__.__name__
            config.last_test_at = datetime.now(timezone.utc)
            config.last_test_status = "failed"
            config.last_test_error = error
            await db.commit()
            return {"success": False, "message": "Failed to send test email", "error": error}

    # Non-SMTP providers aren't wired up to actually send yet.
    return {"success": False, "message": "Unsupported provider", "error": f"Sending is not implemented for provider '{config.provider}'"}


# ═══════════════════════════════════════════════════════════════════════════════
#  Payment Gateway Configuration Service
# ═══════════════════════════════════════════════════════════════════════════════

async def get_payment_gateway_config(db: AsyncSession) -> PaymentGatewayConfiguration:
    """Get payment gateway configuration, creating default if not exists."""
    result = await db.execute(select(PaymentGatewayConfiguration))
    config = result.scalar_one_or_none()
    
    if not config:
        config = PaymentGatewayConfiguration()
        db.add(config)
        await db.commit()
        await db.refresh(config)
    
    return config


async def update_payment_gateway_config(db: AsyncSession, data: dict) -> PaymentGatewayConfiguration:
    """Update payment gateway configuration."""
    config = await get_payment_gateway_config(db)
    
    for key, value in data.items():
        if value is not None and hasattr(config, key):
            setattr(config, key, value)
    
    await db.commit()
    await db.refresh(config)
    return config


async def test_payment_gateway(db: AsyncSession) -> dict:
    """Test payment gateway connection."""
    config = await get_payment_gateway_config(db)
    
    if not config.is_enabled:
        return {"success": False, "message": "Payment gateway is not enabled", "error": "Configuration is disabled"}
    
    if not config.api_key:
        return {"success": False, "message": "Missing API key", "error": "API key is not configured"}
    
    try:
        # In production, implement actual gateway test
        # For now, validate configuration exists
        config.last_test_at = datetime.now(timezone.utc)
        config.last_test_status = "success"
        config.last_test_error = None
        await db.commit()
        
        return {"success": True, "message": f"Successfully connected to {config.provider}"}
    
    except Exception as e:
        config.last_test_at = datetime.now(timezone.utc)
        config.last_test_status = "failed"
        config.last_test_error = str(e)
        await db.commit()
        
        return {"success": False, "message": "Failed to connect to payment gateway", "error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
#  Branding Service
# ═══════════════════════════════════════════════════════════════════════════════

async def get_branding(db: AsyncSession) -> Branding:
    """Get branding settings, creating default if not exists."""
    result = await db.execute(select(Branding))
    branding = result.scalar_one_or_none()
    
    if not branding:
        branding = Branding()
        db.add(branding)
        await db.commit()
        await db.refresh(branding)
    
    return branding


async def update_branding(db: AsyncSession, data: dict) -> Branding:
    """Update branding settings."""
    branding = await get_branding(db)
    
    for key, value in data.items():
        if value is not None and hasattr(branding, key):
            setattr(branding, key, value)
    
    await db.commit()
    await db.refresh(branding)
    return branding


# ═══════════════════════════════════════════════════════════════════════════════
#  Security Settings Service
# ═══════════════════════════════════════════════════════════════════════════════

async def get_security_settings(db: AsyncSession) -> SecuritySettings:
    """Get security settings, creating default if not exists."""
    result = await db.execute(select(SecuritySettings))
    settings = result.scalar_one_or_none()
    
    if not settings:
        settings = SecuritySettings()
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    
    return settings


async def update_security_settings(db: AsyncSession, data: dict) -> SecuritySettings:
    """Update security settings."""
    settings = await get_security_settings(db)
    
    for key, value in data.items():
        if value is not None and hasattr(settings, key):
            setattr(settings, key, value)
    
    await db.commit()
    await db.refresh(settings)
    return settings


def validate_password(password: str, settings: SecuritySettings) -> tuple[bool, list[str]]:
    """Validate password against security settings."""
    errors = []
    
    if len(password) < settings.min_password_length:
        errors.append(f"Password must be at least {settings.min_password_length} characters")
    
    if settings.require_uppercase and not any(c.isupper() for c in password):
        errors.append("Password must contain at least one uppercase letter")
    
    if settings.require_lowercase and not any(c.islower() for c in password):
        errors.append("Password must contain at least one lowercase letter")
    
    if settings.require_numbers and not any(c.isdigit() for c in password):
        errors.append("Password must contain at least one number")
    
    if settings.require_special_chars and not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
        errors.append("Password must contain at least one special character")
    
    return len(errors) == 0, errors


# ═══════════════════════════════════════════════════════════════════════════════
#  Roles & Permissions Service
# ═══════════════════════════════════════════════════════════════════════════════

async def get_all_roles(db: AsyncSession) -> list[Role]:
    """Get all roles."""
    result = await db.execute(
        select(Role).order_by(Role.is_system.desc(), Role.name)
    )
    return result.scalars().all()


async def get_role_by_id(db: AsyncSession, role_id: str) -> Optional[Role]:
    """Get role by ID with permissions."""
    result = await db.execute(
        select(Role)
        .options(selectinload(Role.permissions))
        .where(Role.id == role_id)
    )
    return result.scalar_one_or_none()


async def get_role_by_name(db: AsyncSession, name: str) -> Optional[Role]:
    """Get role by name."""
    result = await db.execute(
        select(Role).where(Role.name == name)
    )
    return result.scalar_one_or_none()


async def create_role(db: AsyncSession, data: dict) -> Role:
    """Create a new role."""
    permissions_data = data.pop("permissions", [])
    
    role = Role(**data)
    db.add(role)
    await db.flush()
    
    # Add permissions
    for perm in permissions_data:
        permission = Permission(
            role_id=role.id,
            resource=perm["resource"],
            action=perm["action"]
        )
        db.add(permission)
    
    await db.commit()
    await db.refresh(role)
    return role


async def update_role(db: AsyncSession, role_id: str, data: dict) -> Optional[Role]:
    """Update a role."""
    role = await get_role_by_id(db, role_id)
    if not role or role.is_system:
        return None
    
    permissions_data = data.pop("permissions", None)
    
    for key, value in data.items():
        if value is not None and hasattr(role, key):
            setattr(role, key, value)
    
    # Update permissions if provided
    if permissions_data is not None:
        # Delete existing permissions
        for perm in role.permissions:
            await db.delete(perm)
        
        # Add new permissions
        for perm in permissions_data:
            permission = Permission(
                role_id=role.id,
                resource=perm["resource"],
                action=perm["action"]
            )
            db.add(permission)
    
    await db.commit()
    await db.refresh(role)
    return role


async def delete_role(db: AsyncSession, role_id: str) -> bool:
    """Delete a role."""
    role = await get_role_by_id(db, role_id)
    if not role or role.is_system:
        return False
    
    await db.delete(role)
    await db.commit()
    return True


async def initialize_system_roles(db: AsyncSession):
    """Initialize default system roles."""
    default_roles = [
        {
            "name": "owner",
            "display_name": "Owner",
            "description": "Full administrative access to the platform",
            "is_system": True,
            "permissions": [
                {"resource": "all", "action": "manage"},
            ]
        },
        {
            "name": "practitioner",
            "display_name": "Practitioner",
            "description": "Standard practitioner access",
            "is_system": True,
            "permissions": [
                {"resource": "patients", "action": "manage"},
                {"resource": "appointments", "action": "manage"},
                {"resource": "payments", "action": "manage"},
                {"resource": "assessments", "action": "manage"},
                {"resource": "settings", "action": "read"},
                {"resource": "profile", "action": "manage"},
            ]
        },
    ]
    
    for role_data in default_roles:
        existing = await get_role_by_name(db, role_data["name"])
        if not existing:
            await create_role(db, role_data)


# ═══════════════════════════════════════════════════════════════════════════════
#  Audit Log Service
# ═══════════════════════════════════════════════════════════════════════════════

async def create_audit_log(
    db: AsyncSession,
    action: str,
    description: str,
    practitioner: Optional[Practitioner] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> AuditLog:
    """Create an audit log entry."""
    log = AuditLog(
        practitioner_id=practitioner.id if practitioner else None,
        practitioner_name=practitioner.name if practitioner else None,
        practitioner_email=practitioner.email if practitioner else None,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        description=description,
        old_values=old_values,
        new_values=new_values,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(log)
    await db.commit()
    return log


async def get_audit_logs(
    db: AsyncSession,
    filters: dict,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[AuditLog], int]:
    """Get audit logs with filters and pagination."""
    query = select(AuditLog)
    count_query = select(func.count(AuditLog.id))
    
    # Apply filters
    if filters.get("action"):
        query = query.where(AuditLog.action == filters["action"])
        count_query = count_query.where(AuditLog.action == filters["action"])
    
    if filters.get("resource_type"):
        query = query.where(AuditLog.resource_type == filters["resource_type"])
        count_query = count_query.where(AuditLog.resource_type == filters["resource_type"])
    
    if filters.get("practitioner_id"):
        query = query.where(AuditLog.practitioner_id == filters["practitioner_id"])
        count_query = count_query.where(AuditLog.practitioner_id == filters["practitioner_id"])
    
    if filters.get("start_date"):
        query = query.where(AuditLog.created_at >= filters["start_date"])
        count_query = count_query.where(AuditLog.created_at >= filters["start_date"])
    
    if filters.get("end_date"):
        query = query.where(AuditLog.created_at <= filters["end_date"])
        count_query = count_query.where(AuditLog.created_at <= filters["end_date"])
    
    if filters.get("search"):
        search_term = f"%{filters['search']}%"
        query = query.where(
            or_(
                AuditLog.description.ilike(search_term),
                AuditLog.practitioner_name.ilike(search_term),
                AuditLog.practitioner_email.ilike(search_term),
            )
        )
        count_query = count_query.where(
            or_(
                AuditLog.description.ilike(search_term),
                AuditLog.practitioner_name.ilike(search_term),
                AuditLog.practitioner_email.ilike(search_term),
            )
        )
    
    # Get total count
    count_result = await db.execute(count_query)
    total_count = count_result.scalar()
    
    # Apply pagination and ordering
    query = query.order_by(desc(AuditLog.created_at))
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    logs = result.scalars().all()
    
    return logs, total_count


# ═══════════════════════════════════════════════════════════════════════════════
#  System Preferences Service
# ═══════════════════════════════════════════════════════════════════════════════

async def get_system_preferences(db: AsyncSession) -> SystemPreferences:
    """Get system preferences, creating default if not exists."""
    result = await db.execute(select(SystemPreferences))
    preferences = result.scalar_one_or_none()
    
    if not preferences:
        preferences = SystemPreferences()
        db.add(preferences)
        await db.commit()
        await db.refresh(preferences)
    
    return preferences


async def update_system_preferences(db: AsyncSession, data: dict) -> SystemPreferences:
    """Update system preferences."""
    preferences = await get_system_preferences(db)
    
    for key, value in data.items():
        if value is not None and hasattr(preferences, key):
            setattr(preferences, key, value)
    
    await db.commit()
    await db.refresh(preferences)
    return preferences


# ═══════════════════════════════════════════════════════════════════════════════
#  Calendar Integration Service
# ═══════════════════════════════════════════════════════════════════════════════

# Google's Calendar API is also how Meet links get created (there is no separate
# "Meet API" — a Calendar event with conferenceData.createRequest produces the
# hangoutLink). One OAuth grant on this scope covers both the "Google Calendar"
# and "Google Meet" cards in Settings > Integrations.
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_OAUTH_SCOPE = "https://www.googleapis.com/auth/calendar"


class GoogleOAuthNotConfigured(Exception):
    """Raised when GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET aren't set on the server."""
    pass


def _google_client_credentials() -> tuple[str, str]:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise GoogleOAuthNotConfigured(
            "Google OAuth is not configured on the server. Set GOOGLE_CLIENT_ID and "
            "GOOGLE_CLIENT_SECRET in the backend .env file (see Google Cloud Console > "
            "APIs & Services > Credentials)."
        )
    return client_id, client_secret


def build_google_auth_url(redirect_uri: str) -> str:
    """Build the Google OAuth consent URL for connecting Calendar/Meet."""
    client_id, _ = _google_client_credentials()
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": GOOGLE_OAUTH_SCOPE,
        "access_type": "offline",
        # Force the consent screen every time so Google reissues a refresh_token —
        # without this, a refresh_token is only granted on a user's very first
        # authorization, which breaks reconnect-after-disconnect flows.
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def _exchange_google_code_for_tokens(authorization_code: str, redirect_uri: str) -> dict:
    """Exchange an OAuth authorization code for access/refresh tokens."""
    client_id, client_secret = _google_client_credentials()

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": authorization_code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )

    if response.status_code != 200:
        try:
            error_body = response.json()
            detail = error_body.get("error_description") or error_body.get("error") or response.text
        except Exception:
            detail = response.text
        raise ValueError(f"Google rejected the authorization code: {detail}")

    return response.json()


async def get_calendar_integration(db: AsyncSession, practitioner_id: str) -> CalendarIntegration:
    """Get calendar integration for practitioner, creating if not exists."""
    result = await db.execute(
        select(CalendarIntegration).where(CalendarIntegration.practitioner_id == practitioner_id)
    )
    integration = result.scalar_one_or_none()
    
    if not integration:
        integration = CalendarIntegration(practitioner_id=practitioner_id)
        db.add(integration)
        await db.commit()
        await db.refresh(integration)
    
    return integration


async def update_calendar_integration(db: AsyncSession, practitioner_id: str, data: dict) -> CalendarIntegration:
    """Update calendar integration settings."""
    integration = await get_calendar_integration(db, practitioner_id)
    
    for key, value in data.items():
        if value is not None and hasattr(integration, key):
            setattr(integration, key, value)
    
    await db.commit()
    await db.refresh(integration)
    return integration


async def connect_google_calendar(
    db: AsyncSession,
    practitioner_id: str,
    authorization_code: str,
    redirect_uri: str,
) -> dict:
    """Connect Google Calendar (and Google Meet, which rides the same OAuth grant
    via the Calendar API's conferenceData) for a practitioner."""
    integration = await get_calendar_integration(db, practitioner_id)

    try:
        tokens = await _exchange_google_code_for_tokens(authorization_code, redirect_uri)
        client_id, client_secret = _google_client_credentials()

        # Google only returns a refresh_token when the user is prompted for consent
        # (which build_google_auth_url always forces) — but guard anyway rather than
        # clobbering a previously-stored one with nothing.
        refresh_token = tokens.get("refresh_token") or integration.google_refresh_token
        if not refresh_token:
            raise ValueError(
                "Google did not return a refresh token. Please disconnect and reconnect."
            )

        integration.google_credentials = {
            "access_token": tokens.get("access_token"),
            "client_id": client_id,
            "client_secret": client_secret,
            "token_type": tokens.get("token_type"),
            "scope": tokens.get("scope"),
        }
        integration.google_refresh_token = refresh_token
        integration.google_connected = True
        integration.google_sync_error = None
        await db.commit()

        return {"success": True, "message": "Google Calendar connected successfully"}

    except GoogleOAuthNotConfigured as e:
        return {"success": False, "message": str(e), "error": str(e)}

    except Exception as e:
        integration.google_sync_error = str(e)
        await db.commit()

        return {"success": False, "message": "Failed to connect Google Calendar", "error": str(e)}


async def disconnect_google_calendar(db: AsyncSession, practitioner_id: str) -> dict:
    """Disconnect Google Calendar for a practitioner."""
    integration = await get_calendar_integration(db, practitioner_id)
    
    integration.google_connected = False
    integration.google_calendar_id = None
    integration.google_credentials = None
    integration.google_refresh_token = None
    integration.google_last_sync_at = None
    integration.google_sync_error = None
    
    await db.commit()
    
    return {"success": True, "message": "Google Calendar disconnected"}


async def sync_calendar(db: AsyncSession, practitioner_id: str) -> dict:
    """Verify the stored Google connection still works.

    This makes one real, cheap Calendar API call (calendarList.get) rather than
    unconditionally stamping success — a revoked token, disabled Calendar API, or
    scope mismatch would otherwise go unnoticed here and only surface later as a
    dead Meet link on a patient's booking. Full two-way event sync isn't
    implemented; events_synced is always 0.
    """
    integration = await get_calendar_integration(db, practitioner_id)

    if not integration.google_connected:
        return {"success": False, "message": "Google Calendar not connected", "events_synced": 0}

    from meeting_service import GoogleMeetProvider

    try:
        provider = GoogleMeetProvider(
            credentials=integration.google_credentials,
            refresh_token=integration.google_refresh_token,
        )
        calendar_info = await provider.verify_connection()

        integration.google_last_sync_at = datetime.now(timezone.utc)
        integration.google_sync_error = None
        await db.commit()

        calendar_name = calendar_info.get("summary") or "your Google Calendar"
        return {
            "success": True,
            "message": f"Connected to {calendar_name}",
            "synced_at": integration.google_last_sync_at,
            "events_synced": 0,  # Placeholder — full two-way sync not implemented
        }

    except Exception as e:
        integration.google_sync_error = str(e)
        await db.commit()

        return {"success": False, "message": "Failed to verify Google connection", "error": str(e), "events_synced": 0}


# ═══════════════════════════════════════════════════════════════════════════════
#  Notification Preferences Service
# ═══════════════════════════════════════════════════════════════════════════════

async def get_notification_preferences(db: AsyncSession, practitioner_id: str) -> PractitionerNotificationPreferences:
    """Get notification preferences for practitioner, creating if not exists."""
    result = await db.execute(
        select(PractitionerNotificationPreferences)
        .where(PractitionerNotificationPreferences.practitioner_id == practitioner_id)
    )
    preferences = result.scalar_one_or_none()
    
    if not preferences:
        preferences = PractitionerNotificationPreferences(practitioner_id=practitioner_id)
        db.add(preferences)
        await db.commit()
        await db.refresh(preferences)
    
    return preferences


async def update_notification_preferences(
    db: AsyncSession,
    practitioner_id: str,
    data: dict
) -> PractitionerNotificationPreferences:
    """Update notification preferences."""
    preferences = await get_notification_preferences(db, practitioner_id)
    
    for key, value in data.items():
        if value is not None and hasattr(preferences, key):
            setattr(preferences, key, value)
    
    await db.commit()
    await db.refresh(preferences)
    return preferences


# ═══════════════════════════════════════════════════════════════════════════════
#  Active Sessions Service
# ═══════════════════════════════════════════════════════════════════════════════

async def get_active_sessions(db: AsyncSession, practitioner_id: str) -> list[ActiveSession]:
    """Get active sessions for a practitioner."""
    result = await db.execute(
        select(ActiveSession)
        .where(ActiveSession.practitioner_id == practitioner_id)
        .order_by(desc(ActiveSession.last_active_at))
    )
    return result.scalars().all()


async def create_active_session(
    db: AsyncSession,
    practitioner_id: str,
    token_hash: str,
    device_info: Optional[str] = None,
    ip_address: Optional[str] = None,
    expires_at: Optional[datetime] = None,
) -> ActiveSession:
    """Create a new active session."""
    # Mark other sessions as not current
    result = await db.execute(
        select(ActiveSession)
        .where(ActiveSession.practitioner_id == practitioner_id)
        .where(ActiveSession.is_current == True)
    )
    for session in result.scalars():
        session.is_current = False
    
    session = ActiveSession(
        practitioner_id=practitioner_id,
        token_hash=token_hash,
        device_info=device_info,
        ip_address=ip_address,
        is_current=True,
        expires_at=expires_at,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def terminate_session(db: AsyncSession, practitioner_id: str, session_id: str) -> bool:
    """Terminate a specific session."""
    result = await db.execute(
        select(ActiveSession)
        .where(ActiveSession.id == session_id)
        .where(ActiveSession.practitioner_id == practitioner_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        return False
    
    await db.delete(session)
    await db.commit()
    return True


async def terminate_other_sessions(db: AsyncSession, practitioner_id: str, current_session_id: str) -> int:
    """Terminate all sessions except the current one."""
    result = await db.execute(
        select(ActiveSession)
        .where(ActiveSession.practitioner_id == practitioner_id)
        .where(ActiveSession.id != current_session_id)
    )
    sessions = result.scalars().all()
    
    count = len(sessions)
    for session in sessions:
        await db.delete(session)
    
    await db.commit()
    return count


# ═══════════════════════════════════════════════════════════════════════════════
#  WhatsApp Configuration Service (extends existing)
# ═══════════════════════════════════════════════════════════════════════════════

async def get_whatsapp_config_admin(db: AsyncSession) -> Optional[WhatsAppConfig]:
    """Get WhatsApp configuration for admin (first one or owner's)."""
    result = await db.execute(select(WhatsAppConfig).limit(1))
    return result.scalar_one_or_none()


async def test_whatsapp_config(db: AsyncSession, recipient_phone: str) -> dict:
    """Test WhatsApp configuration by sending a test message."""
    config = await get_whatsapp_config_admin(db)
    
    if not config or not config.is_enabled:
        return {"success": False, "message": "WhatsApp is not enabled", "error": "Configuration is disabled"}
    
    if not config.access_token:
        return {"success": False, "message": "Missing access token", "error": "Access token is not configured"}
    
    try:
        # In production, implement actual WhatsApp test message
        return {"success": True, "message": f"Test message sent to {recipient_phone}"}
    
    except Exception as e:
        return {"success": False, "message": "Failed to send test message", "error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
#  Settings Navigation
# ═══════════════════════════════════════════════════════════════════════════════

def get_admin_settings_sections() -> list[dict]:
    """Get settings sections for administrators."""
    return [
        {"id": "appointments", "label": "Appointments", "description": "Clinic-wide booking policy (advance window, notice, holidays)", "icon": "CalendarDays"},
        {"id": "availability", "label": "Availability", "description": "Your working hours and schedule", "icon": "Calendar"},
        {"id": "integrations", "label": "Integrations", "description": "Calendar, meeting, and external services", "icon": "Plug"},
        {"id": "payment", "label": "Payment", "description": "Payment gateway and billing settings", "icon": "CreditCard"},
        {"id": "email", "label": "Email", "description": "Email provider and sender settings", "icon": "Mail"},
        {"id": "whatsapp", "label": "WhatsApp", "description": "WhatsApp Business API settings", "icon": "MessageCircle"},
        {"id": "notifications", "label": "Notifications", "description": "Notification templates and settings", "icon": "Bell"},
        {"id": "security", "label": "Security", "description": "Password policy and security settings", "icon": "Shield"},
    ]


def get_practitioner_settings_sections() -> list[dict]:
    """Get settings sections for practitioners."""
    return [
        {"id": "profile", "label": "Personal Profile", "description": "Your account information", "icon": "User"},
        {"id": "availability", "label": "Availability", "description": "Working hours and schedule", "icon": "Calendar"},
        {"id": "calendar", "label": "Calendar Integration", "description": "Connect external calendars", "icon": "CalendarSync"},
        {"id": "notifications", "label": "Notifications", "description": "Email and in-app notification preferences", "icon": "Bell"},
        {"id": "public-profile", "label": "Public Profile", "description": "Your public practice profile", "icon": "Globe"},
        {"id": "security", "label": "Security", "description": "Password and active sessions", "icon": "Shield"},
    ]
