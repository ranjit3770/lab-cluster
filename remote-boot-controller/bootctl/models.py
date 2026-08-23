from dataclasses import dataclass, field
from typing import Optional


@dataclass
class CommandResult:
    command: str
    stdout: str
    stderr: str
    return_code: int

    @property
    def success(self) -> bool:
        return self.return_code == 0


@dataclass
class BootEntry:
    identifier: str
    description: str
    device: Optional[str] = None
    path: Optional[str] = None
    raw: str = ""


@dataclass
class BootState:
    firmware_manager: str = ""
    firmware_display_order: list[str] = field(default_factory=list)
    firmware_entries: list[BootEntry] = field(default_factory=list)
    boot_manager_default: Optional[str] = None
    raw_output: str = ""
