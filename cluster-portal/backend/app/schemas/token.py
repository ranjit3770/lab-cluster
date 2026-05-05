from typing import Optional
from pydantic import BaseModel
from app.models.user import UserRole

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    role: UserRole

class TokenPayload(BaseModel):
    sub: Optional[str] = None
