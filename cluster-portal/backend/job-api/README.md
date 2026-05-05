# Job-API // Slurm Compute Fabrication

High-fidelity Python workload submission and Jupyter orchestration service. It plans through live Slurm CLI telemetry and submits through the configured Slurm REST endpoint.

## 🏗️ Core Functions
- **Slurm Dispatcher**: Converts researcher job requests into Slurm `sbatch` workloads with automated environment isolation.
- **Resource Planner**: Dynamic horizontal-first allocation using live node CPU, memory, health, and queue state.
- **Log Streamer**: Live, low-latency log telemetry via streaming response architecture.
- **Job Control**: High-priority stop/cancel signals and status interrogation.

## 📂 Architecture
- `app/main.py`: FastAPI gateway and maintenance middleware.
- `app/planner.py`: Smart Slurm planning, packing, validation, and correction.
- `app/slurm.py`: Script generation, audit logging, `srun` execution, and Slurm REST submission.
- `SMART-SLURM-ORCHESTRATION.md`: Full implementation and operation notes.
- `app/models.py`: Local job log registry for persistence.

## 🚀 Deployment
Deployed as a containerized service (Port 9000). Requires direct access to:
- `/etc/slurm`: Slurm configuration (Read-only).
- `/var/run/munge`: Integrity verification socket.
- `/run/slurmrestd`: Slurm OpenAPI Unix socket.

## 🔐 Security
Uses a dedicated `slurm_user` identity for database registry access. Maintenance mode is enforced via cross-database verification against the portal's `strach_portal` system settings.
