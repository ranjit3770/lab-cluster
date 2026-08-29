"""Tests for the MCP policy engine.

Tests cover:
- Risk level enforcement
- Role-based access control
- OBSERVE/OPERATE mode restrictions
- Confirmation requirements
- Policy summary endpoint
"""
import os

os.environ.setdefault("MCP_REQUIRE_AUTH", "false")

import pytest

pytest.importorskip("fastapi", reason="fastapi not installed")
pytest.importorskip("httpx", reason="httpx not installed (TestClient)")

from fastapi.testclient import TestClient
from app.main import app
from app.auth import MCPUser
from app.tools import RiskLevel
from app.policy import PolicyEngine, PolicyDecision, check_policy, policy_engine


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ── Risk level tests ────────────────────────────────────────────────────

def test_read_risk_auto_allowed():
    user = MCPUser(user_id=1, username="student1", role="user", mode="operate")
    result = check_policy(user, "get_cluster_status", {})
    assert result.decision == PolicyDecision.ALLOW
    assert result.risk_level == "read"


def test_low_risk_auto_allowed():
    user = MCPUser(user_id=1, username="student1", role="user", mode="operate")
    result = check_policy(user, "get_nodes", {})
    assert result.decision == PolicyDecision.ALLOW
    assert result.risk_level == "read"


def test_medium_risk_requires_admin():
    user = MCPUser(user_id=1, username="student1", role="user", mode="operate")
    result = check_policy(user, "cancel_job", {"job_id": 1})
    assert result.decision == PolicyDecision.DENY
    assert result.risk_level == "medium"


def test_medium_risk_allowed_for_admin():
    user = MCPUser(user_id=1, username="admin1", role="admin", mode="operate")
    result = check_policy(user, "cancel_job", {"job_id": 1})
    assert result.decision == PolicyDecision.ALLOW
    assert result.risk_level == "medium"


def test_medium_risk_allowed_for_developer():
    user = MCPUser(user_id=1, username="dev1", role="developer", mode="operate")
    result = check_policy(user, "submit_job", {"username": "dev1", "job_name": "test", "entry_point": "run.sh"})
    assert result.decision == PolicyDecision.ALLOW
    assert result.risk_level == "medium"


def test_high_risk_requires_confirmation():
    user = MCPUser(user_id=1, username="admin1", role="admin", mode="operate")
    result = check_policy(user, "drain_node", {"node_name": "worker1"})
    assert result.decision == PolicyDecision.CONFIRM
    assert result.risk_level == "high"
    assert result.requires_confirmation is True


def test_high_risk_deny_user():
    user = MCPUser(user_id=1, username="student1", role="user", mode="operate")
    result = check_policy(user, "drain_node", {"node_name": "worker1"})
    assert result.decision == PolicyDecision.DENY
    assert result.risk_level == "high"


def test_critical_risk_requires_confirmation():
    user = MCPUser(user_id=1, username="admin1", role="admin", mode="operate")
    result = check_policy(user, "switch_os", {"node_name": "worker1", "target_os": "windows"})
    assert result.decision == PolicyDecision.CONFIRM
    assert result.risk_level == "critical"
    assert result.requires_confirmation is True


def test_critical_risk_deny_user():
    user = MCPUser(user_id=1, username="student1", role="user", mode="operate")
    result = check_policy(user, "switch_os", {"node_name": "worker1", "target_os": "windows"})
    assert result.decision == PolicyDecision.DENY
    assert result.risk_level == "critical"


# ── OBSERVE/OPERATE mode tests ──────────────────────────────────────────

def test_observe_mode_allows_read():
    user = MCPUser(user_id=1, username="admin1", role="admin", mode="observe")
    result = check_policy(user, "get_cluster_status", {})
    assert result.decision == PolicyDecision.ALLOW


def test_observe_mode_allows_low_risk():
    user = MCPUser(user_id=1, username="admin1", role="admin", mode="observe")
    result = check_policy(user, "get_nodes", {})
    assert result.decision == PolicyDecision.ALLOW


def test_observe_mode_denies_medium_risk():
    user = MCPUser(user_id=1, username="admin1", role="admin", mode="observe")
    result = check_policy(user, "cancel_job", {"job_id": 1})
    assert result.decision == PolicyDecision.DENY_OBSERVE


