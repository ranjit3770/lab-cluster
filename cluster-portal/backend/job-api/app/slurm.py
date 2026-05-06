import subprocess
import os
import socket
import secrets
import mysql.connector
import time
import requests
import json
import shlex
import pwd
import grp
import re
import math
from app.planner import plan_resources
from app.config import DATA_ROOT, MYSQL_CONFIG, SLURM_PATH, SLURM_LIB_PATH, SLURM_JWT_USER, SLURM_JWT_TOKEN, SLURM_REST_URL, SLURM_VERSION

# Slurm Environment Config
EXCLUDE_NODES = os.getenv("SLURM_EXCLUDE_NODES", "head-node")

def _to_int(value, default=0):
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return int(value)
    raw = str(value).strip()
    if not raw or raw.upper() in {"N/A", "NA", "NONE", "NULL", "UNKNOWN", "(NULL)"}:
        return default
    import re
    match = re.match(r"^-?\d+", raw)
    if not match:
        return default
    try:
        return int(match.group(0))
    except Exception:
        return default

def _parse_slurm_memory_to_gb(value, cpus=1):
    if value is None:
        return 0.0
    raw = str(value).strip()
    if not raw or raw.upper() in {"N/A", "NA", "NONE", "NULL", "UNKNOWN", "(NULL)"}:
        return 0.0

    per_cpu = raw.endswith("c")
    if per_cpu:
        raw = raw[:-1]

    match = re.match(r"^([0-9]+(?:\.[0-9]+)?)([KMGTP]?)", raw, re.IGNORECASE)
    if not match:
        return 0.0

    amount = float(match.group(1))
    unit = match.group(2).upper() or "M"
    multiplier = {
        "K": 1 / (1024 * 1024),
        "M": 1 / 1024,
        "G": 1,
        "T": 1024,
        "P": 1024 * 1024,
    }.get(unit, 1 / 1024)

    gb = amount * multiplier
    if per_cpu:
        gb *= max(1, _to_int(cpus, 1))
    return gb

def _walltime_to_seconds(value, default_seconds=1800):
    try:
        parts = [int(part) for part in str(value or "").split(":")]
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        if len(parts) == 2:
            return parts[0] * 60 + parts[1]
        if len(parts) == 1:
            return parts[0] * 60
    except Exception:
        pass
    return default_seconds

def _seconds_to_walltime(seconds):
    seconds = max(60, int(seconds))
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"

def _slurm_bin(name):
    for directory in SLURM_PATH.split(":"):
        candidate = os.path.join(directory, name)
        if os.path.exists(candidate):
            return candidate
    for candidate in (f"/usr/local/slurm/bin/{name}", f"/usr/local/bin/{name}", f"/usr/bin/{name}", f"/bin/{name}"):
        if os.path.exists(candidate):
            return candidate
    return name

def _chown_path_to_user(path, username):
    try:
        user_info = pwd.getpwnam(username)
        try:
            gid = grp.getgrnam(username).gr_gid
        except KeyError:
            gid = user_info.pw_gid
        os.chown(path, user_info.pw_uid, gid)
    except Exception as exc:
        print(f"[SLURM-CLI] Ownership adjustment skipped for {path}: {exc}")

def _submit_script_with_sbatch(username, script_path, work_dir):
    sbatch = _slurm_bin("sbatch")
    commands = [
        ["sudo", "-n", "-u", username, sbatch, "--export=ALL", "--chdir", work_dir, script_path],
    ]
    last_error = ""

    for cmd in commands:
        try:
            output = subprocess.check_output(
                cmd,
                env=get_slurm_env(),
                stderr=subprocess.STDOUT,
                text=True,
                timeout=30,
            )
            match = re.search(r"Submitted batch job\s+(\S+)", output)
            if match:
                return match.group(1)
            last_error = output.strip() or "sbatch did not return a job id."
        except Exception as exc:
            last_error = str(exc)
            if hasattr(exc, "output") and exc.output:
                last_error = exc.output.strip()
            print(f"[SLURM-CLI] sbatch attempt failed ({' '.join(cmd)}): {last_error}")

    raise Exception(f"sbatch CLI fallback failed: {last_error}")

def get_slurm_env():
    """Build the environment dictionary for Slurm CLI calls."""
    env = os.environ.copy()
    env["PATH"] = f"{SLURM_PATH}:{env.get('PATH', '')}"
    env["LD_LIBRARY_PATH"] = SLURM_LIB_PATH
    return env

