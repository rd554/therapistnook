import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

log = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SITE_URL = os.getenv("SITE_URL", "http://localhost:5173")
OWNER_NAME = os.getenv("OWNER_NAME", "MMPI-2 Admin")


def _smtp_configured() -> bool:
    return bool(SMTP_EMAIL and SMTP_PASSWORD and not SMTP_PASSWORD.startswith("your-"))


def _send(to_email: str, subject: str, html_body: str):
    if not _smtp_configured():
        log.warning("SMTP not configured — skipping email to %s", to_email)
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = f"{OWNER_NAME} <{SMTP_EMAIL}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.sendmail(SMTP_EMAIL, to_email, msg.as_string())
        log.info("Email sent to %s", to_email)
        return True
    except Exception as e:
        log.error("Failed to send email to %s: %s", to_email, e)
        return False


def send_practitioner_welcome(
    to_email: str,
    name: str,
    password: str,
    ref_code: str,
):
    test_link = f"{SITE_URL}/test?ref={ref_code}"
    login_link = f"{SITE_URL}/login"

    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #eff6ff; border-radius: 16px; padding: 16px;">
          <span style="font-size: 28px;">📋</span>
        </div>
        <h1 style="font-size: 24px; color: #111827; margin: 16px 0 4px;">Welcome to MMPI-2 Assessment Platform</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 0;">Your practitioner account has been created</p>
      </div>

      <p style="font-size: 15px; line-height: 1.7;">
        Hi <strong>{name}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.7;">
        <strong>{OWNER_NAME}</strong> has set up a practitioner account for you on the MMPI-2 Assessment Platform.
        You can now administer MMPI-2 assessments to your patients and view their scored results from your dashboard.
      </p>

      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 14px; color: #374151; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.05em;">Your Login Credentials</h3>
        <table style="width: 100%; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #6b7280; width: 80px;">Email:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #111827;">{to_email}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280;">Password:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #111827;">{password}</td>
          </tr>
        </table>
        <div style="margin-top: 16px;">
          <a href="{login_link}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
            Sign In to Dashboard →
          </a>
        </div>
      </div>

      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <h3 style="font-size: 14px; color: #1e40af; margin: 0 0 8px;">Your Patient Test Link</h3>
        <p style="font-size: 13px; color: #374151; margin: 0 0 12px;">
          Share this link with your patients to begin the MMPI-2 assessment:
        </p>
        <div style="background: #ffffff; border: 1px solid #93c5fd; border-radius: 8px; padding: 12px; word-break: break-all;">
          <a href="{test_link}" style="color: #2563eb; font-size: 13px; font-family: monospace; text-decoration: none;">
            {test_link}
          </a>
        </div>
      </div>

      <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 12px; padding: 16px; margin: 24px 0;">
        <p style="font-size: 13px; color: #92400e; margin: 0;">
          <strong>⚠️ Security Note:</strong> Please change your password after your first login.
          Do not share your login credentials with patients. Only share the test link above.
        </p>
      </div>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
      <p style="font-size: 12px; color: #9ca3af; text-align: center;">
        This email was sent from the MMPI-2 Assessment Platform managed by {OWNER_NAME}.
      </p>
    </div>
    """

    return _send(to_email, f"Your MMPI-2 Practitioner Account — {OWNER_NAME}", html)
