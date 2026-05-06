from pydantic import BaseModel
from typing import Any, Optional, Union

class JobRequest(BaseModel):
    username: str
    project_name: str = "smart-job"
    entry_point: str = ""
    total_cpu: int
    total_ram: Union[int, str]
    resource_mode: str = "node_wise"  # Kept for backward compat, internally ignored
    time: str = "01:00:00"
    command: Optional[str] = None
    command_args: Optional[str] = None
    requirements_path: Optional[str] = None
    
    # Slurm-native fields (all optional, backend auto-derives if missing)
    ntasks: Optional[int] = None
    cpus_per_task: Optional[int] = None
    job_type: Optional[str] = None  # multithread | mpi | single_node | gpu
    partition: Optional[str] = None
    gpu_count: Optional[int] = 0
    mem_per_cpu: Optional[int] = None
    constraint: Optional[str] = None

class JobResponse(BaseModel):
    job_id: Optional[str] = None
    status: str
    warnings: Optional[list[str]] = None
    used_cpu: Optional[int] = None
    used_ram_gb: Optional[float] = None
    total_cpu_quota: Optional[int] = None
    total_ram_quota_gb: Optional[int] = None
    jupyter_port: Optional[int] = None
    jupyter_token: Optional[str] = None
    optimized_sbatch_script: Optional[str] = None
    explanation: Optional[list[str]] = None
    expected_node_distribution: Optional[list[dict[str, Any]]] = None
    allocation: Optional[dict[str, Any]] = None
    audit_log_path: Optional[str] = None
    submission_transport: Optional[str] = None
