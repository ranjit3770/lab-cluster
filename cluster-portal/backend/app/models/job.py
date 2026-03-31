from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum, Text
from sqlalchemy.orm import relationship
import enum
from datetime import datetime
from app.db.base_class import Base

class JobStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class Job(Base):
    __tablename__ = "jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    job_name = Column(String(255), index=True, nullable=False)
    script_path = Column(String(500))
    requirements_path = Column(String(500), nullable=True)
    dependency_path = Column(String(500), nullable=True)
    slurm_job_id = Column(String(50), nullable=True)
    
    # Resource Specs
    total_cpu = Column(Integer, default=1)
    total_ram = Column(Integer, default=1)
    resource_mode = Column(String(20), default="node_wise")
    walltime = Column(String(20), default="00:10:00")

    status = Column(Enum(JobStatus), default=JobStatus.PENDING)
    output_log = Column(Text, nullable=True)
    error_log = Column(Text, nullable=True)
    
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    owner = relationship("User", back_populates="jobs")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
