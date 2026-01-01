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

class UserQuota(Base):
    __tablename__ = "user_quotas"

    user_id = Column(String(255), primary_key=True, index=True)
    
    # Resource Limits
    disk_quota_mb = Column(Integer, default=1000)
    cpus_per_job = Column(Integer, default=1)
    mem_mb_per_cpu = Column(Integer, default=1024)
    max_concurrent_jobs = Column(Integer, default=5)
    
    # I/O Throttling (Cgroups v2)
    read_limit_mb_s = Column(Integer, default=50)
    write_limit_mb_s = Column(Integer, default=50)
    read_iops = Column(Integer, default=500)
    write_iops = Column(Integer, default=500)

class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String(255), index=True)
    slurm_job_id = Column(Integer, nullable=True, index=True)
    status = Column(Enum(JobStatus), default=JobStatus.PENDING, index=True)
    
    script_path = Column(String(1024))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
