# Smart Slurm Orchestration Layer

This job-api implements a production-oriented Slurm submission layer that converts high-level user intent into efficient Slurm allocations without hardcoded cluster specifications.

## Entry Points

- REST preview: `POST /plan`
- REST submit: `POST /submit`
- CLI: `python smart_submit.py --cpu 32 --memory 64G --command "python job.py"`
- Portal path: `cluster-portal/backend/app/api/v1/jobs.py` forwards portal submissions to `job-api /submit`

## User Input Model

The engine accepts:

- `total_cpu`: total CPU requirement
- `total_ram`: memory as GB integer or Slurm-style string such as `64G`
- `entry_point`: user storage relative script path, or
- `command`: direct command for API/CLI submissions
- `time`: walltime
- optional advanced controls: `ntasks`, `cpus_per_task`, `mem_per_cpu`, `partition`, `constraint`, `gpu_count`, `job_type`

If users do not provide Slurm-native values, the planner derives them.

## Dynamic Cluster Awareness

The planner uses live Slurm commands at submission time:

- `scontrol show nodes -o` for node CPU, memory, state, partition, features, and GRES
- `sinfo` fallback when `scontrol` is unavailable
- `squeue` for queue pressure summary

No fixed node count, CPU count, memory size, or hostname pattern is assumed.

## Allocation Strategy

Default behavior prioritizes horizontal scaling:

- `ntasks = total_cpu`
- `cpus_per_task = 1`
- `mem_per_cpu = ceil(total_memory / total_allocated_cpu)`
- `--distribution=block:block`
- `--hint=nomultithread`

Vertical scaling is used only when users explicitly request it or choose workload types that require shared memory, such as `multithread`, `jupyter`, or `interactive`.

## Smart Corrections

The planner warns and corrects when possible:

- If a single-node mode cannot fit the request, it converts to distributed mode.
- If memory is supplied as a total value, it normalizes to `--mem-per-cpu`.
- If resources are valid for the cluster but not currently free, it allows Slurm to queue instead of failing.
- If the request cannot fit any configured healthy Slurm node set, it fails clearly before submission.

Warnings are returned by the API and written into portal job logs.

## Packing Logic

The planner computes expected node distribution by greedily packing tasks into currently free nodes:

1. Exclude unhealthy node states such as `DOWN`, `DRAIN`, `MAINT`, `NO_RESPOND`, and `FAIL`.
2. Compute each node task capacity from free CPU and free memory.
3. Sort nodes by task capacity, free CPU, and free memory.
4. Assign tasks until the request is satisfied or only queued capacity remains.
5. Generate `--nodes=min-max` when a practical node range can be inferred.

Slurm remains the final scheduler; the expected distribution is advisory and transparent.

## Generated sbatch Script

The script includes:

- job name, walltime, logs, uid, export policy
- optimized Slurm directives
- virtualenv setup
- optional requirements installation
- execution through `srun`
- planner metadata in log output

Generated scripts and replay data are stored under:

```text
/data_storage/<username>/slurm_logs/generated/
```

Each submission writes:

- `<request_id>.sbatch`
- `<request_id>.json`

The JSON audit file contains the input request, optimized plan, Slurm directives, expected distribution, cluster snapshot, and final script.

## Multi-User Fairness

The system keeps existing portal fairness controls:

- per-user active batch/Jupyter job limits in `strach_portal.system_settings`
- user CPU and memory limits from `strach_portal.users`
- local waiting queue in `slurm_jobs.job_queue`
- background queue worker promotes jobs when user quota allows

The job-api still lets Slurm enforce site scheduling, fairshare, partition limits, QOS, and priority policies.

## API Examples

Dry-run plan:

```bash
curl -s http://127.0.0.1:9000/plan \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "alice",
    "project_name": "smart-test",
    "total_cpu": 32,
    "total_ram": "64G",
    "command": "python job.py",
    "time": "02:00:00"
  }'
```

Submit:

```bash
curl -s http://127.0.0.1:9000/submit \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "alice",
    "project_name": "smart-test",
    "total_cpu": 32,
    "total_ram": "64G",
    "command": "python job.py",
    "time": "02:00:00"
  }'
```

CLI dry-run:

```bash
python smart_submit.py --username alice --name smart-test --cpu 32 --memory 64G --command "python job.py"
```

CLI submit:

```bash
python smart_submit.py --username alice --name smart-test --cpu 32 --memory 64G --command "python job.py" --submit
```

## Extensibility Points

The planner is intentionally modular:

- GPU policy: extend `gpu_count` and GRES parsing
- preemption/QOS: add policy fields before directive generation
- autoscaling: react to queued-but-valid plans
- ML tuning: add command-aware task and memory heuristics
- partition policy: set `job_default_partition` in portal system settings or env `JOB_DEFAULT_PARTITION`

## Changed Files

- `app/planner.py`: dynamic Slurm inventory, validation, packing, correction, directive generation
- `app/slurm.py`: generated scripts, `srun` execution, audit logs, optimized REST submission
- `app/main.py`: `/plan`, enriched `/submit`, DB columns for audit metadata
- `app/models.py`: planner metadata persistence
- `app/schemas.py`: direct command and enriched response model
- `smart_submit.py`: CLI preview/submit tool

