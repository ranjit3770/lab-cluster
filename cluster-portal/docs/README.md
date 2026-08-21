# Cluster Portal Documentation

Reference documentation for the portal stack and the underlying Slurm cluster.

**Note on scope:** the production Amrita cluster is provisioned and repaired by
the Ansible playbooks in [`ansible/`](../../ansible/README.md). The
guides here describe manual/reference procedures for understanding,
troubleshooting, and rebuilding individual components when working outside
Ansible.

## Setup Guides (`setup-guides/`)

| Document | Topic |
| --- | --- |
| [MANUAL-SLURM-SETUP.md](setup-guides/MANUAL-SLURM-SETUP.md) | Golden-standard manual Slurm setup: identity, time, Munge, slurm.conf, services. |
| [SHARED-STORAGE-NFS.md](setup-guides/SHARED-STORAGE-NFS.md) | NFS shared storage between head node and workers. |
| [SLURMDBD-SETUP.md](setup-guides/SLURMDBD-SETUP.md) | Accounting database (MariaDB + slurmdbd) configuration. |
| [SLURMREST-SETUP.md](setup-guides/SLURMREST-SETUP.md) | slurmrestd daemon, user, socket, and verification. |
| [GPU-INTEL-SETUP.md](setup-guides/GPU-INTEL-SETUP.md) | Intel iGPU scheduling via GRES (gres.conf + slurm.conf). |
| [CGROUP-CONFIG.md](setup-guides/CGROUP-CONFIG.md) | cgroup.conf resource containment and activation. |
| [WORKER-PROVISIONING.md](setup-guides/WORKER-PROVISIONING.md) | One-script worker provisioning against NFS-hosted configs. |
| [K3S-CONVERGED-SETUP.md](setup-guides/K3S-CONVERGED-SETUP.md) | Converged Slurm + K3s + Intel GPU setup. |

## Troubleshooting (`troubleshooting/`)

| Document | Topic |
| --- | --- |
| [NODE-DOWN-RESUME.md](troubleshooting/NODE-DOWN-RESUME.md) | Diagnose and resume a node stuck in DOWN state. |
| [SLURM-RUNBOOK.md](troubleshooting/SLURM-RUNBOOK.md) | Recovery runbook: service triangle, permissions, fatal errors, ports. |

## Archive (`archive/`)

Superseded historical documents kept for reference only:

- `Centralized Management(Optional).md`
- `job_api_workflow_analysis.md`
- `job_scheduler_summary.md`
