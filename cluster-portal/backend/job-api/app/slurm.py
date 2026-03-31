import subprocess
import tempfile
import os
import mysql.connector
from app.planner import plan_resources
from app.config import DATA_ROOT, MYSQL_CONFIG

def get_db_limit(username):
    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cursor = conn.cursor(dictionary=True)
        # We need to query the Main Portal DB
        cursor.execute("SELECT cpu_limit, memory_limit_gb, role FROM strach_portal.users WHERE username = %s", (username,))
        row = cursor.fetchone()
        conn.close()
        return row
    except Exception as e:
        print(f"[QUOTA LOG] DB Error fetching limits for {username}: {e}")
        return None

def get_slurm_usage(username):
    try:
        # Get live usage from squeue
        # Format: %C (CPUs), %m (Memory in MB)
        output = subprocess.check_output([
            "squeue", "-u", username, "--noheader", "--format=%C %m"
        ]).decode()
        
        total_cpu = 0
        total_ram_mb = 0
        
        for line in output.strip().split('\n'):
            if not line.strip(): continue
            parts = line.split()
            if len(parts) >= 2:
                total_cpu += int(parts[0])
                # Slurm memory might be '100M' or '2G'. We simplify for now if it's pure number
                # Usually --format=%m returns just numbers in MB if suffix is absent or handled
                ram_str = parts[1].rstrip('M').rstrip('G')
                try:
                    val = int(ram_str)
                    if 'G' in parts[1]: val *= 1024
                    total_ram_mb += val
                except:
                    pass
        
        return total_cpu, total_ram_mb / 1024.0 # Convert to GB
    except Exception as e:
        print(f"[QUOTA LOG] Slurm Error fetching usage for {username}: {e}")
        return 0, 0

def submit_job(job):
    # STRICT QUOTA CHECK
    limits = get_db_limit(job.username)
    if limits and limits['role'] not in ['admin', 'developer']:
        live_cpu, live_ram = get_slurm_usage(job.username)
        requested_cpu = job.total_cpu or 1
        requested_ram = job.total_ram or 1
        
        cpu_limit = limits['cpu_limit'] or 1
        ram_limit = limits['memory_limit_gb'] or 1
        
        if (live_cpu + requested_cpu) > cpu_limit:
            raise Exception(f"Strict Quota Violation: Active Slurm Usage ({live_cpu}) + Request ({requested_cpu}) exceeds your limit ({cpu_limit})")
        
        if (live_ram + requested_ram) > ram_limit:
            raise Exception(f"Strict Quota Violation: Active Slurm Usage ({live_ram:.1f}GB) + Request ({requested_ram}GB) exceeds your limit ({ram_limit}GB)")

    plan = plan_resources(job.total_cpu, job.total_ram, job.resource_mode)
    # FIX: Removed duplicate plan_resources() call that was here.
    # The old code called plan_resources() twice per submission,
    # making two identical Slurm REST API requests unnecessarily.

    user_root = f"{DATA_ROOT}/{job.username}"
    logs_dir = f"{user_root}/slurm_logs"
    venv_path = f"{user_root}/venv"

    # Handle Specialized Jupyter Workloads
    if job.entry_point == "__jupyter__":
        is_jupyter = True
        entry_script = "jupyter-lab" 
        project_root = user_root
    else:
        is_jupyter = False
        entry_file_point = user_root + "/" + job.entry_point
        if not os.path.exists(entry_file_point):
            raise FileNotFoundError(f"Entry point '{job.entry_point}' not found at {entry_file_point}")
        project_root = os.path.dirname(entry_file_point)
        entry_script = os.path.basename(job.entry_point)

    # Ensure logs dir exists and user owns their workspace
    os.makedirs(logs_dir, exist_ok=True)
    try:
        # Portal runs as root or via sudo, ensure user can access/write their own telemetry/storage
        import subprocess as sp
        sp.run(["chown", "-R", f"{job.username}:{job.username}", user_root], check=False)
    except Exception as e:
        print(f"[SECURITY LOG] Permission synchronization failure for @{job.username}: {e}")

    cmd_args = job.command_args or ""

    # Resource flags — unified task-based model
    # FIX: Previously, 'node_wise' mode used only the first node's CPU/RAM
    # values from a multi-node allocation list. For example, if planner returned
    # [(worker1, 4cpu, 8GB), (worker2, 2cpu, 4GB)] for a 6-CPU request,
    # SBATCH would get --cpus-per-task=4 --mem=8G — silently wrong.
    #
    # Now both modes return a consistent shape dict from the planner:
    #   {"ntasks": N, "cpus_per_task": 1, "mem": M}
    # This produces correct SBATCH flags and lets Slurm handle placement.
    resource_flags = f"""
#SBATCH --ntasks={plan['ntasks']}
#SBATCH --cpus-per-task={plan['cpus_per_task']}
#SBATCH --mem={plan['mem']}G
"""

    # Dependency installation
    if job.requirements_path:
        req_file_path = os.path.join(project_root, job.requirements_path)
        if os.path.exists(req_file_path):
            install_cmd = f"""
echo "[SYSTEM LOG] Installing dependencies from {req_file_path}"
"$VENV/bin/pip" install -r "{req_file_path}"
"""
        else:
            install_cmd = f"echo '[SYSTEM LOG] ERROR: Requirements file {req_file_path} not found'; exit 1"
    else:
        install_cmd = "echo '[SYSTEM LOG] No requirements file; skipping dependency installation'"

    # Execution Command
    if is_jupyter:
        execution_cmd = f"""
echo "[SYSTEM LOG] Initializing Jupyter Lab Protocol..."
"$VENV/bin/pip" install --quiet jupyterlab

NODE_IP=$(hostname -I | awk '{{print $1}}')
FREE_PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("", 0)); print(s.getsockname()[1]); s.close()')

echo "------------------------------------------------------------"
echo "JUPYTER ACCESS URL:"
echo "http://$NODE_IP:$FREE_PORT/lab"
echo "------------------------------------------------------------"

"$VENV/bin/jupyter" lab --ip=0.0.0.0 --port=$FREE_PORT --no-browser --NotebookApp.token='' --NotebookApp.password=''
"""
    else:
        execution_cmd = f'"$VENV/bin/python" "{entry_script}" {cmd_args}'

    # SBATCH script
    script = f"""#!/bin/bash
#SBATCH --job-name={job.project_name}
#SBATCH --time={job.time}
#SBATCH --output={logs_dir}/{job.username}_%j.out
#SBATCH --error={logs_dir}/{job.username}_%j.err
#SBATCH --export=NONE
#SBATCH --uid={job.username}
{resource_flags}

set -euo pipefail

PROJECT_ROOT="{project_root}"
VENV="{venv_path}"

mkdir -p "$PROJECT_ROOT"
cd "$PROJECT_ROOT"

if [ ! -d "$VENV" ]; then
    python3 -m venv "$VENV"
fi

source "$VENV/bin/activate"
"$VENV/bin/pip" install --quiet --upgrade pip

{install_cmd}
{execution_cmd}
"""

    with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False) as f:
        f.write(script)
        path = f.name

    # Use -D /tmp to avoid "couldn't chdir to /app" on host nodes
    output = subprocess.check_output(["sbatch", "-D", "/tmp", path]).decode()
    return output.strip().split()[-1]