def get_slurm_jwt():
    """Retrieve or generate the Slurm JWT for REST API authentication."""
    if SLURM_JWT_TOKEN:
        return SLURM_JWT_TOKEN
    
    try:
        # Generate token using scontrol
        cmd = ["sudo", f"{SLURM_PATH.split(':')[0]}/scontrol", "token", f"username={SLURM_JWT_USER}", "lifespan=3600"]
        output = subprocess.check_output(cmd, env=get_slurm_env()).decode()
        for line in output.split('\n'):
            if "SLURM_JWT=" in line:
                return line.split('=')[1].strip()
    except Exception as e:
        print(f"[SLURM] Failed to generate JWT: {e}")
    return None

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

def _find_free_port():
    """Find a random free port for Jupyter sessions."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(('', 0))
    port = sock.getsockname()[1]
    sock.close()
    return port

def _generate_jupyter_token():
    """Generate a secure random token for Jupyter access."""
    return secrets.token_hex(24)

def _get_job_node(slurm_job_id):
    """Query Slurm for the node a running job is allocated to."""
    try:
        output = subprocess.check_output([
            "squeue", "-j", str(slurm_job_id), "--noheader", "--format=%N"
        ], env=get_slurm_env()).decode().strip()
        return output if output else None
    except:
        return None

def submit_job(job, bypass_quota=False, replace_id=None):
    # 1. Resource Planning
    plan = plan_resources(job)
    warnings = plan.get("warnings", [])

    # 2. Quota Check
    limits = get_db_limit(job.username)
    local_quota = get_user_quota(job.username)
    
    live_cpu, live_ram = get_slurm_usage(job.username)
    requested_cpu = plan.get("requested_cpu") or getattr(job, 'total_cpu', 1) or 1
    requested_ram = plan.get("mem") or getattr(job, 'total_ram', 1) or 1

    # prioritized quota source
    cpu_limit = limits.get('cpu_limit') if limits else None
    if not cpu_limit:
        cpu_limit = local_quota.get('max_cpu') if local_quota else 8
        
    ram_limit = limits.get('memory_limit_gb') if limits else None
    if not ram_limit:
        ram_limit = local_quota.get('max_ram_gb') if local_quota else 16
    
    quota_meta = {
        "used_cpu": live_cpu,
        "used_ram_gb": live_ram,
        "total_cpu_quota": cpu_limit,
        "total_ram_quota_gb": ram_limit
    }

    if not bypass_quota:
        # First job MUST ALWAYS go to Slurm
        if live_cpu == 0 and live_ram == 0:
            bypass_quota = True
        
        if not bypass_quota:
            if (live_cpu + requested_cpu) > cpu_limit or (live_ram + requested_ram) > ram_limit:
                print(f"[QUOTA] HARD REJECT: {job.username} exceeds limits. Queued locally.")
                return "QUOTA_EXCEEDED", [], quota_meta, None, None, {"plan": plan}

    quota_status = "NORMAL"
    if (live_cpu + requested_cpu) > cpu_limit:
        quota_status = "QUOTA_OVERAGE"
        warnings.append(f"CPU usage ({int(live_cpu)} + {requested_cpu}) exceeds quota ({cpu_limit}). Job will queue in Slurm.")
        
    if (live_ram + requested_ram) > ram_limit:
        quota_status = "QUOTA_OVERAGE"
        warnings.append(f"RAM usage ({live_ram:.1f}GB + {requested_ram}GB) exceeds quota ({ram_limit}GB). Job will queue in Slurm.")

    # 3. Path & Environment Setup
    user_root = f"{DATA_ROOT}/{job.username}"
    logs_dir = f"{user_root}/slurm_logs"
    venv_path = f"{user_root}/venv"

    is_jupyter = (job.entry_point == "__jupyter__")
    jupyter_port = None
    jupyter_token = None

    command_only = bool(getattr(job, "command", None)) and not getattr(job, "entry_point", None)

    if is_jupyter or command_only:
        project_root = user_root
        if is_jupyter:
            jupyter_port = _find_free_port()
            jupyter_token = _generate_jupyter_token()
    else:
        entry_file_point = user_root + "/" + job.entry_point
        if not os.path.exists(entry_file_point):
            raise FileNotFoundError(f"Entry point '{job.entry_point}' not found at {entry_file_point}")
        project_root = os.path.dirname(entry_file_point)

    os.makedirs(logs_dir, exist_ok=True)
    try:
        # Give full permissions to the logs directory
        os.chmod(logs_dir, 0o777)
        import subprocess as sp
        # RECURSIVE CHMOD: Ensure the entire user workspace is writeable by the Slurm user
        # This is the most reliable way to fix the ".local" permission denied error
        sp.run(["chmod", "-R", "777", user_root], check=False)
        # Attempt chown if running as root
        sp.run(["chown", "-R", f"{job.username}:{job.username}", user_root], check=False)
    except: pass

    # 4. SBATCH Construction — Pure Slurm-native
    ntasks = plan['ntasks']
    cpus_per_task = plan['cpus_per_task']
    mem_gb = plan['mem']
    mem_per_cpu = plan.get('mem_per_cpu')
    partition = plan['partition']
    gpu_count = plan['gpu_count']
    job_type = plan['job_type']

    # Default walltime: always enforced
    walltime = job.time if job.time and ":" in job.time else "00:30:00"
    min_walltime_seconds = 1800 if is_jupyter else 60
    if _walltime_to_seconds(walltime) < min_walltime_seconds:
        corrected_walltime = _seconds_to_walltime(min_walltime_seconds)
        warnings.append(f"Walltime increased from {walltime} to {corrected_walltime} for reliable startup and scheduler accounting.")
        walltime = corrected_walltime

    resource_directives = plan.get("sbatch_directives", [
        f"#SBATCH --ntasks={ntasks}",
        f"#SBATCH --cpus-per-task={cpus_per_task}",
        f"#SBATCH --mem-per-cpu={mem_per_cpu}M",
    ])

    # HEAD NODE PROTECTION: (Disabled for this specific lab-cluster as it doubles as a compute node)
    # if EXCLUDE_NODES:
    #     resource_directives.append(f"#SBATCH --exclude={EXCLUDE_NODES}")

    # 5. Build execution commands
    cmd_args = job.command_args or ""
    srun_bin = _slurm_bin("srun")
    
    if is_jupyter:
        install_cmd = '"$VENV/bin/pip" install --quiet jupyterlab notebook'
        jupyter_cmd = f'{shlex.quote(os.path.join(venv_path, "bin", "jupyter"))} lab --ip=0.0.0.0 --port={jupyter_port} --no-browser --ServerApp.token="{jupyter_token}" --ServerApp.allow_origin="*"'
        execution_cmd = (
            f'echo "[INFO] Jupyter starting on port {jupyter_port} (token: {jupyter_token})..." && '
            f'/bin/bash -c {shlex.quote(jupyter_cmd)}'
        )
    else:
        entry_script = os.path.basename(job.entry_point or "")
        if job.requirements_path:
            req_file_path = job.requirements_path if os.path.isabs(job.requirements_path) else os.path.join(project_root, job.requirements_path)
            if os.path.exists(req_file_path):
                install_cmd = f'"$VENV/bin/pip" install --quiet -r "{req_file_path}"'
            else:
                install_cmd = "echo '[INFO] Requirements file not found, skipping.'"
        else:
            install_cmd = "echo '[INFO] No requirements file, skipping.'"
        
        user_command = getattr(job, "command", None)
        if not user_command:
            if not entry_script:
                raise ValueError("Either entry_point or command must be supplied for batch submissions.")
            user_command = f'{shlex.quote(os.path.join(venv_path, "bin", "python"))} {shlex.quote(entry_script)} {cmd_args}'.strip()
        if ntasks == 1:
            execution_cmd = (
                f'echo "[INFO] Running single-task workload inside the Slurm allocation..." && '
                f'/bin/bash -c {shlex.quote(user_command)}'
            )
        else:
            execution_cmd = (
                f'echo "[INFO] Running distributed Slurm task layout..." && '
                f'{shlex.quote(srun_bin)} --export=ALL --ntasks={ntasks} --cpus-per-task={cpus_per_task} --cpu-bind=cores /bin/bash -c {shlex.quote(user_command)}'
            )

    # Join directives outside f-string (Python < 3.12 compat)
    resource_block = "\n".join(resource_directives)
    allocated_cpu = ntasks * cpus_per_task
    allocated_memory_mb = allocated_cpu * mem_per_cpu

    script = f"""#!/bin/bash
