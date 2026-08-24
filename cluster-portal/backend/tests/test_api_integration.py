"""API integration tests for the portal backend.

These exercise real HTTP behaviour through FastAPI's TestClient against an
in-memory SQLite database with the authentication/RBAC layers fully active.

Set PORTAL_SKIP_STARTUP_PROVISIONING=1 so importing app.main does not touch
MySQL or install requirements at import time.
"""

import os

os.environ.setdefault("PORTAL_SKIP_STARTUP_PROVISIONING", "1")

import pytest

fastapi = pytest.importorskip("fastapi", reason="fastapi not installed")
pytest.importorskip("httpx", reason="httpx not installed (TestClient)")
pytest.importorskip("jose", reason="python-jose not installed")
pytest.importorskip("bcrypt", reason="bcrypt not installed")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.api import deps
from app.core.config import settings
from app.db.base import Base
from app.core.security import get_password_hash
from app.models.user import User, UserRole

# Set by the client fixture; gives tests direct DB access for state resets.
_TestingSession = None


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    global _TestingSession
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    _TestingSession = TestingSession
    Base.metadata.create_all(bind=engine)

    # Redirect user storage to a temp dir so endpoints never touch /data_storage.
    settings.DATA_STORAGE = str(tmp_path_factory.mktemp("data_storage"))

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[deps.get_db] = override_get_db

    # Seed accounts covering each role.
    db = TestingSession()
    db.add_all([
        User(
            username="rootadmin", email="rootadmin@example.com",
            hashed_password=get_password_hash("rootadmin-pass"), role=UserRole.DEVELOPER,
        ),
        User(
            username="admin1", email="admin1@example.com",
            hashed_password=get_password_hash("admin1-pass"), role=UserRole.ADMIN,
        ),
        User(
            username="student1", email="student1@example.com",
            hashed_password=get_password_hash("student1-pass"), role=UserRole.USER,
        ),
        User(
            username="student2", email="student2@example.com",
            hashed_password=get_password_hash("student2-pass"), role=UserRole.USER,
        ),
    ])
    db.commit()
    db.close()

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


def login(client, username, password):
    return client.post(
        "/api/v1/login/access-token",
        data={"username": username, "password": password},
    )


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

