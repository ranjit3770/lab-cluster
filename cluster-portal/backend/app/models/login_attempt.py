from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from app.db.base_class import Base


class LoginAttempt(Base):
    """
    Shared login-throttle state.

    Backed by the database so the lockout counter is consistent across every
    Gunicorn worker process and survives service restarts.
    """

    __tablename__ = "login_attempts"

    id = Column(Integer, primary_key=True)
    username = Column(String(255), index=True, nullable=False)
    client_ip = Column(String(64), nullable=False, default="")
    failures = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    class Config:
        unique_key = "username+client_ip"
