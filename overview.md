# Codebase Overview

**Amrita Slurm cluster** — a production HPC workspace: Ansible-driven Slurm provisioning + a Dockerized web portal (FastAPI + React) + dual-boot node tooling.

- **Branch:** `test-refactor` (remotes: `main`, `cluster-via-ansible`, `final-dev-slurm-cluster`, `job-submission-api`, `production-graded`, `setup-via-ansible`)
- **Working tree:** clean

## Repository Layout

```
├── ansible/                  # Infrastructure automation
│   ├── inventory/            # hosts.ini, group_vars (+ Ansible Vault), MAC/cluster metadata
│   └── playbooks/
│       ├── deployment/       # step1–11: SSH→GRUB→Munge→Slurm build→slurmrestd→verify
│       │   ├── slurm/        # Granular Slurm/Munge/slurmdbd/slurmrestd setup
│       │   └── finally/      # append node, repair, restart workers, portal auth fix
│       └── os-switching/     # Dual-boot Ubuntu ↔ Windows (GRUB/WinRM)
├── cluster-portal/           # The web app (docker-compose: 4 services)
│   ├── backend/app/          # FastAPI identity gateway — routers: login, users,
│   │   │                     #   jobs, nodes, files, requests, feedback, settings…
│   │   └── models/           # user, job, node, request, dev_node, system_setting
│   ├── backend/job-api/      # Job submission service (port 9000): planner.py (518 L),
│   │   │                     #   slurm.py (776 L) → talks to slurmrestd v0.0.41 via JWT/Munge
│   ├── frontend/src/pages/   # React 19 + Vite 7 + Tailwind 4 + Radix/shadcn:
│   │                         #   Dashboard, Nodes, Jobs, Files (Monaco editor),
│   │                         #   management/ (Node Mgmt, Admin Tools, Diag Console w/ xterm)
│   └── docker-compose.yml    # mariadb:10.6 + backend(:8000) + job-api(:9000) + frontend(:5173)
│                             #   backend/job-api use host networking, mount /etc/slurm, munge socket
├── scripts/os-swapper/       # swapper.py (fleet Win/Linux flip), single_node_switch.py
├── scripts/slurm-resume-nodes.sh  # Cron watchdog resuming DOWN nodes
└── tests/test_repo.py        # Repo-level checks: YAML validity, compose validity, md link integrity
```

## Components

| Component | Path | Role |
| --- | --- | --- |
| Cluster Automation | `ansible/` | Provision and maintain Slurm, Munge, controller services, workers, dual-boot OS switching, and node repair via playbooks. |
| Cluster Portal | `cluster-portal/` | Dockerized portal: identity, quotas, dashboards, job submission through the Job-API, registered node inventory, and admin node management. |
| OS Swapper Scripts | `scripts/os-swapper/` | Direct SSH/WinRM fleet tools to flip nodes between Ubuntu and Windows without Ansible. |
| Resume Watchdog | `scripts/slurm-resume-nodes.sh` | Detects DOWN nodes back in Linux and resumes them in Slurm. |

## Technology Stack

### Backend (`cluster-portal/backend`)
- FastAPI + Uvicorn (via Gunicorn, 4 workers), served on port **8000**
- SQLAlchemy + MariaDB (`strach_portal` database, exposed on host port 3307)
- Auth: `python-jose` (JWT) + `passlib[bcrypt]`
- Remote access: Paramiko (SSH), PyWinRM (Windows nodes)
- API routers under `app/api/v1/`: `login`, `users`, `dashboard`, `jobs`, `nodes`, `windows_nodes`, `files`, `requests`, `feedback`, `settings`, `developer`

### Job-API (`cluster-portal/backend/job-api`)
- Standalone FastAPI service on port **9000**
- `planner.py` — plans resources from live Slurm state before submission
- `slurm.py` — dispatches jobs to slurmrestd REST API (`v0.0.41`) via JWT/Munge
- Design principle: the portal adds **no scheduling logic** (see `job-api/DESIGN-DECISIONS.md`)

### Frontend (`cluster-portal/frontend`)
- React 19 + TypeScript ~5.9 + Vite 7, Tailwind CSS 4 with Radix UI / shadcn-style components
- TanStack Table for data grids; Monaco Editor for the Files page editor; xterm for the Diagnostic Console
- Routing via react-router-dom v7; axios API clients in `src/api/`
- Pages include Dashboard, Nodes, Jobs, Files, Requests, plus `management/` (Node Management, Admin Tools, Platform Config, Job Settings, Diagnostic Console)

### Docker Stack (`cluster-portal/docker-compose.yml`)
| Service | Image / Build | Port | Notes |
| --- | --- | --- | --- |
| `database` | mariadb:10.6 | 3307 → 3306 | Named volume `portal_db_data` (persistent — never delete during restarts) |
| `backend` | built from `./backend` | 8000 (host network) | Mounts `/etc/slurm`, munge socket, slurmrestd run dir, dual-boot playbooks read-only |
| `job-api` | built from `./backend/job-api` | 9000 (host network) | Same host mounts; talks directly to slurmrestd on 6820 |
| `frontend` | built from `./frontend` | 5173 → 80 | Nginx-served static build |

## CI (`.github/workflows/ci.yml`)

Five jobs run on every push/PR:

1. **Repo checks** — pytest over `tests/`: Ansible playbook YAML validity, group_vars parsing, docker-compose validity, workflow validity, Markdown relative-link integrity.
2. **Ansible syntax** — `ansible-playbook --syntax-check` on main entrypoints.
3. **Job-API planner tests** — dependency-free (stdlib only) unit tests.
4. **Backend schema tests** — Pydantic/SQLAlchemy schema modules only (app import auto-provisions DB, so it is avoided).
5. **Frontend build** — ESLint + `tsc -b && vite build`.

## Notable Details

- **Separation of concerns:** Ansible owns infrastructure state; the portal handles user-facing operations and adds no scheduling logic.
- **Legacy symlinks** at repo root (`grup-to-windows.py`, `grup-to-ubuntu.py`) point into `scripts/os-swapper/`; prefer canonical paths.
- **Untracked artifacts:** `diag.log` (40 KB, recent) and `test-grup-to-ubuntu.py` at repo root — appear to be WIP debug/test material for the OS switcher.
- **Path-portable design:** relocating the repo requires changing only `cluster_root` (`ansible/inventory/group_vars/all.yml`) and `CLUSTER_SETUP_DIR` (`cluster-portal/.env`). Everything else resolves relative to its own location.
- **Security note:** default DB passwords (`Amma@123`, `slurmJob_Sub`) are hardcoded as fallbacks in `docker-compose.yml` — override via environment in production.
