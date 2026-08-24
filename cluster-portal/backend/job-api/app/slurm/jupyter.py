"""Jupyter/interactive session helpers."""
import secrets
import socket
import subprocess

from app.slurm.env import get_slurm_env


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
