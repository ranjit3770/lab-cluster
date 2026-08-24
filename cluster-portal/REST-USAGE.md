# Slurm REST API (slurmrestd) Usage Reference

`slurmrestd` exposes the Slurm Workload Manager over standard HTTP methods
(GET, POST, PUT, DELETE) with JSON payloads. This cluster runs Slurm 25.11.4
with the **v0.0.44** OpenAPI plugin. This page summarizes what the interface
provides and how the portal uses it.

## Capabilities

### 1. Job Management (core use case)

- **Submit jobs** — a job script or JSON job description (equivalent to `sbatch`).
- **List jobs** — full queue or filtered by user, partition, or state (equivalent to `squeue`).
- **Job details** — start/end time, allocated nodes, environment variables, and other metadata.
- **Cancel/signal jobs** — kill a running job or send signals such as SIGTERM (equivalent to `scancel`).
- **Modify pending jobs** — update time limits or partition while queued (equivalent to `scontrol update job`).

### 2. Node And Cluster Monitoring

Structured JSON instead of parsed `sinfo` text:

- **Node status** — `IDLE`, `DOWN`, `DRAIN`, `ALLOCATED`.
- **Hardware inventory** — CPUs, memory, and GRES (for example GPUs) per node.
- **Node state updates** — `DRAIN` a node for maintenance or `RESUME` it back.

### 3. Partition And Reservation Control

- **Read partitions** — limits, defaults, and member nodes.
- **Manage reservations** — create/update/delete reservations for users or maintenance windows.

### 4. Accounting (SlurmDBD)

Accounting storage is backed by `slurmdbd`, so the REST API can also:

- **Users & accounts** — list/create/modify Slurm accounts and associations.
- **Usage statistics** — historical job and consumption data (equivalent to `sacct`).
- **QOS management** — priority and limit tiers per group.

### 5. Diagnostics And Health

- **Ping** — controller liveness and latency.
- **Diag** — internal controller statistics (equivalent to `sdiag`).
- **Configuration** — the active `slurm.conf` parameters in use by running daemons.

## CLI Vs REST Comparison

| Aspect | CLI (`sbatch`, `squeue`) | REST (`slurmrestd`) |
| :--- | :--- | :--- |
| Output format | Plain text / tables | Structured JSON |
| Connectivity | Slurm binaries required locally | Any client with `curl` or Python |
| Authentication | Munge (UID/GID based) | JWT token or Unix socket |
| Integration | String parsing required | Direct web/app integration |

## How The Portal Uses It

The portal backend queries job IDs and node data through Python over the
Unix socket (see `SLURM_REST_URL` in the [backend guide](backend/README.md)).
This is what powers user-facing dashboards for job status without granting
SSH access to the head node.

For setup of the daemon itself, see
[docs/setup-guides/SLURMREST-SETUP.md](docs/setup-guides/SLURMREST-SETUP.md).
