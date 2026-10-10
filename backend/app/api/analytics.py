from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models.orm import DrivingSession
from app.models.schemas import AnalyticsSummary, SessionCreate, SessionDetail, SessionOut
from app.services.analytics import summarize

router = APIRouter(tags=["analytics"])


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(payload: SessionCreate, db: DbSession, user: CurrentUser) -> DrivingSession:
    # Idempotent on the client-generated id (safe to retry).
    existing = db.scalar(
        select(DrivingSession).where(DrivingSession.user_id == user.id, DrivingSession.client_id == payload.client_id)
    )
    if existing:
        return existing
    data = payload.model_dump()
    data["events"] = [e.model_dump() for e in payload.events]
    data["driver_type"] = payload.driver_type or user.driver_type
    session = DrivingSession(user_id=user.id, **data)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(db: DbSession, user: CurrentUser, limit: int = 50) -> list[DrivingSession]:
    stmt = (
        select(DrivingSession)
        .where(DrivingSession.user_id == user.id)
        .order_by(DrivingSession.started_at.desc())
        .limit(min(limit, 200))
    )
    return list(db.scalars(stmt))


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def get_session(session_id: int, db: DbSession, user: CurrentUser) -> DrivingSession:
    session = db.get(DrivingSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return session


@router.get("/analytics/summary", response_model=AnalyticsSummary)
def analytics_summary(db: DbSession, user: CurrentUser) -> AnalyticsSummary:
    return summarize(db, user.id)
