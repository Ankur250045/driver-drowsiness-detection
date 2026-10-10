from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.orm import User
from app.services.notifications import TwilioNotifier
from app.services.watch import WatchNotifier
from app.utils.config import get_settings
from app.utils.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


def get_optional_user(db: DbSession, token: Annotated[str | None, Depends(oauth2_scheme)]) -> User | None:
    if not token:
        return None
    sub = decode_access_token(token)
    return db.get(User, int(sub)) if sub and sub.isdigit() else None


def get_current_user(user: Annotated[User | None, Depends(get_optional_user)]) -> User:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def get_notifier() -> TwilioNotifier:
    return TwilioNotifier(get_settings())


def get_watch_notifier() -> WatchNotifier:
    return WatchNotifier(get_settings())
