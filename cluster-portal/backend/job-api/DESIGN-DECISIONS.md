# Job-API Design Decisions

Why the portal implements **no scheduling logic of its own**, and which job
model rules the submission layer follows. This consolidates the earlier
"why not add a scheduler" note and the design review of the original job
logic into a single reference.

## Decision 1 — Slurm Is The Only Scheduler

Slurm already handles everything a custom scheduler would try to do:

| Concern | Owner |
| --- | --- |
| Which node runs the job | Slurm |
| When the job starts | Slurm |
| Priority and queue order | Slurm |
| Resource allocation (CPU, RAM) | Slurm |

The portal's entire responsibility is:

1. Validate the user request.
2. Generate a correct `sbatch` script.
3. Submit it.

The portal must **not**:

- Choose nodes manually or pin jobs to specific nodes.
- Decide job start order.
- Try to "fit" jobs onto nodes itself.

Any of those conflicts with Slurm and produces inconsistent state.

**One-line summary:** you request resources; Slurm decides execution.

## Decision 2 — Cluster As A Resource Pool

The design treats the cluster as one global pool: users request resources,
and the scheduler finds suitable nodes. Removing hardcoded node IDs was a
deliberate, production-correct change — manual node forcing is an anti-pattern
because Slurm already optimizes node selection, load balancing, and backfilling.

## Decision 3 — Flexible Task Model (ntasks x cpus-per-task)

The original model forced every request into:

```bash
#SBATCH --ntasks={total_cpu}
#SBATCH --cpus-per-task=1
#SBATCH --mem={total_ram}G
```

That works but assumes "many tasks, one CPU each", which does not fit all real
workloads:

| Workload | Correct shape |
| --- | --- |
| MPI / distributed | many tasks across nodes |
| Multithreaded | fewer tasks, more CPUs per task |
| GPU | different model entirely (`--gres`) |

**Rule adopted:** total CPU is expressed as `ntasks x cpus-per-task`, and the
planner picks the shape by job intent:

```python
if job_type == "multithread":
    ntasks = 1
    cpus_per_task = total_cpu
elif job_type == "mpi":
    ntasks = total_cpu
    cpus_per_task = 1
```

Examples:

```bash
# Multithreaded job (shared memory)
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=8

# MPI job (distributed)
#SBATCH --ntasks=8
#SBATCH --cpus-per-task=1
```

Vertical single-node allocation is used only when the workload needs shared
memory (Jupyter, interactive, explicit `multithread`/`single_node`); batch
work defaults to horizontal distribution. See
[SMART-SLURM-ORCHESTRATION.md](SMART-SLURM-ORCHESTRATION.md).

## Decision 4 — No Node-Wise Pre-Validation Blocking

An early idea validated CPU/RAM against authorized nodes before submitting and
blocked on shortage. Review found this conceptually wrong:

- It duplicates scheduler logic Slurm already maintains (free CPUs, free
  memory, node states).
- It is racy: user A validates successfully, user B submits and consumes the
  resources, then A's submission fails or waits anyway.

**Rule adopted:** valid requests are always submitted. If resources are busy,
the job queues in Slurm. Validation exists to reject *impossible* requests
(requests that cannot fit any healthy configured node set), not to predict
scheduler availability. Users get a warning, never a silent drop.

## Decision 5 — Modes Replaced By Intent

The old `node_wise` / `random` allocation modes were removed:

- `random` (global pool) was simply default Slurm behavior — no mode needed.
- `node_wise` was replaced by intent-based `job_type` inputs:

```text
job_type: mpi | single-node | multi-thread
```

Advanced users who need precise control can still pass native values directly:
`ntasks`, `cpus_per_task`, `mem_per_cpu`, `partition`, `constraint`,
`gpu_count`.

## Resulting Architecture

```text
User input:  total_cpu, total_ram, time, entry_point/command (+ optional advanced fields)
                |
                v
Planner:     live cluster snapshot -> validation -> task-shape decision -> packing estimate
                |
                v
Generator:   #SBATCH directives + runtime contract + environment setup
                |
                v
Submission:  Slurm REST (preferred) or sbatch CLI fallback
```

No allocation "modes"; Slurm remains the final authority at every step.

## Review Summary (Historical)

| Component | Verdict at review time | Resolution |
| --- | --- | --- |
| Slurm-native scheduling | Correct | Kept as core principle |
| Removing node hardcoding | Excellent | Kept |
| Resource abstraction | Needed improvement | Flexible ntasks x cpus-per-task model adopted |
| Allocation modes | Over-engineered | Removed; intent-based `job_type` instead |
| Strict pre-validation | Too aggressive | Warn-and-queue; block only impossible requests |
