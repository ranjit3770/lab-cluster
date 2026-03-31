from sqlalchemy import Column, Integer, String, DateTime, Boolean
from datetime import datetime
from app.db.base_class import Base

class ClusterHealth(Base):
    __tablename__ = "cluster_health"
    
    id = Column(Integer, primary_key=True, index=True)
    slurmctld_status = Column(String(50), default="unknown") # running, stopped, unknown
    slurmdbd_status = Column(String(50), default="unknown")
    cluster_status = Column(String(50), default="unknown") # healthy, degraded, down
    last_heartbeat = Column(DateTime, default=datetime.utcnow)
    
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