def test_observe_mode_denies_high_risk():
    user = MCPUser(user_id=1, username="admin1", role="admin", mode="observe")
    result = check_policy(user, "drain_node", {"node_name": "worker1"})
    assert result.decision == PolicyDecision.DENY_OBSERVE


def test_observe_mode_denies_critical_risk():
    user = MCPUser(user_id=1, username="admin1", role="admin", mode="observe")
    result = check_policy(user, "switch_os", {"node_name": "worker1", "target_os": "windows"})
    assert result.decision == PolicyDecision.DENY_OBSERVE


def test_operate_mode_allows_medium_risk():
    user = MCPUser(user_id=1, username="admin1", role="admin", mode="operate")
    result = check_policy(user, "cancel_job", {"job_id": 1})
    assert result.decision == PolicyDecision.ALLOW


def test_operate_mode_requires_confirmation_for_high_risk():
    user = MCPUser(user_id=1, username="admin1", role="admin", mode="operate")
    result = check_policy(user, "drain_node", {"node_name": "worker1"})
    assert result.decision == PolicyDecision.CONFIRM


# ── Policy engine tests ─────────────────────────────────────────────────

def test_policy_engine_has_rules():
    engine = PolicyEngine()
    assert len(engine.rules) > 0


def test_policy_summary_endpoint(client):
    res = client.get("/api/v1/mcp/policy")
    assert res.status_code == 200
    data = res.json()
    assert "rules" in data
    assert "risk_levels" in data
    assert len(data["rules"]) > 0


def test_policy_summary_includes_risk_levels(client):
    res = client.get("/api/v1/mcp/policy")
    assert res.status_code == 200
    data = res.json()
    assert "read" in data["risk_levels"]
    assert "low" in data["risk_levels"]
    assert "medium" in data["risk_levels"]
    assert "high" in data["risk_levels"]
    assert "critical" in data["risk_levels"]


# ── Tool registry risk levels ───────────────────────────────────────────

def test_read_tools_have_read_risk():
    from app.tools import get_tool
    read_tools = [
        "get_cluster_status", "get_node_status", "get_nodes",
        "get_jobs", "get_job", "get_partition_status",
        "get_queue_status", "get_resource_capacity",
        "get_recent_audit_events", "get_node_diagnostics",
        "explain_pending_job", "diagnose_failed_job",
        "diagnose_node", "analyze_cluster_capacity",
        "find_available_gpu_nodes", "diagnose_cluster_issue",
        "optimize_job_request",
    ]
    for tool_name in read_tools:
        tool = get_tool(tool_name)
        assert tool is not None, f"Tool {tool_name} not found"
        assert tool["risk_level"] == RiskLevel.READ, f"Tool {tool_name} should have READ risk"


def test_write_tools_have_correct_risk():
    from app.tools import get_tool
    medium_risk = ["cancel_job", "submit_job"]
    high_risk = ["resume_node", "drain_node", "restart_service"]
    critical_risk = ["switch_os"]

    for tool_name in medium_risk:
        tool = get_tool(tool_name)
        assert tool is not None, f"Tool {tool_name} not found"
        assert tool["risk_level"] == RiskLevel.MEDIUM, f"Tool {tool_name} should have MEDIUM risk"

    for tool_name in high_risk:
        tool = get_tool(tool_name)
        assert tool is not None, f"Tool {tool_name} not found"
        assert tool["risk_level"] == RiskLevel.HIGH, f"Tool {tool_name} should have HIGH risk"

    for tool_name in critical_risk:
        tool = get_tool(tool_name)
        assert tool is not None, f"Tool {tool_name} not found"
        assert tool["risk_level"] == RiskLevel.CRITICAL, f"Tool {tool_name} should have CRITICAL risk"


def test_dangerous_flag_matches_risk_level():
    from app.tools import get_tool
    high_risk = ["resume_node", "drain_node", "restart_service", "switch_os"]
    for tool_name in high_risk:
        tool = get_tool(tool_name)
        assert tool["dangerous"] is True, f"Tool {tool_name} should be dangerous"
