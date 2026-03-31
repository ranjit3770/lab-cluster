# Strach Portal // HPC Management Interface

A professional, high-density control plane for modern HPC clusters. Designed for researchers and administrators to manage Slurm workloads, compute resources, and system governance with a premium, terminal-inspired aesthetic.

## 🚀 Core Capabilities

### 1. Research & Workload Dispatch
- **Interactive Jupyter Hub**: Provision isolated Jupyter Lab environments with automatic user identity mapping.
- **Batch Workload Registry**: Streamlined submission of Python workloads with pip dependency management and real-time log telemetry.
- **Job Monitoring**: Live status tracking (Pending, Running, Completed, Failed) with detailed output/error log streaming.

### 2. Unified Management Console
- **Platform Configuration**: Centralized control over Slurm REST API (v0.0.44), session constraints, and identity providers.
- **Job Registry Enforcement**: Administrative caps for concurrent batch and interactive sessions per user.
- **Maintenance Governance**: Global system lock with IP-based whitelisting for seamless infrastructure upgrades.
- **Admin Diagnostic Tools**: Integrated terminal console for direct node access and fabric troubleshooting.

### 3. Resource & Identity Governance
- **Quota Management**: Individualized CPU, RAM, and Storage allocations per researcher.
- **Cluster Inventory**: Federated view of Slurm compute nodes and administrative gateway nodes.
- **Audit & Feedback**: Integrated system feedback loop for researcher-administrator communication.

## 🛠️ Technology Stack

- **Framework**: React + Vite (Frontend), FastAPI (Backend & Job-API)
- **Database**: MariaDB 10.6 (Persistent Identity & Job Registry)
- **Slurm Integration**: Slurm REST API v0.0.44 via Unix Socket
- **Styling**: Tailwind CSS + Radix UI + Lucide Icons
- **Aesthetic**: Custom High-Density "Datadog-Inspired" Monotonic Design

## 📦 Deployment & Development

### Local Development
```bash
# Clone the repository
git clone <repository-url>

# Start Frontend
cd frontend && npm install && npm run dev

# Start Backend (Requires Python 3.9+)
cd backend && pip install -r requirements.txt && python app/main.py
```

### Production Environment (Docker Persistence)
The portal is production-ready with a containerized architecture. Database volumes are persistent.

```bash
# Start the full stack
docker-compose up -d --build

# 🛑 AVOID deleting existing data:
# DO NOT use 'docker-compose down -v' as it will destroy persistent volumes.
# Use 'docker-compose down' (without -v) to stop services while keeping data.
```

## 🔐 Administrative Credentials
Default users seeded by `initial_data.py`:
- **Admin**: `admin` / `admin123`
- **Ranjithks (Admin)**: `ranjithks` / `ranjit123`

---
*Developed for advanced research environments requiring robust scheduling and secure data isolation.*
