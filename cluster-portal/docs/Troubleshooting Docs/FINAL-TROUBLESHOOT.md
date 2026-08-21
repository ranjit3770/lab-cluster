Since your cluster is now in a "Golden State," having a dedicated troubleshooting runbook is the best way to prevent future downtime. This document summarizes the specific fixes we applied to your source-built Slurm 25.11.4 environment.

---

## 🛠️ Slurm High-Availability Troubleshooting Runbook

### 1. The "Connectivity Triangle"
Slurm depends on three services staying in sync. If one fails, the others will eventually hang.

| Service | Common Failure Symptom | Primary Fix |
| :--- | :--- | :--- |
| **Munge** | `srun: error: Invalid credential` | `sudo systemctl restart munge` |
| **SlurmDBD** | `error: Database host localhost not reachable` | `sudo systemctl restart mariadb` |
| **Slurmctld** | `sinfo: Unable to contact slurm controller` | `sudo systemctl restart slurmctld` |

---

### 2. Critical Configuration Paths (Source-Built)
Because your Slurm was built from source, it looks in non-standard locations. **Always ensure these symlinks exist:**

* **Primary Config:** `/etc/slurm/slurm.conf` → `/usr/local/slurm/etc/slurm.conf`
* **DB Config:** `/etc/slurm/slurmdbd.conf` → `/usr/local/slurm/etc/slurmdbd.conf`
* **State Files:** `/var/spool/slurmctld` (Must be owned by `slurm:slurm`)

---

### 3. Permission & Ownership Matrix
If a service fails to start, 90% of the time it is a directory permission issue.

| Directory | Required Owner | Purpose |
| :--- | :--- | :--- |
| `/var/spool/slurmctld` | `slurm:slurm` | Saves job state (The "Brain's" memory) |
| `/var/spool/slurmd` | `root:root` | Temporary job scripts on workers |
| `/var/log/slurm/` | `slurm:slurm` | All logs (ctld, dbd, slurmd) |
| `/var/run/slurm/` | `slurm:slurm` | PID files for process tracking |
| `/etc/munge/` | `munge:munge` | Authentication keys (Must be 400 permissions) |

---

### 4. Resolving The "Fatal" Errors (Lessons Learned)

#### **"Fatal: failed to initialize auth plugin"**
* **Cause:** `AuthAltTypes=auth/local` was set, but the plugin was missing or the controller was reading an old config.
* **Fix:** Set `AuthType=auth/munge` and comment out `AuthAltTypes` unless specifically needed for the REST API.

#### **"Fatal: CLUSTER ID MISMATCH"**
* **Cause:** The database and the local state files disagree on the cluster's identity.
* **Fix:** 1. `sudo systemctl stop slurmctld`
  2. `sudo rm -rf /var/spool/slurmctld/*`
  3. `sudo systemctl start slurmctld`

#### **"error: 1045 Access denied for user 'slurm'@'localhost'"**
* **Cause:** Duplicate `StoragePass` entries in `slurmdbd.conf` or incorrect MariaDB grants.
* **Fix:** Ensure only one `StoragePass` exists and test the login manually: `mysql -u slurm -p -h localhost`.

---

### 5. Network & Firewall Requirements
If `sinfo` shows nodes as `idle` but `srun` fails with `Communication connection failure`:

1.  **Sync Munge Keys:** `scp /etc/munge/munge.key` from head node to all workers.
2.  **Open Ports:** * `6817-6819` (Static Slurm ports)
    * `60001-63000` (Dynamic step ports — **Crucial for return traffic**)



---

### 6. Quick Recovery Commands
If the cluster gets "stuck," run these in order:
```bash
# 1. Reset any failed systemd counters
sudo systemctl reset-failed slurmctld slurmd slurmdbd

# 2. Force nodes back to IDLE if they are stuck in DOWN/DRAIN
sudo scontrol update nodename=worker[1-2] state=resume

# 3. Check the "Health Check"
sinfo
sacctmgr show cluster
munge -n | unmunge
```

**Would you like me to help you set up an automated bash script that checks all these "Health" points and emails you if something goes down?**
