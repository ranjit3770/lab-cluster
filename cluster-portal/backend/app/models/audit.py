from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from app.db.base_class import Base


class AuditLog(Base):
    """Immutable trail of privileged and security-relevant actions."""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    user_id = Column(Integer, index=True)
    username = Column(String(255), index=True)
    client_ip = Column(String(64))
    action = Column(String(128), index=True, nullable=False)
    resource = Column(String(255))
    detail = Column(String(1024))
    status = Column(String(32), default="success")
