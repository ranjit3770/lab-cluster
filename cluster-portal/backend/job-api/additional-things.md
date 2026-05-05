### 🔧 ADDITIONAL HPC HARDENING (MANDATORY)

---

# 🧠 1. SINGLE SOURCE OF TRUTH (STRICT)

---

## RULE:

```text
ALL resource usage MUST come ONLY from Slurm (squeue)
```

---

## FORBIDDEN:

- DB-based usage ❌
- Cached values ❌
- Frontend calculations ❌

---

## ENFORCE:

```python
live_cpu, live_ram = get_slurm_usage(username)
```

---

# 🧠 2. PREVENT DOUBLE COUNTING (CRITICAL)

---

## Problem:

`squeue` may include multiple entries per job

---

## FIX:

Ensure parsing counts **unique jobs only**

---

## REQUIRED:

```text
Use:
squeue --format="%i %C %m"

Group by job_id
```

---

# 🧠 3. ATOMIC QUEUE DISPATCH (RACE CONDITION FIX)

---

## Problem:

Multiple queued jobs may dispatch simultaneously

---

## FIX:

Before dispatch:

```python
LOCK user queue
recalculate usage
dispatch ONLY ONE job
UNLOCK
```

---

## RULE:

```text
Queue worker must process jobs ONE-BY-ONE per user
```

---

# 🧠 4. STRICT STATE TRANSITION RULE

---

## REQUIRED FLOW:

```text
WAITING → (queue worker) → submit → PENDING → RUNNING
```

---

## FORBIDDEN:

```text
WAITING → UNKNOWN ❌
WAITING → RUNNING ❌
```

---

# 🧠 5. HARD SEPARATION OF RESPONSIBILITIES

---

## RULE:

```text
Your system:
    controls USER quota

Slurm:
    controls CLUSTER scheduling
```

---

## NEVER:

- Try to simulate Slurm queue ❌
- Override Slurm decisions ❌

---

# 🧠 6. SAFETY FALLBACK (ANTI-STUCK JOB)

---

## REQUIRED:

```python
if job.status == WAITING and age > 30 minutes:
    re-evaluate OR mark FAILED
```

---

# 🧠 7. DEBUG LOGGING (MANDATORY FOR NOW)

---

Add:

```python
print(f"[DEBUG] CPU: {live_cpu}, RAM: {live_ram}")
print(f"[DEBUG] REQUEST: {requested_cpu}, {requested_ram}")
print(f"[DEBUG] LIMIT: {cpu_limit}, {ram_limit}")
```

---

# 🧠 8. VALIDATION GUARD (FINAL CHECK)

---

Before submission:

```python
assert cpu_limit > 0
assert requested_cpu > 0
```

---
