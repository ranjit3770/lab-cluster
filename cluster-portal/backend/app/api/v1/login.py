from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from pydantic import ValidationError
from jose import jwt
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api import deps
from app.core import security
from app.core.config import settings
from app.core.login_throttle import check_lockout, clear_failures, record_failure
from app.models.user import User
from app.schemas.token import Token, TokenPayload

router = APIRouter()


@router.post("/login/access-token", response_model=Token)
def login_access_token(
    request: Request,
    db: Session = Depends(deps.get_db), form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests.
    Failed attempts are rate limited in the shared database; repeated failures
    lock the account out for every worker process.
    """
    ip = request.client.host if request.client else "unknown"
    check_lockout(db, form_data.username, ip)

    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        record_failure(db, form_data.username, ip)
        from app.core import audit
        audit.record(
            db, action="login.failure",
            resource=f"user:{form_data.username}", detail="invalid credentials",
            request=request, status="failure",
        )
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    clear_failures(db, form_data.username, ip)

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            user.id, expires_delta=access_token_expires, username=user.username, role=user.role
        ),
        "refresh_token": security.create_refresh_token(user.id),
        "token_type": "bearer",
        "role": user.role,
        "username": user.username
    }

@router.post("/refresh-token", response_model=Token)
def refresh_token(
    db: Session = Depends(deps.get_db), refresh_token: str = Body(..., embed=True)
) -> Any:
    """
    Refresh access token
    """
    try:
        payload = jwt.decode(
            refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        if not payload.get("refresh"):
             raise HTTPException(status_code=403, detail="Invalid refresh token")
        token_data = TokenPayload(**payload)
    except (jwt.JWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    user = db.query(User).filter(User.id == token_data.sub).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            user.id, expires_delta=access_token_expires, username=user.username, role=user.role
        ),
        "refresh_token": security.create_refresh_token(user.id),
        "token_type": "bearer",
        "role": user.role,
        "username": user.username
    }
