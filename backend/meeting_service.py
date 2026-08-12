"""
Meeting Provider Service — Phase 5

Provides an abstraction layer for different meeting providers (Google Meet, Zoom, Teams).
Supports automatic meeting link generation after payment confirmation.
"""

import os
import asyncio
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import Optional
import secrets

log = logging.getLogger(__name__)


class MeetingLink:
    """Represents a meeting link with metadata."""
    
    def __init__(
        self,
        link: str,
        provider: str,
        meeting_id: Optional[str] = None,
        join_url: Optional[str] = None,
        host_url: Optional[str] = None,
        password: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ):
        self.link = link
        self.provider = provider
        self.meeting_id = meeting_id
        self.join_url = join_url or link
        self.host_url = host_url
        self.password = password
        self.start_time = start_time
        self.end_time = end_time


class MeetingProvider(ABC):
    """Abstract base class for meeting providers."""
    
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider name (e.g., 'google_meet', 'zoom')."""
        pass
    
    @abstractmethod
    async def create_meeting(
        self,
        title: str,
        start_time: datetime,
        end_time: datetime,
        description: Optional[str] = None,
        attendees: Optional[list[str]] = None,
        include_conference: bool = True,
    ) -> MeetingLink:
        """Create a new meeting and return the meeting link.

        include_conference=False creates a plain calendar event with no
        video-call attached (used for in-person sessions, where the goal is
        just calendar visibility, not a Meet link).
        """
        pass
    
    @abstractmethod
    async def update_meeting(
        self,
        meeting_id: str,
        title: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        description: Optional[str] = None,
    ) -> MeetingLink:
        """Update an existing meeting."""
        pass
    
    @abstractmethod
    async def delete_meeting(self, meeting_id: str) -> bool:
        """Delete/cancel a meeting."""
        pass
    
    @abstractmethod
    def is_configured(self) -> bool:
        """Check if the provider is properly configured."""
        pass


class GoogleMeetProvider(MeetingProvider):
    """
    Google Meet provider.
    
    For full integration, requires Google Calendar API credentials.
    Falls back to generating instant meeting links if not configured.
    """
    
    def __init__(
        self,
        credentials: Optional[dict] = None,
        refresh_token: Optional[str] = None,
    ):
        self.credentials = credentials
        self.refresh_token = refresh_token
        self._client = None
    
    @property
    def provider_name(self) -> str:
        return "google_meet"
    
    def is_configured(self) -> bool:
        """Check if Google API credentials are configured."""
        return bool(self.credentials and self.refresh_token)
    
    async def _get_client(self):
        """Get or create Google Calendar API client."""
        if not self.is_configured():
            return None

        if self._client is not None:
            return self._client

        try:
            # Credentials.refresh() and googleapiclient's build()/execute() are all
            # blocking network calls — run them off the event loop.
            return await asyncio.to_thread(self._build_client_sync)
        except Exception as e:
            log.error(f"Failed to create Google Calendar client: {e}")
            return None

    def _build_client_sync(self):
        """Blocking: build credentials, refresh the access token, build the API client."""
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build

        creds = Credentials(
            token=self.credentials.get("access_token"),
            refresh_token=self.refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=self.credentials.get("client_id"),
            client_secret=self.credentials.get("client_secret"),
        )
        # Always refresh proactively: the stored access_token is short-lived
        # (~1hr) and we don't track its expiry, so refreshing every time avoids
        # a silent 401 that would otherwise fall back to a fake meeting link.
        creds.refresh(Request())

        self._client = build("calendar", "v3", credentials=creds, cache_discovery=False)
        return self._client
    
    async def verify_connection(self) -> dict:
        """Make one cheap real API call to confirm the stored credentials actually
        work (token not revoked/expired-beyond-refresh, Calendar API enabled on the
        Google Cloud project, etc). Used by the Settings 'Test' button so a broken
        connection is caught there instead of silently at booking time."""
        client = await self._get_client()
        if client is None:
            raise RuntimeError("Google Calendar is not connected.")

        calendar = await asyncio.to_thread(
            lambda: client.calendarList().get(calendarId="primary").execute()
        )
        return {"summary": calendar.get("summary"), "id": calendar.get("id")}

    async def create_meeting(
        self,
        title: str,
        start_time: datetime,
        end_time: datetime,
        description: Optional[str] = None,
        attendees: Optional[list[str]] = None,
        include_conference: bool = True,
    ) -> MeetingLink:
        """Create a Google Calendar event, optionally with a Meet link attached.

        Raises on any failure (not connected, expired/revoked token, API error)
        rather than fabricating a meet.google.com link that looks real but
        doesn't work — callers (see booking_service.confirm_booking_payment)
        already handle this by leaving meeting_link unset and logging, which is
        far safer than emailing a patient a dead video-call URL.
        """

        client = await self._get_client()

        if client is None:
            raise RuntimeError(
                "Google Meet is not connected for this practitioner "
                "(Settings > Integrations > Google Calendar)."
            )

        try:
            event = {
                "summary": title,
                "description": description or "",
                "start": {
                    "dateTime": start_time.isoformat(),
                    "timeZone": "Asia/Kolkata",
                },
                "end": {
                    "dateTime": end_time.isoformat(),
                    "timeZone": "Asia/Kolkata",
                },
            }

            if include_conference:
                event["conferenceData"] = {
                    "createRequest": {
                        "requestId": secrets.token_hex(8),
                        "conferenceSolutionKey": {"type": "hangoutsMeet"},
                    }
                }

            if attendees:
                event["attendees"] = [{"email": email} for email in attendees]

            created_event = await asyncio.to_thread(
                lambda: client.events().insert(
                    calendarId="primary",
                    body=event,
                    conferenceDataVersion=1 if include_conference else 0,
                ).execute()
            )

            meet_link = created_event.get("hangoutLink", "")

            return MeetingLink(
                link=meet_link,
                provider=self.provider_name,
                meeting_id=created_event.get("id"),
                start_time=start_time,
                end_time=end_time,
            )
        except Exception as e:
            log.error(f"Failed to create Google Calendar event: {e}")
            raise

    async def update_meeting(
        self,
        meeting_id: str,
        title: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        description: Optional[str] = None,
    ) -> MeetingLink:
        """Update a Google Calendar event."""
        
        client = await self._get_client()

        if client is None:
            raise RuntimeError(
                "Google Meet is not connected for this practitioner "
                "(Settings > Integrations > Google Calendar)."
            )

        try:
            event = await asyncio.to_thread(
                lambda: client.events().get(calendarId="primary", eventId=meeting_id).execute()
            )

            if title:
                event["summary"] = title
            if description:
                event["description"] = description
            if start_time:
                event["start"]["dateTime"] = start_time.isoformat()
            if end_time:
                event["end"]["dateTime"] = end_time.isoformat()

            updated_event = await asyncio.to_thread(
                lambda: client.events().update(
                    calendarId="primary",
                    eventId=meeting_id,
                    body=event,
                ).execute()
            )

            return MeetingLink(
                link=updated_event.get("hangoutLink", ""),
                provider=self.provider_name,
                meeting_id=updated_event.get("id"),
                start_time=start_time,
                end_time=end_time,
            )
        except Exception as e:
            log.error(f"Failed to update Google Calendar event: {e}")
            raise

    async def delete_meeting(self, meeting_id: str) -> bool:
        """Delete a Google Calendar event."""
        
        client = await self._get_client()
        
        if client is None:
            return True  # No calendar event to delete
        
        try:
            await asyncio.to_thread(
                lambda: client.events().delete(calendarId="primary", eventId=meeting_id).execute()
            )
            return True
        except Exception as e:
            log.error(f"Failed to delete Google Calendar event: {e}")
            return False


class ZoomProvider(MeetingProvider):
    """
    Zoom meeting provider (placeholder for future implementation).
    """
    
    def __init__(
        self,
        account_id: Optional[str] = None,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
    ):
        self.account_id = account_id
        self.client_id = client_id
        self.client_secret = client_secret
    
    @property
    def provider_name(self) -> str:
        return "zoom"
    
    def is_configured(self) -> bool:
        return bool(self.account_id and self.client_id and self.client_secret)
    
    async def create_meeting(
        self,
        title: str,
        start_time: datetime,
        end_time: datetime,
        description: Optional[str] = None,
        attendees: Optional[list[str]] = None,
        include_conference: bool = True,
    ) -> MeetingLink:
        raise NotImplementedError("Zoom integration coming soon")
    
    async def update_meeting(
        self,
        meeting_id: str,
        title: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        description: Optional[str] = None,
    ) -> MeetingLink:
        raise NotImplementedError("Zoom integration coming soon")
    
    async def delete_meeting(self, meeting_id: str) -> bool:
        raise NotImplementedError("Zoom integration coming soon")


class TeamsProvider(MeetingProvider):
    """
    Microsoft Teams meeting provider (placeholder for future implementation).
    """
    
    def __init__(
        self,
        tenant_id: Optional[str] = None,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
    ):
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
    
    @property
    def provider_name(self) -> str:
        return "microsoft_teams"
    
    def is_configured(self) -> bool:
        return bool(self.tenant_id and self.client_id and self.client_secret)
    
    async def create_meeting(
        self,
        title: str,
        start_time: datetime,
        end_time: datetime,
        description: Optional[str] = None,
        attendees: Optional[list[str]] = None,
        include_conference: bool = True,
    ) -> MeetingLink:
        raise NotImplementedError("Microsoft Teams integration coming soon")
    
    async def update_meeting(
        self,
        meeting_id: str,
        title: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        description: Optional[str] = None,
    ) -> MeetingLink:
        raise NotImplementedError("Microsoft Teams integration coming soon")
    
    async def delete_meeting(self, meeting_id: str) -> bool:
        raise NotImplementedError("Microsoft Teams integration coming soon")


class CustomMeetingProvider(MeetingProvider):
    """
    Custom meeting link provider using a template.
    Useful when therapists have their own meeting solution.
    """
    
    def __init__(self, link_template: Optional[str] = None):
        self.link_template = link_template
    
    @property
    def provider_name(self) -> str:
        return "custom"
    
    def is_configured(self) -> bool:
        return bool(self.link_template)
    
    def _generate_link(self, start_time: datetime, meeting_id: str) -> str:
        """Generate link from template with placeholders."""
        if not self.link_template:
            return f"https://example.com/meeting/{meeting_id}"
        
        return self.link_template.replace("{meeting_id}", meeting_id).replace(
            "{date}", start_time.strftime("%Y%m%d")
        ).replace("{time}", start_time.strftime("%H%M"))
    
    async def create_meeting(
        self,
        title: str,
        start_time: datetime,
        end_time: datetime,
        description: Optional[str] = None,
        attendees: Optional[list[str]] = None,
        include_conference: bool = True,
    ) -> MeetingLink:
        meeting_id = secrets.token_hex(8)
        link = self._generate_link(start_time, meeting_id)
        
        return MeetingLink(
            link=link,
            provider=self.provider_name,
            meeting_id=meeting_id,
            start_time=start_time,
            end_time=end_time,
        )
    
    async def update_meeting(
        self,
        meeting_id: str,
        title: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        description: Optional[str] = None,
    ) -> MeetingLink:
        link = self._generate_link(start_time or datetime.now(), meeting_id)
        return MeetingLink(
            link=link,
            provider=self.provider_name,
            meeting_id=meeting_id,
            start_time=start_time,
            end_time=end_time,
        )
    
    async def delete_meeting(self, meeting_id: str) -> bool:
        return True


class MeetingService:
    """
    Main meeting service that manages provider selection and meeting operations.
    """
    
    def __init__(self):
        self._providers: dict[str, MeetingProvider] = {}
        self._default_provider = GoogleMeetProvider()
        self._providers["google_meet"] = self._default_provider
    
    def register_provider(self, provider: MeetingProvider):
        """Register a meeting provider."""
        self._providers[provider.provider_name] = provider
    
    def get_provider(self, provider_name: str) -> Optional[MeetingProvider]:
        """Get a provider by name."""
        return self._providers.get(provider_name)
    
    def get_default_provider(self) -> MeetingProvider:
        """Get the default provider (Google Meet)."""
        return self._default_provider
    
    async def create_meeting_for_booking(
        self,
        booking_id: str,
        therapist_name: str,
        patient_name: str,
        start_time: datetime,
        end_time: datetime,
        session_type: str,
        provider_name: str = "google_meet",
        attendees: Optional[list[str]] = None,
        config: Optional[dict] = None,
        include_conference: bool = True,
    ) -> MeetingLink:
        """Create a meeting for a booking request."""
        
        provider = self._providers.get(provider_name)
        
        if provider is None or not provider.is_configured():
            if provider_name == "google_meet":
                if config:
                    provider = GoogleMeetProvider(
                        credentials=config.get("google_credentials"),
                        refresh_token=config.get("google_refresh_token"),
                    )
                else:
                    provider = GoogleMeetProvider()
            elif provider_name == "custom" and config:
                provider = CustomMeetingProvider(config.get("custom_link_template"))
            else:
                provider = self._default_provider
        
        title = f"Therapy Session - {patient_name} with {therapist_name}"
        description = f"Session Type: {session_type}\nBooking ID: {booking_id}"
        
        return await provider.create_meeting(
            title=title,
            start_time=start_time,
            end_time=end_time,
            description=description,
            attendees=attendees,
            include_conference=include_conference,
        )


meeting_service = MeetingService()
