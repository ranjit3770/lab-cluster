"""HPC Operations MCP Server — FastAPI entry point.

Exposes registered tools as ``POST /api/v1/mcp/tools/{name}`` and supports
MCP's ``tools/list`` discovery endpoint.  Read-only tools are available to
any authenticated user; write tools require admin/developer role.
"""
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict, Optional
import os
import logging
import hashlib
import time
import requests

from app.config import settings
from app.auth import get_current_user, MCPUser, require_role
from app.tools import get_tool, list_tools, list_tools_by_tier, RiskLevel
from app.security import wrap_untrusted, detect_injection_patterns, validate_tool_output
from app.policy import check_policy, PolicyDecision, policy_engine

configure_log = logging.getLogger("mcp.main")

# ── Confirmation store for dangerous operations ────────────────────────────
# Stores pending confirmations keyed by a hash of (tool_name, user_id, args, timestamp)
_CONFIRMATIONS: Dict[str, Dict[str, Any]] = {}
_CONFIRMATION_TTL = 300  # 5 minutes


def _make_confirmation_key(tool_name: str, user_id: int, args: dict) -> str:
    raw = f"{tool_name}:{user_id}:{sorted(args.items())}:{int(time.time())}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _store_confirmation(tool_name: str, user_id: int, args: dict) -> str:
    key = _make_confirmation_key(tool_name, user_id, args)
    _CONFIRMATIONS[key] = {
        "tool_name": tool_name,
        "user_id": user_id,
        "args": args,
        "created_at": time.time(),
    }
    return key


def _consume_confirmation(key: str, user_id: int) -> Optional[Dict[str, Any]]:
    conf = _CONFIRMATIONS.pop(key, None)
    if not conf:
        return None
    if conf["user_id"] != user_id:
        _CONFIRMATIONS[key] = conf  # restore
        return None
    if time.time() - conf["created_at"] > _CONFIRMATION_TTL:
        return None
    return conf

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/api/v1/mcp/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health / readiness ────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "healthy", "service": "mcp-server"}


@app.get("/ready")
def ready():
    checks: Dict[str, str] = {}
    try:
        import requests as _req
        r = _req.get(f"{settings.PORTAL_API_URL}/health", timeout=3)
        checks["portal_backend"] = "ok" if r.status_code == 200 else f"error: {r.status_code}"
    except Exception as exc:
        checks["portal_backend"] = f"error: {type(exc).__name__}"
    try:
        import requests as _req
        r = _req.get(f"{settings.JOB_API_URL}/health", timeout=3)
        checks["job_api"] = "ok" if r.status_code == 200 else f"error: {r.status_code}"
    except Exception as exc:
        checks["job_api"] = f"error: {type(exc).__name__}"

    if any("error" in v for v in checks.values()):
        return JSONResponse(status_code=503, content={"status": "not_ready", "checks": checks})
    return {"status": "ready", "checks": checks}


# ── Tool discovery (MCP-compatible) ───────────────────────────────────────

@app.get("/api/v1/mcp/tools")
async def tools_list(user: MCPUser = Depends(get_current_user)):
    """Return all tools the requesting user is authorized to call."""
    all_tools = list_tools()
    if user.role in ("admin", "developer"):
        return {"tools": all_tools}
    return {"tools": [t for t in all_tools if t["tier"] != "write"]}


@app.get("/api/v1/mcp/policy")
async def policy_summary(user: MCPUser = Depends(get_current_user)):
    """Return the current policy rules and risk levels."""
    return policy_engine.get_policy_summary()


# ── Confirmation endpoint ─────────────────────────────────────────────────

class ConfirmRequest(BaseModel):
    confirmation_key: str


@app.post("/api/v1/mcp/tools/{tool_name}/confirm")
async def tools_confirm(
    tool_name: str,
    body: ConfirmRequest,
    user: MCPUser = Depends(get_current_user),
):
    """Confirm and execute a dangerous tool operation.

    Dangerous tools (switch_os, drain_node, restart_service, resume_node)
    require a two-step flow:
    1. Call the tool normally -> returns confirmation_key
    2. Call this endpoint with the confirmation_key to execute
    """
    tool = get_tool(tool_name)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found.")

    conf = _consume_confirmation(body.confirmation_key, user.user_id)
    if not conf:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired confirmation key. Call the tool first to get a confirmation key.",
        )

    # Evaluate policy for confirmation
    policy_result = check_policy(user, tool_name, conf["args"])

    if policy_result.decision == PolicyDecision.DENY:
        raise HTTPException(
            status_code=403,
            detail=f"Policy denied: {policy_result.reason}",
        )
    elif policy_result.decision == PolicyDecision.DENY_OBSERVE:
        raise HTTPException(
            status_code=403,
            detail="Write operations not allowed in OBSERVE mode.",
        )

    try:
        result = tool["fn"](token=None, **conf["args"])
    except Exception as exc:
        configure_log.exception("Confirmed tool %s failed", tool_name)
        raise HTTPException(status_code=500, detail=f"Tool execution error: {exc}")

    validation = validate_tool_output(result, tool_name)
    if validation["injection_detected"]:
        configure_log.warning(
            "Potential injection in confirmed %s: %s",
            tool_name,
            validation["injection_patterns"],
        )

    _audit_tool_call(tool_name, user, conf["args"], result)
    return {
        "tool": tool_name,
        "result": result,
        "confirmed": True,
        "security": {
            "trust_level": "tool_output",
            "injection_detected": validation["injection_detected"],
        },
    }


