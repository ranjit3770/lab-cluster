from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey
from sqlalchemy.sql import func
from app.models.database import Base
import enum

class JobStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED" # If quota exceeded

# UserQuota table is no longer required in slurm_jobs_db.
# Quota information is now fetched directly from the portal's 'users' table.

class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String(255), index=True)
    slurm_job_id = Column(Integer, nullable=True, index=True)
    status = Column(Enum(JobStatus), default=JobStatus.PENDING, index=True)
    
    script_path = Column(String(1024))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
