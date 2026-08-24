# Manual Slurm Setup Guide

Consolidated reference for setting up a Slurm cluster correctly from the
start, based on issues encountered during earlier deployments. It covers
identity, time synchronization, authentication, configuration, permissions,
and deployment order.

> The production cluster automates all of this through Ansible; use this guide
> to understand what the playbooks do or to set up nodes manually.

## 1. Prerequisites: Identity And Time

### A. Hostname mapping

Every node must know all others. Update `/etc/hosts` on **all nodes**:

```text
192.168.196.250 cluster-hn
192.168.196.85  worker1
192.168.196.86  worker2
```

### B. Time synchronization (critical for Munge)

Munge fails when clocks drift. Use `chrony` for sub-second sync:

```bash
sudo apt update && sudo apt install chrony -y
sudo timedatectl set-timezone Asia/Kolkata
sudo systemctl enable --now chrony
```

## 2. Authentication: The Munge Key

The key must be **identical** on every node with **strict permissions**.

1. On the head node: generate the key if not present.
2. Copy to workers:

   ```bash
   scp /etc/munge/munge.key user@worker1:/tmp/
   ```

3. On each worker:

   ```bash
   sudo mv /tmp/munge.key /etc/munge/munge.key
   sudo chown munge:munge /etc/munge/munge.key
   sudo chmod 400 /etc/munge/munge.key
   sudo systemctl restart munge
   ```

## 3. Master Configuration (`slurm.conf`)

Identical on all nodes. `NodeName` specs must match actual hardware
(cross-check with `slurmd -C`).

**File path:** `/etc/slurm/slurm.conf`

```ini
ClusterName=demo-cluster
ControlMachine=cluster-hn
ControlAddr=192.168.196.250

AuthType=auth/munge
SlurmdUser=root   # required for process management
MpiDefault=none
ProctrackType=proctrack/linuxproc
TaskPlugin=task/affinity

# Ports
SlurmctldPort=6817
SlurmdPort=6818

# Paths & logging
SlurmdSpoolDir=/var/spool/slurmd
StateSaveLocation=/var/spool/slurmctld
SlurmctldLogFile=/var/log/slurm/slurmctld.log
SlurmdLogFile=/var/log/slurm/slurmd.log

# Node definitions (values must match 'slurmd -C' output)
NodeName=cluster-hn NodeAddr=192.168.196.250 Sockets=1 CoresPerSocket=6 ThreadsPerCore=1 CPUs=6 RealMemory=7000 Gres=gpu:1 State=UNKNOWN
NodeName=worker1    NodeAddr=192.168.196.85  Sockets=1 CoresPerSocket=6 ThreadsPerCore=2 CPUs=12 RealMemory=6000 Feature=w1 Gres=gpu:1 State=UNKNOWN
NodeName=worker2    NodeAddr=192.168.196.86  Sockets=1 CoresPerSocket=6 ThreadsPerCore=2 CPUs=12 RealMemory=6000 Feature=w2 Gres=gpu:1 State=UNKNOWN

PartitionName=main Nodes=cluster-hn,worker1,worker2 Default=YES MaxTime=INFINITE State=UP
```

## 4. Systemd Service File

Point at the real daemon binary (`slurmd`), not the REST API.

**File path:** `/etc/systemd/system/slurmd.service`

```ini
[Unit]
Description=Slurm node daemon
After=network.target munge.service
ConditionPathExists=/etc/slurm/slurm.conf

[Service]
Type=simple
User=root
Group=root
ExecStart=/usr/local/slurm/sbin/slurmd -D
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 5. Permissions And Directory Cleanup

Run on all nodes so the `slurm` user can write logs and spool data:

```bash
sudo useradd -m -s /bin/bash slurm || true
sudo mkdir -p /var/spool/slurmd /var/spool/slurmctld /var/log/slurm
sudo chown -R slurm:slurm /var/spool/slurmd /var/spool/slurmctld /var/log/slurm
```

## 6. Deployment Workflow

Bring the cluster online in this order:

```bash
# 1. Head node
sudo systemctl restart slurmctld

# 2. All nodes
sudo systemctl restart slurmd

# 3. Verify
sinfo

# 4. If nodes show drained/invalid states
sudo scontrol update NodeName=cluster-hn,worker1,worker2 State=RESUME
```
