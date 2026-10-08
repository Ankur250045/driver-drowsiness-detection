from fastapi import APIRouter, HTTPException, status

from app.api.deps import DbSession, OptionalUser
from app.models.orm import Prediction
from app.models.schemas import PredictRequest, PredictResponse
from app.services.ml_service import get_model
from app.services.preprocessing import FeatureValidationError, feature_spec

router = APIRouter(prefix="/predict", tags=["predictions"])


@router.post("", response_model=PredictResponse)
def predict(payload: PredictRequest, db: DbSession, user: OptionalUser) -> PredictResponse:
    """Classify a 10-second feature window (see ml/feature_spec.json)."""
    model = get_model()
    try:
        probability, contributions = model.predict(payload.features)
    except FeatureValidationError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e

    db.add(
        Prediction(
            user_id=user.id if user else None,
            probability=probability,
            model_version=model.artifact.version_tag,
            features=payload.features,
        )
    )
    db.commit()
    return PredictResponse(
        probability=probability,
        label="drowsy" if probability >= 0.5 else "alert",
        model_version=model.artifact.version_tag,
        contributions=contributions,
    )


@router.get("/model")
def model_info() -> dict:
    """Model card metadata for the server-side model."""
    a = get_model().artifact
    return {
        "name": a.name,
        "version": a.version,
        "type": a.type,
        "trained": a.trained,
        "features": a.features,
        "layers": [len(layer["bias"]) for layer in a.layers],
        "metrics": a.metrics,
        "source": a.raw.get("source"),
        "trained_at": a.raw.get("trained_at"),
        "window_seconds": feature_spec()["window_seconds"],
    }
