# Recommended cgroup.conf

`cgroup.conf` is the cluster's safety net: it stops a single runaway job from
consuming all RAM or CPU on a worker and crashing the node. With Intel GPUs,
cgroups also ensure CPU tasks accompanying GPU compute cannot starve the rest
of the system.

## The Configuration

Create or edit in shared storage: `/home/slurm_shared/cgroup.conf`.

```ini
###
# Slurm cgroup support configuration file
###
CgroupMountpoint="/sys/fs/cgroup"
CgroupAutomount=yes

# Constrain RAM: a job cannot take more memory than requested
ConstrainRAMSpace=yes
AllowedRAMSpacePercent=95
MaxRAMPercent=98

# Constrain CPU: jobs only use the cores assigned to them
ConstrainCores=yes

# Constrain swap: jobs cannot slow the node down via swap
ConstrainSwapSpace=yes

# Optional: constrain devices (for example the GPU)
ConstrainDevices=yes
```

## Why Each Setting Matters

| Setting | Effect |
| :--- | :--- |
| `ConstrainRAMSpace=yes` | A job asking for 2 GB but using 8 GB is killed before reaching 100% — saves the OS from freezing. |
| `AllowedRAMSpacePercent=95` | Reserves 5% of RAM for the OS and Slurm daemons; SSH keeps working under full load. |
| `ConstrainCores=yes` | Cgroups pin a job to exactly its assigned cores; it cannot slow other jobs on the node. |
| `ConstrainDevices=yes` | Users who do not request a GPU cannot see or use the GPU at all. |

## Activating Cgroups

**1. Enable the plugins in `/home/slurm_shared/slurm.conf`:**

```ini
TaskPlugin=task/cgroup,task/affinity
JobAcctGatherType=jobacct_gather/cgroup
```

**2. Push changes from the head node:**

```bash
sudo scontrol reconfigure
```

**3. Restart worker daemons** (required for first-time setup because cgroups
interact deeply with the kernel):

```bash
sudo systemctl restart slurmd   # on each worker
```

## Test Enforcement

Submit a job that requests 1 GB but tries to allocate 5 GB:

```bash
srun --mem=1G --gres=gpu:intel:1 python3 -c "a = bytearray(5 * 1024**3)"
```

Expected: Slurm kills the job with an OOM error while the worker stays stable.

> In this repository, strict cgroup enforcement of Slurm deployments is an
> Ansible option (`-e enable_slurm_cgroups=true`) — see
> [Ansible Cluster Automation](../../../ansible/README.md#slurm-resource-enforcement).

## Resulting Cluster State

- Munge for security.
- MariaDB for accounting.
- NFS for shared configs/logs.
- GRES for Intel GPU scheduling.
- Cgroups for system stability.
