from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum, Text
from sqlalchemy.orm import relationship
import enum
from datetime import datetime
from app.db.base_class import Base

class JobStatus(str, enum.Enum):
    PENDING = "PENDING"
    WAITING = "WAITING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    UNKNOWN = "UNKNOWN"

class Job(Base):
    __tablename__ = "jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    job_name = Column(String(255), index=True, nullable=False)
    script_path = Column(String(500))
    requirements_path = Column(String(500), nullable=True)
    dependency_path = Column(String(500), nullable=True)
    slurm_job_id = Column(String(50), nullable=True)
    
    total_cpu = Column(Integer, default=1)
    total_ram = Column(Integer, default=1)
    resource_mode = Column(String(20), default="node_wise")
    walltime = Column(String(20), default="00:10:00")
    
    # New Slurm-native SPEC
    job_type = Column(String(50), default="single_node")
    partition = Column(String(100), nullable=True)
    ntasks = Column(Integer, default=1)
    cpus_per_task = Column(Integer, default=1)
    gpu_count = Column(Integer, default=0)
    quota_status = Column(String(50), default="NORMAL")
    mem_per_cpu = Column(Integer, nullable=True)
    constraint = Column(String(255), nullable=True)

    status = Column(Enum(JobStatus), default=JobStatus.PENDING)
    output_log = Column(Text, nullable=True)
    error_log = Column(Text, nullable=True)
    
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    owner = relationship("User", back_populates="jobs")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
