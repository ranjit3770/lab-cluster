from typing import Optional
from pydantic import BaseModel, EmailStr

class FeedbackCreate(BaseModel):
    type: str # 'bug', 'feature', 'suggestion', 'other'
    subject: str
    message: str
    category: Optional[str] = "General"

class FeedbackResponse(BaseModel):
    status: str
    message: str
