"""MCP tool definitions for HPC operations.

Tools are grouped into three tiers:
  1. Read-only diagnostic tools  (any authenticated user)
  2. Analytical tools            (any authenticated user)
  3. Write operations            (admin / developer only)

Each tool has a risk level:
  - READ:    No side effects, safe for any authenticated user
  - LOW:     Minimal side effects, safe for any authenticated user
  - MEDIUM:  Requires authorization, may affect job state
  - HIGH:    Requires confirmation, affects node/cluster state
  - CRITICAL: Requires confirmation + additional policy checks

Each tool is a plain function.  The FastAPI router in ``app.main`` exposes
them as ``POST /api/v1/mcp/tools/{name}`` endpoints.
"""
from typing import Any, Dict, List, Optional
from enum import Enum
from app.clients import (
    get_overview,
    get_nodes,
    get_jobs,
    get_job_detail,
    get_slurm_node_detail,
    get_slurm_queue,
    get_slurm_diag,
    get_slurm_partitions,
    get_user_quota,
    get_job_status_external,
    cancel_job_external,
    get_audit_events,
    _run_slurm_cmd,
    _slurm_env,
    _job_api_post,
    _portal_post,
)


class RiskLevel(str, Enum):
    """Operation risk levels for policy enforcement."""
    READ = "read"           # No side effects
    LOW = "low"             # Minimal side effects
    MEDIUM = "medium"       # May affect job state
    HIGH = "high"           # Affects node/cluster state
    CRITICAL = "critical"   # Affects cluster availability


# ── Tool registry ──────────────────────────────────────────────────────────

_TOOLS: Dict[str, Dict[str, Any]] = {}


def _register(
    name: str,
    *,
    description: str,
    tier: str = "read",
    params: Optional[Dict] = None,
    risk_level: RiskLevel = RiskLevel.READ,
):
    """Decorator to register a tool in the global registry.

    Args:
        risk_level: Operation risk level for policy enforcement.
            READ/LOW: automatic execution
            MEDIUM: requires authorization
            HIGH: requires confirmation
            CRITICAL: requires confirmation + additional policy
    """
    def decorator(fn):
        _TOOLS[name] = {
            "name": name,
            "description": description,
            "tier": tier,
            "params": params or {},
            "fn": fn,
            "risk_level": risk_level,
            "dangerous": risk_level in (RiskLevel.HIGH, RiskLevel.CRITICAL),
        }
        return fn
    return decorator


def get_tool(name: str) -> Optional[Dict[str, Any]]:
    return _TOOLS.get(name)


def list_tools() -> List[Dict[str, Any]]:
    return [
        {"name": t["name"], "description": t["description"], "tier": t["tier"], "params": t["params"]}
        for t in _TOOLS.values()
    ]


def list_tools_by_tier(tier: str) -> List[Dict[str, Any]]:
    return [t for t in list_tools() if t["tier"] == tier]


# ── Read-only diagnostic tools ────────────────────────────────────────────

@_register(
    "get_cluster_status",
    description=(
        "Return high-level cluster health: node count, active/failed nodes, "
        "CPU/memory utilization percentages, and Slurm daemon status."
    ),
    tier="read",
)
def tool_get_cluster_status(token: Optional[str] = None) -> Dict[str, Any]:
    overview = get_overview(token)
    if not overview:
        return {"error": "Failed to retrieve cluster overview from the portal API."}
    cluster = overview.get("cluster_status", {})
    resources = overview.get("resources", {})
    utilization = overview.get("utilization", {})
    return {
        "cluster_status": cluster.get("cluster_status", "unknown"),
        "slurmctld": cluster.get("slurmctld_status", "unknown"),
        "total_nodes": resources.get("node_count", 0),
        "active_nodes": resources.get("active_nodes", 0),
        "cpu_total": resources.get("cpu_total", 0),
        "cpu_used": int(resources.get("cpu_total", 0) * utilization.get("cpu_used_percent", 0) / 100),
        "cpu_percent": utilization.get("cpu_used_percent", 0),
        "memory_percent": utilization.get("memory_used_percent", 0),
        "gpu_total": resources.get("gpu_total", 0),
    }


