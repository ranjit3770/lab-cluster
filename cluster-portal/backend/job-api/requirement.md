### 🚀 FINAL HPC FIX — QUOTA + STATUS + SLURM TERMINATION (PRODUCTION CRITICAL)

---

# 🔒 CRITICAL RULES

- LIVE PRODUCTION SYSTEM
- DO NOT break existing workflows
- DO NOT delete DB records before Slurm cleanup
- Slurm is ALWAYS the source of truth

---

# 🎯 OBJECTIVE

Fix:

1. Incorrect quota calculation
2. API crash (job_id = None)
3. ❗ Job deletion not stopping Slurm jobs (CRITICAL)

---

# 🔧 SECTION 1 — QUOTA FIX (RUNNING ONLY)

---

## RULE:

```text
ONLY count RUNNING jobs for quota
IGNORE PENDING jobs
```

---

## IMPLEMENT:

```python
if state != "RUNNING":
    continue
```

---

---

# 🔧 SECTION 2 — API RESPONSE FIX

---

## RULE:

```text
job_id must NEVER be None
```

---

## IMPLEMENT:

```python
if queued:
    job_id = f"LOCAL-{uuid}"
```

---

---

# 🔧 SECTION 3 — SLURM TERMINATION (CRITICAL NEW FIX)

---

## ❗ CURRENT PROBLEM

```text
Delete job → only DB deleted ❌
Slurm job keeps running ❌
```

---

## ✅ REQUIRED IMPLEMENTATION

---

### STEP 1 — CHECK JOB TYPE

```python
if job.slurm_job_id is not None:
    terminate in Slurm
else:
    remove from local queue only
```

---

### STEP 2 — TERMINATE IN SLURM

Use:

```bash
scancel <job_id>
```

---

### Python implementation:

```python
subprocess.run(["scancel", str(job.slurm_job_id)], check=True)
```

---

### STEP 3 — VERIFY TERMINATION

```bash
squeue -j <job_id>
```

---

### IF job still exists:

```text
Retry scancel (max 3 times)
```

---

---

## 🔁 FINAL DELETE FLOW

```text
User clicks delete
    ↓
IF slurm_job_id exists:
    → scancel job
    → verify removal
    → update status = CANCELLED
ELSE:
    → remove from local queue

ONLY AFTER THAT:
    → update DB
```

---

## ❗ IMPORTANT RULE

```text
NEVER delete DB row before killing Slurm job
```

---

---

# 🔧 SECTION 4 — UI STATUS FIX

---

## AFTER DELETE:

```text
Status → CANCELLED
```

---

## NOT:

```text
UNKNOWN ❌
```

---

---

# 🔧 SECTION 5 — EDGE CASE HANDLING

---

## Case 1 — Job already finished:

```text
scancel fails → ignore safely
```

---

## Case 2 — Local queued job:

```text
Remove from queue only (no scancel)
```

---

## Case 3 — Slurm job missing:

```text
Mark as CANCELLED (no error)
```

---

---

# 🧪 VALIDATION

---

## CASE 1

```text
RUNNING job → delete
→ Slurm job killed ✅
→ status = CANCELLED ✅
```

---

## CASE 2

```text
WAITING job → delete
→ removed from queue ✅
```

---

## CASE 3

```text
After delete:
→ squeue shows NO job ✅
```

---

---

# 🚫 STRICTLY FORBIDDEN

- Deleting DB without scancel
- Leaving orphan Slurm jobs
- Returning success without actual termination
- Setting UNKNOWN after delete

---

# 🎯 FINAL RESULT

- Slurm and DB fully synchronized
- No ghost jobs consuming resources
- Correct quota enforcement
- Clean job lifecycle

---

# ⚡ PRIORITY

1. Slurm termination fix (CRITICAL)
2. Quota calculation fix
3. API response fix

---
