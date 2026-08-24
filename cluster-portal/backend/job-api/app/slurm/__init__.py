"""Slurm integration package.

Public API is re-exported here so existing call sites keep working:

    from app.slurm import submit_job, get_slurm_env, get_slurm_jwt, ...
"""

from app.config import SLURM_JWT_USER, SLURM_REST_URL
from app.slurm.env import EXCLUDE_NODES, _slurm_bin, get_slurm_env, get_slurm_jwt
from app.slurm.jupyter import _find_free_port, _generate_jupyter_token, _get_job_node
from app.slurm.parsers import (
    _parse_slurm_memory_to_gb,
    _seconds_to_walltime,
    _to_int,
    _walltime_to_seconds,
)
from app.slurm.quota import (
    _get_slurm_usage_cli,
    get_db_limit,
    get_user_quota,
    get_slurm_usage,
)
from app.slurm.submit import submit_job

__all__ = [
    "EXCLUDE_NODES",
    "SLURM_JWT_USER",
    "SLURM_REST_URL",
    "submit_job",
    "get_slurm_env",
    "get_slurm_jwt",
    "get_db_limit",
    "get_user_quota",
    "get_slurm_usage",
]
