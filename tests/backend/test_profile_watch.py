"""Driver profile, smartwatch (ntfy) alerts, R insights endpoint and the served website."""

import httpx
import pytest

from app.api.deps import get_watch_notifier
from app.main import app
from app.services.watch import WatchNotifier
from app.utils.config import Settings


def test_new_user_has_no_driver_type(client, auth_headers):
    me = client.get("/api/users/me", headers=auth_headers).json()
    assert me["driver_type"] is None


def test_save_profile(client, auth_headers):
    r = client.put(
        "/api/users/me/profile",
        json={"driver_type": "truck", "vehicle_number": " mh12ab1234 ", "full_name": "Ravi"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["driver_type"] == "truck"
    assert body["vehicle_number"] == "MH12AB1234"
    assert body["full_name"] == "Ravi"


def test_invalid_driver_type_rejected(client, auth_headers):
    r = client.put("/api/users/me/profile", json={"driver_type": "bus"}, headers=auth_headers)
    assert r.status_code == 422


def test_session_gets_driver_type_from_profile(client, auth_headers):
    client.put("/api/users/me/profile", json={"driver_type": "cab"}, headers=auth_headers)
    session = {
        "client_id": "cab-1",
        "started_at": "2026-10-10T23:00:00Z",
        "duration_seconds": 120,
        "model_version": "t@1",
        "avg_probability": 0.3,
        "max_probability": 0.6,
        "avg_perclos": 0.1,
        "total_blinks": 30,
        "total_yawns": 1,
        "microsleeps": 0,
        "alerts": 0,
        "events": [{"t": 1000, "type": "yawn", "detail": "Yawn"}],
        "timeline": [{"t": 0, "probability": 0.2, "perclos": 0.1}],
    }
    created = client.post("/api/sessions", json=session, headers=auth_headers).json()
    assert created["driver_type"] == "cab"
    detail = client.get(f"/api/sessions/{created['id']}", headers=auth_headers).json()
    assert detail["events"][0]["type"] == "yawn" and len(detail["timeline"]) == 1


def test_cannot_read_other_users_session(client, auth_headers):
    import uuid

    email = f"other-{uuid.uuid4().hex[:6]}@example.com"
    client.post("/api/auth/register", json={"email": email, "password": "password123"})
    token = client.post("/api/auth/login", data={"username": email, "password": "password123"}).json()["access_token"]
    other = {"Authorization": f"Bearer {token}"}
    sessions = client.get("/api/sessions", headers=auth_headers).json()
    if sessions:
        assert client.get(f"/api/sessions/{sessions[0]['id']}", headers=other).status_code == 404


# ---------- smartwatch ----------


def test_watch_topic_validation(client, auth_headers):
    assert client.put("/api/alerts/watch", json={"watch_topic": "bad topic!"}, headers=auth_headers).status_code == 422
    assert client.put("/api/alerts/watch", json={"watch_topic": "short"}, headers=auth_headers).status_code == 422
    ok = client.put("/api/alerts/watch", json={"watch_topic": "drowsy-abc12345"}, headers=auth_headers)
    assert ok.status_code == 200 and ok.json()["watch_topic"] == "drowsy-abc12345"


def test_watch_alert_without_topic(client, auth_headers):
    res = client.post("/api/alerts/watch", json={"reason": "test"}, headers=auth_headers).json()
    assert res["status"] == "not_configured"


class _FakeNtfy(httpx.BaseTransport):
    def __init__(self, status=200):
        self.status = status
        self.requests: list[httpx.Request] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(self.status, json={"id": "x"})


@pytest.fixture
def fake_ntfy():
    transport = _FakeNtfy()
    app.dependency_overrides[get_watch_notifier] = lambda: WatchNotifier(
        Settings(ntfy_server="https://ntfy.example"), httpx.Client(transport=transport)
    )
    yield transport
    app.dependency_overrides.pop(get_watch_notifier, None)


def test_watch_alert_publishes_urgent_notification(client, auth_headers, fake_ntfy):
    client.put("/api/alerts/watch", json={"watch_topic": "drowsy-topic123"}, headers=auth_headers)
    res = client.post("/api/alerts/watch", json={"reason": "Eyes closed for 2 s"}, headers=auth_headers).json()
    assert res["status"] == "sent"
    req = fake_ntfy.requests[0]
    assert str(req.url) == "https://ntfy.example/drowsy-topic123"
    assert req.headers["Priority"] == "5"
    assert req.content == b"Eyes closed for 2 s"


def test_watch_test_alert_is_not_urgent(client, auth_headers, fake_ntfy):
    client.put("/api/alerts/watch", json={"watch_topic": "drowsy-topic123"}, headers=auth_headers)
    client.post("/api/alerts/watch", json={"reason": "test", "test": True}, headers=auth_headers)
    assert fake_ntfy.requests[0].headers["Priority"] == "3"


# ---------- insights + website ----------


def test_insights_endpoint_requires_login(client):
    assert client.get("/api/insights").status_code == 401


def test_insights_endpoint_reports_r_status(client, auth_headers):
    body = client.get("/api/insights", headers=auth_headers).json()
    assert "available" in body and "r_installed" in body


def test_website_is_served(client):
    for page in ("login.html", "monitor.html", "profile.html", "sessions.html", "insights.html", "training.html"):
        r = client.get(f"/{page}")
        assert r.status_code == 200, page
        assert "<html" in r.text
    assert client.get("/models/drowsiness_model.json").json()["features"][0] == "ear_mean"
