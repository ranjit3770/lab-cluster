import requests
import subprocess
from app.slurm import get_slurm_jwt, get_slurm_env, SLURM_JWT_USER, SLURM_REST_URL

COMPLETED_STATES = {"COMPLETED", "COMPLETING", "FAILED", "CANCELLED", "TIMEOUT", "NODE_FAIL", "OUT_OF_MEMORY", "PREEMPTED"}

def _normalize_state(state):
    raw = str(state or "UNKNOWN").strip().upper()
    if not raw:
        return "UNKNOWN"
    if raw in {"R", "RUNNING"}:
        return "RUNNING"
    if raw in {"PD", "PENDING", "CONFIGURING", "RESIZING", "SUSPENDED"}:
        return "PENDING"
    if raw in {"CG", "COMPLETING"}:
        return "RUNNING"
    if raw in {"CD", "COMPLETED"}:
        return "COMPLETED"
    if raw in {"CA", "CANCELLED"}:
        return "CANCELLED"
    if raw in {"TO", "TIMEOUT"}:
        return "CANCELLED"
    if raw in {"F", "FAILED", "NF", "NODE_FAIL", "OOM", "OUT_OF_MEMORY", "PR", "PREEMPTED"}:
        return "FAILED"
    if "PENDING" in raw or "HELD" in raw or "REQUEUE" in raw:
        return "PENDING"
    return raw

def _status_from_cli(job_id):
    try:
        output = subprocess.check_output(
            ["squeue", "-j", str(job_id), "--noheader", "--format=%T|%r"],
            env=get_slurm_env(),
            stderr=subprocess.STDOUT,
            text=True,
            timeout=5,
        ).strip()
        if output:
            state, reason = (output.split("|", 1) + [""])[:2]
            normalized = _normalize_state(state)
            if normalized == "PENDING" and "user_env_retrieval_failed" in reason.lower():
                return "FAILED"
            return normalized
    except Exception as e:
        print(f"DEBUG: CLI squeue status error for {job_id}: {e}")

    try:
        output = subprocess.check_output(
            ["sacct", "-j", str(job_id), "--noheader", "--parsable2", "--format=State", "-n"],
            env=get_slurm_env(),
            stderr=subprocess.STDOUT,
            text=True,
            timeout=5,
        ).strip()
        for line in output.splitlines():
            state = line.split("|", 1)[0].strip()
            if state:
                return _normalize_state(state)
    except Exception as e:
        print(f"DEBUG: CLI sacct status error for {job_id}: {e}")

    return None

def job_status_detail(job_id):
    try:
        output = subprocess.check_output(
            ["scontrol", "show", "job", str(job_id), "-o"],
            env=get_slurm_env(),
            stderr=subprocess.STDOUT,
            text=True,
            timeout=5,
        ).strip()
    except Exception as e:
        detail = getattr(e, "output", None) or str(e)
        return {"detail": str(detail).strip()}

    fields = {}
    for token in output.split():
        if "=" in token:
            key, value = token.split("=", 1)
            fields[key] = value

    state = _normalize_state(fields.get("JobState"))
    reason = fields.get("Reason", "")
    if state == "PENDING" and "user_env_retrieval_failed" in reason.lower():
        state = "FAILED"

    return {
        "status": state,
        "reason": reason,
        "exit_code": fields.get("ExitCode", ""),
        "node_list": fields.get("NodeList", ""),
        "batch_host": fields.get("BatchHost", ""),
        "stdout": fields.get("StdOut", ""),
        "stderr": fields.get("StdErr", ""),
        "submit_line": fields.get("SubmitLine", ""),
    }

def job_status(job_id):
    """
    Unified Status Fetcher. Prefer CLI because this deployment can submit via
    sbatch fallback when slurmrestd JWT auth is unhealthy.
    """
    cli_status = _status_from_cli(job_id)
    if cli_status:
        return cli_status

    jwt = get_slurm_jwt()
    if not jwt:
        return "UNKNOWN"
        
    headers = {
        "X-SLURM-USER-NAME": SLURM_JWT_USER,
        "X-SLURM-USER-TOKEN": jwt
    }
    
    try:
        # GET /job/{id} returns details for a single job
        url = f"{SLURM_REST_URL}/job/{job_id}"
        res = requests.get(url, headers=headers, timeout=5)
        
        if res.status_code == 404 and "v0.0.41" not in url:
             f_url = url.replace("v0.0.44", "v0.0.41")
             res = requests.get(f_url, headers=headers, timeout=5)
             
        if res.status_code == 200:
            data = res.json()
            jobs = data.get("jobs", [])
            if jobs:
                # v0.0.41 returns list even for single ID & state might be a list
                state_raw = jobs[0].get("job_state", "UNKNOWN")
                if isinstance(state_raw, list):
                    return state_raw[0].upper() if state_raw else "UNKNOWN"
                return str(state_raw or "UNKNOWN").upper()
        
        return "NOT_FOUND"
    except Exception as e:
        print(f"DEBUG: REST Status fetch error for {job_id}: {e}")
        return "UNKNOWN"

def cancel_job(job_id):
    """
    Cancel job via CLI first, then Slurm REST API.
    """
    try:
        subprocess.check_output(
            ["scancel", str(job_id)],
            env=get_slurm_env(),
            stderr=subprocess.STDOUT,
            text=True,
            timeout=10,
        )
        return "CANCELLED"
    except Exception as e:
        print(f"DEBUG: CLI Cancel error for {job_id}: {e}")

    jwt = get_slurm_jwt()
    if not jwt:
         return "ERROR"
         
    headers = {
        "X-SLURM-USER-NAME": SLURM_JWT_USER,
        "X-SLURM-USER-TOKEN": jwt
    }
    
    try:
        url = f"{SLURM_REST_URL}/job/{job_id}"
        res = requests.delete(url, headers=headers, timeout=5)
        
        if res.status_code == 404 and "v0.0.41" not in url:
             f_url = url.replace("v0.0.44", "v0.0.41")
             res = requests.delete(f_url, headers=headers, timeout=5)
             
        res.raise_for_status()
        return "CANCELLED"
    except Exception as e:
        print(f"DEBUG: REST Cancel error for {job_id}: {e}")
        return "ERROR"
