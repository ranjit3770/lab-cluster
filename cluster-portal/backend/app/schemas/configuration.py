from pydantic import BaseModel
from typing import Optional

class SystemConfiguration(BaseModel):
    slurm_rest_url: Optional[str] = None
    slurm_node_api: Optional[str] = None
    slurm_version: Optional[str] = None
    slurm_user: Optional[str] = None
    external_job_api_url: Optional[str] = None
    cluster_name: Optional[str] = None
    cluster_description: Optional[str] = None
    session_timeout_seconds: Optional[int] = None
    sync_interval_ms: Optional[int] = None
    max_batch_jobs_per_user: Optional[int] = None
    max_jupyter_jobs_per_user: Optional[int] = None
    identity_provider: Optional[str] = None
    mfa_enabled: Optional[bool] = None
