import math
import os
import re
import subprocess
import uuid
from typing import Any, Dict, List, Optional, Tuple

from app.config import MYSQL_CONFIG


UNHEALTHY_STATES = {
    "DOWN",
    "DRAIN",
    "DRAINING",
    "FAIL",
    "FAILING",
    "FUTURE",
    "INVAL",
    "MAINT",
    "NO_RESPOND",
    "NOT_RESPONDING",
    "POWER_DOWN",
    "POWERED_DOWN",
    "REBOOT",
    "RESERVED",
    "UNKNOWN",
}


def _slurm_env() -> Dict[str, str]:
    from app.slurm import get_slurm_env

    return get_slurm_env()


def _run_slurm_command(args: List[str], timeout: int = 5) -> str:
    try:
        return subprocess.check_output(
            args,
            env=_slurm_env(),
            stderr=subprocess.STDOUT,
            timeout=timeout,
            text=True,
        )
    except Exception as exc:
        print(f"[PLANNER] Slurm command failed ({' '.join(args)}): {exc}")
        return ""


def _parse_memory_to_mb(value: Any) -> int:
    if value is None:
        return 1024
    if isinstance(value, (int, float)):
        return max(1, int(math.ceil(float(value) * 1024)))

    raw = str(value).strip().upper()
    match = re.match(r"^([0-9]+(?:\.[0-9]+)?)([KMGTP]?B?|)$", raw)
    if not match:
        raise ValueError(f"Invalid memory value '{value}'. Use values like 64G, 64000M, or 64.")

    amount = float(match.group(1))
    unit = match.group(2).rstrip("B")
    factors = {
        "": 1024,
        "K": 1 / 1024,
        "M": 1,
        "G": 1024,
        "T": 1024 * 1024,
        "P": 1024 * 1024 * 1024,
    }
    return max(1, int(math.ceil(amount * factors.get(unit, 1024))))


def _parse_mem_per_cpu_to_mb(value: Any) -> int:
    if isinstance(value, (int, float)):
        return max(1, int(value))
    raw = str(value).strip()
    if raw.isdigit():
        return max(1, int(raw))
    return _parse_memory_to_mb(raw)


def _parse_int(value: Any, default: int = 1) -> int:
    try:
        return max(1, int(value))
    except Exception:
        return default


def _parse_scontrol_nodes(output: str) -> List[Dict[str, Any]]:
    nodes: List[Dict[str, Any]] = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue

        fields: Dict[str, str] = {}
        for token in line.split():
            if "=" in token:
                key, value = token.split("=", 1)
                fields[key] = value

        name = fields.get("NodeName")
        if not name:
            continue

        total_cpu = int(fields.get("CPUTot") or fields.get("CPUEfctv") or 0)
        allocated_cpu = int(fields.get("CPUAlloc") or 0)
        real_memory = int(fields.get("RealMemory") or 0)
        allocated_memory = int(fields.get("AllocMem") or 0)
        free_memory = int(fields.get("FreeMem") or 0)
        usable_memory = free_memory if free_memory > 0 else max(0, real_memory - allocated_memory)
        state = fields.get("State", "UNKNOWN").split("+")[0].upper()

        nodes.append({
            "name": name,
            "state": state,
            "partition": fields.get("Partitions", ""),
            "total_cpus": total_cpu,
            "allocated_cpus": allocated_cpu,
            "free_cpus": max(0, total_cpu - allocated_cpu),
            "real_memory_mb": real_memory,
            "allocated_memory_mb": allocated_memory,
            "free_memory_mb": usable_memory,
            "features": fields.get("AvailableFeatures", ""),
            "gres": fields.get("Gres", ""),
            "load": fields.get("CPULoad", "0"),
        })
    return nodes


def _parse_sinfo_nodes(output: str) -> List[Dict[str, Any]]:
    nodes: List[Dict[str, Any]] = []
    for line in output.splitlines():
        parts = line.strip().split("|")
        if len(parts) < 5:
            continue
        name, state, cpus, memory, cpu_state = parts[:5]
        cpu_parts = [int(x) if x.isdigit() else 0 for x in cpu_state.split("/")]
        allocated = cpu_parts[0] if len(cpu_parts) >= 1 else 0
        idle = cpu_parts[1] if len(cpu_parts) >= 2 else max(0, int(cpus or 0) - allocated)
        total = cpu_parts[3] if len(cpu_parts) >= 4 else int(cpus or 0)
        nodes.append({
            "name": name,
            "state": state.split("+")[0].upper(),
            "partition": parts[5] if len(parts) > 5 else "",
            "total_cpus": total,
            "allocated_cpus": allocated,
            "free_cpus": idle,
            "real_memory_mb": int(memory or 0),
            "allocated_memory_mb": 0,
            "free_memory_mb": int(memory or 0),
            "features": "",
            "gres": "",
            "load": "0",
        })
    return nodes


