from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ClusterStatusSchema(BaseModel):
    slurmctld_status: str = "unknown"
    slurmdbd_status: str = "unknown"
    cluster_status: str = "unknown"
    last_heartbeat: Optional[datetime] = None

class ResourcesSchema(BaseModel):
    cpu_total: int = 0
    memory_total_mb: int = 0
    cpu_allocated: int = 0
    memory_allocated_mb: int = 0
    node_count: int = 0
    active_nodes: int = 0
    gpu_total: int = 0

class UtilizationSchema(BaseModel):
    cpu_used_percent: float = 0.0
    memory_used_percent: float = 0.0
    gpu_used_percent: float = 0.0

class JobStatsSchema(BaseModel):
    running: int = 0
    pending: int = 0
    completed: int = 0
    failed: int = 0
    cancelled: int = 0
    total: int = 0
    today_count: int = 0

class UserStatsSchema(BaseModel):
    total_users: int = 0

class RequestStatsSchema(BaseModel):
    pending_requests: int = 0

class DashboardStats(BaseModel):
    cluster_status: ClusterStatusSchema
    resources: ResourcesSchema
    utilization: UtilizationSchema
    jobs: JobStatsSchema
    users: UserStatsSchema
    requests: RequestStatsSchema
    maintenance_active: bool = False