#SBATCH --job-name={job.project_name}
#SBATCH --time={walltime}
#SBATCH --output={logs_dir}/{job.username}_%j.out
#SBATCH --error={logs_dir}/{job.username}_%j.err
#SBATCH --export=ALL
{resource_block}

set -euo pipefail
echo "[INFO] Job started on node: $(hostname)"
echo "[INFO] Allocation mode: {plan.get('allocation_mode', 'distributed')}"
echo "[INFO] Allocated resources: {ntasks} tasks x {cpus_per_task} CPU/task, {mem_per_cpu}MB memory/CPU"
echo "[INFO] Planner request id: {plan.get('request_id')}"
PROJECT_ROOT="{project_root}"
VENV="{venv_path}"
PORTAL_REQUEST_ID="{plan.get('request_id')}"
PORTAL_ALLOCATION_MODE="{plan.get('allocation_mode', 'distributed')}"
PORTAL_NTASKS="{ntasks}"
PORTAL_CPUS_PER_TASK="{cpus_per_task}"
PORTAL_ALLOCATED_CPUS="{allocated_cpu}"
PORTAL_MEM_PER_CPU_MB="{mem_per_cpu}"
PORTAL_ALLOCATED_MEMORY_MB="{allocated_memory_mb}"
PORTAL_ALLOCATED_MEMORY_GB="{max(1, int(math.ceil(allocated_memory_mb / 1024)))}"
PORTAL_EXPECTED_NODE_COUNT="{plan.get('expected_node_count') or 1}"
export PROJECT_ROOT
export VENV
export PORTAL_REQUEST_ID
export PORTAL_ALLOCATION_MODE
export PORTAL_NTASKS
export PORTAL_CPUS_PER_TASK
export PORTAL_ALLOCATED_CPUS
export PORTAL_MEM_PER_CPU_MB
export PORTAL_ALLOCATED_MEMORY_MB
export PORTAL_ALLOCATED_MEMORY_GB
export PORTAL_EXPECTED_NODE_COUNT
export HOME="{user_root}"
export PATH="$VENV/bin:{SLURM_PATH}:/usr/local/bin:/usr/bin:/bin"
export PYTHONNOUSERSITE=1

