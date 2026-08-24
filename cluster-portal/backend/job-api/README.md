# Job-API Guide — Slurm Workload Submission Service

Python workload submission and Jupyter orchestration service for the portal.
It plans each request against **live Slurm state** (never hardcoded node
specs) and submits through Slurm REST, with a production-safe `sbatch` CLI
fallback. Runs as a containerized FastAPI service on port 9000.

## What It Does

| Function | Description |
| --- | --- |
| Slurm dispatcher | Converts researcher requests into `sbatch` workloads with environment isolation. |
| Resource planner | Horizontal-first allocation computed from live node CPU, memory, health, and queue state. |
| Log streamer | Live, low-latency job log telemetry via streaming responses. |
| Job control | Stop/cancel signaling and status interrogation. |

## Entry Points

| Path | Purpose |
| --- | --- |
| `POST /plan` | Dry-run: returns the plan without submitting. |
| `POST /submit` | Validates, plans, and submits the job. |
| `smart_submit.py` | CLI equivalent (`--plan` default, `--submit` to submit). |
| Portal route `backend/app/api/v1/jobs.py` | Forwards portal submissions to `/submit`. |

## Architecture

| File | Responsibility |
| --- | --- |
| `app/main.py` | FastAPI gateway, quota enforcement, maintenance middleware. |
| `app/planner.py` | Dynamic Slurm inventory, validation, packing, correction, directive generation. |
| `app/slurm.py` | Script generation, audit logging, `srun` execution, Slurm REST submission. |
| `app/models.py` | Local job registry and planner metadata persistence. |
| `app/schemas.py` | Request/response models. |

## Deployment Requirements

The container needs direct access to:

| Mount | Purpose |
| --- | --- |
| `/etc/slurm` (read-only) | Slurm configuration. |
| `/var/run/munge` | Munge authentication socket. |
| `/run/slurmrestd` | Slurm OpenAPI Unix socket. |

Security model:

- A dedicated `slurm_user` identity is used for database registry access.
- Maintenance mode is enforced via cross-database verification against the
  portal's `strach_portal.system_settings`.

## How Allocation Works (Summary)

1. Read live state: `scontrol show nodes -o`, `sinfo` fallback, `squeue`
   pressure.
2. Validate the request against healthy-node capacity; reject impossible
   requests before submission, but let valid requests queue when the cluster
   is busy.
3. Prefer horizontal allocation (`ntasks = total_cpu`, one CPU per task);
   use vertical single-node allocation only for shared-memory workloads such
   as Jupyter.
4. Emit an auditable `sbatch` script plus a runtime resource contract, then
   submit via Slurm REST or `sbatch`.

Full details:

- Planner behavior and API examples: [SMART-SLURM-ORCHESTRATION.md](SMART-SLURM-ORCHESTRATION.md)
- Verification runbook (prove jobs run inside their limits):
  [RESOURCE-ALLOCATION-AND-VERIFICATION.md](RESOURCE-ALLOCATION-AND-VERIFICATION.md)

## Documentation Index

| Document | Audience | Description |
| --- | --- | --- |
| [SLURM-JOB-SYSTEM.md](SLURM-JOB-SYSTEM.md) | Everyone | Plain-language overview of the whole system. |
| [SMART-SLURM-ORCHESTRATION.md](SMART-SLURM-ORCHESTRATION.md) | Developers | Planner internals, packing logic, API/CLI examples. |
| [RESOURCE-ALLOCATION-AND-VERIFICATION.md](RESOURCE-ALLOCATION-AND-VERIFICATION.md) | Ops/users | How to verify CPU/memory allocations from head node, notebooks, and logs. |
| [DESIGN-DECISIONS.md](DESIGN-DECISIONS.md) | Developers | Why the portal has no custom scheduler; job-model rules. |
| [QUOTA-AND-JOB-LIFECYCLE.md](QUOTA-AND-JOB-LIFECYCLE.md) | Developers/Ops | Quota counting rules, deletion flow, hardening invariants, past incident lessons. |