@_register(
    "get_node_status",
    description="Return detailed status for a single compute node by name.",
    tier="read",
    params={"node_name": {"type": "string", "required": True, "description": "Node name (e.g. worker1)"}},
)
def tool_get_node_status(token: Optional[str] = None, *, node_name: str) -> Dict[str, Any]:
    nodes = get_nodes(token)
    if nodes is None:
        return {"error": "Failed to retrieve node list from the portal API."}
    for node in nodes:
        if node.get("name", "").lower() == node_name.lower():
            slurm = get_slurm_node_detail(node_name)
            return {
                "name": node.get("name"),
                "ip_address": node.get("ip_address"),
                "status": node.get("status"),
                "cpu_total": node.get("cpu_total", 0),
                "cpu_used": node.get("cpu_used", 0),
                "memory_total_mb": node.get("memory_total_mb", 0),
                "free_memory_mb": node.get("free_memory_mb", 0),
                "cpu_load": node.get("cpu_load", 0),
                "slurm_version": node.get("slurm_version", "N/A"),
                "slurm_detail": {
                    k: v for k, v in (slurm or {}).items()
                    if k not in ("raw",)
                } if slurm else None,
            }
    return {"error": f"Node '{node_name}' not found in the cluster."}


@_register(
    "get_nodes",
    description="Return the status of every compute node in the cluster.",
    tier="read",
)
def tool_get_nodes(token: Optional[str] = None) -> Dict[str, Any]:
    nodes = get_nodes(token)
    if nodes is None:
        return {"error": "Failed to retrieve node list."}
    return {
        "total": len(nodes),
        "nodes": [
            {
                "name": n.get("name"),
                "status": n.get("status"),
                "cpu_total": n.get("cpu_total", 0),
                "cpu_used": n.get("cpu_used", 0),
                "memory_total_mb": n.get("memory_total_mb", 0),
                "free_memory_mb": n.get("free_memory_mb", 0),
            }
            for n in nodes
        ],
    }


@_register(
    "get_jobs",
    description="Return jobs visible to the requesting user (all jobs for admins).",
    tier="read",
    params={"username": {"type": "string", "required": False, "description": "Filter by Slurm username (admin only)"}},
)
def tool_get_jobs(token: Optional[str] = None, *, username: Optional[str] = None) -> Dict[str, Any]:
    jobs = get_jobs(token)
    if jobs is None:
        return {"error": "Failed to retrieve job list."}
    if username:
        jobs = [j for j in jobs if (j.get("user_name") or j.get("username", "")).lower() == username.lower()]
    return {
        "total": len(jobs),
        "jobs": [
            {
                "id": j.get("id"),
                "job_name": j.get("job_name"),
                "slurm_job_id": j.get("slurm_job_id"),
                "status": j.get("status"),
                "total_cpu": j.get("total_cpu"),
                "total_ram": j.get("total_ram"),
                "partition": j.get("partition"),
                "owner": j.get("owner", {}).get("username") if isinstance(j.get("owner"), dict) else j.get("user_name"),
            }
            for j in jobs
        ],
    }


@_register(
    "get_job",
    description="Return full details for a single job by portal ID.",
    tier="read",
    params={"job_id": {"type": "integer", "required": True, "description": "Portal job ID"}},
)
def tool_get_job(token: Optional[str] = None, *, job_id: int) -> Dict[str, Any]:
    job = get_job_detail(job_id, token)
    if not job:
        return {"error": f"Job {job_id} not found."}
    return job


@_register(
    "get_partition_status",
    description="Return Slurm partition configurations and current node allocation.",
    tier="read",
)
def tool_get_partition_status(token: Optional[str] = None) -> Dict[str, Any]:
    output = get_slurm_partitions()
    if not output:
        return {"error": "Failed to retrieve partition information."}
    partitions = []
    for line in output.strip().splitlines():
        parts = line.split("|")
        if len(parts) >= 8:
            partitions.append({
                "partition": parts[0],
                "available": parts[1],
                "max_walltime": parts[2],
                "nodes": parts[3],
                "cpus": parts[4],
                "features": parts[5],
                "nodelist": parts[6],
                "state": parts[7],
            })
    return {"partitions": partitions}


