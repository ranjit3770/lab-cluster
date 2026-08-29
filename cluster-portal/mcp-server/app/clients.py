"""HTTP clients for the Portal backend and Job-API.

These thin wrappers handle timeout, error translation, and structured logging
so tool implementations stay clean.

Strategy: prefer Portal API routes over direct Slurm CLI calls where possible.
Direct Slurm CLI is used only when no Portal API equivalent exists.
"""
import requests
import subprocess
import os
import logging
from typing import Optional, Dict, Any, List
from app.config import settings

logger = logging.getLogger("mcp.clients")

REQUEST_TIMEOUT = 10
_SLURM_TIMEOUT = 5


def _portal_get(path: str, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        resp = requests.get(
            f"{settings.PORTAL_API_URL}/api/v1{path}",
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.error("Portal GET %s failed: %s", path, exc)
        return None


def _portal_post(path: str, payload: dict, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        resp = requests.post(
            f"{settings.PORTAL_API_URL}/api/v1{path}",
            json=payload,
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.error("Portal POST %s failed: %s", path, exc)
        return None


def _job_api_get(path: str) -> Optional[Dict[str, Any]]:
    try:
        resp = requests.get(
            f"{settings.JOB_API_URL}{path}",
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.error("Job-API GET %s failed: %s", path, exc)
        return None


def _job_api_post(path: str, payload: dict) -> Optional[Dict[str, Any]]:
    try:
        resp = requests.post(
            f"{settings.JOB_API_URL}{path}",
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.error("Job-API POST %s failed: %s", path, exc)
        return None


def _slurm_env() -> dict:
    env = os.environ.copy()
    slurm_path = os.getenv("SLURM_PATH", "/usr/local/slurm/bin:/usr/local/slurm/sbin")
    env["PATH"] = f"{slurm_path}:{env.get('PATH', '')}"
    env["LD_LIBRARY_PATH"] = os.getenv("SLURM_LIB_PATH", "/usr/local/slurm/lib")
    return env


def _run_slurm_cmd(cmd: List[str]) -> Optional[str]:
    try:
        return subprocess.check_output(
            cmd,
            env=_slurm_env(),
            stderr=subprocess.STDOUT,
            timeout=_SLURM_TIMEOUT,
        ).decode()
    except Exception as exc:
        logger.error("Slurm CLI %s failed: %s", cmd, exc)
        return None


# ---------------------------------------------------------------------------
# Public helpers — consumed by tools
# Prefer Portal API over direct Slurm CLI where possible.
# ---------------------------------------------------------------------------

def get_overview(token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    return _portal_get("/system-info/overview", token)


def get_nodes(token: Optional[str] = None) -> Optional[List[Dict[str, Any]]]:
    data = _portal_get("/compute-resources/", token)
    if data is None:
        return None
    return data if isinstance(data, list) else data.get("nodes", [])


def get_jobs(token: Optional[str] = None) -> Optional[List[Dict[str, Any]]]:
    data = _portal_get("/jobs", token)
    if data is None:
        return None
    return data if isinstance(data, list) else data.get("jobs", [])


def get_job_detail(job_id: int, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    return _portal_get(f"/jobs/{job_id}", token)


def get_slurm_node_detail(node_name: str) -> Optional[Dict[str, Any]]:
    """Get node detail. Try Portal API first, fall back to Slurm CLI."""
    portal_data = _portal_get(f"/compute-resources/{node_name}")
    if portal_data:
        return portal_data

    output = _run_slurm_cmd(["scontrol", "show", "node", node_name, "-o"])
    if not output:
        return None
    info: Dict[str, Any] = {"raw": output.strip()}
    for token in output.split():
        if "=" in token:
            k, v = token.split("=", 1)
            info[k.lower()] = v
    return info


def get_slurm_queue(username: Optional[str] = None) -> Optional[str]:
    """Get job queue. Try Portal API first, fall back to Slurm CLI."""
    if username:
        jobs = get_jobs()
        if jobs:
            filtered = [
                j for j in jobs
                if (j.get("user_name") or j.get("username", "")).lower() == username.lower()
            ]
            lines = []
            for j in filtered:
                lines.append(
                    f"{j.get('slurm_job_id', '')}|"
                    f"{j.get('user_name') or j.get('username', '')}|"
                    f"{j.get('status', '')}|"
                    f"{j.get('partition', '')}|"
                    f"{j.get('total_cpu', '')}|"
                    f"{j.get('total_ram', '')}|"
                    f""
                )
            return "\n".join(lines) if lines else None
    else:
        jobs = get_jobs()
        if jobs:
            lines = []
            for j in jobs:
                lines.append(
                    f"{j.get('slurm_job_id', '')}|"
                    f"{j.get('user_name') or j.get('username', '')}|"
                    f"{j.get('status', '')}|"
                    f"{j.get('partition', '')}|"
                    f"{j.get('total_cpu', '')}|"
                    f"{j.get('total_ram', '')}|"
                    f""
                )
            return "\n".join(lines) if lines else None

    cmd = ["squeue", "-h", "-o", "%i|%u|%T|%P|%C|%m|%R"]
    if username:
        cmd.extend(["-u", username])
    return _run_slurm_cmd(cmd)


def get_slurm_diag() -> Optional[Dict[str, Any]]:
    output = _run_slurm_cmd(["sdiag"])
    if not output:
        return None
    info: Dict[str, Any] = {"raw": output.strip()}
    for line in output.splitlines():
        line = line.strip()
        if "=" in line:
            k, v = line.split("=", 1)
            info[k.strip().lower()] = v.strip()
    return info


def get_slurm_partitions() -> Optional[str]:
    """Get partition info. Slurm CLI only (no Portal API equivalent)."""
    return _run_slurm_cmd([
        "sinfo",
        "-h",
        "-o", "%P|%a|%l|%D|%C|%f|%N|%T",
    ])


def get_user_quota(username: str) -> Optional[Dict[str, Any]]:
    """Get user resource quota. Try Portal API first, fall back to Slurm CLI."""
    portal_data = _portal_get(f"/users/me/dashboard")
    if portal_data and isinstance(portal_data, dict):
        try:
            return {
                "cpu_used": portal_data.get("cpu_used", 0),
                "mem_used_mb": portal_data.get("mem_used_mb", 0),
            }
        except Exception:
            pass

    output = _run_slurm_cmd(["squeue", "-u", username, "--noheader", "--format=%C|%m"])
    if not output:
        return {"cpu_used": 0, "mem_used": 0}
    total_cpu = 0
    total_mem = 0
    for line in output.strip().splitlines():
        parts = line.split("|")
        if len(parts) >= 2:
            try:
                total_cpu += int(parts[0])
                mem_str = parts[1].strip()
                if mem_str.endswith("G"):
                    total_mem += int(float(mem_str[:-1]) * 1024)
                else:
                    total_mem += int(float(mem_str))
            except (ValueError, IndexError):
                pass
    return {"cpu_used": total_cpu, "mem_used_mb": total_mem}


def get_job_status_external(slurm_job_id: str) -> Optional[Dict[str, Any]]:
    return _job_api_get(f"/status/{slurm_job_id}")


def cancel_job_external(slurm_job_id: str) -> Optional[Dict[str, Any]]:
    return _job_api_post(f"/cancel/{slurm_job_id}", {})


def get_audit_events(token: Optional[str] = None) -> Optional[List[Dict[str, Any]]]:
    try:
        import mysql.connector
        conn = mysql.connector.connect(
            host=settings.MYSQL_HOST,
            port=settings.MYSQL_PORT,
            user=settings.MYSQL_USER,
            password=settings.MYSQL_PASSWORD,
            database=settings.MYSQL_DB,
        )
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT timestamp, username, action, resource, detail, status "
            "FROM audit_logs ORDER BY timestamp DESC LIMIT 100"
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        for row in rows:
            row["timestamp"] = str(row["timestamp"])
        return rows
    except Exception as exc:
        logger.error("Audit query failed: %s", exc)
        return None
