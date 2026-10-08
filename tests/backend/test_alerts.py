"""Phone-call escalation: settings validation, simulated mode, real Twilio calls (mocked), cooldown."""

import httpx
import pytest

from app.api.deps import get_notifier
from app.main import app
from app.services.notifications import TwilioNotifier, build_twiml
from app.utils.config import Settings

ESCALATE = {"reason": "Eyes closed for 2.1 s", "probability": 0.93, "closure_seconds": 2.1}


def _enable(client, headers, **extra):
    body = {
        "phone_number": "+919876543210",
        "emergency_contact": "+919812345678",
        "escalation_enabled": True,
        "escalation_delay_seconds": 8,
        **extra,
    }
    return client.put("/api/alerts/settings", json=body, headers=headers)


def test_settings_roundtrip_and_validation(client, auth_headers):
    default = client.get("/api/alerts/settings", headers=auth_headers).json()
    assert default["escalation_enabled"] is False and default["provider_configured"] is False

    assert _enable(client, auth_headers, phone_number="98765").status_code == 422  # not E.164
    assert _enable(client, auth_headers, phone_number=None).status_code == 422  # enabled without phone
    assert _enable(client, auth_headers, escalation_delay_seconds=1).status_code == 422

    saved = _enable(client, auth_headers).json()
    assert saved["phone_number"] == "+919876543210" and saved["escalation_enabled"] is True


def test_escalation_requires_phone_and_enabled(client, auth_headers):
    assert client.post("/api/alerts/escalate", json=ESCALATE, headers=auth_headers).status_code == 400
    _enable(client, auth_headers, escalation_enabled=False)
    assert client.post("/api/alerts/escalate", json=ESCALATE, headers=auth_headers).status_code == 400


def test_simulated_call_then_cooldown(client, auth_headers):
    _enable(client, auth_headers)
    first = client.post("/api/alerts/escalate", json=ESCALATE, headers=auth_headers).json()
    assert first["status"] == "simulated"
    second = client.post("/api/alerts/escalate", json=ESCALATE, headers=auth_headers).json()
    assert second["status"] == "cooldown"

    history = client.get("/api/alerts/history", headers=auth_headers).json()
    assert [h["status"] for h in history] == ["simulated"]


class _FakeTransport(httpx.BaseTransport):
    def __init__(self):
        self.requests: list[httpx.Request] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        sid = "CA123" if request.url.path.endswith("/Calls.json") else "SM456"
        return httpx.Response(201, json={"sid": sid})


@pytest.fixture
def twilio_transport():
    transport = _FakeTransport()
    settings = Settings(twilio_account_sid="AC_test", twilio_auth_token="tok", twilio_from_number="+15005550006")
    app.dependency_overrides[get_notifier] = lambda: TwilioNotifier(settings, httpx.Client(transport=transport))
    yield transport
    app.dependency_overrides.pop(get_notifier, None)


def test_real_call_places_call_and_texts_emergency_contact(client, auth_headers, twilio_transport):
    _enable(client, auth_headers)
    res = client.post("/api/alerts/escalate", json=ESCALATE, headers=auth_headers).json()
    assert res == {"status": "calling", "call_sid": "CA123", "sms_sid": "SM456", "message": "Calling +919876543210"}

    call, sms = twilio_transport.requests
    assert call.url.path == "/2010-04-01/Accounts/AC_test/Calls.json"
    call_form = dict(httpx.QueryParams(call.content.decode()))
    assert call_form["To"] == "+919876543210" and "Wake up" in call_form["Twiml"]
    assert dict(httpx.QueryParams(sms.content.decode()))["To"] == "+919812345678"


def test_test_call_does_not_text_emergency_contact(client, auth_headers, twilio_transport):
    _enable(client, auth_headers, escalation_enabled=False)
    res = client.post("/api/alerts/escalate", json={**ESCALATE, "test": True}, headers=auth_headers).json()
    assert res["status"] == "calling" and res["sms_sid"] is None
    assert len(twilio_transport.requests) == 1


def test_twiml_escapes_user_text():
    xml = build_twiml("<script>&")
    assert "<script>" not in xml and "&lt;script&gt;&amp;" in xml
