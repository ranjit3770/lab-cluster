from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from app.db.base_class import Base

class Node(Base):
    __tablename__ = "nodes"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, index=True, nullable=False)
    ip_address = Column(String(50), nullable=True)
    status = Column(String(50), default="idle") # idle, allocated, down, draining
    cpu_info = Column(String(255), nullable=True)
    memory_info = Column(String(255), nullable=True)
    gpu_info = Column(String(255), nullable=True)
    operating_system = Column(String(255), nullable=True)
    
    # Resource Stats (for dashboard aggregation)
    cpu_total = Column(Integer, default=0)
    cpu_used = Column(Integer, default=0)
    cores_total = Column(Integer, default=0)
    sockets = Column(Integer, default=0)
    threads_per_core = Column(Integer, default=0)
    memory_total_mb = Column(Integer, default=0)
    memory_used_mb = Column(Integer, default=0)
    gpu_total = Column(Integer, default=0)
    gpu_used = Column(Integer, default=0)
    cpu_load = Column(Integer, default=0)
    free_memory_mb = Column(Integer, default=0)
    slurm_version = Column(String(50), nullable=True)
    
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
