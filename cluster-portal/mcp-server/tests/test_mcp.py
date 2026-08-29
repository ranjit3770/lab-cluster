"""Tests for the HPC Operations MCP Server.

Tests cover:
- Tool discovery and authorization
- Read-only tool execution
- Analytical tool execution
- Write tool access control
- Negative authorization paths (student denied write ops)
- Confirmation gates for dangerous operations
- AI operator mode (OBSERVE vs OPERATE)
- Health/readiness probes
- Error handling
"""
import os
import json

os.environ.setdefault("MCP_REQUIRE_AUTH", "false")

import pytest

pytest.importorskip("fastapi", reason="fastapi not installed")
pytest.importorskip("httpx", reason="httpx not installed (TestClient)")
pytest.importorskip("jose", reason="python-jose not installed")

from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.tools import get_tool, list_tools, list_tools_by_tier


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ── Health / readiness ────────────────────────────────────────────────────

def test_health_endpoint(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"
    assert res.json()["service"] == "mcp-server"


def test_root_endpoint(client):
    res = client.get("/")
    assert res.status_code == 200
    data = res.json()
    assert data["service"] == "HPC Operations MCP Server"
    assert data["version"] == "1.0.0"


def test_ready_endpoint_reports_dependencies(client, monkeypatch):
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("app.main.requests") as mock_req:
        mock_req.get.return_value = mock_resp
        res = client.get("/ready")
        assert res.status_code == 200
        assert res.json()["status"] == "ready"


# ── Tool registry ─────────────────────────────────────────────────────────

def test_tool_registry_has_all_expected_tools():
    tools = list_tools()
    names = [t["name"] for t in tools]
    expected_read = [
        "get_cluster_status",
        "get_node_status",
        "get_nodes",
        "get_jobs",
        "get_job",
        "get_partition_status",
        "get_queue_status",
        "get_resource_capacity",
        "get_recent_audit_events",
        "get_node_diagnostics",
    ]
    expected_analytical = [
        "explain_pending_job",
        "diagnose_failed_job",
        "diagnose_node",
        "analyze_cluster_capacity",
        "find_available_gpu_nodes",
        "diagnose_cluster_issue",
        "optimize_job_request",
    ]
    expected_write = [
        "cancel_job",
        "resume_node",
        "drain_node",
        "submit_job",
        "restart_service",
        "switch_os",
    ]
    for name in expected_read:
        assert name in names, f"Read tool '{name}' not found"
    for name in expected_analytical:
        assert name in names, f"Analytical tool '{name}' not found"
    for name in expected_write:
        assert name in names, f"Write tool '{name}' not found"


def test_read_only_tier_count():
    read_tools = list_tools_by_tier("read")
    assert len(read_tools) == 17, f"Expected 17 read tools, got {len(read_tools)}"


def test_write_tier_count():
    write_tools = list_tools_by_tier("write")
    assert len(write_tools) == 6, f"Expected 6 write tools, got {len(write_tools)}"


def test_tool_has_description():
    for tool in list_tools():
        assert tool["description"], f"Tool '{tool['name']}' has no description"
        assert len(tool["description"]) > 10, f"Tool '{tool['name']}' description too short"


# ── Tool discovery endpoint ───────────────────────────────────────────────

def test_tools_list_endpoint(client):
    res = client.get("/api/v1/mcp/tools")
    assert res.status_code == 200
    data = res.json()
    assert "tools" in data
    assert len(data["tools"]) == 23  # 17 read + 6 write


# ── Read-only tools (mocked backend) ──────────────────────────────────────
# NOTE: Patch app.tools.<name> (the module-level binding), not app.clients.<name>

def test_get_cluster_status(client, monkeypatch):
    mock_overview = {
        "cluster_status": {"cluster_status": "healthy", "slurmctld_status": "running"},
        "resources": {"node_count": 4, "active_nodes": 3, "cpu_total": 64, "gpu_total": 2},
        "utilization": {"cpu_used_percent": 45.2, "memory_used_percent": 62.1},
    }
    monkeypatch.setattr("app.tools.get_overview", lambda token=None: mock_overview)

    res = client.post("/api/v1/mcp/tools/get_cluster_status", json={"arguments": {}})
    assert res.status_code == 200
    data = res.json()
    assert data["result"]["cluster_status"] == "healthy"
    assert data["result"]["total_nodes"] == 4
    assert data["result"]["cpu_percent"] == 45.2


def test_get_cluster_status_api_failure(client, monkeypatch):
    monkeypatch.setattr("app.tools.get_overview", lambda token=None: None)
    res = client.post("/api/v1/mcp/tools/get_cluster_status", json={"arguments": {}})
    assert res.status_code == 200
    assert "error" in res.json()["result"]


def test_get_node_status(client, monkeypatch):
    mock_nodes = [
        {"name": "worker1", "ip_address": "10.0.0.1", "status": "idle", "cpu_total": 16, "cpu_used": 0,
         "memory_total_mb": 32768, "free_memory_mb": 30000, "cpu_load": 5, "slurm_version": "23.02"},
    ]
    monkeypatch.setattr("app.tools.get_nodes", lambda token=None: mock_nodes)
    monkeypatch.setattr("app.tools.get_slurm_node_detail", lambda n: {"state": "idle", "cpus": "16"})

    res = client.post("/api/v1/mcp/tools/get_node_status", json={"arguments": {"node_name": "worker1"}})
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["name"] == "worker1"
    assert data["status"] == "idle"
    assert data["cpu_total"] == 16


def test_get_node_status_not_found(client, monkeypatch):
    monkeypatch.setattr("app.tools.get_nodes", lambda token=None: [{"name": "worker1"}])
    monkeypatch.setattr("app.tools.get_slurm_node_detail", lambda n: None)
    res = client.post("/api/v1/mcp/tools/get_node_status", json={"arguments": {"node_name": "worker99"}})
    assert res.status_code == 200
    assert "error" in res.json()["result"]


def test_get_nodes(client, monkeypatch):
    mock_nodes = [
        {"name": "worker1", "status": "idle", "cpu_total": 16, "cpu_used": 0,
         "memory_total_mb": 32768, "free_memory_mb": 30000},
        {"name": "worker2", "status": "allocated", "cpu_total": 16, "cpu_used": 16,
         "memory_total_mb": 32768, "free_memory_mb": 8000},
    ]
    monkeypatch.setattr("app.tools.get_nodes", lambda token=None: mock_nodes)

    res = client.post("/api/v1/mcp/tools/get_nodes", json={"arguments": {}})
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["total"] == 2
    assert len(data["nodes"]) == 2


def test_get_jobs(client, monkeypatch):
    mock_jobs = [
        {"id": 1, "job_name": "test-job", "slurm_job_id": "12345", "status": "RUNNING",
         "total_cpu": 4, "total_ram": 8, "partition": "compute", "user_name": "student1"},
    ]
    monkeypatch.setattr("app.tools.get_jobs", lambda token=None: mock_jobs)

    res = client.post("/api/v1/mcp/tools/get_jobs", json={"arguments": {}})
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["total"] == 1
    assert data["jobs"][0]["job_name"] == "test-job"


def test_get_partition_status(client, monkeypatch):
    mock_output = "compute*|up|1-00:00:00|4|64||worker[1-4]|idle\n"
    monkeypatch.setattr("app.tools.get_slurm_partitions", lambda: mock_output)

    res = client.post("/api/v1/mcp/tools/get_partition_status", json={"arguments": {}})
    assert res.status_code == 200
    data = res.json()["result"]
    assert len(data["partitions"]) == 1
    assert data["partitions"][0]["partition"] == "compute*"


def test_get_queue_status(client, monkeypatch):
    mock_output = "12345|student1|RUNNING|compute|4|8G|\n12346|student2|PENDING|compute|2|4G|Resources\n"
    monkeypatch.setattr("app.tools.get_slurm_queue", lambda username=None: mock_output)

    res = client.post("/api/v1/mcp/tools/get_queue_status", json={"arguments": {}})
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["total"] == 2


def test_get_resource_capacity(client, monkeypatch):
    mock_nodes = [
        {"cpu_total": 16, "cpu_used": 8, "memory_total_mb": 32768, "free_memory_mb": 16000, "gres": "gpu:2"},
        {"cpu_total": 16, "cpu_used": 0, "memory_total_mb": 32768, "free_memory_mb": 32000, "gres": ""},
    ]
    monkeypatch.setattr("app.tools.get_nodes", lambda token=None: mock_nodes)

    res = client.post("/api/v1/mcp/tools/get_resource_capacity", json={"arguments": {}})
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["cpu_total"] == 32
    assert data["cpu_free"] == 24
    assert data["gpu_total"] == 2


def test_find_available_gpu_nodes(client, monkeypatch):
    mock_nodes = [
        {"name": "gpu1", "status": "idle", "gres": "gpu:2", "cpu_total": 32, "cpu_used": 0, "free_memory_mb": 60000},
        {"name": "cpu1", "status": "idle", "gres": "", "cpu_total": 16, "cpu_used": 0, "free_memory_mb": 30000},
        {"name": "gpu2", "status": "down", "gres": "gpu:4", "cpu_total": 32, "cpu_used": 0, "free_memory_mb": 60000},
    ]
    monkeypatch.setattr("app.tools.get_nodes", lambda token=None: mock_nodes)

    res = client.post("/api/v1/mcp/tools/find_available_gpu_nodes", json={"arguments": {}})
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["total"] == 1
    assert data["gpu_nodes"][0]["name"] == "gpu1"


# ── Analytical tools (mocked backend) ─────────────────────────────────────

def test_explain_pending_job(client, monkeypatch):
    mock_job = {"id": 1, "status": "PENDING", "total_cpu": 8, "total_ram": 16, "partition": "compute",
                "slurm_job_id": None, "owner": {"username": "student1"}, "user_name": "student1"}
    mock_nodes = [
        {"cpu_total": 16, "cpu_used": 14, "memory_total_mb": 32768, "free_memory_mb": 2000, "gres": ""},
    ]
    monkeypatch.setattr("app.tools.get_job_detail", lambda jid, token=None: mock_job)
    monkeypatch.setattr("app.tools.get_nodes", lambda token=None: mock_nodes)
    monkeypatch.setattr("app.tools.get_slurm_queue", lambda: "123|s1|PD|compute|4|4G|Priority\n124|s2|PD|compute|4|4G|Priority")
    monkeypatch.setattr("app.tools.get_user_quota", lambda u: {"cpu_used": 4, "mem_used_mb": 8192})

    res = client.post("/api/v1/mcp/tools/explain_pending_job", json={"arguments": {"job_id": 1}})
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["job_id"] == 1
    assert len(data["reasons"]) > 0


def test_explain_pending_job_not_pending(client, monkeypatch):
    mock_job = {"id": 2, "status": "RUNNING", "total_cpu": 4, "total_ram": 8, "partition": None,
                "slurm_job_id": "999", "owner": {"username": "s1"}, "user_name": "s1"}
    monkeypatch.setattr("app.tools.get_job_detail", lambda jid, token=None: mock_job)

    res = client.post("/api/v1/mcp/tools/explain_pending_job", json={"arguments": {"job_id": 2}})
    assert res.status_code == 200
    assert "error" in res.json()["result"]


def test_diagnose_failed_job(client, monkeypatch):
    mock_job = {
        "id": 3, "job_name": "fail-test", "slurm_job_id": "555", "status": "FAILED",
        "error_log": "Segmentation fault", "output_log": "Running...\nCrash.",
    }
    mock_detail = {"status": "FAILED", "exit_code": "139", "reason": "SIGSEGV"}
    monkeypatch.setattr("app.tools.get_job_detail", lambda jid, token=None: mock_job)
    monkeypatch.setattr("app.tools.get_job_status_external", lambda sid: mock_detail)

    res = client.post("/api/v1/mcp/tools/diagnose_failed_job", json={"arguments": {"job_id": 3}})
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["status"] == "FAILED"
    assert data["error_log"] == "Segmentation fault"


def test_analyze_cluster_capacity(client, monkeypatch):
    mock_nodes = [
        {"name": "w1", "status": "idle", "cpu_total": 16, "cpu_used": 0, "memory_total_mb": 32768,
         "free_memory_mb": 30000, "gres": "gpu:2"},
        {"name": "w2", "status": "allocated", "cpu_total": 16, "cpu_used": 16, "memory_total_mb": 32768,
         "free_memory_mb": 8000, "gres": ""},
    ]
    monkeypatch.setattr("app.tools.get_nodes", lambda token=None: mock_nodes)
    monkeypatch.setattr("app.tools.get_slurm_partitions", lambda: "compute*|up|1-00:00:00|2|32||w[1-2]|idle")

    res = client.post("/api/v1/mcp/tools/analyze_cluster_capacity", json={"arguments": {}})
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["total_nodes"] == 2
    assert data["cpu"]["total"] == 32
    assert data["gpu_total"] == 2


# ── Write tools access control ───────────────────────────────────────────

def test_write_tool_requires_admin_role(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)

    mock_token_payload = {"sub": "1", "username": "student1", "role": "user"}

    with patch("app.auth.jwt") as mock_jwt:
        mock_jwt.decode.return_value = mock_token_payload
        res = client.post(
            "/api/v1/mcp/tools/cancel_job",
            json={"arguments": {"job_id": 1}},
            headers={"Authorization": "Bearer fake-token"},
        )
        assert res.status_code == 403

    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_write_tool_allowed_for_admin(client, monkeypatch):
    monkeypatch.setattr("app.tools.get_job_detail", lambda jid, token=None: None)
    res = client.post("/api/v1/mcp/tools/cancel_job", json={"arguments": {"job_id": 1}})
    assert res.status_code == 200


def test_tool_not_found(client):
    res = client.post("/api/v1/mcp/tools/nonexistent_tool", json={"arguments": {}})
    assert res.status_code == 404
    assert "not found" in res.json()["detail"]


def test_invalid_arguments_returns_400(client, monkeypatch):
    monkeypatch.setattr("app.tools.get_nodes", lambda token=None: [])
    res = client.post(
        "/api/v1/mcp/tools/get_node_status",
        json={"arguments": {}},
    )
    assert res.status_code == 400


# ── Negative authorization paths ─────────────────────────────────────────

def _make_token(user_id: int, username: str, role: str, mode: str = "operate") -> str:
    from jose import jwt
    from app.config import settings
    return jwt.encode(
        {"sub": str(user_id), "username": username, "role": role, "mode": mode},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def test_student_cannot_use_cancel_job(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    token = _make_token(2, "student1", "user")
    res = client.post(
        "/api/v1/mcp/tools/cancel_job",
        json={"arguments": {"job_id": 1}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_student_cannot_use_drain_node(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    token = _make_token(2, "student1", "user")
    res = client.post(
        "/api/v1/mcp/tools/drain_node",
        json={"arguments": {"node_name": "worker1"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_student_cannot_use_resume_node(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    token = _make_token(2, "student1", "user")
    res = client.post(
        "/api/v1/mcp/tools/resume_node",
        json={"arguments": {"node_name": "worker1"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_student_cannot_use_restart_service(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    token = _make_token(2, "student1", "user")
    res = client.post(
        "/api/v1/mcp/tools/restart_service",
        json={"arguments": {"node_name": "worker1", "service": "slurmd"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_student_cannot_use_switch_os(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    token = _make_token(2, "student1", "user")
    res = client.post(
        "/api/v1/mcp/tools/switch_os",
        json={"arguments": {"node_name": "worker1", "target_os": "windows"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_student_cannot_use_submit_job(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    token = _make_token(2, "student1", "user")
    res = client.post(
        "/api/v1/mcp/tools/submit_job",
        json={"arguments": {"username": "student1", "job_name": "test", "entry_point": "run.sh"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_admin_can_use_all_write_tools(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    monkeypatch.setattr("app.tools.get_job_detail", lambda jid, token=None: None)
    monkeypatch.setattr("app.tools._run_slurm_cmd", lambda cmd: "OK")
    monkeypatch.setattr("app.tools._portal_post", lambda path, payload, token=None: {"status": "ok"})
    monkeypatch.setattr("app.tools._job_api_post", lambda path, payload: {"job_id": 1})

    token = _make_token(1, "admin1", "admin")
    for tool_name, args in [
        ("cancel_job", {"job_id": 1}),
        ("resume_node", {"node_name": "worker1"}),
        ("drain_node", {"node_name": "worker1"}),
        ("restart_service", {"node_name": "worker1", "service": "slurmd"}),
        ("switch_os", {"node_name": "worker1", "target_os": "windows"}),
        ("submit_job", {"username": "admin1", "job_name": "test", "entry_point": "run.sh"}),
    ]:
        res = client.post(
            f"/api/v1/mcp/tools/{tool_name}",
            json={"arguments": args},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, f"Admin should use {tool_name}, got {res.status_code}"

    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_developer_can_use_write_tools(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    monkeypatch.setattr("app.tools.get_job_detail", lambda jid, token=None: None)
    monkeypatch.setattr("app.tools._run_slurm_cmd", lambda cmd: "OK")

    token = _make_token(3, "dev1", "developer")
    for tool_name, args in [
        ("cancel_job", {"job_id": 1}),
        ("drain_node", {"node_name": "worker1"}),
        ("resume_node", {"node_name": "worker1"}),
    ]:
        res = client.post(
            f"/api/v1/mcp/tools/{tool_name}",
            json={"arguments": args},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, f"Developer should use {tool_name}, got {res.status_code}"

    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_unauthenticated_user_blocked_when_auth_required(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    res = client.get("/api/v1/mcp/tools")
    assert res.status_code == 401
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_student_can_use_read_tools(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    monkeypatch.setattr("app.tools.get_overview", lambda token=None: {
        "cluster_status": {"cluster_status": "healthy", "slurmctld_status": "running"},
        "resources": {"node_count": 4, "active_nodes": 3, "cpu_total": 64, "gpu_total": 2},
        "utilization": {"cpu_used_percent": 45.2, "memory_used_percent": 62.1},
    })

    token = _make_token(2, "student1", "user")
    res = client.post(
        "/api/v1/mcp/tools/get_cluster_status",
        json={"arguments": {}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_tools_list_hides_write_from_students(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    token = _make_token(2, "student1", "user")
    res = client.get(
        "/api/v1/mcp/tools",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    tools = res.json()["tools"]
    write_tools = [t for t in tools if t["tier"] == "write"]
    assert len(write_tools) == 0, "Student should not see write tools in discovery"
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


# ── Confirmation gate tests ──────────────────────────────────────────────

def test_dangerous_tool_returns_confirmation_key(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    token = _make_token(1, "admin1", "admin")

    res = client.post(
        "/api/v1/mcp/tools/drain_node",
        json={"arguments": {"node_name": "worker1", "reason": "maintenance"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "awaiting_confirmation"
    assert "confirmation_key" in data
    assert data["tool"] == "drain_node"
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_confirmation_executes_dangerous_tool(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    monkeypatch.setattr("app.tools._run_slurm_cmd", lambda cmd: "OK")
    token = _make_token(1, "admin1", "admin")

    res1 = client.post(
        "/api/v1/mcp/tools/drain_node",
        json={"arguments": {"node_name": "worker1", "reason": "maintenance"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    conf_key = res1.json()["confirmation_key"]

    res2 = client.post(
        "/api/v1/mcp/tools/drain_node/confirm",
        json={"confirmation_key": conf_key},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res2.status_code == 200
    data = res2.json()
    assert data["confirmed"] is True
    assert data["result"]["action"] == "drained"
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_invalid_confirmation_key_rejected(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    token = _make_token(1, "admin1", "admin")

    res = client.post(
        "/api/v1/mcp/tools/drain_node/confirm",
        json={"confirmation_key": "invalid_key_12345"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 400
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_non_dangerous_tool_executes_directly(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    monkeypatch.setattr("app.tools.get_nodes", lambda token=None: [])
    token = _make_token(1, "admin1", "admin")

    res = client.post(
        "/api/v1/mcp/tools/get_nodes",
        json={"arguments": {}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert "confirmation_key" not in res.json()
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


# ── AI operator mode tests ───────────────────────────────────────────────

def test_observe_mode_blocks_write_tools(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    token = _make_token(1, "admin1", "admin", mode="observe")

    res = client.post(
        "/api/v1/mcp/tools/cancel_job",
        json={"arguments": {"job_id": 1}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    assert "OBSERVE" in res.json()["detail"]
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_operate_mode_allows_write_tools(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    monkeypatch.setattr("app.tools.get_job_detail", lambda jid, token=None: None)
    token = _make_token(1, "admin1", "admin", mode="operate")

    res = client.post(
        "/api/v1/mcp/tools/cancel_job",
        json={"arguments": {"job_id": 1}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_observe_mode_allows_read_tools(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    monkeypatch.setattr("app.tools.get_overview", lambda token=None: {
        "cluster_status": {"cluster_status": "healthy", "slurmctld_status": "running"},
        "resources": {"node_count": 4, "active_nodes": 3, "cpu_total": 64, "gpu_total": 2},
        "utilization": {"cpu_used_percent": 45.2, "memory_used_percent": 62.1},
    })
    token = _make_token(1, "admin1", "admin", mode="observe")

    res = client.post(
        "/api/v1/mcp/tools/get_cluster_status",
        json={"arguments": {}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


def test_observe_mode_blocks_dangerous_confirmation(client, monkeypatch):
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", True)
    monkeypatch.setattr("app.tools._run_slurm_cmd", lambda cmd: "OK")
    token = _make_token(1, "admin1", "admin", mode="observe")

    res = client.post(
        "/api/v1/mcp/tools/drain_node",
        json={"arguments": {"node_name": "worker1"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    monkeypatch.setattr("app.auth.settings.MCP_REQUIRE_AUTH", False)


# ── Semantic layer tool tests ─────────────────────────────────────────────

def test_diagnose_cluster_issue_healthy(client, monkeypatch):
    mock_nodes = [
        {"name": "w1", "status": "idle", "cpu_total": 16, "cpu_used": 0,
         "memory_total_mb": 32768, "free_memory_mb": 30000, "gres": ""},
        {"name": "w2", "status": "allocated", "cpu_total": 16, "cpu_used": 16,
         "memory_total_mb": 32768, "free_memory_mb": 16000, "gres": ""},
    ]
    monkeypatch.setattr("app.tools.get_nodes", lambda token=None: mock_nodes)
    monkeypatch.setattr("app.tools.get_slurm_queue", lambda: "123|s1|RUNNING|compute|4|8G|")
    monkeypatch.setattr("app.tools.get_slurm_partitions", lambda: "compute*|up|1-00:00:00|2|32||w[1-2]|idle")

    res = client.post("/api/v1/mcp/tools/diagnose_cluster_issue", json={"arguments": {}})
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["status"] == "healthy"


def test_diagnose_cluster_issue_with_issues(client, monkeypatch):
    mock_nodes = [
        {"name": "w1", "status": "down", "cpu_total": 16, "cpu_used": 0,
         "memory_total_mb": 32768, "free_memory_mb": 0, "gres": ""},
        {"name": "w2", "status": "idle", "cpu_total": 16, "cpu_used": 0,
         "memory_total_mb": 32768, "free_memory_mb": 32000, "gres": ""},
    ]
    monkeypatch.setattr("app.tools.get_nodes", lambda token=None: mock_nodes)
    monkeypatch.setattr("app.tools.get_slurm_queue", lambda: "")
    monkeypatch.setattr("app.tools.get_slurm_partitions", lambda: "")

    res = client.post("/api/v1/mcp/tools/diagnose_cluster_issue", json={"arguments": {}})
    assert res.status_code == 200
    data = res.json()["result"]
    assert data["status"] == "issues_detected"
    assert len(data["issues"]) > 0
    assert len(data["recommendations"]) > 0


def test_optimize_job_request(client, monkeypatch):
    mock_nodes = [
        {"name": "w1", "status": "idle", "cpu_total": 16, "cpu_used": 0,
         "memory_total_mb": 32768, "free_memory_mb": 30000, "gres": "gpu:2"},
        {"name": "w2", "status": "allocated", "cpu_total": 16, "cpu_used": 16,
         "memory_total_mb": 32768, "free_memory_mb": 8000, "gres": ""},
    ]
    monkeypatch.setattr("app.tools.get_nodes", lambda token=None: mock_nodes)
    monkeypatch.setattr("app.tools.get_slurm_queue", lambda: "")

    res = client.post(
        "/api/v1/mcp/tools/optimize_job_request",
        json={"arguments": {"cpu": 4, "ram_gb": 8, "gpu": 1}},
    )
    assert res.status_code == 200
    data = res.json()["result"]
    assert "cluster_capacity" in data
    assert "recommendations" in data


def test_optimize_job_request_over_requested(client, monkeypatch):
    mock_nodes = [
        {"name": "w1", "status": "allocated", "cpu_total": 16, "cpu_used": 16,
         "memory_total_mb": 32768, "free_memory_mb": 1000, "gres": ""},
    ]
    monkeypatch.setattr("app.tools.get_nodes", lambda token=None: mock_nodes)
    monkeypatch.setattr("app.tools.get_slurm_queue", lambda: "")

    res = client.post(
        "/api/v1/mcp/tools/optimize_job_request",
        json={"arguments": {"cpu": 32, "ram_gb": 64}},
    )
    assert res.status_code == 200
    data = res.json()["result"]
    assert len(data["warnings"]) > 0


# ── Error handling ────────────────────────────────────────────────────────

def test_tool_exception_returns_500(client, monkeypatch):
    def exploding_fn(**kwargs):
        raise RuntimeError("boom")

    from app import tools as tools_mod
    original = tools_mod._TOOLS.get("get_cluster_status")
    tools_mod._TOOLS["get_cluster_status"] = {
        "name": "get_cluster_status",
        "description": "test",
        "tier": "read",
        "params": {},
        "fn": exploding_fn,
    }
    try:
        res = client.post("/api/v1/mcp/tools/get_cluster_status", json={"arguments": {}})
        assert res.status_code == 500
    finally:
        tools_mod._TOOLS["get_cluster_status"] = original
