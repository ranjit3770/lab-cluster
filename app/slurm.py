import subprocess
import tempfile
from app.planner import plan_resources
from app.config import DATA_ROOT

def submit_job(job):
    plan = plan_resources(job.total_cpu, job.total_ram, job.resource_mode)

    user_root = f"{DATA_ROOT}/{job.username}"
    project_root = f"{user_root}/projects/{job.project_name}"
    logs_dir = f"{user_root}/slurm_logs"
    venv_path = f"{user_root}/venv"

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
    install_cmd = (
        f"$VENV/bin/pip install --quiet -r {job.requirements_path}"
        if job.requirements_path else
        "echo 'No requirements file provided'"
    )

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

    print(f"DEBUG: logs_dir is {logs_dir}")
    print(f"DEBUG: Generated script:\n{script}")

    with tempfile.NamedTemporaryFile("w", delete=False) as f:
        f.write(script)
        path = f.name
    
    print(f"DEBUG: Script written to {path}")

    output = subprocess.check_output(["sbatch", path]).decode()
    return output.strip().split()[-1]
