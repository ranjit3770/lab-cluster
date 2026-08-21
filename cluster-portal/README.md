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
- **Node Management**: Admin-only two-column inventory view that groups registered access nodes into Ubuntu and Windows pools without changing Slurm or Ansible state.

### 3. Resource & Identity Governance
- **Quota Management**: Individualized CPU, RAM, and Storage allocations per researcher.
- **Cluster Inventory**: Federated view of Slurm compute nodes and administrative gateway nodes.
- **Audit & Feedback**: Integrated system feedback loop for researcher-administrator communication.

## 🧭 Operator Workflow

1. **Register access nodes** in `Management -> Slurm Nodes`. This is the portal-owned inventory used for SSH/RDP/WinRM access and diagnostics.
2. **Review grouped inventory** in `Management -> Node Management`. Ubuntu/Linux nodes and Windows nodes are grouped from live SSH/RDP/WinRM probes first, then saved OS Family, then metadata fallback.
3. **Monitor Slurm resources** from `Nodes`, `Dashboard`, and `Jobs`. Slurm resource counts come from the Slurm integration, while Node Management only shows portal-registered access targets.
4. **Submit workloads** from the user or admin job workflows. The Job-API dynamically plans CPU, memory, walltime, and submission scripts from live Slurm state.

Keep infrastructure changes in the Ansible project. The portal should manage user-facing workflows, inventory visibility, job submission, and operational observability.

For dual-boot or repurposed nodes, refresh `Node Management` after changing the machine state. If Windows remote ports are blocked, update the portal OS Family in `Management -> Slurm Nodes` as a fallback.

## Resource Enforcement Contract

The portal and Job-API request CPU/RAM through Slurm; they do not enforce kernel resource limits by themselves. Strict runtime enforcement must be configured by the Ansible Slurm setup:

- `SelectType=select/cons_tres`
- `SelectTypeParameters=CR_Core_Memory`
- `ProctrackType=proctrack/cgroup`
- `TaskPlugin=task/cgroup`
- `JobAcctGatherType=jobacct_gather/cgroup`
- `ConstrainCores=yes`
- `ConstrainRAMSpace=yes`

With that contract in place, a portal job requesting 1 CPU and 1 GB RAM is submitted as a Slurm allocation and enforced by Slurm cgroups on the compute node.

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

For Docker Compose v1 recreate errors such as `KeyError: 'ContainerConfig'`, stop and remove only the affected portal containers, keep the database volume, then recreate services:

```bash
docker-compose stop backend job-api frontend
docker rm -f portal_backend portal_job_api portal_frontend 2>/dev/null || true
docker-compose up -d database
docker-compose up -d --no-deps --force-recreate backend job-api frontend
```

## 🔐 Administrative Credentials
Default users seeded by `initial_data.py`:
- **Admin**: `admin` / `admin123`
- **Ranjithks (Admin)**: `ranjithks` / `ranjit123`

---
*Developed for advanced research environments requiring robust scheduling and secure data isolation.*
