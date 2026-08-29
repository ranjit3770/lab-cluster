"""Authentication and authorization for the MCP server.

Uses the same JWT tokens as the portal backend.  The MCP server never issues
its own tokens — it only validates tokens from the portal.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import BaseModel
from typing import Optional

from app.config import settings


class MCPUser(BaseModel):
    user_id: int
    username: str
    role: str
    mode: str = "operate"  # "observe" or "operate"


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/mcp/auth/token", auto_error=False)


def _decode_token(token: str) -> MCPUser:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        sub = payload.get("sub")
        if sub is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing subject claim",
            )
        username = payload.get("username") or payload.get("name") or ""
        role = payload.get("role", "user")
        mode = payload.get("mode", "operate")  # "observe" or "operate"
        if mode not in ("observe", "operate"):
            mode = "operate"
        return MCPUser(user_id=int(sub), username=username, role=role, mode=mode)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
        )
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Malformed token payload: {exc}",
        )


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
) -> Optional[MCPUser]:
    if not settings.MCP_REQUIRE_AUTH:
        return MCPUser(user_id=0, username="mcp-anonymous", role="admin")
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return _decode_token(token)


def require_role(*allowed_roles: str):
    """Dependency factory for role-based access control on MCP tools."""
    def checker(user: MCPUser = Depends(get_current_user)) -> MCPUser:
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
            )
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role}' not in allowed roles: {allowed_roles}",
            )
        return user
    return checker
