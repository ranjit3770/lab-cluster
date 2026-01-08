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
    entry_file = os.path.join(user_root, job.entry_point)
    
    if not os.path.exists(entry_file):
        raise FileNotFoundError(f"Entry point '{job.entry_point}' not found at {entry_file}")
    
    # Project root is the directory containing the script
    project_root = os.path.dirname(entry_file)

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
    # Determine where dependencies are located
    if job.dependency_path:
        dep_root = f"{user_root}/{job.dependency_path}"
        # If requirements file is listed, verify it exists
        if job.requirements_path:
            req_file = os.path.join(dep_root, job.requirements_path)
            if os.path.exists(req_file):
                install_cmd = f"$VENV/bin/pip install --quiet -r {req_file}"
            else:
                install_cmd = f"echo 'Warning: Requirements file {job.requirements_path} not found in {dep_root}'"
        else:
            install_cmd = "echo 'No requirements file specified'"
    else:
         # Fallback to project root or skip (legacy behavior)
        if job.requirements_path:
             # Assume relative to project root if no dependency_path given?
             # For now, let's assume if they give a path, it's absolute or relative to job execution.
             # But without dependency_path, we'll keep the old behavior (or simple echo)
             install_cmd = f"$VENV/bin/pip install --quiet -r {job.requirements_path}"
        else:
            install_cmd = "echo 'No requirements file provided'"

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
