from typing import Optional
from pydantic import BaseModel
from datetime import datetime
from app.models.job import JobStatus

class JobBase(BaseModel):
    job_name: str
    script_path: Optional[str] = None
    requirements_path: Optional[str] = None
    dependency_path: Optional[str] = None
    slurm_job_id: Optional[str] = None
    total_cpu: int = 1
    total_ram: int = 1
    resource_mode: str = "node_wise"
    walltime: str = "00:10:00"
    
    # New Slurm-native fields
    job_type: str = "single_node"
    partition: Optional[str] = None
    ntasks: Optional[int] = None
    cpus_per_task: Optional[int] = None
    gpu_count: Optional[int] = 0
    quota_status: str = "NORMAL"
    mem_per_cpu: Optional[int] = None
    constraint: Optional[str] = None
    
    status: JobStatus = JobStatus.PENDING
    output_log: Optional[str] = None
    error_log: Optional[str] = None

class JobCreate(JobBase):
    pass

class JobUpdate(JobBase):
    job_name: Optional[str] = None
    script_path: Optional[str] = None
    requirements_path: Optional[str] = None
    dependency_path: Optional[str] = None

from app.schemas.user import UserSchema

class JobInDBBase(JobBase):
    id: int
    owner_id: int
    owner: Optional[UserSchema] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class Job(JobInDBBase):
    pass
