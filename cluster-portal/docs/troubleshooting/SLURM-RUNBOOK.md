# Slurm Recovery Runbook

Runbook for a source-built Slurm 25.11.4 cluster ("golden state" recovery
reference). Use it when services hang, nodes drain unexpectedly, or daemons
refuse to start.

## 1. The Connectivity Triangle

Slurm depends on three services staying in sync. If one fails, the others
eventually hang.

| Service | Common failure symptom | Primary fix |
| :--- | :--- | :--- |
| Munge | `srun: error: Invalid credential` | `sudo systemctl restart munge` |
| SlurmDBD | `error: Database host localhost not reachable` | `sudo systemctl restart mariadb` |
| Slurmctld | `sinfo: Unable to contact slurm controller` | `sudo systemctl restart slurmctld` |

## 2. Critical Configuration Paths (Source-Built)

Source builds look in non-standard locations. Always ensure these symlinks
exist:

- Primary config: `/etc/slurm/slurm.conf` -> `/usr/local/slurm/etc/slurm.conf`
- DB config: `/etc/slurm/slurmdbd.conf` -> `/usr/local/slurm/etc/slurmdbd.conf`
- State files: `/var/spool/slurmctld` (owned by `slurm:slurm`)

## 3. Permission And Ownership Matrix

If a service fails to start, most of the time it is a directory permission
issue.

| Directory | Required owner | Purpose |
| :--- | :--- | :--- |
| `/var/spool/slurmctld` | `slurm:slurm` | Controller state (the "brain's" memory) |
| `/var/spool/slurmd` | `root:root` | Temporary job scripts on workers |
| `/var/log/slurm/` | `slurm:slurm` | All logs (ctld, dbd, slurmd) |
| `/var/run/slurm/` | `slurm:slurm` | PID files for process tracking |
| `/etc/munge/` | `munge:munge` | Authentication keys (must be mode 400) |

## 4. Resolving Fatal Errors (Lessons Learned)

### "Fatal: failed to initialize auth plugin"

- **Cause:** `AuthAltTypes=auth/local` set while the plugin is missing, or the
  controller reading an old config.
- **Fix:** Set `AuthType=auth/munge`; comment out `AuthAltTypes` unless
  specifically needed for the REST API.

### "Fatal: CLUSTER ID MISMATCH"

- **Cause:** The database and local state files disagree on the cluster's
  identity.
- **Fix:**

  ```bash
  sudo systemctl stop slurmctld
  sudo rm -rf /var/spool/slurmctld/*
  sudo systemctl start slurmctld
  ```

### "error: 1045 Access denied for user 'slurm'@'localhost'"

- **Cause:** Duplicate `StoragePass` entries in `slurmdbd.conf`, or incorrect
  MariaDB grants.
- **Fix:** Keep exactly one `StoragePass`; test the login manually:
  `mysql -u slurm -p -h localhost`.

## 5. Network And Firewall Requirements

If `sinfo` shows nodes idle but `srun` fails with a communication/connection
failure:

1. Sync Munge keys from the head node to all workers.
2. Open the required ports:
   - `6817-6819` — static Slurm ports.
   - `60001-63000` — dynamic step ports (crucial for return traffic).

## 6. Quick Recovery Sequence

When the cluster is stuck, run these in order:

```bash
# 1. Reset failed systemd counters
sudo systemctl reset-failed slurmctld slurmd slurmdbd

# 2. Force stuck DOWN/DRAIN nodes back to service
sudo scontrol update nodename=worker[1-2] state=resume

# 3. Health check
sinfo
sacctmgr show cluster
munge -n | unmunge
```
