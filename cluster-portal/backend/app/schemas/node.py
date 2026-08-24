from typing import Optional
from pydantic import BaseModel
from datetime import datetime

class NodeBase(BaseModel):
    name: str
    ip_address: Optional[str] = None
    status: str = "idle"
    cpu_info: Optional[str] = None
    memory_info: Optional[str] = None
    gpu_info: Optional[str] = None
    operating_system: Optional[str] = None
    cpu_total: int = 0
    cpu_used: int = 0
    cores_total: int = 0
    sockets: int = 0
    threads_per_core: int = 0
    memory_total_mb: int = 0
    memory_used_mb: int = 0
    gpu_total: int = 0
    gpu_used: int = 0
    cpu_load: int = 0
    free_memory_mb: int = 0
    slurm_version: Optional[str] = None
    dev_node_id: Optional[int] = None

class NodeCreate(NodeBase):
    pass

class NodeUpdate(NodeBase):
    name: Optional[str] = None

class NodeInDBBase(NodeBase):
    id: int
    last_updated: datetime

    class Config:
        from_attributes = True

class Node(NodeInDBBase):
    pass
