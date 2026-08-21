To create an error-free Slurm setup based on the hurdles we just cleared, you need a document that addresses **Identity, Time, Hardware, and Permissions**. 

Here is your consolidated, "Golden Standard" guide for setting up your 3-node cluster correctly from the start.

---

## 1. Prerequisites: Identity & Time
Before Slurm even starts, the foundation must be solid.

### A. Hostname Mapping
Every node must know who the others are. Update `/etc/hosts` on **all nodes**:
```text
192.168.196.250 cluster-hn
192.168.196.85  worker1
192.168.196.86  worker2
```

### B. Perfect Time Sync (Crucial for Munge)
Munge will fail if clocks drift. Use `chrony` for sub-second synchronization.
```bash
sudo apt update && sudo apt install chrony -y
sudo timedatectl set-timezone Asia/Kolkata
sudo systemctl enable --now chrony
```

---

## 2. Authentication: The Munge Key
The secret key must be **identical** and have **strict permissions**.

1. **On Head Node:** Generate the key (if not present).
2. **Copy to Workers:** `scp /etc/munge/munge.key user@worker1:/tmp/`
3. **On Workers:**
   ```bash
   sudo mv /tmp/munge.key /etc/munge/munge.key
   sudo chown munge:munge /etc/munge/munge.key
   sudo chmod 400 /etc/munge/munge.key
   sudo systemctl restart munge
   ```

---

## 3. The Master Configuration (`slurm.conf`)
This file must be identical on all nodes. Pay close attention to the `NodeName` specs matching actual hardware.

**File Path:** `/etc/slurm/slurm.conf`
```ini
ClusterName=demo-cluster
ControlMachine=cluster-hn
ControlAddr=192.168.196.250

AuthType=auth/munge
SlurmdUser=root   # Required for process management
MpiDefault=none
ProctrackType=proctrack/linuxproc
TaskPlugin=task/affinity

# Ports
SlurmctldPort=6817
SlurmdPort=6818

# Paths & Logging
SlurmdSpoolDir=/var/spool/slurmd
StateSaveLocation=/var/spool/slurmctld
SlurmctldLogFile=/var/log/slurm/slurmctld.log
SlurmdLogFile=/var/log/slurm/slurmd.log

# Node Definitions (Values must match 'slurmd -C' output)
NodeName=cluster-hn NodeAddr=192.168.196.250 Sockets=1 CoresPerSocket=6 ThreadsPerCore=1 CPUs=6 RealMemory=7000 Gres=gpu:1 State=UNKNOWN
NodeName=worker1    NodeAddr=192.168.196.85  Sockets=1 CoresPerSocket=6 ThreadsPerCore=2 CPUs=12 RealMemory=6000 Feature=w1 Gres=gpu:1 State=UNKNOWN
NodeName=worker2    NodeAddr=192.168.196.86  Sockets=1 CoresPerSocket=6 ThreadsPerCore=2 CPUs=12 RealMemory=6000 Feature=w2 Gres=gpu:1 State=UNKNOWN

PartitionName=main Nodes=cluster-hn,worker1,worker2 Default=YES MaxTime=INFINITE State=UP
```

---

## 4. Systemd Service Files
Ensure you are pointing to the correct binary (`slurmd`), not the REST API.

**File Path:** `/etc/systemd/system/slurmd.service`
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

---

## 5. Permission & Directory Cleanup
Run this on all nodes to ensure the `slurm` user can write logs and spool data:
```bash
sudo useradd -m -s /bin/bash slurm || true
sudo mkdir -p /var/spool/slurmd /var/spool/slurmctld /var/log/slurm
sudo chown -R slurm:slurm /var/spool/slurmd /var/spool/slurmctld /var/log/slurm
```

---

## 6. Deployment Workflow
Follow this specific order to bring the cluster online:

1. **Head Node:** `sudo systemctl restart slurmctld`
2. **All Nodes:** `sudo systemctl restart slurmd`
3. **Verify:** `sinfo`
4. **If Drained/Inval:** `sudo scontrol update NodeName=cluster-hn,worker1,worker2 State=RESUME`



**Would you like me to create a bash script that automates this "Resume" and health-check process for you?**