@_register(
    "get_queue_status",
    description="Return the current Slurm job queue, optionally filtered by user.",
    tier="read",
    params={"username": {"type": "string", "required": False, "description": "Filter by Slurm username"}},
)
def tool_get_queue_status(token: Optional[str] = None, *, username: Optional[str] = None) -> Dict[str, Any]:
    output = get_slurm_queue(username)
    if not output:
        return {"jobs": [], "total": 0}
    jobs = []
    for line in output.strip().splitlines():
        parts = line.split("|")
        if len(parts) >= 7:
            jobs.append({
                "job_id": parts[0],
                "user": parts[1],
                "state": parts[2],
                "partition": parts[3],
                "cpus": parts[4],
                "memory": parts[5],
                "reason": parts[6],
            })
    return {"jobs": jobs, "total": len(jobs)}


@_register(
    "get_resource_capacity",
    description="Aggregate cluster resource capacity (total/free CPU, memory, GPUs).",
    tier="read",
)
def tool_get_resource_capacity(token: Optional[str] = None) -> Dict[str, Any]:
    nodes = get_nodes(token)
    if not nodes:
        return {"error": "Failed to retrieve node list."}
    total_cpu = 0
    free_cpu = 0
    total_mem = 0
    free_mem = 0
    total_gpu = 0
    for n in nodes:
        t = n.get("cpu_total", 0)
        u = n.get("cpu_used", 0)
        total_cpu += t
        free_cpu += max(0, t - u)
        total_mem += n.get("memory_total_mb", 0)
        free_mem += n.get("free_memory_mb", 0)
        gres = n.get("gres", "")
        if gres and "gpu" in gres:
            try:
                total_gpu += int(gres.split(":")[-1])
            except (ValueError, IndexError):
                pass
    return {
        "cpu_total": total_cpu,
        "cpu_free": free_cpu,
        "memory_total_mb": total_mem,
        "memory_free_mb": free_mem,
        "gpu_total": total_gpu,
        "node_count": len(nodes),
    }


@_register(
    "get_recent_audit_events",
    description="Return the 100 most recent audit log entries.",
    tier="read",
)
def tool_get_recent_audit_events(token: Optional[str] = None) -> Dict[str, Any]:
    events = get_audit_events(token)
    if events is None:
        return {"error": "Failed to retrieve audit events."}
    return {"events": events, "total": len(events)}


@_register(
    "get_node_diagnostics",
    description="Detailed diagnostics for a node including Slurm internals and OS-level info.",
    tier="read",
    params={"node_name": {"type": "string", "required": True, "description": "Node name"}},
)
def tool_get_node_diagnostics(token: Optional[str] = None, *, node_name: str) -> Dict[str, Any]:
    slurm = get_slurm_node_detail(node_name)
    nodes = get_nodes(token)
    portal_node = None
    if nodes:
        for n in nodes:
            if n.get("name", "").lower() == node_name.lower():
                portal_node = n
                break
    if not slurm and not portal_node:
        return {"error": f"No diagnostic data available for node '{node_name}'."}
    return {
        "name": node_name,
        "portal_data": portal_node,
        "slurm_detail": {k: v for k, v in (slurm or {}).items() if k != "raw"} if slurm else None,
    }


# ── Analytical tools ──────────────────────────────────────────────────────

