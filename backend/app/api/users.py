from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.models.orm import User
from app.models.schemas import ProfileIn, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.put("/me/profile", response_model=UserOut)
def update_profile(payload: ProfileIn, user: CurrentUser, db: DbSession) -> User:
    """Driver type (personal car / cab / truck) and vehicle details chosen after sign-up."""
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip() or None
    user.driver_type = payload.driver_type
    user.vehicle_number = (payload.vehicle_number or "").strip().upper() or None
    db.commit()
    return user
