from datetime import datetime, timezone

from conftest import ALERT_FEATURES, DROWSY_FEATURES


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["escalation_provider"] == "simulated"
    assert "name" in body["model"]


# ---------- auth ----------
def test_register_login_me(client):
    r = client.post("/api/auth/register", json={"email": "Ankur@Example.com", "password": "password123"})
    assert r.status_code == 201
    assert r.json()["email"] == "ankur@example.com"

    assert client.post("/api/auth/register", json={"email": "ankur@example.com", "password": "password123"}).status_code == 409

    bad = client.post("/api/auth/login", data={"username": "ankur@example.com", "password": "wrong-pass"})
    assert bad.status_code == 401

    token = client.post("/api/auth/login", data={"username": "ankur@example.com", "password": "password123"}).json()[
        "access_token"
    ]
    me = client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["email"] == "ankur@example.com"


def test_protected_routes_require_auth(client):
    assert client.get("/api/users/me").status_code == 401
    assert client.get("/api/analytics/summary").status_code == 401
    assert client.post("/api/alerts/escalate", json={"reason": "x", "probability": 0.9, "closure_seconds": 2}).status_code == 401


def test_short_password_rejected(client):
    assert client.post("/api/auth/register", json={"email": "a@b.co", "password": "short"}).status_code == 422


# ---------- predictions ----------
def test_predict_orders_alert_below_drowsy(client):
    alert = client.post("/api/predict", json={"features": ALERT_FEATURES}).json()
    drowsy = client.post("/api/predict", json={"features": DROWSY_FEATURES}).json()
    assert 0 <= alert["probability"] < drowsy["probability"] <= 1
    assert drowsy["label"] == "drowsy"
    assert set(drowsy["contributions"]) == set(ALERT_FEATURES)


def test_predict_rejects_missing_features(client):
    r = client.post("/api/predict", json={"features": {"ear_mean": 0.3}})
    assert r.status_code == 422
    assert "Missing features" in r.json()["detail"]


def test_model_info(client):
    info = client.get("/api/predict/model").json()
    assert info["features"] == list(ALERT_FEATURES)
    assert info["window_seconds"] == 10


# ---------- sessions & analytics ----------
def _session(client_id="abc"):
    return {
        "client_id": client_id,
        "started_at": datetime(2026, 10, 9, 22, 30, tzinfo=timezone.utc).isoformat(),
        "duration_seconds": 600,
        "model_version": "test@1",
        "avg_probability": 0.4,
        "max_probability": 0.95,
        "avg_perclos": 0.12,
        "total_blinks": 120,
        "total_yawns": 3,
        "microsleeps": 2,
        "alerts": 1,
        "events": [{"t": 1000, "type": "yawn", "detail": "Yawn"}],
        "timeline": [{"t": 0, "probability": 0.1}],
    }


def test_sessions_are_idempotent_and_summarised(client, auth_headers):
    first = client.post("/api/sessions", json=_session(), headers=auth_headers)
    again = client.post("/api/sessions", json=_session(), headers=auth_headers)
    assert first.status_code == 201 and first.json()["id"] == again.json()["id"]
    client.post("/api/sessions", json={**_session("def"), "avg_probability": 0.2}, headers=auth_headers)

    summary = client.get("/api/analytics/summary", headers=auth_headers).json()
    assert summary["total_sessions"] == 2
    assert summary["total_drive_minutes"] == 20
    assert abs(summary["avg_probability"] - 0.3) < 1e-9
    assert summary["total_microsleeps"] == 4
    assert summary["risk_by_hour"][0]["hour"] == 22


# ---------- datasets ----------
def test_upload_and_export_samples(client, auth_headers):
    samples = [{"timestamp_ms": i * 1000, "label": i % 2, "features": ALERT_FEATURES} for i in range(4)]
    assert client.post("/api/datasets/samples", json={"samples": samples}, headers=auth_headers).json() == {"stored": 4}
    csv = client.get("/api/datasets/samples.csv", headers=auth_headers).text.strip().splitlines()
    assert csv[0].startswith("timestamp_ms,ear_mean") and csv[0].endswith(",label")
    assert len(csv) == 5
