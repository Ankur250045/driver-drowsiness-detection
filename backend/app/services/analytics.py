from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.orm import DrivingSession
from app.models.schemas import AnalyticsSummary, HourBucket


def summarize(db: Session, user_id: int) -> AnalyticsSummary:
    sessions = db.scalars(select(DrivingSession).where(DrivingSession.user_id == user_id)).all()
    total_seconds = sum(s.duration_seconds for s in sessions)
    weighted_prob = (
        sum(s.avg_probability * s.duration_seconds for s in sessions) / total_seconds if total_seconds else 0.0
    )

    by_hour: dict[int, list[float]] = defaultdict(list)
    for s in sessions:
        by_hour[s.started_at.hour].append(s.avg_probability)

    return AnalyticsSummary(
        total_sessions=len(sessions),
        total_drive_minutes=total_seconds / 60,
        avg_probability=weighted_prob,
        total_microsleeps=sum(s.microsleeps for s in sessions),
        total_alerts=sum(s.alerts for s in sessions),
        total_yawns=sum(s.total_yawns for s in sessions),
        risk_by_hour=[
            HourBucket(hour=h, avg_probability=sum(v) / len(v), sessions=len(v)) for h, v in sorted(by_hour.items())
        ],
    )
