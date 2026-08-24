# Quota And Job Lifecycle Rules

Operational contract for user quotas, queue dispatch, and job deletion in the
Job-API. This consolidates the original fix specification, hardening rules,
and root-cause analysis of past incidents into one enforceable reference.

## Golden Rules

- This is a live production system: do not break existing workflows.
- **Slurm is always the source of truth** for resource usage and job state.
- Never delete a database record before Slurm cleanup.

---

## 1. Quota Counting

### Count RUNNING jobs only

PENDING jobs hold no allocation yet and must not consume quota:

```python
if state != "RUNNING":
    continue
```

Incident that established this rule: a submission was rejected because usage
was computed as 11 CPU — but that total included four PENDING jobs. Only one
job (4 CPU) was actually RUNNING, so the correct usage was 4 CPU.

### Usage comes only from live Slurm data

```text
ALL resource usage MUST come ONLY from Slurm (squeue)
```

Forbidden sources: database-computed usage, cached values, frontend-side
calculations.

```python
live_cpu, live_ram = get_slurm_usage(username)
```

### Prevent double counting

`squeue` can emit multiple rows per job (one per task/step). Group by job ID
and count each running job exactly once:

```bash
squeue --format="%i %C %m"
```

## 2. Queue Dispatch And State Transitions

### Atomic per-user dispatch

Multiple queued jobs must not dispatch simultaneously. Before dispatching:

```python
LOCK user queue
recalculate usage
dispatch ONLY ONE job
UNLOCK
```

Rule: the queue worker processes jobs **one-by-one per user**.

### Allowed state transitions only

```text
WAITING -> (queue worker submits) -> PENDING -> RUNNING
```

Forbidden transitions:

```text
WAITING -> UNKNOWN   (never)
WAITING -> RUNNING   (never; must pass through submission)
```

### Queued jobs always have an identifier

The API schema requires `job_id` to be a string — it must never be `None`
(a past crash: queued jobs returned `None` and FastAPI raised a
`ResponseValidationError` on `POST /submit`). Locally queued (not yet
submitted) jobs receive a synthetic ID:

```python
if queued:
    job_id = f"LOCAL-{uuid}"
```

### Anti-stuck safety fallback

```python
if job.status == WAITING and age > 30 minutes:
    re-evaluate OR mark FAILED
```

## 3. Job Deletion / Termination Flow

Deleting a job must terminate it in Slurm **first**, then touch the database.
A past bug deleted only the DB row while the Slurm job kept running, silently
consuming quota and creating "ghost" jobs.

### Required order

```text
User clicks delete
    |
    |-- IF slurm_job_id exists:
    |       scancel <slurm_job_id>
    |       verify removal via squeue -j <id>   (retry scancel up to 3 times)
    |       set status = CANCELLED
    |
    |-- ELSE (local queued job):
    |       remove from local queue only (no scancel)
    |
    v
ONLY THEN update the database
```

Termination uses:

```python
subprocess.run(["scancel", str(job.slurm_job_id)], check=True)
```

Verification after cancel:

```bash
squeue -j <job_id>
```

### Edge cases

| Case | Behavior |
| --- | --- |
| Job already finished | `scancel` fails — ignore safely, still mark CANCELLED. |
| Local queued job (no Slurm ID) | Remove from queue only; no `scancel`. |
| Slurm job missing from queue | Mark CANCELLED without raising an error. |

### Strictly forbidden

- Deleting the DB row without cancelling the Slurm job.
- Leaving orphan Slurm jobs consuming resources.
- Returning success without actual termination.
- Setting status to UNKNOWN after delete.

## 4. Separation Of Responsibilities

```text
Portal system: controls USER quota
Slurm:         controls CLUSTER scheduling
```

Never simulate the Slurm queue and never override Slurm scheduling decisions.

## 5. Debugging Aids

Mandatory debug lines while tuning quota behavior:

```python
print(f"[DEBUG] CPU: {live_cpu}, RAM: {live_ram}")
print(f"[DEBUG] REQUEST: {requested_cpu}, {requested_ram}")
print(f"[DEBUG] LIMIT: {cpu_limit}, {ram_limit}")
```

Final validation guard before any submission:

```python
assert cpu_limit > 0
assert requested_cpu > 0
```

## 6. Incident Lessons (Root-Cause Summary)

| Symptom seen in logs | Root cause | Rule that fixed it |
| --- | --- | --- |
| `[QUOTA] HARD REJECT`, computed usage 11 CPU with mostly PENDING jobs | PENDING jobs counted toward quota | Section 1: count RUNNING only |
| `ResponseValidationError: job_id = None` on submit of queued job | Null job id returned for local queue entries | Section 2: `LOCAL-{uuid}` identifiers |
| Deleted job kept running in Slurm, quota still consumed | DB-only deletion | Section 3: scancel → verify → update DB |

Expected outcomes of following this document: Slurm and database stay
synchronized, no ghost jobs, correct quota enforcement, clean job lifecycle.

Priority if revisiting: termination correctness first, then quota math, then
API response shape.
