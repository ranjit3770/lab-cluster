# SLURM-COMPLETE-SETUP

Production workspace for the Amrita Slurm cluster: Ansible-based infrastructure
automation, a Dockerized web portal for researchers and administrators, and
operational scripts for dual-boot node management.

## Repository Layout

```text
SLURM-COMPLETE-SETUP/
├── ansible/                     # Infrastructure automation
│   ├── ansible.cfg              # Project Ansible configuration
│   ├── inventory/               # hosts.ini, group_vars, MAC/cluster metadata
│   └── playbooks/
│       ├── deployment/          # Slurm lifecycle: setup, append, repair
│       └── os-switching/        # Dual-boot Ubuntu <-> Windows control
├── cluster-portal/              # Web portal (FastAPI backend + React frontend + Job-API)
├── scripts/
│   ├── os-swapper/              # Standalone OS switch tools (SSH/WinRM based)
│   │   ├── swapper.py           # Fleet-wide Linux <-> Windows swapper
│   │   └── single_node_switch.py# Single-node switch helper
│   └── slurm-resume-nodes.sh    # Cron-safe Slurm node resume watchdog
├── docs/                        # Operator procedures and setup guides
├── logs/                        # Runtime logs (ansible playbook-errors.log)
└── backups/                     # Historical artifacts kept for reference only
```

## Components

| Component | Path | Role |
| --- | --- | --- |
| Cluster Automation | `ansible/` | Provision and maintain Slurm, Munge, controller services, workers, dual-boot OS switching, and node repair via playbooks. |
| Cluster Portal | `cluster-portal/` | Dockerized portal: identity, quotas, dashboards, job submission through the Job-API, registered node inventory, and admin node management. |
| OS Swapper Scripts | `scripts/os-swapper/` | Direct SSH/WinRM fleet tools to flip nodes between Ubuntu and Windows without Ansible. |
| Resume Watchdog | `scripts/slurm-resume-nodes.sh` | Detects DOWN nodes back in Linux and resumes them in Slurm. |

## Separation Of Responsibilities

Use Ansible for infrastructure state. Use the portal for user-facing cluster operations.

- Provision or repair Slurm nodes with Ansible playbooks.
- Register portal access targets from `Management -> Slurm Nodes`.
- Review grouped portal inventory from `Management -> Node Management`.
- Monitor Slurm resources from `Dashboard`, `Nodes`, and `Jobs`.
- Submit researcher workloads through the portal Job-API, which plans resources from live Slurm state.

## Quick Start

### Full cluster deployment

```bash
cd /opt/amritacluster/SLURM-COMPLETE-SETUP/ansible
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory/hosts.ini playbooks/deployment/cluster_manage.yml --ask-vault-pass
```

Choose `setup` for a fresh build, or `append` to add one new worker.

### Start the portal stack

```bash
cd /opt/amritacluster/SLURM-COMPLETE-SETUP/cluster-portal
docker compose up -d --build
```

Persistent database volumes are preserved across rebuilds; never delete them
during routine restarts.

### Switch nodes between Ubuntu and Windows

```bash
python3 scripts/os-swapper/swapper.py        # interactive fleet tool
```

Or use the targeted Ansible workflow:

```bash
cd /opt/amritacluster/SLURM-COMPLETE-SETUP/ansible
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory/hosts.ini playbooks/os-switching/ensure_ubuntu_boot_target_auto.yml -e target_hosts=worker_node28 --ask-vault-pass
```

## Recommended Operator Flow

1. Update `ansible/inventory/hosts.ini` with the desired Linux Slurm inventory.
2. Run Ansible setup, append, or repair playbooks from `ansible/`.
3. Start or rebuild the portal stack from `cluster-portal` without deleting persistent database volumes.
4. Add only the nodes that administrators need visible in portal access workflows.
5. Refresh Node Management to run live SSH/RDP/WinRM probes for dual-boot or repurposed machines.
6. Set OS Family in `Management -> Slurm Nodes` only when live remote ports are blocked.
7. Use Node Management to confirm Ubuntu and Windows access pools before demo or operations.

## Documentation Index

| Document | Description |
| --- | --- |
| [Ansible workflow](ansible/README.md) | Playbook layout, commands, resource enforcement. |
| [Fresh Slurm Cluster Setup](docs/FRESH-SLURM-CLUSTER-SETUP.md) | Full build/rebuild procedure. |
| [Append a New Worker Node](docs/APPEND-NEW-NODE.md) | Add one worker safely. |
| [Vault Setup](docs/VAULT-SETUP.md) | Encrypted variables for Windows inventory. |
| [Dual-Boot Fix Reference](docs/FIX-BOOT-ISSUE.md) | Boot-order troubleshooting. |
| [Portal workflow](cluster-portal/README.md) | Portal architecture and operations. |
| [Frontend UI guide](cluster-portal/frontend/README.md) | React frontend reference. |
| [Backend API guide](cluster-portal/backend/README.md) | FastAPI backend reference. |
| [Job-API guide](cluster-portal/backend/job-api/README.md) | Job submission service. |
| [Resource verification](cluster-portal/backend/job-api/RESOURCE-ALLOCATION-AND-VERIFICATION.md) | Allocation audit details. |

## Production Relocation

The repo is path-portable. When moving it to another server or directory,
change only these two values:

| What | Where | Purpose |
| --- | --- | --- |
| `cluster_root` | `ansible/inventory/group_vars/all.yml` | Base path used by playbooks (e.g. error log location). |
| `CLUSTER_SETUP_DIR` | `cluster-portal/.env` (copy from `.env.example`) | Host path mounted into portal containers for dual-boot playbooks. |

Everything else — `ansible.cfg` inventory/logging, the backend playbook
discovery, and all playbook commands — resolves relative to its own location.

## Legacy Entry Points

For backward compatibility, repository-root symlinks still work:

- `./grup-to-windows.py` -> `scripts/os-swapper/swapper.py`
- `./grup-to-ubuntu.py` -> `scripts/os-swapper/single_node_switch.py`

Prefer the canonical paths under `scripts/os-swapper/`.

## Demo Checklist

- Ansible inventory parses successfully.
- Slurm controller, database daemon, Munge, and worker `slurmd` services are healthy.
- Portal containers are healthy and database volume is preserved.
- Admin login can open Dashboard, Nodes, Jobs, Slurm Nodes, and Node Management.
- Node Management shows only registered portal nodes, grouped into Ubuntu and Windows columns from live probes, saved OS Family, or metadata fallback.
- A small Jupyter or Python job submits, reaches Running, and records a planner audit log.
