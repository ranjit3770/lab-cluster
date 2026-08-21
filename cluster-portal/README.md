# Cluster Portal — Strach HPC Management Interface

A control plane for the Amrita Slurm cluster. Researchers submit and monitor
workloads; administrators manage users, quotas, registered access nodes, and
system governance.

## What It Provides

### Researcher workloads

| Capability | Description |
| --- | --- |
| Interactive Jupyter Hub | Isolated Jupyter Lab environments with automatic user identity mapping. |
| Batch Python jobs | Submission with pip dependency management and real-time log streaming. |
| Job monitoring | Live status (Pending, Running, Completed, Failed) with output/error log streaming. |

### Administration

| Capability | Description |
| --- | --- |
| Platform Config | Central control of Slurm REST API (v0.0.44), session constraints, identity providers. |
| Job Setting | Administrative caps for concurrent batch and interactive sessions per user. |
| Maintenance Mode | Global system lock with IP whitelisting for infrastructure upgrades. |
| Admin Tools | Registered access-node inventory plus a diagnostic SSH terminal console. |
| Node Management | Admin-only two-column inventory grouping registered nodes into Ubuntu and Windows pools; changes no Slurm or Ansible state. |

### Governance

| Capability | Description |
| --- | --- |
| Quota management | Per-researcher CPU, RAM, and storage allocations. |
| Cluster inventory | Federated view of Slurm compute nodes and administrative gateway nodes. |
| Audit & feedback | System feedback channel between researchers and administrators. |

## Operator Workflow

1. **Register access nodes** in `Management -> Slurm Nodes`. This is the
   portal-owned inventory used for SSH/RDP/WinRM access and diagnostics.
2. **Review grouped inventory** in `Management -> Node Management`. Nodes are
   grouped by live SSH/RDP/WinRM probes first, then saved OS Family, then
   metadata fallback.
3. **Monitor Slurm resources** from `Nodes`, `Dashboard`, and `Jobs`. Slurm
   counts come from the Slurm integration; Node Management shows only
   portal-registered access targets.
4. **Submit workloads** through the job workflows. The Job-API plans CPU,
   memory, walltime, and submission scripts from live Slurm state.

Division of responsibility: infrastructure changes belong in the
[Ansible project](../ansible/README.md). The portal owns user-facing
workflows, inventory visibility, job submission, and observability.

For dual-boot or repurposed nodes, refresh `Node Management` after changing
the machine state. If Windows remote ports are blocked, set the OS Family
manually in `Management -> Slurm Nodes`.

## Resource Enforcement Contract

The portal and Job-API request CPU/RAM through Slurm; they do not enforce
kernel resource limits themselves. Strict runtime enforcement is configured by
the Ansible Slurm setup:

```text
SelectType=select/cons_tres
SelectTypeParameters=CR_Core_Memory
ProctrackType=proctrack/cgroup      # strict mode
TaskPlugin=task/cgroup              # strict mode
JobAcctGatherType=jobacct_gather/cgroup
ConstrainCores=yes
ConstrainRAMSpace=yes
```

With that contract in place, a portal job requesting 1 CPU and 1 GB RAM is
submitted as a Slurm allocation and enforced by Slurm cgroups on the compute
node. See
[Resource Allocation and Verification](backend/job-api/RESOURCE-ALLOCATION-AND-VERIFICATION.md).

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React + Vite, Tailwind CSS, Radix UI, Lucide Icons |
| Backend & Job-API | FastAPI |
| Database | MariaDB 10.6 (identity + job registry) |
| Slurm integration | Slurm REST API v0.0.44 via Unix socket |

## Running The Portal

### Local development

```bash
# Frontend
cd frontend && npm install && npm run dev

# Backend (Python 3.9+)
cd backend && pip install -r requirements.txt && python app/main.py
```

### Production (Docker)

```bash
docker-compose up -d --build
```

Database volumes are persistent.

**Never run `docker-compose down -v`** — it destroys persistent data. Use plain
`docker-compose down` to stop services while keeping data.

#### Docker Compose v1 recreate errors

For failures such as `KeyError: 'ContainerConfig'`, stop and remove only the
affected portal containers, keep the database volume, then recreate:

```bash
docker-compose stop backend job-api frontend
docker rm -f portal_backend portal_job_api portal_frontend 2>/dev/null || true
docker-compose up -d database
docker-compose up -d --no-deps --force-recreate backend job-api frontend
```

## Default Administrative Users

Seeded by `initial_data.py`:

| User | Password | Role |
| --- | --- | --- |
| `admin` | `admin123` | Admin |
| `ranjithks` | `ranjit123` | Admin |

## Documentation Index

| Document | Description |
| --- | --- |
| [Frontend guide](frontend/README.md) | UI architecture, navigation, RBAC, design system. |
| [Backend guide](backend/README.md) | FastAPI registry, inventory contract, environment. |
| [Job-API guide](backend/job-api/README.md) | Job submission service overview and doc index. |
| [Slurm REST usage](REST-USAGE.md) | What slurmrestd provides to the portal. |
| [Product expansion roadmap](PRODUCT-EXPANSION.md) | Planned workload types, phased. |
