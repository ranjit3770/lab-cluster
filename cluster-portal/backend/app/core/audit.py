"""Centralized audit logging for privileged and security-relevant actions.

Records are persisted to the ``audit_logs`` table AND emitted as structured
JSON on stdout so they survive into container log aggregation.
"""
import json
import logging
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.audit import AuditLog

logger = logging.getLogger("audit")


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def record(
    db: Session,
    *,
    action: str,
    user=None,
    resource: str | None = None,
    detail: str | None = None,
    request: Request | None = None,
    status: str = "success",
    commit: bool = True,
) -> None:
    """
    Persist an audit entry.

    Args:
        db: active database session.
        action: short verb phrase, e.g. ``user.create``, ``login.failure``.
        user: ORM User object (or None for anonymous failures).
        user_id/username fallbacks are extracted from the user when available.
        resource: target of the action, e.g. ``user:42`` or ``setting:maintenance_mode``.
        detail: human-readable context (never include secrets).
        request: optional FastAPI request to capture the client IP.
        status: ``success`` or ``failure``.
        commit: set False when the caller commits shortly after.
    """
    user_id = getattr(user, "id", None)
    username = getattr(user, "username", None)

    entry = AuditLog(
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
        user_id=user_id,
        username=username,
        client_ip=client_ip(request),
        action=action,
        resource=resource,
        detail=(detail or "")[:1000],
        status=status,
    )
    try:
        db.add(entry)
        if commit:
            db.commit()
    except Exception:  # noqa: BLE001 - auditing must never break the request path
        db.rollback()
        logger.exception("Failed to persist audit log for action=%s", action)

    # Structured JSON line for log shippers.
    logger.info(json.dumps({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "portal-backend",
        "event": "audit",
        "action": action,
        "user_id": user_id,
        "username": username,
        "client_ip": client_ip(request),
        "resource": resource,
        "status": status,
        "detail": detail,
    }))
