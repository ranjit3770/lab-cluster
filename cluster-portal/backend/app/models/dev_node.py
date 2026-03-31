from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from app.db.base_class import Base

class DevNode(Base):
    __tablename__ = "dev_nodes"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, index=True, nullable=False)
    ip_address = Column(String(50), nullable=False)
    ssh_port = Column(Integer, default=22)
    ssh_username = Column(String(255), nullable=False)
    ssh_password = Column(String(255), nullable=True) # In production use encryption
    
    created_at = Column(DateTime, default=datetime.utcnow)
