from typing import Optional
from pydantic import BaseModel
from datetime import datetime

class RequestBase(BaseModel):
    request_type: str
    cpu_cores: Optional[int] = None
    ram_gb: Optional[int] = None
    storage_gb: Optional[int] = None
    status: str = "pending"

class RequestCreate(RequestBase):
    pass

class RequestUpdate(BaseModel):
    request_type: Optional[str] = None
    cpu_cores: Optional[int] = None
    ram_gb: Optional[int] = None
    storage_gb: Optional[int] = None
    status: Optional[str] = None

class RequestInDBBase(RequestBase):
    id: int
    user_id: int
    cpu_cores: Optional[int] = None
    ram_gb: Optional[int] = None
    storage_gb: Optional[int] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class Request(RequestInDBBase):
    pass
