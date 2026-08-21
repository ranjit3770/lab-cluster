"""Validation tests for portal backend Pydantic schemas.

These exercise the request/response contract modules only. The FastAPI
application object is intentionally not imported here because importing it
triggers dependency auto-installation and database provisioning side effects.
"""

import pytest
from pydantic import ValidationError

from app.models.user import UserRole
from app.models.job import JobStatus
from app.schemas.user import UserCreate, UserDashboardStats, UserUpdate
from app.schemas.dev_node import DevNodeCreate, DevNodeBulkCreate, DevNodeBulkResult, DevNodeUpdate, SSHTestRequest
from app.schemas.job import JobCreate


# ---------------------------------------------------------------------------
# Registered access-node inventory schemas
# ---------------------------------------------------------------------------

def test_dev_node_create_defaults():
    node = DevNodeCreate(name="worker_node28", ip_address="172.17.181.170", ssh_username="root")
    assert node.ssh_port == 22
    assert node.os_family == "auto"
    assert node.ssh_password is None


def test_dev_node_create_requires_core_fields():
    with pytest.raises(ValidationError):
        DevNodeCreate(name="incomplete")   # no ip_address / ssh_username


def test_dev_node_update_all_optional():
    update = DevNodeUpdate()
    assert update.name is None and update.ip_address is None and update.os_family is None


def test_dev_node_bulk_create_defaults():
    bulk = DevNodeBulkCreate(nodes=[{"name": "n1", "ip_address": "10.0.0.1", "ssh_username": "root"}])
    assert bulk.test_connections is False
    assert len(bulk.nodes) == 1


def test_dev_node_bulk_result_defaults_are_empty_collections():
    result = DevNodeBulkResult()
    assert result.created == [] and result.skipped == [] and result.failed == []


def test_ssh_test_request_port_default():
    req = SSHTestRequest(ip_address="10.0.0.5", username="admin")
    assert req.port == 22


# ---------------------------------------------------------------------------
# User schemas
# ---------------------------------------------------------------------------

def test_user_create_accepts_valid_payload():
    user = UserCreate(
        email="researcher@example.com",
        username="researcher",
        password="secret123",
        full_name="Researcher One",
    )
    assert user.role == "user"
    assert user.cpu_limit == 0            # 0 means "no explicit cap" downstream
    assert user.memory_limit_gb == 4
    assert user.storage_limit_gb == 15


def test_user_create_rejects_invalid_email():
    with pytest.raises(ValidationError):
        UserCreate(email="not-an-email", username="u", password="p")


def test_user_create_requires_username_and_password():
    with pytest.raises(ValidationError):
        UserCreate(email="a@b.com")


def test_user_role_enum_values():
    assert {role.value for role in UserRole} == {"admin", "user", "developer"}


def test_user_dashboard_stats_zero_usage_defaults():
    stats = UserDashboardStats(
        cpu_limit=16,
        memory_limit_gb=32,
        total_jobs=10,
        running_jobs=1,
        pending_jobs=2,
        completed_jobs=6,
        failed_jobs=1,
        cancelled_jobs=0,
        storage_limit_gb=15,
        storage_used_gb=3.5,
    )
    assert stats.cpu_used == 0.0 and stats.ram_used == 0.0


# ---------------------------------------------------------------------------
# Job schemas
# ---------------------------------------------------------------------------

def test_job_create_defaults_match_portal_contract():
    job = JobCreate(job_name="demo-job")
    assert job.total_cpu == 1 and job.total_ram == 1
    assert job.walltime == "00:10:00"
    assert job.job_type == "single_node"
    assert job.quota_status == "NORMAL"
    assert job.status == JobStatus.PENDING
    assert job.gpu_count == 0


def test_job_status_enum_covers_lifecycle():
    values = {status.value for status in JobStatus}
    for expected in ("PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"):
        assert expected in {v.upper() for v in values} or expected in values
