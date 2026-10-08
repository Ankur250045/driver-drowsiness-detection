"""Phone-call / SMS escalation via the Twilio REST API.

Why a phone call: browser audio can be blocked (autoplay policy, muted tab) and the
Vibration API is unsupported on iOS and most desktops. An incoming call rings with
the phone's native ringtone and vibration, independent of the web app.

Without Twilio credentials the service runs in *simulated* mode: nothing is sent,
the attempt is logged, and the API reports status="simulated".
"""

import logging
from dataclasses import dataclass
from xml.sax.saxutils import escape

import httpx

from app.utils.config import Settings

log = logging.getLogger(__name__)

TWILIO_API = "https://api.twilio.com/2010-04-01/Accounts/{sid}/{resource}.json"


@dataclass
class NotificationResult:
    status: str  # "calling" | "simulated" | "failed"
    call_sid: str | None = None
    sms_sid: str | None = None
    message: str = ""


def build_twiml(reason: str) -> str:
    """Voice message spoken when the driver answers; repeated so it is hard to miss."""
    text = escape(
        f"Wake up! This is DrowsiGuard. {reason}. "
        "You may be falling asleep at the wheel. Please pull over safely and take a break."
    )
    return f'<Response><Say voice="alice" loop="3">{text}</Say><Pause length="1"/></Response>'


class TwilioNotifier:
    def __init__(self, settings: Settings, client: httpx.Client | None = None):
        self.settings = settings
        self.client = client or httpx.Client(timeout=10)

    @property
    def configured(self) -> bool:
        return self.settings.twilio_configured

    def _post(self, resource: str, data: dict) -> str:
        s = self.settings
        res = self.client.post(
            TWILIO_API.format(sid=s.twilio_account_sid, resource=resource),
            data=data,
            auth=(s.twilio_account_sid, s.twilio_auth_token),
        )
        res.raise_for_status()
        return res.json()["sid"]

    def escalate(self, phone: str, reason: str, emergency_contact: str | None = None) -> NotificationResult:
        if not self.configured:
            log.warning("SIMULATED escalation call to %s (Twilio not configured): %s", phone, reason)
            return NotificationResult(
                status="simulated",
                message="Twilio is not configured on the server, so no real call was placed. "
                "Set TWILIO_* in backend/.env to enable phone calls.",
            )

        from_ = self.settings.twilio_from_number
        try:
            call_sid = self._post("Calls", {"To": phone, "From": from_, "Twiml": build_twiml(reason)})
        except httpx.HTTPError as e:
            log.exception("Twilio call failed")
            return NotificationResult(status="failed", message=f"Call failed: {e}")

        sms_sid = None
        if emergency_contact:
            try:
                sms_sid = self._post(
                    "Messages",
                    {
                        "To": emergency_contact,
                        "From": from_,
                        "Body": f"DrowsiGuard alert: the driver ({phone}) did not respond to a drowsiness alarm. "
                        f"Reason: {reason}. Please try to contact them.",
                    },
                )
            except httpx.HTTPError:
                log.exception("Twilio SMS to emergency contact failed")

        return NotificationResult(status="calling", call_sid=call_sid, sms_sid=sms_sid, message=f"Calling {phone}")