@_register(
    "explain_pending_job",
    description=(
        "Analyze why a job is pending.  Combines queue, partition, node "
        "capacity, and user quota data to produce a human-readable explanation."
    ),
    tier="read",
    params={"job_id": {"type": "integer", "required": True, "description": "Portal job ID"}},
)
def tool_explain_pending_job(token: Optional[str] = None, *, job_id: int) -> Dict[str, Any]:
    job = get_job_detail(job_id, token)
    if not job:
        return {"error": f"Job {job_id} not found."}
    status_val = str(job.get("status", "")).upper()
    if status_val not in ("PENDING", "WAITING"):
        return {"error": f"Job {job_id} is not pending (status: {status_val})."}

    reasons = []
    requested_cpu = job.get("total_cpu", 1)
    requested_ram = job.get("total_ram", 1)
    partition = job.get("partition")

    queue_output = get_slurm_queue()
    queue_jobs = []
    if queue_output:
        for line in queue_output.strip().splitlines():
            parts = line.split("|")
            if len(parts) >= 7:
                queue_jobs.append(parts)

    pending_ahead = [
        q for q in queue_jobs
        if q[2] == "PD" and (partition is None or q[3] == partition)
    ]
    if pending_ahead:
        reasons.append(
            f"{len(pending_ahead)} job(s) ahead in the queue for partition '{partition or 'default'}'."
        )

    nodes = get_nodes(token)
    if nodes:
        total_cpu_free = sum(max(0, n.get("cpu_total", 0) - n.get("cpu_used", 0)) for n in nodes)
        total_mem_free = sum(n.get("free_memory_mb", 0) for n in nodes)
        if requested_cpu > total_cpu_free:
            reasons.append(
                f"Requested {requested_cpu} CPUs but only {total_cpu_free} are free cluster-wide."
            )
        if requested_ram * 1024 > total_mem_free:
            reasons.append(
                f"Requested {requested_ram} GB RAM but only {total_mem_free // 1024} GB is free cluster-wide."
            )

    owner = job.get("owner", {})
    username = owner.get("username") if isinstance(owner, dict) else job.get("user_name")
    if username:
        quota = get_user_quota(username)
        if quota:
            reasons.append(
                f"User {username} currently using {quota.get('cpu_used', 0)} CPUs / "
                f"{quota.get('mem_used_mb', 0) // 1024} GB RAM in active jobs."
            )

    if not reasons:
        reasons.append("No obvious resource bottleneck detected.  The job may be waiting for a backfill slot.")

    return {
        "job_id": job_id,
        "status": status_val,
        "requested_cpu": requested_cpu,
        "requested_ram_gb": requested_ram,
        "partition": partition,
        "reasons": reasons,
    }


@_register(
    "diagnose_failed_job",
    description=(
        "Retrieve and explain the failure reason for a completed/failed job, "
        "including exit code, node, and stderr excerpts."
    ),
    tier="read",
    params={"job_id": {"type": "integer", "required": True, "description": "Portal job ID"}},
)
def tool_diagnose_failed_job(token: Optional[str] = None, *, job_id: int) -> Dict[str, Any]:
    job = get_job_detail(job_id, token)
    if not job:
        return {"error": f"Job {job_id} not found."}

    slurm_id = job.get("slurm_job_id")
    slurm_detail = {}
    if slurm_id:
        detail = get_job_status_external(str(slurm_id))
        if detail:
            slurm_detail = detail

    return {
        "job_id": job_id,
        "job_name": job.get("job_name"),
        "slurm_job_id": slurm_id,
        "status": job.get("status"),
        "error_log": job.get("error_log"),
        "output_log": job.get("output_log"),
        "slurm_detail": slurm_detail,
    }


@_register(
    "diagnose_node",
    description=(
        "Full diagnostic report for a node: Slurm state, resource usage, "
        "recent jobs, and configuration details."
    ),
    tier="read",
    params={"node_name": {"type": "string", "required": True, "description": "Node name"}},
)
def tool_diagnose_node(token: Optional[str] = None, *, node_name: str) -> Dict[str, Any]:
    slurm = get_slurm_node_detail(node_name)
    nodes = get_nodes(token)
    portal_node = None
    if nodes:
        for n in nodes:
            if n.get("name", "").lower() == node_name.lower():
                portal_node = n
                break

    queue_output = get_slurm_queue()
    jobs_on_node = []
    if queue_output:
        for line in queue_output.strip().splitlines():
            parts = line.split("|")
            if len(parts) >= 7 and node_name.lower() in parts[6].lower():
                jobs_on_node.append({
                    "job_id": parts[0],
                    "user": parts[1],
                    "state": parts[2],
                })

    return {
        "name": node_name,
        "slurm_state": slurm.get("state", "unknown") if slurm else "unknown",
        "portal_status": portal_node.get("status") if portal_node else None,
        "cpu_total": portal_node.get("cpu_total", 0) if portal_node else 0,
        "cpu_used": portal_node.get("cpu_used", 0) if portal_node else 0,
        "memory_total_mb": portal_node.get("memory_total_mb", 0) if portal_node else 0,
        "free_memory_mb": portal_node.get("free_memory_mb", 0) if portal_node else 0,
        "cpu_load": portal_node.get("cpu_load", 0) if portal_node else 0,
        "reason": slurm.get("reason", "") if slurm else "",
        "jobs_on_node": jobs_on_node,
    }


