"""Slurm CLI environment and JWT acquisition."""
import os
import subprocess

from app.config import SLURM_PATH, SLURM_LIB_PATH, SLURM_JWT_USER, SLURM_JWT_TOKEN

# Slurm Environment Config
EXCLUDE_NODES = os.getenv("SLURM_EXCLUDE_NODES", "head-node")


def _slurm_bin(name):
    for directory in SLURM_PATH.split(":"):
        candidate = os.path.join(directory, name)
        if os.path.exists(candidate):
            return candidate
    for candidate in (f"/usr/local/slurm/bin/{name}", f"/usr/local/bin/{name}", f"/usr/bin/{name}", f"/bin/{name}"):
        if os.path.exists(candidate):
            return candidate
    return name


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
