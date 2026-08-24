# Slurm Job System — Plain-Language Overview

This project is a job scheduling system built on top of Slurm for HPC
environments. In one sentence: users submit tasks (jobs), and the system
automatically uses available cluster nodes to run them efficiently.

## The Problem Being Solved

Multiple computers (a cluster), many users, competing programs. Without a
coordination system:

- Users fight over resources.
- Some nodes sit idle while others are overloaded.

With this system:

- Jobs are queued.
- Resources are shared fairly.
- Everything runs automatically.

## How It Works

```text
User → Submit Job → Slurm → Assign Resources → Run Job → Return Result
```

Step by step:

1. User submits a job (for example: run a Python script).
2. System checks the request inputs (CPU, RAM, time).
3. Job is sent to Slurm.
4. Slurm picks the best available machine.
5. Job runs automatically.
6. User gets output and logs through the portal.

## Core Principle: Let Slurm Decide

Earlier designs tried to manually assign machines to jobs. That causes errors
and conflicts. The current design trusts Slurm completely to decide where jobs
run; the portal only validates input and generates a correct `sbatch` script.
See [DESIGN-DECISIONS.md](DESIGN-DECISIONS.md) for the full rationale.

## Features

### 1. Smart CPU usage by job type

| Job type | Shape | Example |
| --- | --- | --- |
| Single / multithread | 1 task, many CPUs per task | Notebook or threaded app |
| Parallel (MPI-style) | Many tasks, 1 CPU each | Distributed batch run |

Total CPU is always `ntasks × cpus-per-task`.

### 2. GPU support

Users can request GPUs (for AI/ML/heavy compute). The system automatically
assigns GPU-enabled machines using Slurm GRES data from live node state.

### 3. Partition support

The cluster can be divided into groups (CPU nodes, GPU nodes, high-memory
nodes). Expert users can target a partition; everyone else gets the default.

### 4. Time limits as a safety feature

Every job has a walltime limit. This prevents infinite jobs from blocking
resources.

### 5. Smart memory handling

Both total memory and memory-per-CPU requests are supported; conflicts are
resolved automatically by normalizing to `--mem-per-cpu`, preventing invalid
configurations.

### 6. No submission blocking

Jobs are always accepted. If resources are not free right now, the job waits
in the queue — which is how real HPC systems behave. Impossible requests are
rejected up front instead.

### 7. Quota system for fair usage

Each user has CPU/RAM limits (optionally GPU).

```text
User quota: 16 CPU — currently using: 4 CPU
```

Quota counting rules and enforcement details:
[QUOTA-AND-JOB-LIFECYCLE.md](QUOTA-AND-JOB-LIFECYCLE.md).

### 8. Real-time visibility

The service logs live quota state on every decision:

```text
[QUOTA] CPU: 4/16 | RAM: 2.5/16GB
```

Benefits: easy monitoring and better admin control with no ambiguity about
what was counted.

### 9. Advanced options for expert users

Experts can set `ntasks`, `cpus_per_task`, `mem_per_cpu`, partition,
constraint, or `gpu_count` explicitly. Normal users get everything derived
automatically.

## Design Principle

> "Backend supports, Slurm decides."

- No manual machine selection.
- No forced scheduling order.
- No conflict with the scheduler.

## Current Status

| Aspect | Status |
| --- | --- |
| Stability | High |
| Performance | Improved over fixed-allocation designs |
| Flexibility | High (job types, GPU, partitions) |
| Compatibility | Existing workflows unchanged |

All improvements were additive: no existing workflow was broken.