@_register(
    "analyze_cluster_capacity",
    description="Comprehensive capacity analysis across all nodes, partitions, and resource types.",
    tier="read",
)
def tool_analyze_cluster_capacity(token: Optional[str] = None) -> Dict[str, Any]:
    nodes = get_nodes(token)
    if not nodes:
        return {"error": "Failed to retrieve node list."}

    state_counts: Dict[str, int] = {}
    total_cpu = 0
    alloc_cpu = 0
    total_mem = 0
    free_mem = 0
    total_gpu = 0
    for n in nodes:
        raw_state = n.get("status", "unknown")
        state_counts[raw_state] = state_counts.get(raw_state, 0) + 1
        total_cpu += n.get("cpu_total", 0)
        alloc_cpu += n.get("cpu_used", 0)
        total_mem += n.get("memory_total_mb", 0)
        free_mem += n.get("free_memory_mb", 0)
        gres = n.get("gres", "")
        if gres and "gpu" in gres:
            try:
                total_gpu += int(gres.split(":")[-1])
            except (ValueError, IndexError):
                pass

    partitions_raw = get_slurm_partitions()
    partitions = []
    if partitions_raw:
        for line in partitions_raw.strip().splitlines():
            parts = line.split("|")
            if len(parts) >= 4:
                partitions.append({
                    "partition": parts[0],
                    "available": parts[1],
                    "nodes": parts[3],
                })

    return {
        "node_summary": state_counts,
        "total_nodes": len(nodes),
        "cpu": {"total": total_cpu, "allocated": alloc_cpu, "free": total_cpu - alloc_cpu},
        "memory_mb": {"total": total_mem, "free": free_mem},
        "gpu_total": total_gpu,
        "partitions": partitions,
    }


# ── Semantic layer tools ──────────────────────────────────────────────────

@_register(
    "diagnose_cluster_issue",
    description=(
        "Comprehensive cluster health diagnosis. Combines node states, resource "
        "utilization, partition status, and queue congestion to identify issues "
        "and provide actionable recommendations."
    ),
    tier="read",
)
def tool_diagnose_cluster_issue(token: Optional[str] = None) -> Dict[str, Any]:
    nodes = get_nodes(token)
    if not nodes:
        return {"error": "Failed to retrieve node list."}

    issues: List[str] = []
    recommendations: List[str] = []

    state_counts: Dict[str, int] = {}
    total_cpu = 0
    alloc_cpu = 0
    total_mem = 0
    free_mem = 0
    down_nodes: List[str] = []
    drained_nodes: List[str] = []

    for n in nodes:
        state = n.get("status", "unknown").lower()
        state_counts[state] = state_counts.get(state, 0) + 1
        total_cpu += n.get("cpu_total", 0)
        alloc_cpu += n.get("cpu_used", 0)
        total_mem += n.get("memory_total_mb", 0)
        free_mem += n.get("free_memory_mb", 0)
        name = n.get("name", "unknown")
        if state == "down":
            down_nodes.append(name)
        elif state in ("drain", "draining"):
            drained_nodes.append(name)

    if down_nodes:
        issues.append(f"{len(down_nodes)} node(s) in DOWN state: {', '.join(down_nodes)}")
        recommendations.append("Investigate node hardware/network issues. Run 'scontrol resume' after fixing.")
    if drained_nodes:
        issues.append(f"{len(drained_nodes)} node(s) in DRAIN state: {', '.join(drained_nodes)}")
        recommendations.append("Check if drain is intentional. Resume with 'scontrol resume' when ready.")

    cpu_percent = (alloc_cpu / total_cpu * 100) if total_cpu > 0 else 0
    mem_percent = ((total_mem - free_mem) / total_mem * 100) if total_mem > 0 else 0

    if cpu_percent > 90:
        issues.append(f"CPU utilization critical: {cpu_percent:.1f}%")
        recommendations.append("Consider adding nodes or reducing job resource requests.")
    elif cpu_percent > 75:
        issues.append(f"CPU utilization high: {cpu_percent:.1f}%")

    if mem_percent > 90:
        issues.append(f"Memory utilization critical: {mem_percent:.1f}%")
        recommendations.append("Jobs may be memory-constrained. Check for memory leaks or over-requesting.")
    elif mem_percent > 75:
        issues.append(f"Memory utilization high: {mem_percent:.1f}%")

    queue_output = get_slurm_queue()
    pending_count = 0
    if queue_output:
        for line in queue_output.strip().splitlines():
            parts = line.split("|")
            if len(parts) >= 3 and parts[2] == "PD":
                pending_count += 1

    if pending_count > 10:
        issues.append(f"{pending_count} jobs pending in queue")
        recommendations.append("Queue congestion detected. Consider backfill scheduling or adding resources.")

    partitions_raw = get_slurm_partitions()
    partitions_ok = True
    if partitions_raw:
        for line in partitions_raw.strip().splitlines():
            parts = line.split("|")
            if len(parts) >= 8 and parts[7].strip().lower() == "inactive":
                issues.append(f"Partition '{parts[0]}' is inactive")
                partitions_ok = False

    if not issues:
        return {
            "status": "healthy",
            "summary": "No issues detected. Cluster is operating normally.",
            "metrics": {
                "cpu_percent": round(cpu_percent, 1),
                "memory_percent": round(mem_percent, 1),
                "nodes_total": len(nodes),
                "nodes_down": 0,
                "pending_jobs": pending_count,
            },
        }

    return {
        "status": "issues_detected",
        "issues": issues,
        "recommendations": recommendations,
        "metrics": {
            "cpu_percent": round(cpu_percent, 1),
            "memory_percent": round(mem_percent, 1),
            "nodes_total": len(nodes),
            "nodes_down": len(down_nodes),
            "nodes_drained": len(drained_nodes),
            "pending_jobs": pending_count,
        },
    }