def get_cluster_snapshot() -> Dict[str, Any]:
    nodes = _parse_scontrol_nodes(_run_slurm_command(["scontrol", "show", "nodes", "-o"], timeout=8))
    source = "scontrol"
    if not nodes:
        nodes = _parse_sinfo_nodes(_run_slurm_command(["sinfo", "-N", "-h", "-o", "%N|%T|%c|%m|%C|%P"], timeout=8))
        source = "sinfo"

    healthy_nodes = [n for n in nodes if n["state"] not in UNHEALTHY_STATES and n["total_cpus"] > 0]
    queue_summary = get_queue_summary()
    return {
        "source": source,
        "nodes": healthy_nodes,
        "all_nodes_seen": len(nodes),
        "total_cpus": sum(n["total_cpus"] for n in healthy_nodes),
        "free_cpus": sum(n["free_cpus"] for n in healthy_nodes),
        "total_memory_mb": sum(n["real_memory_mb"] for n in healthy_nodes),
        "free_memory_mb": sum(n["free_memory_mb"] for n in healthy_nodes),
        "max_node_cpus": max([n["total_cpus"] for n in healthy_nodes], default=0),
        "max_node_memory_mb": max([n["real_memory_mb"] for n in healthy_nodes], default=0),
        "queue": queue_summary,
    }


def get_queue_summary() -> Dict[str, int]:
    output = _run_slurm_command(["squeue", "-h", "-o", "%T"], timeout=5)
    summary = {"pending": 0, "running": 0, "other": 0}
    for line in output.splitlines():
        state = line.strip().upper()
        if not state:
            continue
        if state.startswith("PEND"):
            summary["pending"] += 1
        elif state.startswith("RUN"):
            summary["running"] += 1
        else:
            summary["other"] += 1
    return summary


def _load_policy_defaults() -> Dict[str, Any]:
    defaults = {
        "max_cpu_per_submission": int(os.getenv("JOB_MAX_CPU_PER_SUBMISSION", "0") or 0),
        "max_memory_gb_per_submission": int(os.getenv("JOB_MAX_MEMORY_GB_PER_SUBMISSION", "0") or 0),
        "default_partition": os.getenv("JOB_DEFAULT_PARTITION", ""),
        "fair_share_weight": int(os.getenv("JOB_FAIR_SHARE_WEIGHT", "0") or 0),
    }
    try:
        import mysql.connector

        db = mysql.connector.connect(
            host=MYSQL_CONFIG["host"],
            port=MYSQL_CONFIG["port"],
            user=MYSQL_CONFIG["user"],
            password=MYSQL_CONFIG["password"],
            database="strach_portal",
        )
        cursor = db.cursor(dictionary=True)
        cursor.execute(
            "SELECT `key`, value FROM system_settings WHERE `key` IN "
            "('job_default_partition', 'job_max_cpu_per_submission', 'job_max_memory_gb_per_submission')"
        )
        for row in cursor.fetchall():
            key = row["key"]
            value = row["value"]
            if key == "job_default_partition":
                defaults["default_partition"] = value or ""
            elif key == "job_max_cpu_per_submission" and str(value).isdigit():
                defaults["max_cpu_per_submission"] = int(value)
            elif key == "job_max_memory_gb_per_submission" and str(value).isdigit():
                defaults["max_memory_gb_per_submission"] = int(value)
        cursor.close()
        db.close()
    except Exception as exc:
        print(f"[PLANNER] Policy defaults unavailable: {exc}")
    return defaults


def _pack_tasks(nodes: List[Dict[str, Any]], ntasks: int, cpus_per_task: int, mem_per_task_mb: int) -> Tuple[List[Dict[str, Any]], int]:
    distribution: List[Dict[str, Any]] = []
    remaining = ntasks
    sorted_nodes = sorted(
        nodes,
        key=lambda n: (
            min(
                n["free_cpus"] // max(1, cpus_per_task),
                n["free_memory_mb"] // max(1, mem_per_task_mb),
            ),
            n["free_cpus"],
            n["free_memory_mb"],
        ),
        reverse=True,
    )

    for node in sorted_nodes:
        if remaining <= 0:
            break
        task_capacity = min(
            node["free_cpus"] // max(1, cpus_per_task),
            node["free_memory_mb"] // max(1, mem_per_task_mb),
        )
        if task_capacity <= 0:
            continue
        assigned = min(remaining, task_capacity)
        distribution.append({
            "node": node["name"],
            "tasks": assigned,
            "cpus": assigned * cpus_per_task,
            "memory_mb": assigned * mem_per_task_mb,
            "free_cpus_before": node["free_cpus"],
            "free_memory_mb_before": node["free_memory_mb"],
        })
        remaining -= assigned

    return distribution, remaining


