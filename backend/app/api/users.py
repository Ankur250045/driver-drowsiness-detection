from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.models.orm import User
from app.models.schemas import UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user