@_register(
    "optimize_job_request",
    description=(
        "Analyze a proposed job request against current cluster capacity and "
        "provide optimization recommendations for faster scheduling."
    ),
    tier="read",
    params={
        "cpu": {"type": "integer", "required": True, "description": "Requested CPU cores"},
        "ram_gb": {"type": "integer", "required": True, "description": "Requested RAM in GB"},
        "gpu": {"type": "integer", "required": False, "description": "Requested GPU count", "default": 0},
        "partition": {"type": "string", "required": False, "description": "Target partition"},
        "walltime": {"type": "string", "required": False, "description": "Requested walltime (HH:MM:SS)"},
    },
)
def tool_optimize_job_request(
    token: Optional[str] = None,
    *,
    cpu: int,
    ram_gb: int,
    gpu: int = 0,
    partition: Optional[str] = None,
    walltime: Optional[str] = None,
) -> Dict[str, Any]:
    nodes = get_nodes(token)
    if not nodes:
        return {"error": "Failed to retrieve node list."}

    total_cpu = 0
    free_cpu = 0
    total_mem = 0
    free_mem = 0
    total_gpu = 0
    free_gpu_nodes: List[Dict] = []

    for n in nodes:
        t = n.get("cpu_total", 0)
        u = n.get("cpu_used", 0)
        total_cpu += t
        free_cpu += max(0, t - u)
        total_mem += n.get("memory_total_mb", 0)
        free_mem += n.get("free_memory_mb", 0)
        gres = n.get("gres", "")
        if gres and "gpu" in gres:
            try:
                gpu_count = int(gres.split(":")[-1])
                total_gpu += gpu_count
            except (ValueError, IndexError):
                gpu_count = 0

    recommendations: List[str] = []
    warnings: List[str] = []

    if cpu > free_cpu:
        warnings.append(
            f"Requested {cpu} CPUs but only {free_cpu} are free cluster-wide. "
            f"Job will queue until resources free up."
        )
        if cpu > total_cpu * 0.5:
            recommendations.append(
                f"Requesting {cpu} CPUs is >50% of cluster capacity ({total_cpu}). "
                f"Consider splitting into smaller parallel jobs."
            )

    ram_mb = ram_gb * 1024
    if ram_mb > free_mem:
        warnings.append(
            f"Requested {ram_gb} GB RAM but only {free_mem // 1024} GB is free cluster-wide."
        )

    if gpu > 0:
        if gpu > total_gpu:
            warnings.append(
                f"Requested {gpu} GPUs but only {total_gpu} exist cluster-wide."
            )
        else:
            available = sum(
                1 for n in nodes
                if n.get("status", "").lower() in ("idle", "mixed", "allocated")
                and "gpu" in (n.get("gres") or "")
            )
            if available == 0:
                warnings.append("No GPU nodes are currently available.")
            elif gpu > 1:
                recommendations.append(
                    f"For multi-GPU jobs, ensure all GPUs are on the same node "
                    f"by adding a gres constraint (e.g., --gres=gpu:{gpu})."
                )

    if cpu > 1 and ram_gb // cpu < 2:
        recommendations.append(
            f"CPU-to-RAM ratio is low ({ram_gb}GB / {cpu} cores = {ram_gb/cpu:.1f}GB/core). "
            f"Most HPC workloads benefit from 2-4 GB/core. Consider increasing RAM."
        )

    queue_output = get_slurm_queue()
    pending_ahead = 0
    if queue_output:
        for line in queue_output.strip().splitlines():
            parts = line.split("|")
            if len(parts) >= 3 and parts[2] == "PD":
                pending_ahead += 1

    if pending_ahead > 5:
        recommendations.append(
            f"{pending_ahead} jobs are currently pending. "
            f"Consider using a lower-priority partition or reducing resource requests for faster scheduling."
        )

    if not recommendations and not warnings:
        recommendations.append("Your job request looks well-sized for current cluster capacity.")

    return {
        "request": {"cpu": cpu, "ram_gb": ram_gb, "gpu": gpu, "partition": partition},
        "cluster_capacity": {
            "cpu_free": free_cpu,
            "cpu_total": total_cpu,
            "memory_free_gb": free_mem // 1024,
            "memory_total_gb": total_mem // 1024,
            "gpu_total": total_gpu,
        },
        "warnings": warnings,
        "recommendations": recommendations,
        "estimated_queue_position": f"~{pending_ahead + 1}" if pending_ahead > 0 else "likely immediate",
    }


