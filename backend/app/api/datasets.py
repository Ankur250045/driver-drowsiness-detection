import csv
import io

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models.orm import FeatureSample
from app.models.schemas import SamplesUpload
from app.services.preprocessing import FeatureValidationError, feature_names, to_vector

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.post("/samples", status_code=status.HTTP_201_CREATED)
def upload_samples(payload: SamplesUpload, db: DbSession, user: CurrentUser) -> dict:
    """Store labelled feature windows recorded in the Data Lab."""
    try:
        for s in payload.samples:
            to_vector(s.features)  # validate
    except FeatureValidationError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e
    db.add_all(
        FeatureSample(user_id=user.id, timestamp_ms=s.timestamp_ms, label=s.label, features=s.features)
        for s in payload.samples
    )
    db.commit()
    return {"stored": len(payload.samples)}


@router.get("/samples.csv")
def export_samples(db: DbSession, user: CurrentUser) -> StreamingResponse:
    """Export the user's samples in the CSV layout consumed by ml/preprocessing/build_dataset.py."""
    names = feature_names()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["timestamp_ms", *names, "label"])
    rows = db.scalars(select(FeatureSample).where(FeatureSample.user_id == user.id).order_by(FeatureSample.timestamp_ms))
    for r in rows:
        writer.writerow([int(r.timestamp_ms), *(r.features[n] for n in names), r.label])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=drowsiness_samples.csv"},
    )
