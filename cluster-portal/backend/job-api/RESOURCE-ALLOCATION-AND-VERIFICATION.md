# Job API Resource Allocation and Verification

This document explains how the portal job-api converts user requests into Slurm allocations, how it avoids wasting cluster resources, and how users/operators can verify that Jupyter and Python jobs are running inside the assigned CPU and memory limits.

## Production Rule

Slurm is the source of truth for enforcement. The portal/job-api plans and submits efficient requests, but strict CPU and memory limits are enforced by Slurm plus the cluster cgroup configuration.

For strict enforcement, the cluster should use Slurm cgroups:

```bash
scontrol show config | grep -E "TaskPlugin|ProctrackType|JobAcctGatherType"
```

Recommended signals:

```text
TaskPlugin=task/cgroup
ProctrackType=proctrack/cgroup
JobAcctGatherType=jobacct_gather/cgroup
SelectType=select/cons_tres
SelectTypeParameters=CR_Core_Memory
```

If cgroups are not enabled, Slurm can reserve resources, but Linux may not hard-limit all process usage.

The Ansible setup now shows detected CPU/RAM before generating `slurm.conf`. Operators can accept detected values or cap advertised resources, for example:

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i hosts.ini step4_main.yml --ask-vault-pass -e slurm_cpu_cap_per_node=12 -e slurm_memory_cap_mb_per_node=12288
```

## User Request Model

The portal accepts simple fields:

```json
{
  "total_cpu": 1,
  "total_ram": "1G",
  "time": "04:00:00",
  "entry_point": "__jupyter__"
}
```

The job-api converts this into Slurm-native directives:

```bash
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=1
#SBATCH --mem-per-cpu=1024M
#SBATCH --distribution=block:block
#SBATCH --hint=nomultithread
```

For a 1 CPU / 1 GB Jupyter job, this means:

- one Slurm task
- one CPU assigned to that task
- 1024 MB memory assigned per CPU
- total requested memory is 1 GB

## Allocation Strategy

The planner prefers horizontal allocation for batch Python workloads:

```text
ntasks = total_cpu
cpus_per_task = 1
mem_per_cpu = ceil(total_memory / total_cpu)
```

Example: 32 CPU / 64 GB Python batch job:

```bash
#SBATCH --ntasks=32
#SBATCH --cpus-per-task=1
#SBATCH --mem-per-cpu=2048M
```

This keeps jobs easy for Slurm to pack across nodes.

Vertical allocation is used only for shared-memory workloads:

- Jupyter
- interactive sessions
- explicit `multithread`
- explicit `single_node`

Example: 4 CPU / 8 GB Jupyter job:

```bash
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem-per-cpu=2048M
```

This gives the notebook one process space with 4 CPUs and 8 GB total memory.

## No-Waste Logic

The planner reads live Slurm state at submit time:

- `scontrol show nodes -o`
- `sinfo` fallback
- `squeue` queue pressure

It avoids hardcoded node specs. It computes:

- healthy nodes only
- free CPUs
- free memory
- maximum single-node capacity
- expected node distribution
- whether the request can run now or should queue

For portal-created jobs, the deployment can also set:

```bash
PORTAL_SLURM_NODELIST=head-node
```

or a comma-separated list:

```bash
PORTAL_SLURM_NODELIST=head-node,worker-node1,worker-node2
```

Only include nodes that can read and write the same `/data_storage` path mounted into the portal containers. If a compute node cannot access `/data_storage/<user>/slurm_logs`, Slurm may accept the job but fail it before stdout/stderr files are created.

The planner rejects impossible requests before submission, but allows valid requests to queue when resources are temporarily busy.

## Submission Transport

The job-api can submit through:

- Slurm REST when JWT auth is healthy
- `sbatch` CLI fallback when Slurm REST auth is unavailable

Both paths submit the same generated Slurm script. The CLI fallback is production-safe and cluster-native. It should not be treated as a failed submission path.

## Generated Runtime Contract

Every submitted job exports a resource contract into the job environment:

```bash
PORTAL_REQUEST_ID
PORTAL_ALLOCATION_MODE
PORTAL_NTASKS
PORTAL_CPUS_PER_TASK
PORTAL_ALLOCATED_CPUS
PORTAL_MEM_PER_CPU_MB
PORTAL_ALLOCATED_MEMORY_MB
PORTAL_ALLOCATED_MEMORY_GB
PORTAL_EXPECTED_NODE_COUNT
```

Every job also writes:

```text
/data_storage/<username>/.portal_resource_allocation.json
/data_storage/<username>/slurm_logs/resource_<jobid>.json
```

Example content:

```json
{
  "request_id": "JOBPLAN-xxxxxxxxxxxx",
  "job_id": "2968",
  "allocation_mode": "single-node",
  "ntasks": 1,
  "cpus_per_task": 1,
  "allocated_cpus": 1,
  "memory_per_cpu_mb": 1024,
  "allocated_memory_mb": 1024,
  "allocated_memory_gb": 1,
  "slurm_job_cpus_per_node": "1",
  "slurm_job_node_list": "worker-node17"
}
```

## Verify From Head Node

Use the Slurm job id shown in the portal:

```bash
JOBID=2968
scontrol show job "$JOBID"
```

For 1 CPU / 1 GB, check:

```text
NumCPUs=1
NumTasks=1
CPUs/Task=1
ReqTRES=cpu=1,mem=1G,node=1
MinMemoryCPU=1G
```

For accounting:

```bash
sacct -j "$JOBID" --format=JobID,JobName,State,AllocCPUS,ReqMem,MaxRSS,Elapsed,NNodes,NTasks
```

Expected:

```text
AllocCPUS = 1
ReqMem    = 1G or 1024Mc
MaxRSS    should stay under the requested memory
```

Important distinction:

- `scontrol show job` proves the Slurm assignment/reservation.
- cgroup files prove the Linux enforcement boundary when Slurm cgroups are enabled.
- `sacct MaxRSS`, `AveCPU`, and elapsed time show what the job actually consumed.

A job does not need to consume 100% of assigned CPU or memory to be correct. It must stay inside the assigned CPU and memory contract. For example, a 1 GB job using 300 MB is healthy and not wasteful if the user requested that memory for peak usage. A job exceeding 1 GB should be constrained or killed by Slurm/cgroups.

For live queue/runtime:

```bash
squeue -j "$JOBID" -o "%.18i %.9T %.10M %.6D %.12C %.12m %R"
```

## Verify Inside Jupyter

Run this in a notebook cell:

```python
import json
import os
from pathlib import Path

