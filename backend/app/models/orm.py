from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str | None] = mapped_column(String(120))
    hashed_password: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Driver profile: "personal" | "cab" | "truck" (None until chosen after sign-up)
    driver_type: Mapped[str | None] = mapped_column(String(20))
    vehicle_number: Mapped[str | None] = mapped_column(String(20))
    # ntfy.sh topic for phone → smartwatch notification alerts
    watch_topic: Mapped[str | None] = mapped_column(String(64))

    # Emergency phone-call escalation
    phone_number: Mapped[str | None] = mapped_column(String(20))
    emergency_contact: Mapped[str | None] = mapped_column(String(20))
    escalation_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    escalation_delay_seconds: Mapped[int] = mapped_column(Integer, default=8)

    sessions: Mapped[list["DrivingSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class DrivingSession(Base):
    __tablename__ = "driving_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    client_id: Mapped[str] = mapped_column(String(64), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[float] = mapped_column(Float)
    model_version: Mapped[str] = mapped_column(String(100))
    avg_probability: Mapped[float] = mapped_column(Float)
    max_probability: Mapped[float] = mapped_column(Float)
    avg_perclos: Mapped[float] = mapped_column(Float)
    total_blinks: Mapped[int] = mapped_column(Integer)
    total_yawns: Mapped[int] = mapped_column(Integer)
    microsleeps: Mapped[int] = mapped_column(Integer)
    alerts: Mapped[int] = mapped_column(Integer)
    driver_type: Mapped[str | None] = mapped_column(String(20))
    events: Mapped[list] = mapped_column(JSON, default=list)
    timeline: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="sessions")


class FeatureSample(Base):
    """Labelled feature windows contributed from the Data Lab (training data)."""

    __tablename__ = "feature_samples"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    timestamp_ms: Mapped[float] = mapped_column(Float)
    label: Mapped[int] = mapped_column(Integer)
    features: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Prediction(Base):
    """Audit log of server-side predictions."""

    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    probability: Mapped[float] = mapped_column(Float)
    model_version: Mapped[str] = mapped_column(String(100))
    features: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AlertEscalation(Base):
    """Each phone-call escalation attempt (real or simulated)."""

    __tablename__ = "alert_escalations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    reason: Mapped[str] = mapped_column(String(255))
    probability: Mapped[float] = mapped_column(Float)
    closure_seconds: Mapped[float] = mapped_column(Float)
    is_test: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20))
    call_sid: Mapped[str | None] = mapped_column(String(64))
    sms_sid: Mapped[str | None] = mapped_column(String(64))
    detail: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
