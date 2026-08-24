"""Quota sources: portal DB limits, local quota table, live Slurm usage."""
import subprocess

import mysql.connector
import requests

from app.config import MYSQL_CONFIG, SLURM_JWT_USER, SLURM_REST_URL
from app.slurm.env import _slurm_bin, get_slurm_env, get_slurm_jwt
from app.slurm.parsers import _parse_slurm_memory_to_gb, _to_int


def get_db_limit(username):
    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT cpu_limit, memory_limit_gb, role FROM strach_portal.users WHERE username = %s", (username,))
        row = cursor.fetchone()
        conn.close()
        return row
    except Exception as e:
        print(f"[QUOTA] DB Error fetching limits for {username}: {e}")
        return None


def get_user_quota(username):
    """Fetch quota from job-api's local user_quota table."""
    try:
        from app.database import get_db
        db = get_db()
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT * FROM user_quota WHERE username = %s", (username,))
        row = cursor.fetchone()
        cursor.close()
        db.close()
        return row
    except:
        return None


def _get_slurm_usage_cli(username):
    try:
        output = subprocess.check_output(
            [
                _slurm_bin("squeue"),
                "--noheader",
                "--user",
                username,
                "--states=RUNNING",
                "--format=%C|%m",
            ],
            env=get_slurm_env(),
            stderr=subprocess.STDOUT,
            text=True,
            timeout=5,
        ).strip()
    except Exception as exc:
        detail = getattr(exc, "output", None) or str(exc)
        print(f"[QUOTA] Slurm CLI usage query failed for {username}: {str(detail).strip()}")
        return None

    total_cpu = 0
    total_ram_gb = 0.0
    for line in output.splitlines():
        if not line.strip():
            continue
        parts = line.split("|", 1)
        cpus = _to_int(parts[0] if parts else 0, 0)
        mem = parts[1] if len(parts) > 1 else 0
        total_cpu += cpus
        total_ram_gb += _parse_slurm_memory_to_gb(mem, cpus)

    print(f"[DEBUG] CLI Usage for {username}: CPU={total_cpu}, RAM={total_ram_gb:.2f}GB")
    return total_cpu, total_ram_gb


def get_slurm_usage(username):
    """
    Query current resource usage. Prefer Slurm CLI because this deployment can
    operate through sbatch/squeue even when slurmrestd JWT auth is unavailable.
    Returns (total_cpu, total_ram_gb).
    """
    cli_usage = _get_slurm_usage_cli(username)
    if cli_usage is not None:
        return cli_usage

    jwt = get_slurm_jwt()
    if not jwt:
        print(f"[QUOTA] Failed to fetch usage for {username}: No JWT.")
        return 0, 0

    headers = {
        "X-SLURM-USER-NAME": SLURM_JWT_USER,
        "X-SLURM-USER-TOKEN": jwt
    }

    try:
        # v0.0.41/v0.0.44 structure:
        # GET /jobs returns a list of jobs
        # We filter by username and RUNNING state
        params = {"user": username}
        res = requests.get(f"{SLURM_REST_URL}/jobs", headers=headers, params=params, timeout=5)

        if res.status_code == 404 and "v0.0.41" not in SLURM_REST_URL:
            # Fallback version detection
            f_url = SLURM_REST_URL.replace("v0.0.44", "v0.0.41")
            res = requests.get(f"{f_url}/jobs", headers=headers, params=params, timeout=5)

        res.raise_for_status()
        data = res.json()
        jobs = data.get("jobs", [])

        total_cpu = 0
        total_ram_gb = 0.0

        for job in jobs:
            # Only count RUNNING jobs for quota enforcement
            state_raw = job.get("job_state")
            if isinstance(state_raw, list):
                state = state_raw[0].upper() if state_raw else ""
            else:
                state = str(state_raw or "").upper()

            if state != "RUNNING":
                continue

            # Slurm Job IDs in REST might have array suffixes
            # Extract CPU count
            cpus = job.get("cpus", 0)
            if isinstance(cpus, dict):
                cpus = cpus.get("number", 0)

            cpus = _to_int(cpus, 0)
            total_cpu += cpus

            # RAM calculation (stored in MB by Slurm)
            # v0.0.41 standard is often 'memory_per_node' or 'memory_per_cpu'
            mem = job.get("memory_per_node", 0)
            if isinstance(mem, dict):
                # Standard for v0.0.41 'Uint64' types
                mem = mem.get("number", 0)

            if not mem or mem == 0:
                mem = job.get("memory_per_cpu", 0)
                if isinstance(mem, dict):
                    mem = mem.get("number", 0)
                mem = _to_int(mem, 0) * max(1, cpus)

            total_ram_gb += (_to_int(mem, 0) / 1024.0)

        print(f"[DEBUG] REST Usage for {username}: CPU={total_cpu}, RAM={total_ram_gb:.2f}GB")
        return total_cpu, total_ram_gb
    except Exception as e:
        print(f"[QUOTA] Slurm REST usage query failed for {username}: {e}")
        return 0, 0
