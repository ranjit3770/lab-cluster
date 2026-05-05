#!/usr/bin/env python3
import argparse
import json
import os
import sys

import requests


def build_payload(args):
    payload = {
        "username": args.username,
        "project_name": args.name,
        "entry_point": args.entry_point or "",
        "total_cpu": args.cpu,
        "total_ram": args.memory,
        "time": args.time,
        "command": args.command,
        "command_args": args.command_args,
        "requirements_path": args.requirements,
        "ntasks": args.ntasks,
        "cpus_per_task": args.cpus_per_task,
        "job_type": args.job_type,
        "partition": args.partition,
        "gpu_count": args.gpu,
        "mem_per_cpu": args.mem_per_cpu,
        "constraint": args.constraint,
    }
    return {key: value for key, value in payload.items() if value is not None}


def main():
    parser = argparse.ArgumentParser(
        description="Submit or preview smart Slurm jobs through the cluster portal job API."
    )
    parser.add_argument("--api-url", default=os.getenv("JOB_API_URL", "http://127.0.0.1:9000"))
    parser.add_argument("--username", default=os.getenv("USER", "slurm"))
    parser.add_argument("--name", default="smart-job")
    parser.add_argument("--cpu", type=int, required=True)
    parser.add_argument("--memory", required=True, help="Memory request, e.g. 64G, 64000M, or 64.")
    parser.add_argument("--time", default="01:00:00")
    parser.add_argument("--command", help="Command to execute through srun, e.g. 'python job.py'.")
    parser.add_argument("--entry-point", help="User storage relative Python script path.")
    parser.add_argument("--command-args", default="")
    parser.add_argument("--requirements")
    parser.add_argument("--ntasks", type=int)
    parser.add_argument("--cpus-per-task", type=int)
    parser.add_argument("--mem-per-cpu")
    parser.add_argument("--job-type", default="distributed")
    parser.add_argument("--partition")
    parser.add_argument("--gpu", type=int, default=0)
    parser.add_argument("--constraint")
    parser.add_argument("--submit", action="store_true", help="Submit job. Default is dry-run planning.")
    args = parser.parse_args()

    if not args.command and not args.entry_point:
        parser.error("Provide either --command or --entry-point.")

    endpoint = "/submit" if args.submit else "/plan"
    try:
        response = requests.post(
            f"{args.api_url.rstrip('/')}{endpoint}",
            json=build_payload(args),
            timeout=60,
        )
        response.raise_for_status()
    except requests.HTTPError:
        print(response.text, file=sys.stderr)
        return response.status_code
    except Exception as exc:
        print(f"Request failed: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(response.json(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
