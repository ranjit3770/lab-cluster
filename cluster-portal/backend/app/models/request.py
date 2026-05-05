from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base_class import Base

class Request(Base):
    __tablename__ = "requests"
    
    id = Column(Integer, primary_key=True, index=True)
    request_type = Column(String(100), index=True) # e.g., 'resources', 'storage'
    
    # Granular request details
    cpu_cores = Column(Integer, nullable=True)
    ram_gb = Column(Integer, nullable=True)
    storage_gb = Column(Integer, nullable=True)
    
    status = Column(String(50), default="pending") # pending, approved, rejected
    
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    user = relationship("User", back_populates="requests")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
