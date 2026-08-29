"""Shared login-throttle store.

State lives in the database (``login_attempts`` table) so lockout is enforced
consistently across every backend worker process — and survives restarts.

If the throttle table itself is unavailable, the limiter fails open (a failed
DB write must never lock every user out of a degraded cluster) and logs loudly.
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.login_attempt import LoginAttempt

logger = logging.getLogger("security.throttle")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def check_lockout(db: Session, username: str, ip: str) -> None:
    """Raise HTTP 429 if this username+IP pair is currently locked out.

    Fails open: an unavailable throttle table must never lock everyone out
    of a degraded cluster.
    """
    try:
        entry = (
            db.query(LoginAttempt)
            .filter(LoginAttempt.username == username, LoginAttempt.client_ip == ip)
            .first()
        )
        if entry and entry.locked_until:
            remaining = (entry.locked_until - _now()).total_seconds()
            if remaining > 0:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many failed logins. Try again in {int(remaining)} seconds.",
                )
            # Lock expired: clear it eagerly.
            entry.locked_until = None
            entry.failures = 0
            db.commit()
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001 - fail open
        logger.warning("Throttle lookup unavailable; failing open", exc_info=True)


def record_failure(db: Session, username: str, ip: str) -> None:
    """Increment the failure counter; lock the account at the threshold."""
    try:
        entry = (
            db.query(LoginAttempt)
            .filter(LoginAttempt.username == username, LoginAttempt.client_ip == ip)
            .first()
        )
        if not entry:
            entry = LoginAttempt(username=username, client_ip=ip, failures=0)
            db.add(entry)

        entry.failures = (entry.failures or 0) + 1
        if entry.failures >= settings.LOGIN_MAX_ATTEMPTS:
            entry.locked_until = _now() + timedelta(seconds=settings.LOGIN_LOCKOUT_SECONDS)
            entry.failures = 0
            logger.warning(
                "Account locked out: username=%s ip=%s for %ss",
                username, ip, settings.LOGIN_LOCKOUT_SECONDS,
            )
        db.commit()
    except Exception:  # noqa: BLE001 - fail open
        db.rollback()
        logger.exception("Throttle persistence unavailable; failing open")


def clear_failures(db: Session, username: str, ip: str) -> None:
    try:
        db.query(LoginAttempt).filter(
            LoginAttempt.username == username, LoginAttempt.client_ip == ip
        ).delete(synchronize_session=False)
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()


def purge_expired(db: Session, older_than_hours: int = 24) -> None:
    """Housekeeping: drop stale rows whose last update is older than cutoff."""
    try:
        cutoff = _now() - timedelta(hours=older_than_hours)
        db.execute(
            text("DELETE FROM login_attempts WHERE updated_at < :cutoff"),
            {"cutoff": cutoff},
        )
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
