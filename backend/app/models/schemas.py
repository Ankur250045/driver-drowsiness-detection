from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

E164 = r"^\+[1-9]\d{7,14}$"


# ---------- users / auth ----------
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=120)


DriverType = Literal["personal", "cab", "truck"]
TOPIC = r"^[A-Za-z0-9_-]{8,64}$"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str | None
    created_at: datetime
    driver_type: DriverType | None = None
    vehicle_number: str | None = None
    watch_topic: str | None = None


class ProfileIn(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    driver_type: DriverType
    vehicle_number: str | None = Field(default=None, max_length=20)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- predictions ----------
class PredictRequest(BaseModel):
    features: dict[str, float]


class PredictResponse(BaseModel):
    probability: float
    label: Literal["alert", "drowsy"]
    model_version: str
    contributions: dict[str, float]


# ---------- sessions / analytics ----------
class SessionEvent(BaseModel):
    t: float
    type: str
    detail: str


class SessionCreate(BaseModel):
    client_id: str = Field(max_length=64)
    started_at: datetime
    duration_seconds: float = Field(ge=0)
    model_version: str = Field(max_length=100)
    avg_probability: float = Field(ge=0, le=1)
    max_probability: float = Field(ge=0, le=1)
    avg_perclos: float = Field(ge=0, le=1)
    total_blinks: int = Field(ge=0)
    total_yawns: int = Field(ge=0)
    microsleeps: int = Field(ge=0)
    alerts: int = Field(ge=0)
    driver_type: DriverType | None = None
    events: list[SessionEvent] = Field(default_factory=list, max_length=500)
    timeline: list[dict] = Field(default_factory=list, max_length=2000)


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: str
    started_at: datetime
    duration_seconds: float
    model_version: str
    avg_probability: float
    max_probability: float
    avg_perclos: float
    total_blinks: int
    total_yawns: int
    microsleeps: int
    alerts: int
    driver_type: str | None = None


class SessionDetail(SessionOut):
    events: list[dict]
    timeline: list[dict]


class HourBucket(BaseModel):
    hour: int
    avg_probability: float
    sessions: int


class AnalyticsSummary(BaseModel):
    total_sessions: int
    total_drive_minutes: float
    avg_probability: float
    total_microsleeps: int
    total_alerts: int
    total_yawns: int
    risk_by_hour: list[HourBucket]


# ---------- datasets ----------
class SampleIn(BaseModel):
    timestamp_ms: float
    label: Literal[0, 1]
    features: dict[str, float]


class SamplesUpload(BaseModel):
    samples: list[SampleIn] = Field(max_length=10_000)


# ---------- alert escalation ----------
class AlertSettingsIn(BaseModel):
    phone_number: str | None = Field(default=None, pattern=E164)
    emergency_contact: str | None = Field(default=None, pattern=E164)
    escalation_enabled: bool = False
    escalation_delay_seconds: int = Field(default=8, ge=3, le=60)


class AlertSettingsOut(AlertSettingsIn):
    provider_configured: bool


class EscalateRequest(BaseModel):
    reason: str = Field(max_length=255)
    probability: float = Field(ge=0, le=1)
    closure_seconds: float = Field(ge=0)
    test: bool = False


class EscalationResult(BaseModel):
    status: Literal["calling", "simulated", "failed", "cooldown"]
    call_sid: str | None = None
    sms_sid: str | None = None
    message: str


class WatchSettingsIn(BaseModel):
    watch_topic: str | None = Field(default=None, pattern=TOPIC)


class WatchAlertIn(BaseModel):
    reason: str = Field(max_length=255)
    test: bool = False


class WatchAlertOut(BaseModel):
    status: Literal["sent", "failed", "not_configured"]
    message: str


class EscalationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reason: str
    status: str
    is_test: bool
    call_sid: str | None
    created_at: datetime
