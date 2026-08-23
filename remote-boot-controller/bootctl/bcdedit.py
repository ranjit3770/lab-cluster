import re

from .models import BootEntry, BootState
from .winrm_client import WinRMClient


GUID_PATTERN = re.compile(
    r"\{[0-9a-fA-F-]{36}\}"
)


class BCDManager:

    def __init__(self, client: WinRMClient):
        self.client = client

    def enum_firmware(self) -> str:

        result = self.client.run_cmd(
            "bcdedit.exe",
            ["/enum", "firmware", "/v"],
        )

        if not result.success:
            raise RuntimeError(
                f"bcdedit failed:\n{result.stderr}"
            )

        return result.stdout

    def enum_all(self) -> str:

        result = self.client.run_cmd(
            "bcdedit.exe",
            ["/enum", "all", "/v"],
        )

        if not result.success:
            raise RuntimeError(
                f"bcdedit failed:\n{result.stderr}"
            )

        return result.stdout

    def get_current_state(self) -> BootState:

        output = self.enum_firmware()

        state = BootState(
            raw_output=output,
        )

        self._parse_firmware_output(
            output,
            state,
        )

        return state

    def _parse_firmware_output(
        self,
        output: str,
        state: BootState,
    ):

        current_entry = None

        for line in output.splitlines():

            line = line.rstrip()

            if not line:
                continue

            identifier_match = re.match(
                r"\s*identifier\s+(.+)",
                line,
                re.IGNORECASE,
            )

            if identifier_match:

                identifier = (
                    identifier_match.group(1)
                    .strip()
                )

                current_entry = BootEntry(
                    identifier=identifier,
                    description="",
                )

                state.firmware_entries.append(
                    current_entry
                )

                continue

            if current_entry is None:
                continue

            description_match = re.match(
                r"\s*description\s+(.+)",
                line,
                re.IGNORECASE,
            )

            if description_match:

                current_entry.description = (
                    description_match
                    .group(1)
                    .strip()
                )

                continue

            device_match = re.match(
                r"\s*device\s+(.+)",
                line,
                re.IGNORECASE,
            )

            if device_match:

                current_entry.device = (
                    device_match
                    .group(1)
                    .strip()
                )

                continue

            path_match = re.match(
                r"\s*path\s+(.+)",
                line,
                re.IGNORECASE,
            )

            if path_match:

                current_entry.path = (
                    path_match
                    .group(1)
                    .strip()
                )

                continue

        self._extract_display_order(
            output,
            state,
        )

    def _extract_display_order(
        self,
        output: str,
        state: BootState,
    ):

        lines = output.splitlines()

        in_firmware_manager = False
        in_display_order = False

        for line in lines:

            stripped = line.strip()

            if stripped.lower() == "firmware boot manager":
                in_firmware_manager = True
                continue

            if not in_firmware_manager:
                continue

            if (
                stripped.lower() == "windows boot manager"
                or stripped.lower().startswith(
                    "firmware application"
                )
            ):
                break

            if not stripped:
                in_display_order = False
                continue

            if stripped.lower().startswith(
                "displayorder"
            ):
                in_display_order = True

                matches = GUID_PATTERN.findall(
                    stripped
                )

                state.firmware_display_order.extend(
                    matches
                )

                continue

            if in_display_order:

                matches = GUID_PATTERN.findall(
                    stripped
                )

                for guid in matches:
                    state.firmware_display_order.append(
                        guid
                    )

                continue

    def find_ubuntu_entry(self) -> BootEntry | None:

        output = self.enum_firmware()

        entries = self._parse_entries(output)

        # Prefer an exact Ubuntu firmware application.
        for entry in entries:

            if (
                entry.description.strip().lower()
                == "ubuntu"
            ):
                return entry

        # Fallback: detect Ubuntu EFI loader.
        for entry in entries:

            description = (
                entry.description or ""
            ).strip().lower()

            # Do not mistake Windows Boot Manager
            # for Ubuntu just because its path points
            # to Ubuntu's shim.
            if (
                "windows boot manager"
                in description
            ):
                continue

            path = (
                entry.path or ""
            ).lower()

            if (
                r"\efi\ubuntu\shimx64.efi"
                in path
                or
                r"\efi\ubuntu\grubx64.efi"
                in path
            ):
                return entry

        return None

    def _parse_entries(
        self,
        output: str,
    ) -> list[BootEntry]:

        entries = []

        blocks = re.split(
            r"\r?\n\s*\r?\n",
            output,
        )

        for block in blocks:

            identifier_match = re.search(
                r"identifier\s+(.+)",
                block,
                re.IGNORECASE,
            )

            if not identifier_match:
                continue

            identifier = (
                identifier_match
                .group(1)
                .strip()
            )

            description_match = re.search(
                r"description\s+(.+)",
                block,
                re.IGNORECASE,
            )

            path_match = re.search(
                r"path\s+(.+)",
                block,
                re.IGNORECASE,
            )

            device_match = re.search(
                r"device\s+(.+)",
                block,
                re.IGNORECASE,
            )

            entries.append(
                BootEntry(
                    identifier=identifier,
                    description=(
                        description_match.group(1).strip()
                        if description_match
                        else ""
                    ),
                    path=(
                        path_match.group(1).strip()
                        if path_match
                        else None
                    ),
                    device=(
                        device_match.group(1).strip()
                        if device_match
                        else None
                    ),
                    raw=block,
                )
            )

        return entries

    def set_boot_order_first(
        self,
        guid: str,
    ) -> bool:

        result = self.client.run_cmd(
            "bcdedit.exe",
            [
                "/set",
                "{fwbootmgr}",
                "displayorder",
                guid,
                "/addfirst",
            ],
        )

        return result.success

    def verify_boot_order_first(
        self,
        guid: str,
    ) -> bool:

        state = self.get_current_state()

        if not state.firmware_display_order:
            return False

        return (
            state.firmware_display_order[0]
            .lower()
            == guid.lower()
        )

    def reboot(self) -> bool:

        result = self.client.run_cmd(
            "shutdown.exe",
            [
                "/r",
                "/t",
                "2",
                "/f",
                "/d",
                "p:2:4",
                "/c",
                "Automated switch to Ubuntu",
            ],
        )

        return result.success