# ── Tool execution ────────────────────────────────────────────────────────

class ToolCallRequest(BaseModel):
    arguments: Dict[str, Any] = {}
    confirm: Optional[str] = None


@app.post("/api/v1/mcp/tools/{tool_name}")
async def tools_call(
    tool_name: str,
    body: ToolCallRequest,
    request: Request,
    user: MCPUser = Depends(get_current_user),
):
    """Execute a registered MCP tool.

    For dangerous tools, the first call returns a confirmation_key.
    The caller must then POST to /api/v1/mcp/tools/{tool_name}/confirm
    with the key to execute the operation.
    """
    tool = get_tool(tool_name)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found.")

    # Evaluate policy
    policy_result = check_policy(user, tool_name, body.arguments)

    if policy_result.decision == PolicyDecision.DENY:
        raise HTTPException(
            status_code=403,
            detail=f"Policy denied: {policy_result.reason}",
        )
    elif policy_result.decision == PolicyDecision.DENY_OBSERVE:
        raise HTTPException(
            status_code=403,
            detail="Write operations not allowed in OBSERVE mode. "
                   "Use OPERATE mode for write operations.",
        )
    elif policy_result.decision == PolicyDecision.CONFIRM:
        if not body.confirm:
            conf_key = _store_confirmation(tool_name, user.user_id, body.arguments)
            _audit_tool_call(tool_name, user, body.arguments, {"status": "awaiting_confirmation"})
            return {
                "tool": tool_name,
                "status": "awaiting_confirmation",
                "confirmation_key": conf_key,
                "risk_level": policy_result.risk_level,
                "message": f"Tool '{tool_name}' requires confirmation (risk: {policy_result.risk_level}). "
                           f"Confirm by POSTing to /api/v1/mcp/tools/{tool_name}/confirm "
                           f"with this key.",
            }

    try:
        token = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]
        result = tool["fn"](token=token, **body.arguments)
    except TypeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid arguments: {exc}")
    except Exception as exc:
        configure_log.exception("Tool %s failed", tool_name)
        raise HTTPException(status_code=500, detail=f"Tool execution error: {exc}")

    validation = validate_tool_output(result, tool_name)
    if validation["injection_detected"]:
        configure_log.warning(
            "Potential injection in %s: %s",
            tool_name,
            validation["injection_patterns"],
        )

    _audit_tool_call(tool_name, user, body.arguments, result)
    return {
        "tool": tool_name,
        "result": result,
        "security": {
            "trust_level": "tool_output",
            "injection_detected": validation["injection_detected"],
        },
    }


def _audit_tool_call(tool_name: str, user: MCPUser, args: dict, result: Any):
    if not settings.MCP_AUDIT_ENABLED:
        return
    try:
        import mysql.connector
        conn = mysql.connector.connect(
            host=settings.MYSQL_HOST,
            port=settings.MYSQL_PORT,
            user=settings.MYSQL_USER,
            password=settings.MYSQL_PASSWORD,
            database=settings.MYSQL_DB,
        )
        cur = conn.cursor()
        import json as _json
        cur.execute(
            "INSERT INTO audit_logs (user_id, username, action, resource, detail, status) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (
                user.user_id,
                user.username,
                "mcp.tool.call",
                f"mcp:{tool_name}",
                _json.dumps({"args": args, "result_keys": list(result.keys()) if isinstance(result, dict) else []})[:1000],
                "success" if "error" not in (result or {}) else "failure",
            ),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception:
        pass


# ── Root ──────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "service": "HPC Operations MCP Server",
        "version": "1.0.0",
        "status": "operational",
        "docs": "/docs",
        "tools_endpoint": "/api/v1/mcp/tools",
    }