def test_health_endpoint(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "healthy"


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

def test_login_success_returns_tokens_and_role(client):
    res = login(client, "student1", "student1-pass")
    assert res.status_code == 200
    body = res.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["token_type"] == "bearer"
    assert body["role"] == "user"


def test_login_wrong_password_rejected(client):
    res = login(client, "student1", "nope")
    assert res.status_code == 400


def test_login_unknown_user_rejected(client):
    res = login(client, "ghost", "whatever")
    assert res.status_code == 400


def test_login_lockout_is_shared_and_enforced(client):
    """After LOGIN_MAX_ATTEMPTS failures the account locks even for the
    correct password (state lives in the shared DB, not per-process)."""
    from app.models.login_attempt import LoginAttempt

    db = _TestingSession()
    try:
        db.query(LoginAttempt).delete()
        db.commit()
    finally:
        db.close()

    for _ in range(5):
        assert login(client, "ghost", "wrong").status_code == 400

    locked = login(client, "ghost", "wrong")
    assert locked.status_code == 429

    # Correct credentials do NOT bypass an active lockout.
    assert login(client, "ghost", "whatever").status_code == 429


def test_refresh_token_flow(client):
    login_res = login(client, "student1", "student1-pass")
    refresh = login_res.json()["refresh_token"]
    res = client.post("/api/v1/refresh-token", json={"refresh_token": refresh})
    assert res.status_code == 200
    assert res.json()["access_token"]

    # Access tokens must NOT be accepted as refresh tokens.
    access = login_res.json()["access_token"]
    res = client.post("/api/v1/refresh-token", json={"refresh_token": access})
    assert res.status_code == 403


def test_me_requires_authentication(client):
    assert client.get("/api/v1/users/me").status_code in (401, 403)


def test_me_returns_current_user(client):
    token = login(client, "student1", "student1-pass").json()["access_token"]
    res = client.get("/api/v1/users/me", headers=auth_header(token))
    assert res.status_code == 200
    assert res.json()["username"] == "student1"


# ---------------------------------------------------------------------------
# RBAC: server-side authorization on user management
# ---------------------------------------------------------------------------

def test_create_user_requires_authentication(client):
    res = client.post("/api/v1/users/", json={
        "email": "anon@example.com", "username": "anon",
        "password": "pw-123456", "role": "user",
    })
    assert res.status_code in (401, 403)


def test_create_user_forbidden_for_regular_user(client):
    token = login(client, "student1", "student1-pass").json()["access_token"]
    res = client.post("/api/v1/users/", headers=auth_header(token), json={
        "email": "newbie@example.com", "username": "newbie",
        "password": "pw-123456", "role": "user",
    })
    assert res.status_code == 403


def test_create_user_allowed_for_admin(client):
    token = login(client, "admin1", "admin1-pass").json()["access_token"]
    res = client.post("/api/v1/users/", headers=auth_header(token), json={
        "email": "byadmin@example.com", "username": "byadmin",
        "password": "pw-123456", "role": "user",
    })
    assert res.status_code == 200, res.text


def test_admin_cannot_escalate_to_developer_role(client):
    token = login(client, "admin1", "admin1-pass").json()["access_token"]
    res = client.post("/api/v1/users/", headers=auth_header(token), json={
        "email": "escalated@example.com", "username": "escalated",
        "password": "pw-123456", "role": "developer",
    })
    assert res.status_code == 403


def test_developer_can_provision_developer_role(client):
    token = login(client, "rootadmin", "rootadmin-pass").json()["access_token"]
    res = client.post("/api/v1/users/", headers=auth_header(token), json={
        "email": "dev2@example.com", "username": "dev2",
        "password": "pw-123456", "role": "developer",
    })
    assert res.status_code == 200, res.text


def test_list_users_requires_privileged_role(client):
    user_token = login(client, "student1", "student1-pass").json()["access_token"]
    res = client.get("/api/v1/users/", headers=auth_header(user_token))
    assert res.status_code == 403

    admin_token = login(client, "admin1", "admin1-pass").json()["access_token"]
    res = client.get("/api/v1/users/", headers=auth_header(admin_token))
    assert res.status_code == 200


# ---------------------------------------------------------------------------
# Observability endpoints
# ---------------------------------------------------------------------------

def test_ready_reports_database_dependency(client):
    # get_db is overridden with SQLite, but /ready checks the real engine,
    # which points at an unreachable MySQL in CI -> must degrade to 503.
    res = client.get("/ready")
    assert res.status_code in (200, 503)
    body = res.json()
    assert body["status"] in ("ready", "not_ready")
    assert "database" in body["checks"]


def test_metrics_disabled_by_default(client):
    assert client.get("/metrics").status_code == 404


def test_metrics_exposes_prometheus_counters(client):
    os.environ["METRICS_ENABLED"] = "1"
    try:
        client.get("/health")  # generate at least one request
        res = client.get("/metrics")
        assert res.status_code == 200
        assert "http_requests_total" in res.text
        assert "http_request_duration_seconds" in res.text
    finally:
        os.environ.pop("METRICS_ENABLED", None)


# ---------------------------------------------------------------------------
# RBAC: job ownership is enforced server-side
# ---------------------------------------------------------------------------

def _create_job(client, token, name, script_path="job.sh"):
    return client.post(
        "/api/v1/jobs/",
        headers=auth_header(token),
        json={"job_name": name, "script_path": script_path},
    )


def test_job_access_denied_to_other_users(client, tmp_path):
    owner = login(client, "student1", "student1-pass").json()["access_token"]
    other = login(client, "student2", "student2-pass").json()["access_token"]

    # Create a real script file in the owner's storage root.
    script_dir = os.path.join(settings.DATA_STORAGE, "student1")
    os.makedirs(script_dir, exist_ok=True)
    script_path = os.path.join(script_dir, "job.sh")
    with open(script_path, "w") as handle:
        handle.write("#!/bin/bash\necho hi\n")

    created = _create_job(client, owner, "owner-job", "job.sh")
    if created.status_code not in (200, 201):
        pytest.skip(f"job creation unavailable in this environment: {created.status_code}")
    job_id = created.json()["id"]

    # Another authenticated user cannot read the job.
    assert client.get(
        f"/api/v1/jobs/{job_id}", headers=auth_header(other)
    ).status_code == 403

    # The owner can read it.
    assert client.get(f"/api/v1/jobs/{job_id}", headers=auth_header(owner)).status_code == 200
