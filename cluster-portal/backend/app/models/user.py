from sqlalchemy import Column, Integer, String, Enum, Boolean, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base_class import Base
import enum

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"
    DEVELOPER = "developer"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(255), nullable=True)
    username = Column(String(255), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.USER)
    is_active = Column(Boolean(), default=True)
    

    # Resource Allocations
    cpu_limit = Column(Integer, default=0) # 0 means no limit or default
    memory_limit_gb = Column(Integer, default=4) # Changed from MB to GB
    storage_limit_gb = Column(Integer, default=15)
    
    created_at = Column(DateTime, default=datetime.utcnow)

    jobs = relationship("Job", back_populates="owner", cascade="all, delete-orphan")
    requests = relationship("Request", back_populates="user", cascade="all, delete-orphan")
