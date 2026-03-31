from typing import Optional
from pydantic import BaseModel, EmailStr
from app.models.user import UserRole

class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = True
    role: Optional[str] = "user"
    username: Optional[str] = None
    full_name: Optional[str] = None
    cpu_limit: Optional[int] = 0
    memory_limit_gb: Optional[int] = 4
    storage_limit_gb: Optional[int] = 15

class UserCreate(UserBase):
    email: EmailStr
    username: str
    password: str

class UserUpdate(UserBase):
    password: Optional[str] = None
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None
    role: Optional[str] = None
    cpu_limit: Optional[int] = None
    memory_limit_gb: Optional[int] = None
    storage_limit_gb: Optional[int] = None

class UserInDBBase(UserBase):
    id: int
    
    class Config:
        from_attributes = True

class UserSchema(UserInDBBase):
    pass

class UserDashboardStats(BaseModel):
    cpu_limit: int
    memory_limit_gb: int
    total_jobs: int
    running_jobs: int
    pending_jobs: int
    completed_jobs: int
    failed_jobs: int
    cancelled_jobs: int
    storage_limit_gb: int
    storage_used_gb: float