def _min_nodes_for_capacity(nodes: List[Dict[str, Any]], ntasks: int, cpus_per_task: int, mem_per_task_mb: int, use_total: bool) -> int:
    capacities = []
    for node in nodes:
        cpu_key = "total_cpus" if use_total else "free_cpus"
        mem_key = "real_memory_mb" if use_total else "free_memory_mb"
        capacities.append(min(
            node[cpu_key] // max(1, cpus_per_task),
            node[mem_key] // max(1, mem_per_task_mb),
        ))
    remaining = ntasks
    used = 0
    for capacity in sorted(capacities, reverse=True):
        if remaining <= 0:
            break
        if capacity <= 0:
            continue
        remaining -= capacity
        used += 1
    return used if remaining <= 0 else 0


def plan_resources(job_req) -> Dict[str, Any]:
    request_id = f"JOBPLAN-{uuid.uuid4().hex[:12]}"
    warnings: List[str] = []
    explanations: List[str] = []
    policies = _load_policy_defaults()

    total_cpu = _parse_int(getattr(job_req, "total_cpu", 1), 1)
    total_memory_mb = _parse_memory_to_mb(getattr(job_req, "total_ram", 1))
    total_memory_gb = int(math.ceil(total_memory_mb / 1024))

    if policies["max_cpu_per_submission"] and total_cpu > policies["max_cpu_per_submission"]:
        warnings.append(
            f"CPU request reduced from {total_cpu} to policy limit {policies['max_cpu_per_submission']}."
        )
        total_cpu = policies["max_cpu_per_submission"]

    max_memory_gb = policies["max_memory_gb_per_submission"]
    if max_memory_gb and total_memory_gb > max_memory_gb:
        warnings.append(f"Memory request reduced from {total_memory_gb}G to policy limit {max_memory_gb}G.")
        total_memory_gb = max_memory_gb
        total_memory_mb = max_memory_gb * 1024

    job_type = (getattr(job_req, "job_type", None) or "distributed").lower()
    explicit_ntasks = getattr(job_req, "ntasks", None)
    explicit_cpus_per_task = getattr(job_req, "cpus_per_task", None)
    explicit_mem_per_cpu = getattr(job_req, "mem_per_cpu", None)

    if explicit_cpus_per_task:
        cpus_per_task = _parse_int(explicit_cpus_per_task, 1)
        ntasks = max(1, int(math.ceil(total_cpu / cpus_per_task)))
        explanations.append(f"Using explicit cpus-per-task={cpus_per_task}; task count derived from total CPU.")
    elif explicit_ntasks:
        ntasks = _parse_int(explicit_ntasks, 1)
        cpus_per_task = max(1, int(math.ceil(total_cpu / ntasks)))
        explanations.append(f"Using explicit ntasks={ntasks}; cpus-per-task derived from total CPU.")
    elif job_type in {"multithread", "threaded", "shared_memory", "jupyter", "interactive"}:
        ntasks = 1
        cpus_per_task = total_cpu
        explanations.append("Vertical allocation selected because the workload type requires shared-memory execution.")
    else:
        ntasks = total_cpu
        cpus_per_task = 1
        explanations.append("Horizontal allocation selected: one Slurm task per requested CPU.")

    if explicit_ntasks and explicit_cpus_per_task:
        ntasks = _parse_int(explicit_ntasks, 1)
        cpus_per_task = _parse_int(explicit_cpus_per_task, 1)
        implied_cpu = ntasks * cpus_per_task
        if implied_cpu != total_cpu:
            warnings.append(f"Explicit ntasks/cpus-per-task allocate {implied_cpu} CPUs for a {total_cpu} CPU request.")

    if explicit_mem_per_cpu:
        mem_per_cpu_mb = _parse_mem_per_cpu_to_mb(explicit_mem_per_cpu)
        explanations.append("Using explicit memory-per-CPU request.")
    else:
        mem_per_cpu_mb = max(1, int(math.ceil(total_memory_mb / max(1, ntasks * cpus_per_task))))
        explanations.append("Memory normalized to --mem-per-cpu to avoid whole-node memory over-allocation.")

    mem_per_task_mb = mem_per_cpu_mb * cpus_per_task
    snapshot = get_cluster_snapshot()
    nodes = snapshot["nodes"]
    partition = getattr(job_req, "partition", None) or policies["default_partition"] or None

    if partition:
        partition_nodes = [
            node for node in nodes
            if not node["partition"] or partition in [p.strip("*") for p in node["partition"].split(",")]
        ]
        if partition_nodes:
            nodes = partition_nodes
        else:
            warnings.append(f"Partition '{partition}' has no currently visible healthy nodes; Slurm will decide placement.")

    distribution, remaining = _pack_tasks(nodes, ntasks, cpus_per_task, mem_per_task_mb)
    total_fit_nodes = _min_nodes_for_capacity(nodes, ntasks, cpus_per_task, mem_per_task_mb, use_total=True)
    free_fit_nodes = _min_nodes_for_capacity(nodes, ntasks, cpus_per_task, mem_per_task_mb, use_total=False)

    max_single_node_tasks = 0
    for node in nodes:
        max_single_node_tasks = max(
            max_single_node_tasks,
            min(
                node["total_cpus"] // max(1, cpus_per_task),
                node["real_memory_mb"] // max(1, mem_per_task_mb),
            ),
        )
    if ntasks > max_single_node_tasks and job_type in {"single_node", "python", "distributed", "mpi", "batch"}:
        warnings.append("Requested resources exceed single-node capacity. Converted to distributed job.")
        job_type = "distributed"

    if remaining > 0:
        if total_fit_nodes:
            warnings.append(
                "Requested resources are valid for the cluster but not currently free; Slurm will queue until capacity opens."
            )
        else:
            raise ValueError(
                "Requested CPU/memory cannot fit on the currently configured Slurm nodes. "
                "Reduce resources or add suitable nodes/partition capacity."
            )

    min_nodes = free_fit_nodes or total_fit_nodes or None
    allocation_mode = "distributed" if (min_nodes or 1) > 1 or ntasks > 1 else "single-node"
    if allocation_mode == "distributed" and cpus_per_task == 1:
        explanations.append("Distributed task packing selected to minimize partially idle nodes.")

    directives = [
        f"#SBATCH --ntasks={ntasks}",
        f"#SBATCH --cpus-per-task={cpus_per_task}",
        f"#SBATCH --mem-per-cpu={mem_per_cpu_mb}M",
        "#SBATCH --distribution=block:block",
        "#SBATCH --hint=nomultithread",
    ]
    if min_nodes and min_nodes > 0:
        directives.append(f"#SBATCH --nodes={min_nodes}-{max(min_nodes, len(nodes) or min_nodes)}")
    if partition:
        directives.append(f"#SBATCH --partition={partition}")
    if getattr(job_req, "gpu_count", 0):
        directives.append(f"#SBATCH --gres=gpu:{int(getattr(job_req, 'gpu_count', 0))}")
    if getattr(job_req, "constraint", None):
        directives.append(f"#SBATCH --constraint={getattr(job_req, 'constraint')}")

    return {
        "request_id": request_id,
        "ntasks": ntasks,
        "cpus_per_task": cpus_per_task,
        "total_cpu": ntasks * cpus_per_task,
        "requested_cpu": total_cpu,
        "mem": total_memory_gb,
        "total_memory_mb": total_memory_mb,
        "mem_per_cpu": mem_per_cpu_mb,
        "mem_per_task_mb": mem_per_task_mb,
        "gpu_count": int(getattr(job_req, "gpu_count", 0) or 0),
        "partition": partition,
        "job_type": job_type,
        "allocation_mode": allocation_mode,
        "constraint": getattr(job_req, "constraint", None),
        "warnings": warnings,
        "explanations": explanations,
        "node_distribution": distribution,
        "expected_node_count": min_nodes or 0,
        "cluster_snapshot": {
            "source": snapshot["source"],
            "all_nodes_seen": snapshot["all_nodes_seen"],
            "eligible_nodes": len(nodes),
            "total_cpus": snapshot["total_cpus"],
            "free_cpus": snapshot["free_cpus"],
            "total_memory_mb": snapshot["total_memory_mb"],
            "free_memory_mb": snapshot["free_memory_mb"],
            "queue": snapshot["queue"],
        },
        "sbatch_directives": directives,
    }