cat > "$PROJECT_ROOT/.portal_resource_allocation.json" <<RESOURCE_JSON
{{
  "request_id": "$PORTAL_REQUEST_ID",
  "job_id": "${{SLURM_JOB_ID:-pending}}",
  "allocation_mode": "$PORTAL_ALLOCATION_MODE",
  "ntasks": {ntasks},
  "cpus_per_task": {cpus_per_task},
  "allocated_cpus": {allocated_cpu},
  "memory_per_cpu_mb": {mem_per_cpu},
  "allocated_memory_mb": {allocated_memory_mb},
  "allocated_memory_gb": {max(1, int(math.ceil(allocated_memory_mb / 1024)))},
  "slurm_job_cpus_per_node": "${{SLURM_JOB_CPUS_PER_NODE:-unknown}}",
  "slurm_job_node_list": "${{SLURM_JOB_NODELIST:-unknown}}"
}}
RESOURCE_JSON
if [ -n "${{SLURM_JOB_ID:-}}" ]; then
    cp "$PROJECT_ROOT/.portal_resource_allocation.json" "{logs_dir}/resource_${{SLURM_JOB_ID}}.json" || true
fi

echo "[VERIFY] Slurm job id: ${{SLURM_JOB_ID:-unknown}}"
echo "[VERIFY] Slurm node list: ${{SLURM_JOB_NODELIST:-unknown}}"
echo "[VERIFY] Slurm CPUs per task: ${{SLURM_CPUS_PER_TASK:-{cpus_per_task}}}"
echo "[VERIFY] Slurm CPUs per node: ${{SLURM_JOB_CPUS_PER_NODE:-unknown}}"
echo "[VERIFY] Portal resource contract: $PROJECT_ROOT/.portal_resource_allocation.json"
if [ -r /proc/self/status ]; then
    grep -E 'Cpus_allowed_list|Mems_allowed_list' /proc/self/status | sed 's/^/[VERIFY] /' || true
fi
if [ -r /sys/fs/cgroup/memory.max ]; then
    echo "[VERIFY] cgroup memory.max: $(cat /sys/fs/cgroup/memory.max)"
elif [ -r /sys/fs/cgroup/memory/memory.limit_in_bytes ]; then
    echo "[VERIFY] cgroup memory.limit_in_bytes: $(cat /sys/fs/cgroup/memory/memory.limit_in_bytes)"
fi

cd "$PROJECT_ROOT"
if [ ! -d "$VENV" ]; then
    echo "[INFO] Creating virtual environment..."
    python3 -m venv "$VENV"
