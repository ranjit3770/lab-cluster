# FastAPI Job Execution API (SRS v1.1)

## 📘 Overview

The **FastAPI Job Execution API** is a mission-critical, internal-only backend service designed to securely execute compute jobs on a SLURM cluster. It acts as a strict gatekeeper, enforcing admin-defined resource quotas (Disk, CPU, Memory) and **mandatory I/O throttling via Cgroups v2** before submitting jobs to the scheduler.

**Version**: 1.1 (FINAL)
**Role**: Pure Enforcement Engine & SLURM Interface
**Compliance**: Strictly adheres to SRS v1.1 regarding isolation and resource control.

---

## 🏗 System Architecture

The service sits between the Portal Backend and the SLURM Cluster Management infrastructure.

```text
[ Web UI ] -> [ Portal Backend API ] -> [ Job Execution API ] -> [ SLURM CLI / Cgroups v2 ]
```

### Key Technologies
*   **Framework**: FastAPI (High-performance Async Python)
*   **Database**: MySQL (Stores User Quotas & Job Metadata)
*   **Scheduler Interface**: SLURM CLI (`sbatch`, `squeue`, `scancel`, `sacct`)
*   **Isolation**:
    *   **Filesystem**: Dedicated per-user workspaces (`/var/lib/job-exec/users/...`)
    *   **Runtime**: Per-user Python Virtual Environments
    *   **Resource Control**: Linux Control Groups v2 (I/O Throttling)

---

## 📂 Project Structure

```text
/
├── app/
│   ├── api/                # API Endpoints (v1)
│   ├── core/               # Application Configuration & Security
│   │   ├── config.py       # Pydantic Settings management
│   │   └── errors.py       # Standardized error handling
│   ├── models/             # SQLAlchemy Database Models
│   │   └── models.py       # Job & UserQuota definitions
│   ├── schemas/            # Pydantic Data Schemas (Request/Response)
│   └── services/           # Core Business Logic (To be implemented)
│       ├── slurm.py        # Wrapper for SLURM CLI commands
│       ├── cgroups.py      # Cgroups v2 I/O enforcement logic
│       └── environment.py  # Workspace & Venv management
├── troubleshooting.py      # ✅ System Diagnostic Tool
├── main.py                 # Application Entry Point
├── requirements.txt        # Python Dependencies
└── README.md               # Project Documentation
```

---

## 🚀 Setup & Installation

### Prerequisites
*   **OS**: Linux (HPC Head Node or submission node)
*   **Python**: 3.8+
*   **SLURM**: Installed and configured (`TaskPlugin=task/cgroup`, `ProctrackType=proctrack/cgroup`)
*   **Cgroups**: **v2 Enabled** (`/sys/fs/cgroup/slurm` must exist)
*   **Database**: MySQL 5.7+ or 8.0

### 1. clone the repository
```bash
git clone <repo_url>
cd FASTAPI-JOB-SUBMISSION
```

### 2. Environment Configuration
Create a `.env` file in the root directory (or set env vars):

```ini
APP_NAME="FastAPI Job Execution API"
DB_HOST="localhost"
DB_PORT=3306
DB_USER="job_exec_user"
DB_PASSWORD="secure_password"
DB_NAME="slurm_job_db"

# Crucial Paths
BASE_JOB_DIR="/var/lib/job-exec/users"
SLURM_BIN_PATH="/usr/bin"
CGROUP_ROOT="/sys/fs/cgroup/slurm"
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Run Troubleshooting Tool
Before starting the service, run the built-in diagnostic script to verify the environment:

```bash
python troubleshooting.py
```
*Checks for: Python version, Dependencies, SLURM binaries, Cgroups v2 root, and DB connection.*

### 5. Start the Service
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```
*(Note: access restricted to internal network only)*

---

## 🛡️ Core Implementation Specifications (Mandatory SRS v1.1)

### 1. Resource & Quota Enforcement
*   **Concurrent Job Limits (FR-8)**:
    *   **Logic**: Before submission, query DB for count of jobs in `PENDING` or `RUNNING` state for the user.
    *   **Enforcement**: If `active_jobs >= max_concurrent_jobs`, immediate **REJECTION**.
    *   **Race Condition Prevention**: A job record is inserted into the DB *before* calling `sbatch`.
*   **Two-Phase Disk Quota (FR-6)**:
    *   **Phase 1 (Pre-Allocation)**: Check if `current_usage` > `disk_quota_mb` before creating job directory. Reject if full.
    *   **Phase 2 (Post-Install)**: After dependency installation, re-calculate usage. If `current_usage` > `disk_quota_mb`, **abort job** and cleanup.
*   **CPU/Memory Injection (FR-7)**:
    *   Values are **hard-coded** from MySQL `UserQuota` into `sbatch` flags. User requests are ignored to prevent resource manipulation.

### 2. Dependency Installation Pipeline (FR-5)
*   **Isolation**: All packages installed into `/var/lib/job-exec/users/{user_id}/venv`.
*   **Safety Checks**:
    *   **Max Dependency Count**: Parser checks `requirements.txt` line count (limit: 50).
    *   **Timeout**: `pip install` enforced with strict timeout (e.g., 60s).
    *   **No Cache**: executed with `--no-cache-dir` to prevent storage bloat.
    *   **Failure Protocol**: If installation fails, job status -> `FAILED`, directory cleaned up (if policy requires), user notified.

### 3. Cgroups v2 I/O Enforcement (FR-14)
*   **Mechanism**: Direct interaction with `/sys/fs/cgroup/slurm/uid_{uid}/job_{slurm_id}/io.max`.
*   **Timeout Handling**:
    *   Process polls for cgroup existence after `sbatch` submission.
    *   **Timeout**: If cgroup does not appear within **5 seconds** (configurable), issue `scancel`.
    *   **Write Failure**: If writing to `io.max` raises `OSError` (EPERM/ENOENT), issue `scancel`.
    *   **Strictness**: Using default system limits is **not allowed**. Job must be killed if strict limits cannot be applied.

### 4. Job Lifecycle Management
*   **State Normalization (FR-11)**:
    *   `PENDING`, `CONFIGURING`, `RESIZING` → **PENDING**
    *   `RUNNING` → **RUNNING**
    *   `COMPLETED` → **COMPLETED**
    *   `FAILED`, `BOOT_FAIL`, `NODE_FAIL` → **FAILED**
    *   `CANCELLED`, `TIMEOUT`, `PREEMPTED` → **CANCELLED**
*   **Cancellation Validation (FR-12)**:
    *   **Ownership**: API Key checks are not enough; Database lookup matches `job_id` to `user_id`.
    *   **State Validity**: Can only cancel jobs in `PENDING` or `RUNNING` normalized state.
    *   **Action**: Executes `scancel {slurm_id}`.

### 5. Isolated User Environments (FR-1 & FR-2)
*   **Structure**: `/var/lib/job-exec/users/{user_id}/`
*   **Persistence**: The virtual environment is persistent across jobs for the same user to save build time, but the **Job Directory** is unique per execution.

---

## 👩‍💻 Developer Guide

### Database Models
*   **`UserQuota`**: Stores limits (disk_mb, cpus, mem, io_read_mb_s, etc.).
*   **`Job`**: Stores internal UUID, SLURM Job ID, Status, and Script Path.

### Adding New Features
1.  **Strict Compliance**: Always check `srs_v1.1.md` before making changes.
2.  **No User Inputs**: Never execute raw user commands. Always wrap in `sbatch`.
3.  **Idempotency**: Ensure job submission logic handles retries gracefully.

---
