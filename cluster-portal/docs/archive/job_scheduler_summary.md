# HPC Scheduler Engine — Implementation Summary

## What Was Built

A **production-grade Best-Fit Decreasing (BFD) scheduler engine** integrated into the HPC Portal, with a dedicated admin-only management interface. **No existing job submission workflows were modified.**

---

## Files Created (New)

### Backend — Scheduler Engine (`backend/app/scheduler/`)

| File | Purpose |
|------|---------|
| [__init__.py](file:///d:/AMRITA-PROJECTS/HPC-PORTAL-MAIN/lab-cluster/backend/app/scheduler/__init__.py) | Package init |
| [resource_manager.py](file:///d:/AMRITA-PROJECTS/HPC-PORTAL-MAIN/lab-cluster/backend/app/scheduler/resource_manager.py) | Per-node + cluster resource accounting with atomic alloc/dealloc |
| [engine.py](file:///d:/AMRITA-PROJECTS/HPC-PORTAL-MAIN/lab-cluster/backend/app/scheduler/engine.py) | BFD scheduling core with two-level validation |
| [sync.py](file:///d:/AMRITA-PROJECTS/HPC-PORTAL-MAIN/lab-cluster/backend/app/scheduler/sync.py) | Database ↔ Engine synchronization bridge |
| [simulation.py](file:///d:/AMRITA-PROJECTS/HPC-PORTAL-MAIN/lab-cluster/backend/app/scheduler/simulation.py) | Standalone test runner for reference scenario + edge cases |

### Backend — API

| File | Purpose |
|------|---------|
| [scheduler.py](file:///d:/AMRITA-PROJECTS/HPC-PORTAL-MAIN/lab-cluster/backend/app/api/v1/scheduler.py) | `/api/v1/scheduler/*` endpoints — state, validate, sync, policy, simulation |

### Frontend

| File | Purpose |
|------|---------|
| [scheduler.ts](file:///d:/AMRITA-PROJECTS/HPC-PORTAL-MAIN/lab-cluster/frontend/src/api/scheduler.ts) | API client for scheduler endpoints |
| [JobOrchestrationPage.tsx](file:///d:/AMRITA-PROJECTS/HPC-PORTAL-MAIN/lab-cluster/frontend/src/pages/management/JobOrchestrationPage.tsx) | Admin UI — node resource map, policy config, validator, simulation |

### Documentation

| File | Purpose |
|------|---------|
| [JOB-MANAGEMENT.md](file:///d:/AMRITA-PROJECTS/HPC-PORTAL-MAIN/lab-cluster/JOB-MANAGEMENT.md) | Comprehensive scheduler documentation |

---

## Files Modified (Minimal, Additive Only)

| File | Change |
|------|--------|
| [api.py](file:///d:/AMRITA-PROJECTS/HPC-PORTAL-MAIN/lab-cluster/backend/app/api/v1/api.py) | +2 lines: import + register scheduler router |
| [jobs.py](file:///d:/AMRITA-PROJECTS/HPC-PORTAL-MAIN/lab-cluster/backend/app/api/v1/jobs.py#L153-L162) | Changed quota check from `PENDING+RUNNING` → `RUNNING` only |
| [App.tsx](file:///d:/AMRITA-PROJECTS/HPC-PORTAL-MAIN/lab-cluster/frontend/src/App.tsx) | +1 import + 4 lines route definition |
| [Layout.tsx](file:///d:/AMRITA-PROJECTS/HPC-PORTAL-MAIN/lab-cluster/frontend/src/components/Layout.tsx) | +1 sidebar nav item + 1 line page name |

---

## Key Design Principles

```
┌─────────────────────────────────────────────────┐
│  LEVEL 0: User Quota Check (RUNNING jobs only)  │
│  → Validates against user's cpu_limit/ram_limit │
├─────────────────────────────────────────────────┤
│  LEVEL 1: Global Cluster Cap Check              │
│  → used + requested ≤ max_allocatable           │
│  → REJECT immediately if exceeded               │
├─────────────────────────────────────────────────┤
│  LEVEL 2: Node Fit Check (BFD Selection)        │
│  → Find node with free_cpu ≥ job.cpu AND        │
│    free_ram ≥ job.ram                            │
│  → Prefer highest-utilization node (pack)       │
│  → QUEUE if no single node fits                 │
└─────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Only RUNNING jobs** are counted against resource quotas. PENDING jobs are queued but not consuming physical cluster resources.

## Deployment Steps

1. Copy the new files to the production server
2. Restart the backend service (`uvicorn app.main:app`)
3. Rebuild the frontend (`npm run build`)
4. Access **Management → Job Engine** in the sidebar
5. Click **"Sync from DB"** to initialize the scheduler from current node/job state
6. Configure the cluster policy (default: 16 CPU / 14 GB RAM)
7. Run the reference simulation to verify correctness

## Running the Standalone Simulation

```bash
cd /opt/lab-cluster/backend
python -m app.scheduler.simulation
```

This runs the reference scenario and all edge case tests independently of the web portal.
