import subprocess
import tempfile
import os
from app.planner import plan_resources
from app.config import DATA_ROOT

def submit_job(job):
    plan = plan_resources(job.total_cpu, job.total_ram, job.resource_mode)

    user_root = f"{DATA_ROOT}/{job.username}"
    logs_dir = f"{user_root}/slurm_logs"
    venv_path = f"{user_root}/venv"

    # Resolve entry point (relative to user root)
    # e.g. "testing_script/main.py" -> /data_storage/test/testing_script/main.py


    entry_file_point = user_root + "/" + job.entry_point
    print("Entry file point: ", entry_file_point)
    print("Entry file: ", os.path.exists(entry_file_point))
    # entry_file = os.path.join(user_root, job.entry_point)
    
    if not os.path.exists(entry_file_point):
        raise FileNotFoundError(f"Entry point '{job.entry_point}' not found at {entry_file_point}")
    
    # Project root is the directory containing the script
    project_root = os.path.dirname(entry_file_point)
    print("Project root: ", project_root)
    print("Project root exists: ", os.path.exists(project_root))
    # Ensure logs dir exists (project dir must already exist)
    os.makedirs(logs_dir, exist_ok=True)

    cmd_args = job.command_args or ""

    # Resource flags
    if plan["type"] == "random":
        resource_flags = f"""
#SBATCH --ntasks={plan['ntasks']}
#SBATCH --cpus-per-task=1
#SBATCH --mem={plan['mem']}G
"""
    else:
        nodes = len(plan["nodes"])
        cpu = plan["nodes"][0][1]
        mem = plan["nodes"][0][2]
        resource_flags = f"""
#SBATCH --nodes={nodes}
#SBATCH --ntasks-per-node=1
#SBATCH --cpus-per-task={cpu}
#SBATCH --mem={mem}G
"""

    # Optional requirements install
    # Dependency installation
    # Default to requirements.txt in the same folder as the script if not specified
    req_filename = job.requirements_path if job.requirements_path else "requirements.txt"
    req_file_path = os.path.join(project_root, req_filename)

    if os.path.exists(req_file_path):
        # Only install if explicitly requested OR if the default file actually exists
        if job.requirements_path or os.path.exists(req_file_path):
             install_cmd = f"echo '[SYSTEM LOG] Installing dependencies...'; $VENV/bin/pip install --quiet -r {req_file_path}"
    else:
        if job.requirements_path:
             install_cmd = f"echo '[SYSTEM LOG] Warning: Requirements file {job.requirements_path} not found in {project_root}'"
        else:
             install_cmd = "echo '[SYSTEM LOG] No requirements file provided'"

    # SBATCH script
    script = f"""#!/bin/bash
#SBATCH --job-name={job.project_name}
#SBATCH --time={job.time}
#SBATCH --output={logs_dir}/{job.username}_%j.out
#SBATCH --error={logs_dir}/{job.username}_%j.err
#SBATCH --export=NONE
{resource_flags}

set -euo pipefail

PROJECT_ROOT="{project_root}"
VENV="{venv_path}"

mkdir -p "$PROJECT_ROOT"
cd "$PROJECT_ROOT"

# Create user venv if missing
if [ ! -d "$VENV" ]; then
    python3 -m venv "$VENV"
fi

# Activate ONLY user venv
source "$VENV/bin/activate"

# Upgrade pip safely inside venv
"$VENV/bin/pip" install --quiet --upgrade pip

# Install deps if provided
{install_cmd}

# Run job inside venv
"$VENV/bin/python" {job.entry_point} {cmd_args}
"""

    with tempfile.NamedTemporaryFile("w", delete=False) as f:
        f.write(script)
        path = f.name
    
    output = subprocess.check_output(["sbatch", path]).decode()
    return output.strip().split()[-1]
