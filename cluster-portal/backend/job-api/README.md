# Job-API // Slurm Compute Fabrication

High-fidelity Python workload submission and Jupyter Hub orchestration service. Directly interacts with the Slurm fabric via Unix Sockets (v0.0.44).

## 🏗️ Core Functions
- **Slurm Dispatcher**: Converts researcher job requests into Slurm `sbatch` workloads with automated environment isolation.
- **Resource Planner**: Intelligent node-wise or random resource allocation based on real-time cluster availability.
- **Log Streamer**: Live, low-latency log telemetry via streaming response architecture.
- **Job Control**: High-priority stop/cancel signals and status interrogation.

## 📂 Architecture
- `app/main.py`: FastAPI gateway and maintenance middleware.
- `app/planner.py`: Multi-strategy resource arbitration (Node-wise/Random).
- `app/slurm.py`: Direct Slurm interaction logic (Interrogates Slurm REST API).
- `app/models.py`: Local job log registry for persistence.

## 🚀 Deployment
Deployed as a containerized service (Port 9000). Requires direct access to:
- `/etc/slurm`: Slurm configuration (Read-only).
- `/var/run/munge`: Integrity verification socket.
- `/run/slurmrestd`: Slurm OpenAPI Unix socket.

## 🔐 Security
Uses a dedicated `slurm_user` identity for database registry access. Maintenance mode is enforced via cross-database verification against the portal's `strach_portal` system settings.