@_register(
    "find_available_gpu_nodes",
    description="List nodes that have GPU resources and are currently idle or mixed.",
    tier="read",
)
def tool_find_available_gpu_nodes(token: Optional[str] = None) -> Dict[str, Any]:
    nodes = get_nodes(token)
    if not nodes:
        return {"error": "Failed to retrieve node list."}
    gpu_nodes = []
    for n in nodes:
        gres = n.get("gres", "")
        if not gres or "gpu" not in gres:
            continue
        try:
            gpu_count = int(gres.split(":")[-1])
        except (ValueError, IndexError):
            continue
        status = n.get("status", "unknown")
        if status in ("idle", "allocated", "mixed"):
            gpu_nodes.append({
                "name": n.get("name"),
                "status": status,
                "gpu_total": gpu_count,
                "cpu_free": max(0, n.get("cpu_total", 0) - n.get("cpu_used", 0)),
                "memory_free_mb": n.get("free_memory_mb", 0),
            })
    return {"gpu_nodes": gpu_nodes, "total": len(gpu_nodes)}


# ── Write operations (admin / developer only) ─────────────────────────────

@_register(
    "cancel_job",
    description="Cancel a running or pending job by its portal job ID.",
    tier="write",
    risk_level=RiskLevel.MEDIUM,
    params={"job_id": {"type": "integer", "required": True, "description": "Portal job ID"}},
)
def tool_cancel_job(token: Optional[str] = None, *, job_id: int) -> Dict[str, Any]:
    job = get_job_detail(job_id, token)
    if not job:
        return {"error": f"Job {job_id} not found."}
    slurm_id = job.get("slurm_job_id")
    if not slurm_id:
        return {"error": "Job has no Slurm ID and cannot be cancelled remotely."}
    result = cancel_job_external(str(slurm_id))
    if result and result.get("status") == "CANCELLED":
        return {"job_id": job_id, "slurm_job_id": slurm_id, "status": "CANCELLED"}
    return {"error": f"Failed to cancel job {job_id}.", "detail": result}


@_register(
    "resume_node",
    description="Resume a drained or downed node in Slurm (sets state to idle).",
    tier="write",
    risk_level=RiskLevel.HIGH,
    params={"node_name": {"type": "string", "required": True, "description": "Node name to resume"}},
)
def tool_resume_node(token: Optional[str] = None, *, node_name: str) -> Dict[str, Any]:
    result = _run_slurm_cmd(["sudo", "scontrol", "resume", node_name])
    if result is not None:
        return {"node": node_name, "action": "resumed", "detail": result.strip()}
    return {"error": f"Failed to resume node '{node_name}'."}


