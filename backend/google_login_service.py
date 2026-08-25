"""Google OAuth for practitioner login/signup — "Sign up / Continue with Google".

This is a separate concern from the Calendar/Meet integration in
settings_service.py even though both read the same GOOGLE_CLIENT_ID /
GOOGLE_CLIENT_SECRET env vars: that's one Google Cloud OAuth client with two
registered redirect URIs and two different scopes (this one only ever needs
"identify this person's email", never calendar access). Keeping it in its own
module avoids conflating "is Calendar connected for practitioner X" state with
"did this browser just prove it controls this email address" state.
"""
import os
from urllib.parse import urlencode

import httpx

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_LOGIN_SCOPE = "openid email profile"


class GoogleLoginNotConfigured(Exception):
    """Raised when GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET aren't set on the server."""
    pass


def google_login_configured() -> bool:
    return bool(os.getenv("GOOGLE_CLIENT_ID", "").strip() and os.getenv("GOOGLE_CLIENT_SECRET", "").strip())


def _client_credentials() -> tuple[str, str]:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise GoogleLoginNotConfigured(
            "Google sign-in is not configured on the server. Set GOOGLE_CLIENT_ID and "
            "GOOGLE_CLIENT_SECRET in the backend .env file."
        )
    return client_id, client_secret


def build_login_auth_url(redirect_uri: str) -> str:
    """Build the Google OAuth consent URL for practitioner login/signup."""
    client_id, _ = _client_credentials()
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": GOOGLE_LOGIN_SCOPE,
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def fetch_google_profile(authorization_code: str, redirect_uri: str) -> dict:
    """Exchange an authorization code for the caller's Google profile.

    Returns {"email": str, "name": str, "email_verified": bool}. Raises
    ValueError on any failure (bad code, network error, unverified-by-Google
    account) with a message safe to surface to the user.
    """
    client_id, client_secret = _client_credentials()

    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": authorization_code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            try:
                detail = token_resp.json().get("error_description") or token_resp.text
            except Exception:
                detail = token_resp.text
            raise ValueError(f"Google rejected the sign-in request: {detail}")

        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise ValueError("Google did not return an access token.")

        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_resp.status_code != 200:
            raise ValueError("Could not fetch your Google profile. Please try again.")

        info = userinfo_resp.json()

    email = (info.get("email") or "").strip().lower()
    if not email:
        raise ValueError("Google did not share an email address for this account.")
    if not info.get("email_verified", False):
        raise ValueError("Your Google account's email isn't verified. Please verify it with Google first.")

    return {
        "email": email,
        "name": info.get("name") or email.split("@")[0],
        "email_verified": True,
    }
