from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from app.models.models import JobStatus

class JobCreate(BaseModel):
    # This might be used if we accept metadata alongside file uploads
    pass

class JobResponse(BaseModel):
    id: int
    user_id: str
    slurm_job_id: Optional[int] = None
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    script_path: Optional[str] = None

    class Config:
        from_attributes = True