@_register(
    "drain_node",
    description="Drain a node to prevent new jobs from being scheduled on it.",
    tier="write",
    risk_level=RiskLevel.HIGH,
    params={
        "node_name": {"type": "string", "required": True, "description": "Node name to drain"},
        "reason": {"type": "string", "required": False, "description": "Reason for draining"},
    },
)
def tool_drain_node(token: Optional[str] = None, *, node_name: str, reason: str = "MCP drain") -> Dict[str, Any]:
    result = _run_slurm_cmd([
        "sudo", "scontrol", "update", f"NodeName={node_name}", "State=DRAIN", f"Reason={reason}"
    ])
    if result is not None:
        return {"node": node_name, "action": "drained", "reason": reason}
    return {"error": f"Failed to drain node '{node_name}'."}


@_register(
    "submit_job",
    description=(
        "Submit a job to the cluster via the Job-API.  Requires specifying "
        "the username, script entry point, and resource requirements."
    ),
    tier="write",
    risk_level=RiskLevel.MEDIUM,
    params={
        "username": {"type": "string", "required": True, "description": "Slurm username"},
        "job_name": {"type": "string", "required": True, "description": "Job designation"},
        "entry_point": {"type": "string", "required": True, "description": "Script path relative to user storage"},
        "total_cpu": {"type": "integer", "required": False, "description": "Total CPU cores", "default": 1},
        "total_ram": {"type": "integer", "required": False, "description": "Total RAM in GB", "default": 1},
        "walltime": {"type": "string", "required": False, "description": "Max walltime (HH:MM:SS)", "default": "01:00:00"},
        "partition": {"type": "string", "required": False, "description": "Slurm partition"},
        "gpu_count": {"type": "integer", "required": False, "description": "GPU count", "default": 0},
    },
)
def tool_submit_job(
    token: Optional[str] = None,
    *,
    username: str,
    job_name: str,
    entry_point: str,
    total_cpu: int = 1,
    total_ram: int = 1,
    walltime: str = "01:00:00",
    partition: Optional[str] = None,
    gpu_count: int = 0,
) -> Dict[str, Any]:
    payload = {
        "username": username,
        "project_name": job_name,
        "entry_point": entry_point,
        "total_cpu": total_cpu,
        "total_ram": total_ram,
        "time": walltime,
        "command": None,
        "command_args": "",
        "requirements_path": None,
        "ntasks": None,
        "cpus_per_task": None,
        "job_type": "single_node",
        "partition": partition,
        "gpu_count": gpu_count,
        "mem_per_cpu": None,
        "constraint": None,
    }
    result = _job_api_post("/submit", payload)
    if not result:
        return {"error": "Job submission failed — Job-API unreachable."}
    if result.get("job_id") and "error" not in result:
        return {
            "job_id": result.get("job_id"),
            "status": result.get("status", "PENDING"),
            "allocation": result.get("allocation"),
            "explanation": result.get("explanation"),
        }
    return {"error": "Job submission rejected.", "detail": result}


@_register(
    "restart_service",
    description="Restart a named systemd service on a node via SSH (admin only).",
    tier="write",
    risk_level=RiskLevel.HIGH,
    params={
        "node_name": {"type": "string", "required": True, "description": "Target node"},
        "service": {"type": "string", "required": True, "description": "Systemd service name"},
    },
)
def tool_restart_service(token: Optional[str] = None, *, node_name: str, service: str) -> Dict[str, Any]:
    result = _run_slurm_cmd([
        "sudo", "srun", "-w", node_name, "--quiet",
        "systemctl", "restart", service,
    ])
    if result is not None:
        return {"node": node_name, "service": service, "action": "restarted"}
    return {"error": f"Failed to restart '{service}' on node '{node_name}'."}


@_register(
    "switch_os",
    description="Trigger an OS switch on a node (Linux to Windows or vice versa) via the portal's dual-boot automation.",
    tier="write",
    risk_level=RiskLevel.CRITICAL,
    params={
        "node_name": {"type": "string", "required": True, "description": "Target node"},
        "target_os": {"type": "string", "required": True, "description": "Target OS: 'windows' or 'linux'"},
    },
)
def tool_switch_os(token: Optional[str] = None, *, node_name: str, target_os: str) -> Dict[str, Any]:
    result = _portal_post(
        "/developer/switch-os",
        {"node_name": node_name, "target_os": target_os},
        token,
    )
    if result:
        return {"node": node_name, "target_os": target_os, "status": "initiated", "detail": result}
    return {"error": f"Failed to initiate OS switch on '{node_name}'."}
