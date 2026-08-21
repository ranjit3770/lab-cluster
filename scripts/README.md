# Operational Scripts

Standalone tools that complement the [Ansible automation](../ansible/README.md)
and the [Cluster Portal](../cluster-portal/README.md).

| Script | Purpose |
| --- | --- |
| [`os-swapper/swapper.py`](os-swapper/README.md) | Interactive fleet tool to flip dual-boot nodes between Ubuntu and Windows. |
| [`os-swapper/single_node_switch.py`](os-swapper/README.md) | Minimal one-node Windows -> Ubuntu switch helper. |
| `slurm-resume-nodes.sh` | Watchdog that resumes Slurm nodes once they are back in Linux. |

## slurm-resume-nodes.sh

Designed for dual-boot workers: when a node reboots into Ubuntu after sitting
in Windows, Slurm may still hold it in the `DOWN` state. This script:

1. Lists all nodes Slurm reports as `DOWN`.
2. For each, resolves its IP and probes SSH (port 22).
3. If the node answers with Linux (`uname`), it runs
   `scontrol update nodename=<node> state=RESUME`.

### Cron Installation

On the head node, run every 2 minutes as root:

```cron
*/2 * * * * /opt/amritacluster/SLURM-COMPLETE-SETUP/scripts/slurm-resume-nodes.sh >> /var/log/slurm-resume.log 2>&1
```

Requires passwordless root SSH from the head node to all workers (the Ansible
`step1_startfrom-ssh.yml` provisioning step sets this up).

## Conventions

- Scripts must stay self-contained: no imports from other repo folders.
- Anything requiring repeatable, audited change belongs in an Ansible playbook,
  not here.
