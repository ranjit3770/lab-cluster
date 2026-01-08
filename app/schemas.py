from pydantic import BaseModel
from typing import Optional

class JobRequest(BaseModel):
    username: str
    project_name: str
    entry_point: str
    total_cpu: int
    total_ram: int
    resource_mode: str      # random | node_wise
    time: str
    command_args: Optional[str] = None
    requirements_path: Optional[str] = None

