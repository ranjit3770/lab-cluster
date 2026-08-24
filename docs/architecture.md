# Architecture

## Current topology

```text
                     ┌────────────────────────────┐
                     │   React Portal (nginx)     │  port 5173 → 80
                     │   cluster-portal/frontend  │
                     └─────────────┬──────────────┘
                                   │ REST (/api/v1)
                     ┌─────────────┴──────────────┐
                     │ Portal Backend (FastAPI)   │  port 8000, host network
                     │ identity · RBAC · files ·  │
                     │ node inventory · requests  │
                     └───────┬───────────┬────────┘
                             │           │ job dispatch (HTTP)
              ┌──────────────┘           ▼
              │            ┌───────────────────────────┐
              │            │ Job-API (FastAPI)         │  port 9000, host network
              │            │ planner → sbatch/slurmrestd│
              │            └──────────┬────────────────┘
              │                       │ slurmrestd v0.0.41 (JWT/Munge)
              ▼                       ▼
     ┌────────────────┐      ┌────────────────┐
     │ MariaDB 10.6   │      │ Slurm          │
     │ strach_portal  │      │ controller     │
     │ slurm_jobs     │      ├────────────────┤
     └────────────────┘      │ Linux workers  │
                             │ Windows nodes  │ (dual-boot, Ansible-managed)
                             └────────────────┘

Cross-cutting:
  Ansible playbooks (ansible/) own infrastructure state.
  Audit trail: audit_logs table + structured JSON stdout logs.
  Metrics: /metrics (Prometheus text) when METRICS_ENABLED=1.
```

## Component responsibilities

| Component | Responsibility | Never does |
| --- | --- | --- |
| Frontend | Presentation only | Authorization decisions |
| Portal backend | Identity, quotas, user lifecycle, node registry, audit | Scheduling logic |
| Job-API | Resource planning from live Slurm state, submission, log streaming | User identity management |
| Ansible | OS/Slurm provisioning, dual-boot switching, repair | Runtime portal operations |

## Request flow for a job submission

```text
Browser → POST /api/v1/jobs (JWT)
Portal backend:
  1. authenticate + authorize (server-side ownership/quota checks)
  2. persist job row (PENDING)
  3. POST {JOB_API}/submit
Job-API:
  4. plan_resources(): reads live Slurm state, derives ntasks/cpus-per-task/
     mem-per-cpu, applies allowlist/exclusion policies
  5. submit to slurmrestd; record slurm_job_id
  6. async status/log sync back into slurm_jobs DB
Portal backend:
  7. job status surfaced on Dashboard/Jobs pages
```

## Roles

| Role | Value | Capabilities (enforced server-side) |
| --- | --- | --- |
| Developer (superuser) | `developer` | Everything an admin can do, plus provisioning/removal of admin & developer accounts, developer console |
| Admin | `admin` | User management (non-privileged roles), settings, node operations, view all jobs |
| User (researcher/student) | `user` | Own jobs/files/dashboard only |

## Key source locations

| Concern | Path |
| --- | --- |
| Auth/RBAC dependencies | `cluster-portal/backend/app/api/deps.py` |
| Login throttling | `cluster-portal/backend/app/api/v1/login.py` |
| Audit helper/model | `cluster-portal/backend/app/core/audit.py`, `app/models/audit.py` |
| Observability | `cluster-portal/backend/app/core/observability.py` (+ mirror in `job-api/app/`) |
| Resource planner | `cluster-portal/backend/job-api/app/planner.py` |
| Slurm client | `cluster-portal/backend/job-api/app/slurm.py` |
