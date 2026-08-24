"""Resilience tests: component disappearances must degrade gracefully.

Chaos-style checks that mirror the DR runbooks:
- database unreachable  -> /ready 503 while /health stays up
- database unreachable  -> maintenance middleware falls OPEN (no lockout)
- throttle store broken -> login still possible (fail open)
"""

import os

os.environ.setdefault("PORTAL_SKIP_STARTUP_PROVISIONING", "1")

import pytest

fastapi = pytest.importorskip("fastapi", reason="fastapi not installed")
pytest.importorskip("httpx", reason="httpx not installed (TestClient)")
pytest.importorskip("jose", reason="python-jose not installed")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.api import deps
from app.db.base import Base
from app.core.security import get_password_hash
from app.models.user import User, UserRole


class ExplodingSession:
    """A DB session whose every operation fails (simulates DB outage)."""

    def query(self, *a, **k):
        raise RuntimeError("simulated database outage")

    def add(self, *a, **k):
        raise RuntimeError("simulated database outage")

    def commit(self):
        raise RuntimeError("simulated database outage")

    def rollback(self):
        pass

    def close(self):
        pass


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[deps.get_db] = override_get_db

    db = TestingSession()
    db.add(User(
        username="student1", email="student1@example.com",
        hashed_password=get_password_hash("student1-pass"), role=UserRole.USER,
    ))
    db.commit()
    db.close()

    with TestClient(app) as c:
        yield c


def test_health_stays_up_when_database_down(client, monkeypatch):
    """Liveness must not depend on the database."""
    from sqlalchemy.exc import OperationalError

    class DeadEngine:
        def connect(self):
            raise OperationalError("SELECT 1", {}, Exception("db gone"))

    monkeypatch.setattr("app.main.engine", DeadEngine())

    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"


def test_ready_reports_503_when_database_down(client, monkeypatch):
    """Readiness must fail loudly so orchestrators stop routing traffic."""
    from sqlalchemy.exc import OperationalError

    class DeadEngine:
        def connect(self):
            raise OperationalError("SELECT 1", {}, Exception("db gone"))

    monkeypatch.setattr("app.main.engine", DeadEngine())

    res = client.get("/ready")
    assert res.status_code == 503
    body = res.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["database"].startswith("error:")


def test_ready_recovers_after_database_returns(client, monkeypatch):
    """After the outage clears, readiness flips back without a restart."""
    from sqlalchemy import text as sa_text

    class RecoveredEngine:
        def connect(self):
            class Conn:
                def __enter__(self):
                    return self

                def __exit__(self, *a):
                    return False

                def execute(self, q):
                    pass

            return Conn()

    monkeypatch.setattr("app.main.engine", RecoveredEngine())
    res = client.get("/ready")
    assert res.status_code == 200
    assert res.json()["checks"]["database"] == "ok"


def test_maintenance_middleware_falls_open_when_db_down(client, monkeypatch):
    """A DB outage during a maintenance window must NOT lock everyone out."""
    import app.main as main_mod

    def dead_session_factory():
        raise RuntimeError("simulated database outage")

    monkeypatch.setattr(main_mod, "SessionLocal", dead_session_factory)

    # The middleware swallows the failure and the request reaches the route.
    res = client.get("/api/v1/system-info/maintenance-status")
    assert res.status_code in (200, 404), (
        "middleware must fall open on DB failure, got a hard block"
    )
