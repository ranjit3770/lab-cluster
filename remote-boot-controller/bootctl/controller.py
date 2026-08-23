from .bcdedit import BCDManager
from .config import Config
from .models import BootEntry
from .winrm_client import WinRMClient
import socket
import time


class BootController:

    def __init__(
        self,
        config: Config,
        host: str,
    ):

        self.config = config
        self.host = host

        self.client = WinRMClient(
            config,
            host,
        )

        self.bcd = BCDManager(
            self.client
        )

    @staticmethod
    def _is_port_open(
        ip: str,
        port: int,
        timeout: float = 2.0,
    ) -> bool:

        try:

            with socket.create_connection(
                (ip, port),
                timeout=timeout,
            ):
                return True

        except OSError:
            return False

    def detect_os(self) -> str:

        if self._is_port_open(
            self.host,
            5985,
        ):
            return "WINDOWS"

        if self._is_port_open(
            self.host,
            22,
        ):
            return "UBUNTU"

        return "UNKNOWN"

    def get_status(self) -> dict:

        hostname_result = (
            self.client.run_cmd(
                "hostname"
            )
        )

        if not hostname_result.success:
            raise RuntimeError(
                hostname_result.stderr
            )

        hostname = (
            hostname_result.stdout.strip()
        )

        state = (
            self.bcd.get_current_state()
        )

        ubuntu = (
            self.bcd.find_ubuntu_entry()
        )

        ubuntu_first = False

        if ubuntu:

            if state.firmware_display_order:

                ubuntu_first = (
                    state
                    .firmware_display_order[0]
                    .lower()
                    == ubuntu.identifier.lower()
                )

        current_os = self.detect_os()

        return {
            "host": self.host,
            "hostname": hostname,
            "current_os": current_os,
            "ubuntu_found": ubuntu is not None,
            "ubuntu_identifier": (
                ubuntu.identifier
                if ubuntu
                else None
            ),
            "ubuntu_description": (
                ubuntu.description
                if ubuntu
                else None
            ),
            "ubuntu_path": (
                ubuntu.path
                if ubuntu
                else None
            ),
            "display_order": (
                state.firmware_display_order
            ),
            "ubuntu_first": ubuntu_first,
        }

    def status(self):

        result = self.get_status()

        print("=" * 60)
        print("REMOTE BOOT STATUS")
        print("=" * 60)

        print(
            f"Host     : {result['host']}"
        )

        print(
            f"Hostname : {result['hostname']}"
        )

        print(
            f"OS       : {result.get('current_os', 'UNKNOWN')}"
        )

        print(
            f"Ubuntu   : "
            f"{'FOUND' if result['ubuntu_found'] else 'NOT FOUND'}"
        )

        if result["ubuntu_found"]:

            print(
                f"Ubuntu ID: "
                f"{result['ubuntu_identifier']}"
            )

            print(
                f"Path     : "
                f"{result['ubuntu_path']}"
            )

            print(
                f"First    : "
                f"{'YES' if result['ubuntu_first'] else 'NO'}"
            )

        print()

        if result["ubuntu_first"]:

            print(
                "Action   : SKIP"
            )

            print(
                "Reboot   : NO"
            )

        elif result["ubuntu_found"]:

            print(
                "Action   : CHANGE REQUIRED"
            )

            print(
                "Reboot   : REQUIRED AFTER CHANGE"
            )

        else:

            print(
                "Action   : CANNOT DETERMINE"
            )

            print(
                "Reboot   : NO"
            )

    def bulk_status(
        self,
        hosts,
    ):

        print()
        print("=" * 80)
        print("BULK BOOT STATUS")
        print("=" * 80)

        for host in hosts:

            print()
            print(
                f"[{host.name}] "
                f"{host.address}"
            )

            try:

                result = (
                    self.get_status_for_host(
                        host.address
                    )
                )

                if not result["ubuntu_found"]:

                    print(
                        "  Ubuntu : NOT FOUND"
                    )

                    print(
                        "  Action : SKIP"
                    )

                    print(
                        "  Reboot : NO"
                    )

                    continue

                if result["ubuntu_first"]:

                    print(
                        "  Ubuntu : FOUND"
                    )

                    print(
                        "  Default: YES"
                    )

                    print(
                        "  Action : SKIP"
                    )

                    print(
                        "  Reboot : NO"
                    )

                else:

                    print(
                        "  Ubuntu : FOUND"
                    )

                    print(
                        "  Default: NO"
                    )

                    print(
                        "  Action : CHANGE REQUIRED"
                    )

                    print(
                        "  Reboot : REQUIRED"
                    )

            except Exception as exc:

                print(
                    f"  ERROR  : {exc}"
                )

                print(
                    "  Action : SKIP"
                )

                print(
                    "  Reboot : NO"
                )

    def get_status_for_host(
        self,
        address: str,
    ) -> dict:

        controller = BootController(
            self.config,
            address,
        )

        return controller.get_status()

    def set_ubuntu_first(
        self,
        reboot: bool = True,
        verify_after_reboot: bool = True,
        approve_ubuntu_running: bool = False,
    ) -> dict:

        result = self.get_status()
        current_os = result.get("current_os", "UNKNOWN")

        if current_os == "UNKNOWN":
            return {
                "host": self.host,
                "state": "UNKNOWN",
                "reason": "Cannot determine current OS",
                "rebooted": False,
                "verified": False,
                "backup_display_order": result.get(
                    "display_order", []
                ),
                "current_os": current_os,
                "ubuntu_first": result.get(
                    "ubuntu_first", False
                ),
            }

        if not result["ubuntu_found"]:
            return {
                "host": self.host,
                "state": "UBUNTU_NOT_FOUND",
                "reason": "Ubuntu firmware entry not found",
                "rebooted": False,
                "verified": False,
                "backup_display_order": result.get(
                    "display_order", []
                ),
                "current_os": current_os,
                "ubuntu_first": result.get(
                    "ubuntu_first", False
                ),
            }

        if result["ubuntu_first"]:
            return {
                "host": self.host,
                "state": "SKIPPED",
                "reason": "Ubuntu is already first",
                "rebooted": False,
                "verified": False,
                "backup_display_order": result.get(
                    "display_order", []
                ),
                "current_os": current_os,
                "ubuntu_first": result.get(
                    "ubuntu_first", False
                ),
            }

        ubuntu_guid = result["ubuntu_identifier"]
        backup_order = result.get("display_order", [])

        if current_os == "UBUNTU" and not approve_ubuntu_running:
            return {
                "host": self.host,
                "state": "PENDING",
                "reason": (
                    "Ubuntu is running but Windows is UEFI default. "
                    "Approval required to change boot order."
                ),
                "rebooted": False,
                "verified": False,
                "backup_display_order": backup_order,
                "current_os": current_os,
                "ubuntu_first": result.get(
                    "ubuntu_first", False
                ),
            }

        if current_os == "WINDOWS":
            if not self.bcd.set_boot_order_first(
                ubuntu_guid
            ):
                return {
                    "host": self.host,
                    "state": "CHANGE_FAILED",
                    "reason": "Failed to set boot order",
                    "rebooted": False,
                    "verified": False,
                    "backup_display_order": backup_order,
                    "current_os": current_os,
                    "ubuntu_first": result.get(
                        "ubuntu_first", False
                    ),
                }

            if not self.bcd.verify_boot_order_first(
                ubuntu_guid
            ):
                return {
                    "host": self.host,
                    "state": "VERIFICATION_FAILED",
                    "reason": "Boot order verification failed after change",
                    "rebooted": False,
                    "verified": False,
                    "backup_display_order": backup_order,
                    "current_os": current_os,
                    "ubuntu_first": result.get(
                        "ubuntu_first", False
                    ),
                }

            if not reboot:
                return {
                    "host": self.host,
                    "state": "CHANGED",
                    "reason": "Boot order changed, reboot skipped",
                    "rebooted": False,
                    "verified": True,
                    "backup_display_order": backup_order,
                    "current_os": current_os,
                    "ubuntu_first": result.get(
                        "ubuntu_first", False
                    ),
                }

            if not self.bcd.reboot():
                return {
                    "host": self.host,
                    "state": "REBOOT_FAILED",
                    "reason": "Reboot command failed",
                    "rebooted": False,
                    "verified": False,
                    "backup_display_order": backup_order,
                    "current_os": current_os,
                    "ubuntu_first": result.get(
                        "ubuntu_first", False
                    ),
                }

            time.sleep(5)

            deadline = time.time() + 600
            while time.time() < deadline:
                try:

                    status = self.get_status()

                    if status["ubuntu_first"]:
                        return {
                            "host": self.host,
                            "state": "SUCCESS",
                            "reason": "Ubuntu is first and verified after reboot",
                            "rebooted": True,
                            "verified": True,
                            "backup_display_order": backup_order,
                            "current_os": current_os,
                            "ubuntu_first": status.get(
                                "ubuntu_first", False
                            ),
                        }

                except Exception:
                    pass

                time.sleep(5)

            return {
                "host": self.host,
                "state": "REBOOT_TIMEOUT",
                "reason": "Machine did not come back within timeout",
                "rebooted": True,
                "verified": False,
                "backup_display_order": backup_order,
                "current_os": current_os,
                "ubuntu_first": result.get(
                    "ubuntu_first", False
                ),
            }

        if current_os == "UBUNTU" and approve_ubuntu_running:
            if not self.bcd.set_boot_order_first(
                ubuntu_guid
            ):
                return {
                    "host": self.host,
                    "state": "CHANGE_FAILED",
                    "reason": "Failed to set boot order",
                    "rebooted": False,
                    "verified": False,
                    "backup_display_order": backup_order,
                    "current_os": current_os,
                    "ubuntu_first": result.get(
                        "ubuntu_first", False
                    ),
                }

            if not self.bcd.verify_boot_order_first(
                ubuntu_guid
            ):
                return {
                    "host": self.host,
                    "state": "VERIFICATION_FAILED",
                    "reason": "Boot order verification failed after change",
                    "rebooted": False,
                    "verified": False,
                    "backup_display_order": backup_order,
                    "current_os": current_os,
                    "ubuntu_first": result.get(
                        "ubuntu_first", False
                    ),
                }

            if not reboot:
                return {
                    "host": self.host,
                    "state": "CHANGED",
                    "reason": "Boot order changed, reboot skipped",
                    "rebooted": False,
                    "verified": True,
                    "backup_display_order": backup_order,
                    "current_os": current_os,
                    "ubuntu_first": result.get(
                        "ubuntu_first", False
                    ),
                }

            if not self.bcd.reboot():
                return {
                    "host": self.host,
                    "state": "REBOOT_FAILED",
                    "reason": "Reboot command failed",
                    "rebooted": False,
                    "verified": False,
                    "backup_display_order": backup_order,
                    "current_os": current_os,
                    "ubuntu_first": result.get(
                        "ubuntu_first", False
                    ),
                }

            time.sleep(5)

            deadline = time.time() + 600
            while time.time() < deadline:
                try:

                    status = self.get_status()

                    if status["ubuntu_first"]:
                        return {
                            "host": self.host,
                            "state": "SUCCESS",
                            "reason": "Ubuntu is first and verified after reboot",
                            "rebooted": True,
                            "verified": True,
                            "backup_display_order": backup_order,
                            "current_os": current_os,
                            "ubuntu_first": status.get(
                                "ubuntu_first", False
                            ),
                        }

                except Exception:
                    pass

                time.sleep(5)

            return {
                "host": self.host,
                "state": "REBOOT_TIMEOUT",
                "reason": "Machine did not come back within timeout",
                "rebooted": True,
                "verified": False,
                "backup_display_order": backup_order,
                "current_os": current_os,
                "ubuntu_first": result.get(
                    "ubuntu_first", False
                ),
            }

        return {
            "host": self.host,
            "state": "UNKNOWN",
            "reason": f"Unhandled OS state: {current_os}",
            "rebooted": False,
            "verified": False,
            "backup_display_order": backup_order,
            "current_os": current_os,
            "ubuntu_first": result.get(
                "ubuntu_first", False
            ),
        }