fi
source "$VENV/bin/activate"
"$VENV/bin/pip" install --quiet --upgrade pip
{install_cmd}
echo "[INFO] Execution starting..."
{execution_cmd}
echo "[INFO] Job completed."
"""

    generated_dir = os.path.join(logs_dir, "generated")
    os.makedirs(generated_dir, exist_ok=True)
    _chown_path_to_user(generated_dir, job.username)
    path = os.path.join(generated_dir, f"{plan.get('request_id')}.sbatch")
    with open(path, "w") as f:
        f.write(script)
    _chown_path_to_user(path, job.username)
    os.chmod(path, 0o755)

    audit_log_path = os.path.join(generated_dir, f"{plan.get('request_id')}.json")
    with open(audit_log_path, "w") as f:
        json.dump({
            "request": {
                "username": job.username,
                "project_name": job.project_name,
                "entry_point": job.entry_point,
                "total_cpu": getattr(job, "total_cpu", None),
                "total_ram": getattr(job, "total_ram", None),
                "time": getattr(job, "time", None),
                "command": getattr(job, "command", None),
                "command_args": getattr(job, "command_args", None),
                "job_type": getattr(job, "job_type", None),
                "partition": getattr(job, "partition", None),
            },
            "optimized_plan": plan,
            "sbatch_script": script,
        }, f, indent=2, default=str)
    _chown_path_to_user(audit_log_path, job.username)
    os.chmod(audit_log_path, 0o644)

    try:
        jwt = get_slurm_jwt()
        if not jwt:
            print(f"[SLURM-CLI] Falling back to sbatch for {job.username}; JWT unavailable.")
            slurm_job_id = _submit_script_with_sbatch(job.username, path, project_root)
            submission_transport = "sbatch-cli"
        else:
            # Convert walltime "HH:MM:SS" to total minutes for REST API
            try:
                parts = walltime.split(':')
                if len(parts) == 3:
                    total_minutes = int(parts[0]) * 60 + int(parts[1])
                else:
                    total_minutes = int(parts[0])
            except:
                total_minutes = 60 # Fallback 1 hour

            # Slurm v0.0.41/44 Expectations:
            # 1. Environment MUST be a list of "KEY=VALUE" strings, not a dictionary.
            # 2. 'user_name' is often ignored; identity is handled by headers.
            job_descriptor = {
                "name": job.project_name,
                "current_working_directory": f"{DATA_ROOT}/{job.username}",
                "standard_output": f"{logs_dir}/{job.username}_%j.out",
                "standard_error": f"{logs_dir}/{job.username}_%j.err",
                "tasks": int(ntasks),
                "cpus_per_task": int(cpus_per_task),
                "partition": partition,
                "time_limit": total_minutes,
                "environment": [
                    f"HOME={DATA_ROOT}/{job.username}",
                    f"USER={job.username}",
                    "PATH=/usr/local/bin:/usr/bin:/bin"
                ]
            }
            if not partition:
                job_descriptor.pop("partition", None)

            job_descriptor["memory_per_cpu"] = int(mem_per_cpu)

            expected_node_count = plan.get("expected_node_count")
            eligible_nodes = plan.get("cluster_snapshot", {}).get("eligible_nodes", 0)
            if expected_node_count:
                job_descriptor["nodes"] = [int(expected_node_count), max(int(expected_node_count), int(eligible_nodes or expected_node_count))]

            if gpu_count > 0:
                job_descriptor["gres"] = f"gpu:{gpu_count}"

            payload = {
                "job": job_descriptor,
                "script": script
            }

            # In v0.0.41+, you submit through the JWT user in the header.
            # CLI fallback submits as the target Linux user instead.
            url = f"{SLURM_REST_URL}/job/submit"
            headers = {
                "X-SLURM-USER-NAME": SLURM_JWT_USER,
                "X-SLURM-USER-TOKEN": jwt,
                "Content-Type": "application/json"
            }

            print(f"[SLURM-REST] Submitting job for {job.username}...")
            res = requests.post(url, json=payload, headers=headers, timeout=10)

            if res.status_code >= 400:
                 print(f"[SLURM-REST] ERROR BODY: {res.text}")
                 if res.status_code == 404 and "v0.0.41" not in url:
                      f_url = url.replace("v0.0.44", "v0.0.41")
                      res = requests.post(f_url, json=payload, headers=headers, timeout=10)
                      if res.status_code >= 400:
                          print(f"[SLURM-REST] FALLBACK ERROR BODY: {res.text}")

            if res.status_code in {401, 403}:
                print(f"[SLURM-CLI] Falling back to sbatch for {job.username} after REST {res.status_code}.")
                slurm_job_id = _submit_script_with_sbatch(job.username, path, project_root)
                submission_transport = "sbatch-cli"
            else:
                res.raise_for_status()
                res_json = res.json()
                slurm_job_id = res_json.get("job_id")
                if not slurm_job_id:
                     errors = res_json.get("errors", [])
                     raise Exception(f"Slurm rejected submission: {errors}")
                submission_transport = "slurm-rest"
        
        slurm_job_id = str(slurm_job_id)
        print(f"[SLURM] Success. Job ID: {slurm_job_id}")
        
        # 6. Persistent Logging
        from app.models import insert_job_log
        if replace_id:
            # Atomic Promotion: Replace the local ID with the real Slurm ID
            print(f"[SLURM-REST] Promoting local {replace_id} to Slurm {slurm_job_id}")
            try:
                from app.database import get_db
                db = get_db()
                cur = db.cursor()
                # Update the main log entry
                cur.execute("""
                    UPDATE job_logs SET 
                        job_id = %s, status = 'PENDING', 
                        ntasks = %s, cpus_per_task = %s, 
                        gpu_count = %s, warnings = %s,
                        optimized_script = %s, planner_explanation = %s,
                        node_distribution = %s, audit_log_path = %s
                    WHERE job_id = %s
                """, (
                    slurm_job_id, plan["ntasks"], plan["cpus_per_task"], 
                    plan["gpu_count"], ", ".join(plan["warnings"]), script,
                    "\n".join(plan.get("explanations", [])),
                    json.dumps(plan.get("node_distribution", []), default=str),
                    audit_log_path, replace_id
                ))
                db.commit()
                cur.close()
                db.close()
            except Exception as e:
                print(f"[ERROR] Promotion DB update failed: {e}")
                # Fallback: if update failed, just insert (most likely because replace_id didn't exist)
                insert_job_log(slurm_job_id, job, plan)
        else:
            insert_job_log(slurm_job_id, job, plan)
        
        # Update quota metadata
        try:
            from app.database import get_db
            db = get_db()
            cur = db.cursor()
            cur.execute("""
                UPDATE job_logs
                SET quota_status=%s, optimized_script=%s, planner_explanation=%s,
                    node_distribution=%s, audit_log_path=%s
                WHERE job_id=%s
            """, (
                quota_status, script, "\n".join(plan.get("explanations", [])),
                json.dumps(plan.get("node_distribution", []), default=str),
                audit_log_path, slurm_job_id
            ))
            db.commit()
            cur.close()
            db.close()
        except: pass

        # Track Jupyter runtime for access URL generation
        if is_jupyter and jupyter_port:
            try:
                from app.database import get_db
                db = get_db()
                cur = db.cursor()
                if replace_id:
                    # Update existing runtime entry
                    cur.execute("""
                        UPDATE job_runtime 
                        SET job_id = %s, slurm_job_id = %s, status = 'PENDING'
                        WHERE job_id = %s
                    """, (slurm_job_id, slurm_job_id, replace_id))
                else:
                    cur.execute("""
                        INSERT INTO job_runtime (job_id, slurm_job_id, username, port, token, job_type, status)
                        VALUES (%s, %s, %s, %s, %s, %s, 'PENDING')
                    """, (slurm_job_id, slurm_job_id, job.username, jupyter_port, jupyter_token, plan['job_type']))
                db.commit()
                cur.close()
                db.close()
            except Exception as e:
                print(f"[ERROR] Runtime tracking update failed: {e}")

        orchestration_meta = {
            "plan": plan,
            "optimized_sbatch_script": script,
            "explanation": plan.get("explanations", []),
            "expected_node_distribution": plan.get("node_distribution", []),
            "allocation": {
                "ntasks": ntasks,
                "cpus_per_task": cpus_per_task,
                "mem_per_cpu_mb": mem_per_cpu,
                "allocation_mode": plan.get("allocation_mode"),
                "expected_node_count": plan.get("expected_node_count"),
                "partition": partition,
            },
            "audit_log_path": audit_log_path,
            "generated_script_path": path,
            "submission_transport": submission_transport,
        }
        return slurm_job_id, warnings, quota_meta, jupyter_port, jupyter_token, orchestration_meta
    except Exception as e:
        raise Exception(f"Slurm submission failed: {str(e)}")
