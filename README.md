# SLURM Complete Setup

Production workspace for the Amrita Slurm cluster automation and web portal.

## Projects

- `cluster-via-ansible`: Infrastructure automation for Slurm, Munge, controller services, workers, repair playbooks, and inventory-driven cluster lifecycle.
- `cluster-portal`: Dockerized web portal for administrators and researchers, including identity, quotas, dashboards, job submission, registered node inventory, and operational views.

## Separation Of Responsibilities

Use Ansible for infrastructure state. Use the portal for user-facing cluster operations.

- Provision or repair Slurm nodes with Ansible playbooks.
- Register portal access targets from `Management -> Slurm Nodes`.
- Review grouped portal inventory from `Management -> Node Management`.
- Monitor Slurm resources from `Dashboard`, `Nodes`, and `Jobs`.
- Submit researcher workloads through the portal Job-API, which plans resources from live Slurm state.

## Recommended Operator Flow

1. Update `cluster-via-ansible/hosts.ini` with the desired Linux Slurm inventory.
2. Run Ansible setup, append, or repair playbooks from `cluster-via-ansible`.
3. Start or rebuild the portal stack from `cluster-portal` without deleting persistent database volumes.
4. Add only the nodes that administrators need visible in portal access workflows.
5. Refresh Node Management to run live SSH/RDP/WinRM probes for dual-boot or repurposed machines.
6. Set OS Family in `Management -> Slurm Nodes` only when live remote ports are blocked.
7. Use Node Management to confirm Ubuntu and Windows access pools before demo or operations.

## Key Documentation

- [Ansible workflow](cluster-via-ansible/README.md)
- [Portal workflow](cluster-portal/README.md)
- [Frontend UI guide](cluster-portal/frontend/README.md)
- [Backend API guide](cluster-portal/backend/README.md)
- [Job-API guide](cluster-portal/backend/job-api/README.md)
- [Resource verification](cluster-portal/backend/job-api/RESOURCE-ALLOCATION-AND-VERIFICATION.md)

## Demo Checklist

- Ansible inventory parses successfully.
- Slurm controller, database daemon, Munge, and worker `slurmd` services are healthy.
- Portal containers are healthy and database volume is preserved.
- Admin login can open Dashboard, Nodes, Jobs, Slurm Nodes, and Node Management.
- Node Management shows only registered portal nodes, grouped into Ubuntu and Windows columns from live probes, saved OS Family, or metadata fallback.
- A small Jupyter or Python job submits, reaches Running, and records a planner audit log.
