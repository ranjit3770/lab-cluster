import argparse
import sys

from .config import load_config
from .controller import BootController
from .inventory import load_inventory
from .bulk import run_bulk_status, run_bulk_apply, run_bulk_workflow


def main():

    parser = argparse.ArgumentParser(
        description=(
            "Remote Windows Dual-Boot Controller"
        )
    )

    subparsers = parser.add_subparsers(
        dest="command",
        required=True,
    )

    # --------------------------------------------------
    # Single host
    # --------------------------------------------------

    status_parser = subparsers.add_parser(
        "status",
        help="Show remote firmware boot configuration",
    )

    status_parser.add_argument(
        "--host",
        required=True,
        help="Remote Windows IP/hostname",
    )

    # --------------------------------------------------
    # Single host apply
    # --------------------------------------------------

    apply_single_parser = subparsers.add_parser(
        "apply",
        help="Set Ubuntu as first boot entry on a single host",
    )

    apply_single_parser.add_argument(
        "--host",
        required=True,
        help="Remote Windows IP/hostname",
    )

    apply_single_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without making changes",
    )

    apply_single_parser.add_argument(
        "--no-reboot",
        action="store_true",
        help="Change boot order but do not reboot",
    )

    apply_single_parser.add_argument(
        "--no-verify",
        action="store_true",
        help="Skip post-reboot verification",
    )

    apply_single_parser.add_argument(
        "--approve-ubuntu-running",
        action="store_true",
        help="Allow changing UEFI order when Ubuntu is running but Windows is default",
    )

    # --------------------------------------------------
    # Bulk status
    # --------------------------------------------------

    subparsers.add_parser(
        "bulk-status",
        help=(
            "Check boot status for all hosts "
            "in hosts.yaml"
        ),
    )

    # --------------------------------------------------
    # Bulk apply
    # --------------------------------------------------

    apply_parser = subparsers.add_parser(
        "bulk-apply",
        help=(
            "Set Ubuntu as first boot entry "
            "for all hosts in hosts.yaml"
        ),
    )

    apply_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without making changes",
    )

    apply_parser.add_argument(
        "--max-reboots",
        type=int,
        default=0,
        help="Maximum number of concurrent reboots (0 = unlimited)",
    )

    apply_parser.add_argument(
        "--approve-ubuntu-running",
        action="store_true",
        help="Allow changing UEFI order when Ubuntu is running but Windows is default",
    )

    # --------------------------------------------------
    # Full workflow
    # --------------------------------------------------

    workflow_parser = subparsers.add_parser(
        "workflow",
        help=(
            "Run full workflow: status, dry-run, "
            "approval prompt, then apply"
        ),
    )

    args = parser.parse_args()

    try:

        config = load_config()

        # ----------------------------------------------
        # Single host
        # ----------------------------------------------

        if args.command == "status":

            controller = BootController(
                config,
                args.host,
            )

            controller.status()

        elif args.command == "apply":

            controller = BootController(
                config,
                args.host,
            )

            if args.dry_run:

                result = controller.get_status()

                if not result["ubuntu_found"]:
                    print(
                        "DRY RUN: Ubuntu not found — would SKIP"
                    )

                elif result["ubuntu_first"]:
                    print(
                        "DRY RUN: Ubuntu already first — would SKIP"
                    )

                elif (
                    result.get("current_os") == "UBUNTU"
                    and not result["ubuntu_first"]
                ):
                    print(
                        "DRY RUN: Ubuntu running, Windows default — "
                        "would PENDING (approval required)"
                    )

                else:
                    print(
                        "DRY RUN: Would set Ubuntu first and reboot"
                    )

                sys.exit(0)

            apply_result = controller.set_ubuntu_first(
                reboot=not args.no_reboot,
                verify_after_reboot=not args.no_verify,
                approve_ubuntu_running=args.approve_ubuntu_running,
            )

            print()
            print("=" * 60)
            print("APPLY RESULT")
            print("=" * 60)
            print(
                f"Host     : {apply_result['host']}"
            )
            print(
                f"State    : {apply_result['state']}"
            )
            print(
                f"Reason   : {apply_result['reason']}"
            )
            print(
                f"Rebooted : {'YES' if apply_result['rebooted'] else 'NO'}"
            )
            print(
                f"Verified : {'YES' if apply_result['verified'] else 'NO'}"
            )

            if apply_result.get("backup_display_order"):
                print(
                    f"Backup   : {apply_result['backup_display_order']}"
                )

            sys.exit(
                0
                if apply_result["state"] == "SUCCESS"
                else 1
            )

        # ----------------------------------------------
        # Bulk
        # ----------------------------------------------

        elif args.command == "bulk-status":

            hosts = load_inventory(
                "hosts.yaml"
            )

            run_bulk_status(
                config,
                hosts,
            )

        elif args.command == "bulk-apply":

            hosts = load_inventory(
                "hosts.yaml"
            )

            run_bulk_apply(
                config,
                hosts,
                dry_run=args.dry_run,
                max_reboots=args.max_reboots,
                approve_ubuntu_running=args.approve_ubuntu_running,
            )

        elif args.command == "workflow":

            hosts = load_inventory(
                "hosts.yaml"
            )

            run_bulk_workflow(
                config,
                hosts,
            )

    except KeyboardInterrupt:

        print(
            "\nInterrupted."
        )

        sys.exit(130)

    except Exception as exc:

        print(
            f"ERROR: {exc}",
            file=sys.stderr,
        )

        sys.exit(1)


if __name__ == "__main__":
    main()