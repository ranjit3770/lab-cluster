from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class DevNodeBase(BaseModel):
    name: str
    ip_address: str
    ssh_port: int = 22
    ssh_username: str
    ssh_password: Optional[str] = None
    os_family: Optional[str] = "auto"

class DevNodeCreate(DevNodeBase):
    pass

class DevNodeUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    ssh_port: Optional[int] = None
    ssh_username: Optional[str] = None
    ssh_password: Optional[str] = None
    os_family: Optional[str] = None

class DevNode(DevNodeBase):
    id: int
    created_at: datetime
    detected_os_family: Optional[str] = None
    effective_os_family: Optional[str] = None
    detection_source: Optional[str] = None
    detected_access_label: Optional[str] = None
    detected_access_port: Optional[int] = None
    detected_reachable: Optional[bool] = None
    slurmd_status: Optional[str] = None
    uptime: Optional[str] = None
    uptime_seconds: Optional[float] = None
    auto_discovered: Optional[bool] = False

    class Config:
        from_attributes = True

class DevNodeBulkCreate(BaseModel):
    nodes: List[DevNodeCreate]
    test_connections: bool = False

class DevNodeBulkResult(BaseModel):
    created: List[DevNode] = []
    skipped: List[str] = []
    failed: List[str] = []

class SSHTestRequest(BaseModel):
    ip_address: str
    port: int = 22
    username: str
    password: Optional[str] = None

class SSHTestResponse(BaseModel):
    success: bool
    message: str
