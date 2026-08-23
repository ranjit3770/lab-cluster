from .config import Config
from .controller import BootController
from .inventory import Host
import time
from concurrent.futures import ThreadPoolExecutor, as_completed


def run_bulk_status(
    config: Config,
    hosts: list[Host],
):

    print()
    print("=" * 80)
    print("BULK BOOT STATUS")
    print("=" * 80)

    summary = []

    for host in hosts:

        print()
        print(
            f"[{host.name}] {host.address}"
        )

        try:

            controller = BootController(
                config,
                host.address,
            )

            result = (
                controller.get_status()
            )

            if not result["ubuntu_found"]:

                action = "SKIP"
                reboot = "NO"

                print(
                    "  Ubuntu : NOT FOUND"
                )

                print(
                    "  OS     : "
                    f"{result.get('current_os', 'UNKNOWN')}"
                )

            elif result["ubuntu_first"]:

                action = "SKIP"
                reboot = "NO"

                print(
                    "  Ubuntu : FOUND"
                )

                print(
                    "  Default: YES"
                )

                print(
                    "  OS     : "
                    f"{result.get('current_os', 'UNKNOWN')}"
                )

            else:

                action = "CHANGE"
                reboot = "REQUIRED"

                print(
                    "  Ubuntu : FOUND"
                )

                print(
                    "  Default: NO"
                )

                print(
                    "  OS     : "
                    f"{result.get('current_os', 'UNKNOWN')}"
                )

            print(
                f"  Action : {action}"
            )

            print(
                f"  Reboot : {reboot}"
            )

            summary.append(
                {
                    "host": host.name,
                    "address": host.address,
                    "action": action,
                    "reboot": reboot,
                }
            )

        except Exception as exc:

            print(
                f"  ERROR  : {exc}"
            )

            print(
                "  Action : ERROR"
            )

            print(
                "  Reboot : NO"
            )

            summary.append(
                {
                    "host": host.name,
                    "address": host.address,
                    "action": "ERROR",
                    "reboot": "NO",
                }
            )

    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)

    for item in summary:

        print(
            f"{item['host']:20} "
            f"{item['address']:16} "
            f"{item['action']:10} "
            f"{item['reboot']}"
        )


def _process_single_host(
    config: Config,
    host: Host,
    dry_run: bool,
    approve_ubuntu_running: bool = False,
) -> dict:

    print()
    print(
        f"[{host.name}] {host.address}"
    )

    try:

        controller = BootController(
            config,
            host.address,
        )

        result = controller.get_status()

        if not result["ubuntu_found"]:

            print(
                "  Ubuntu : NOT FOUND"
            )

            print(
                "  State  : UBUNTU_NOT_FOUND"
            )

            print(
                "  Reboot : NO"
            )

            return {
                "host": host.name,
                "address": host.address,
                "state": "UBUNTU_NOT_FOUND",
                "reboot": "NO",
                "reason": "Ubuntu not found",
                "dry_run": dry_run,
                "verified": False,
            }

        if result["ubuntu_first"]:

            print(
                "  Ubuntu : FOUND"
            )

            print(
                "  Default: YES"
            )

            print(
                "  State  : SKIPPED"
            )

            print(
                "  Reboot : NO"
            )

            return {
                "host": host.name,
                "address": host.address,
                "state": "SKIPPED",
                "reboot": "NO",
                "reason": "Ubuntu already first",
                "dry_run": dry_run,
                "verified": False,
            }

        print(
            "  Ubuntu : FOUND"
        )

        print(
            "  Default: NO"
        )

        if dry_run:

            if (
                result.get("current_os") == "UBUNTU"
                and not result["ubuntu_first"]
            ):
                print(
                    "  State  : PENDING"
                )

                print(
                    "  Action : REQUIRES APPROVAL"
                )

                return {
                    "host": host.name,
                    "address": host.address,
                    "state": "PENDING",
                    "reboot": "PENDING",
                    "reason": (
                        "Ubuntu running, Windows default — "
                        "approval required"
                    ),
                    "dry_run": True,
                    "verified": False,
                }

            print(
                "  State  : CHANGE"
            )

            print(
                "  Reboot : REQUIRED"
            )

            return {
                "host": host.name,
                "address": host.address,
                "state": "CHANGE",
                "reboot": "REQUIRED",
                "reason": "Would set Ubuntu first",
                "dry_run": True,
                "verified": False,
            }

        print(
            "  Action : CHANGING..."
        )

        apply_result = (
            controller.set_ubuntu_first(
                reboot=True,
                verify_after_reboot=True,
                approve_ubuntu_running=approve_ubuntu_running,
            )
        )

        print(
            f"  State  : {apply_result['state']}"
        )

        print(
            f"  Reason : {apply_result['reason']}"
        )

        print(
            f"  Reboot : {'YES' if apply_result['rebooted'] else 'NO'}"
        )

        print(
            f"Verified: {'YES' if apply_result['verified'] else 'NO'}"
        )

        if apply_result.get("backup_display_order"):
            print(
                f" Backup : {apply_result['backup_display_order']}"
            )

        return {
            "host": host.name,
            "address": host.address,
            "state": apply_result["state"],
            "reboot": (
                "YES"
                if apply_result["rebooted"]
                else "NO"
            ),
            "reason": apply_result["reason"],
            "verified": apply_result["verified"],
            "dry_run": False,
        }

    except Exception as exc:

        print(
            f"  ERROR  : {exc}"
        )

        print(
            "  State  : ERROR"
        )

        print(
            "  Reboot : NO"
        )

        return {
            "host": host.name,
            "address": host.address,
            "state": "ERROR",
            "reboot": "NO",
            "reason": str(exc),
            "dry_run": dry_run,
            "verified": False,
        }