contract_path = Path.home() / ".portal_resource_allocation.json"
print(contract_path.read_text())

contract = json.loads(contract_path.read_text())
print("Portal allocated CPUs:", contract["allocated_cpus"])
print("Portal allocated memory GB:", contract["allocated_memory_gb"])

for key in [
    "SLURM_JOB_ID",
    "SLURM_JOB_NODELIST",
    "SLURM_CPUS_PER_TASK",
    "SLURM_JOB_CPUS_PER_NODE",
    "PORTAL_ALLOCATED_CPUS",
    "PORTAL_ALLOCATED_MEMORY_GB",
]:
    print(key, "=", os.environ.get(key))
```

To inspect process CPU affinity:

```python
from pathlib import Path

for line in Path("/proc/self/status").read_text().splitlines():
    if line.startswith(("Cpus_allowed_list", "Mems_allowed_list")):
        print(line)
```

To inspect cgroup memory limit:

```python
from pathlib import Path

for path in [
    Path("/sys/fs/cgroup/memory.max"),
    Path("/sys/fs/cgroup/memory/memory.limit_in_bytes"),
]:
    if path.exists():
        print(path, path.read_text().strip())
```

If cgroups are enabled, the value should correspond to the assigned memory limit or the containing Slurm step limit.

## Verify Inside Python App

Add this at the top of any Python script submitted through the portal:

```python
import json
import os
from pathlib import Path

contract_path = Path.home() / ".portal_resource_allocation.json"
if contract_path.exists():
    contract = json.loads(contract_path.read_text())
    print("[RESOURCE CONTRACT]", json.dumps(contract, indent=2))

print("[SLURM] job_id =", os.environ.get("SLURM_JOB_ID"))
print("[SLURM] node_list =", os.environ.get("SLURM_JOB_NODELIST"))
print("[SLURM] cpus_per_task =", os.environ.get("SLURM_CPUS_PER_TASK"))
print("[PORTAL] allocated_cpus =", os.environ.get("PORTAL_ALLOCATED_CPUS"))
print("[PORTAL] allocated_memory_gb =", os.environ.get("PORTAL_ALLOCATED_MEMORY_GB"))
```

For multiprocessing or threaded Python apps, use the allocation instead of `os.cpu_count()`:

```python
import os

workers = int(os.environ.get("PORTAL_ALLOCATED_CPUS", "1"))
```

This prevents Python workloads from accidentally spawning more workers than Slurm assigned.

## Job Logs

Every generated job prints verification lines at startup:

```text
[VERIFY] Slurm job id: 2968
[VERIFY] Slurm node list: worker-node17
[VERIFY] Slurm CPUs per task: 1
[VERIFY] Slurm CPUs per node: 1
[VERIFY] Portal resource contract: /data_storage/test/.portal_resource_allocation.json
[VERIFY] Cpus_allowed_list: ...
[VERIFY] cgroup memory.max: ...
```

Use the portal monitor/log drawer or the raw Slurm output file:

```bash
cat /data_storage/<username>/slurm_logs/<username>_<jobid>.out
cat /data_storage/<username>/slurm_logs/<username>_<jobid>.err
```

## Operational Notes

- REST auth failures do not mean the job failed if `sbatch` fallback succeeds.
- The portal should show users the Slurm job id, allocation, audit log path, and runtime verification data.
- Keep Slurm REST auth healthy for richer API queries, but `sbatch` is the authoritative production submission path in this deployment.
- For demo validation, use `scontrol show job`, `sacct`, the portal job details, and `.portal_resource_allocation.json`.
