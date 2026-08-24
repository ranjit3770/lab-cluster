from typing import Generator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.user import User
from app.schemas.token import TokenPayload

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"/api/v1/login/access-token"
)

def get_db() -> Generator:
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()

def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(reusable_oauth2)
) -> User:
    try:
        # Debugging: Print first few characters of token and secret key info
        # print(f"DEBUG: Validating token starts with: {token[:10]}...")
        # print(f"DEBUG: Using algorithm: {settings.ALGORITHM}")
        
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
        if token_data.sub is None:
             print("DEBUG: Token sub is None")
             raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Token sub missing",
            )
    except (JWTError, ValidationError) as e:
        print(f"DEBUG: JWT Validation Failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Could not validate credentials: {str(e)}",
        )
    except Exception as e:
        print(f"DEBUG: Unexpected Auth Error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during authentication",
        )

    # Ensure we use an integer for ID if sub is a string representation of an int
    user_id = token_data.sub
    try:
        user_id_int = int(user_id)
    except (ValueError, TypeError):
        user_id_int = user_id

    user = db.query(User).filter(User.id == user_id_int).first()
    if not user:
        print(f"DEBUG: User not found in DB for sub: {user_id}")
        raise HTTPException(status_code=404, detail="User not found")
    
    # print(f"DEBUG: Authenticated user: {user.username}")
    return user

def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

# Privileged roles allowed to perform administrative operations.
PRIVILEGED_ROLES = ("admin", "developer")


def require_roles(*allowed_roles: str):
    """
    Dependency factory enforcing server-side RBAC.

    Usage:
        @router.post("/", dependencies=[Depends(require_roles("admin"))])
        def admin_only_endpoint(): ...
    """
    def role_checker(current_user: User = Depends(get_current_active_user)) -> User:
        user_role = str(getattr(current_user.role, "value", current_user.role))
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The user doesn't have enough privileges",
            )
        return current_user
    return role_checker


def get_current_active_superuser(
    current_user: User = Depends(get_current_active_user),
) -> User:
    if str(getattr(current_user.role, "value", current_user.role)) not in PRIVILEGED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges",
        )
    return current_user
