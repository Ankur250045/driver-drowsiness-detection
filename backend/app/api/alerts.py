from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, get_notifier, get_watch_notifier
from app.models.orm import AlertEscalation, User
from app.models.schemas import (
    AlertSettingsIn,
    AlertSettingsOut,
    EscalateRequest,
    EscalationOut,
    EscalationResult,
    UserOut,
    WatchAlertIn,
    WatchAlertOut,
    WatchSettingsIn,
)
from app.services.notifications import TwilioNotifier
from app.services.watch import WatchNotifier
from app.utils.config import get_settings

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _settings_out(user: User, notifier: TwilioNotifier) -> AlertSettingsOut:
    return AlertSettingsOut(
        phone_number=user.phone_number,
        emergency_contact=user.emergency_contact,
        escalation_enabled=user.escalation_enabled,
        escalation_delay_seconds=user.escalation_delay_seconds,
        provider_configured=notifier.configured,
    )


@router.get("/settings", response_model=AlertSettingsOut)
def get_alert_settings(user: CurrentUser, notifier: Annotated[TwilioNotifier, Depends(get_notifier)]):
    return _settings_out(user, notifier)


@router.put("/settings", response_model=AlertSettingsOut)
def update_alert_settings(
    payload: AlertSettingsIn,
    user: CurrentUser,
    db: DbSession,
    notifier: Annotated[TwilioNotifier, Depends(get_notifier)],
):
    if payload.escalation_enabled and not payload.phone_number:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A phone number is required to enable call escalation")
    for field, value in payload.model_dump().items():
        setattr(user, field, value)
    db.commit()
    return _settings_out(user, notifier)


@router.post("/escalate", response_model=EscalationResult)
def escalate(
    payload: EscalateRequest,
    user: CurrentUser,
    db: DbSession,
    notifier: Annotated[TwilioNotifier, Depends(get_notifier)],
) -> EscalationResult:
    """Phone the driver because an on-device alarm went unacknowledged.

    Called by the frontend after the escalation delay. Rate-limited per user so a
    flapping alarm cannot trigger repeated calls.
    """
    if not user.phone_number:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No phone number configured")
    if not payload.test and not user.escalation_enabled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Call escalation is disabled")

    cooldown = timedelta(seconds=get_settings().escalation_cooldown_seconds)
    last = db.scalar(
        select(AlertEscalation)
        .where(AlertEscalation.user_id == user.id, AlertEscalation.status.in_(["calling", "simulated"]))
        .order_by(AlertEscalation.created_at.desc())
        .limit(1)
    )
    if last:
        last_at = last.created_at if last.created_at.tzinfo else last.created_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - last_at < cooldown:
            return EscalationResult(status="cooldown", message="A call was placed moments ago; not calling again yet.")

    result = notifier.escalate(
        user.phone_number,
        payload.reason,
        emergency_contact=None if payload.test else user.emergency_contact,
    )
    db.add(
        AlertEscalation(
            user_id=user.id,
            reason=payload.reason,
            probability=payload.probability,
            closure_seconds=payload.closure_seconds,
            is_test=payload.test,
            status=result.status,
            call_sid=result.call_sid,
            sms_sid=result.sms_sid,
            detail=result.message[:500],
        )
    )
    db.commit()
    return EscalationResult(
        status=result.status, call_sid=result.call_sid, sms_sid=result.sms_sid, message=result.message
    )


@router.get("/history", response_model=list[EscalationOut])
def escalation_history(user: CurrentUser, db: DbSession, limit: int = 20):
    stmt = (
        select(AlertEscalation)
        .where(AlertEscalation.user_id == user.id)
        .order_by(AlertEscalation.created_at.desc())
        .limit(min(limit, 100))
    )
    return list(db.scalars(stmt))


# ---------- smartwatch (phone notification → watch vibration) ----------


@router.put("/watch", response_model=UserOut)
def set_watch_topic(payload: WatchSettingsIn, user: CurrentUser, db: DbSession) -> User:
    user.watch_topic = payload.watch_topic
    db.commit()
    return user


@router.post("/watch", response_model=WatchAlertOut)
def alert_watch(
    payload: WatchAlertIn,
    user: CurrentUser,
    notifier: Annotated[WatchNotifier, Depends(get_watch_notifier)],
) -> WatchAlertOut:
    """Sent by the monitor as soon as the alarm starts (no delay, unlike the phone call)."""
    result = notifier.send(user.watch_topic, payload.reason, test=payload.test)
    return WatchAlertOut(status=result.status, message=result.message)
