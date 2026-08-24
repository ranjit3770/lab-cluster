from sqlalchemy import Column, Integer, String, Boolean
from app.db.base_class import Base

class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, index=True)
    value = Column(String(255))
    description = Column(String(500), nullable=True)

class MaintenanceIP(Base):
    __tablename__ = "maintenance_ips"
    
    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String(50), unique=True, index=True)
    label = Column(String(100), nullable=True)