def run_bulk_apply(
    config: Config,
    hosts: list[Host],
    dry_run: bool = False,
    max_reboots: int = 0,
    approve_ubuntu_running: bool = False,
):

    print()
    print("=" * 80)

    if dry_run:
        print("BULK APPLY (DRY RUN)")
    else:
        print("BULK APPLY")

    print("=" * 80)

    if max_reboots > 0:
        print(
            f"Max concurrent reboots: {max_reboots}"
        )

    if approve_ubuntu_running:
        print(
            "Policy: Ubuntu-running + Windows-default machines will be changed"
        )

    print()

    summary = []

    if max_reboots > 0:
        with ThreadPoolExecutor(
            max_workers=max_reboots
        ) as executor:
            futures = {
                executor.submit(
                    _process_single_host,
                    config,
                    host,
                    dry_run,
                    approve_ubuntu_running,
                ): host
                for host in hosts
            }

            for future in as_completed(futures):
                result = future.result()
                summary.append(result)
    else:
        for host in hosts:
            result = _process_single_host(
                config,
                host,
                dry_run,
                approve_ubuntu_running,
            )
            summary.append(result)

    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)

    for item in summary:

        print(
            f"{item['host']:20} "
            f"{item['address']:16} "
            f"{item.get('state', item.get('action', 'UNKNOWN')):15} "
            f"{item['reboot']}"
        )

        if item.get("reason"):
            print(
                f"{'':20} "
                f"{'':16} "
                f"Reason: {item['reason']}"
            )

    success_count = len(
        [
            item
            for item in summary
            if item.get("state") == "SUCCESS"
        ]
    )

    skip_count = len(
        [
            item
            for item in summary
            if item.get("state") == "SKIPPED"
        ]
    )

    pending_count = len(
        [
            item
            for item in summary
            if item.get("state") == "PENDING"
        ]
    )

    fail_count = len(
        [
            item
            for item in summary
            if item.get("state") in (
                "FAIL",
                "ERROR",
                "TIMEOUT",
                "CHANGE_FAILED",
                "VERIFICATION_FAILED",
                "REBOOT_TIMEOUT",
                "REBOOT_FAILED",
                "UNKNOWN",
            )
        ]
    )

    print()
    print(
        f"Success: {success_count} | "
        f"Skip: {skip_count} | "
        f"Pending: {pending_count} | "
        f"Fail: {fail_count}"
    )


def run_bulk_dry_run(
    config: Config,
    hosts: list[Host],
) -> list[dict]:

    summary = []

    for host in hosts:
        result = _process_single_host(
            config,
            host,
            dry_run=True,
        )
        summary.append(result)

    return summary


def run_bulk_workflow(
    config: Config,
    hosts: list[Host],
):

    print()
    print("=" * 80)
    print("BULK WORKFLOW")
    print("=" * 80)

    print()
    print("[1/4] Current boot status:")
    print("=" * 80)

    run_bulk_status(config, hosts)

    print()
    print("[2/4] Dry-run plan:")
    print("=" * 80)

    dry_summary = run_bulk_dry_run(
        config,
        hosts,
    )

    pending_hosts = [
        item
        for item in dry_summary
        if item.get("state") == "PENDING"
    ]

    approve = False

    if pending_hosts:
        print()
        print("=" * 80)
        print("[3/4] Approval required")
        print("=" * 80)
        print()
        print(
            "The following machines are running Ubuntu "
            "but have Windows as the UEFI default:"
        )
        print()

        for item in pending_hosts:
            print(
                f"  {item['host']:20} "
                f"{item['address']:16} "
                f"Reason: {item.get('reason', '')}"
            )

        print()
        answer = input(
            "Approve UEFI order change + reboot for these machines? (y/n): "
        ).strip().lower()

        approve = answer == "y"

        if not approve:
            print()
            print(
                "Approval denied. Machines will keep current configuration."
            )
    else:
        print()
        print("[3/4] No approval required")
        print("=" * 80)
        print()

    print()
    print("[4/4] Applying changes:")
    print("=" * 80)
    print()

    run_bulk_apply(
        config,
        hosts,
        dry_run=False,
        max_reboots=0,
        approve_ubuntu_running=approve,
    )