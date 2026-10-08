import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

# Isolated database + no real Twilio credentials for every test run.
_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp) / 'test.db'}"
os.environ["SECRET_KEY"] = "test-secret"
for key in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"):
    os.environ[key] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_headers(client):
    import uuid

    email = f"driver-{uuid.uuid4().hex[:8]}@example.com"
    client.post("/api/auth/register", json={"email": email, "password": "s3cure-pass", "full_name": "Test Driver"})
    token = client.post("/api/auth/login", data={"username": email, "password": "s3cure-pass"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


ALERT_FEATURES = {
    "ear_mean": 0.29,
    "ear_std": 0.03,
    "perclos": 0.03,
    "blink_rate": 16,
    "blink_duration_mean": 0.15,
    "longest_closure": 0.2,
    "mar_mean": 0.12,
    "yawn_rate": 0,
    "pitch_mean": 0,
    "pitch_std": 2,
    "yaw_std": 3,
}
DROWSY_FEATURES = {
    **ALERT_FEATURES,
    "ear_mean": 0.21,
    "perclos": 0.35,
    "blink_duration_mean": 0.6,
    "longest_closure": 2.5,
    "yawn_rate": 3,
    "pitch_mean": 12,
}
