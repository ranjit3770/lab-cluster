# SlurmDBD Setup (Accounting Database)

Clean, step-by-step configuration for Slurm 25.11.4 accounting: MariaDB,
`slurmdbd`, and controller wiring, kept synchronized with Munge.

## 1. Prerequisites: MariaDB

Slurm requires a MySQL-compatible backend; MariaDB is the standard choice.

```bash
# Install MariaDB
sudo apt update && sudo apt install mariadb-server -y

# Create the accounting database and user
sudo mysql -u root <<EOF
CREATE DATABASE IF NOT EXISTS slurm_acct_db;
DROP USER IF EXISTS 'slurm'@'localhost';
CREATE USER 'slurm'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('slurm123');
GRANT ALL PRIVILEGES ON slurm_acct_db.* TO 'slurm'@'localhost';
FLUSH PRIVILEGES;
EOF
```

## 2. Database Daemon Config (`slurmdbd.conf`)

Create `/etc/slurm/slurmdbd.conf`. The file **must** be owned by `slurm` with
`600` permissions.

```ini
# Authentication
AuthType=auth/munge
DbdAddr=localhost
DbdHost=cluster-hn
SlurmUser=slurm

# Logging & PID
LogFile=/var/log/slurm/slurmdbd.log
PidFile=/var/run/slurm/slurmdbd.pid

# Database details
StorageType=accounting_storage/mysql
StorageHost=localhost
StoragePass=slurm123
StorageUser=slurm
StorageLoc=slurm_acct_db
```

```bash
sudo chown slurm: /etc/slurm/slurmdbd.conf
sudo chmod 600 /etc/slurm/slurmdbd.conf
```

## 3. Controller Config (`slurm.conf`)

Point the controller at the database in `/etc/slurm/slurm.conf`:

```ini
ClusterName=demo-cluster
ControlMachine=cluster-hn
ControlAddr=192.168.196.250

# Authentication (critical: primary must be munge)
AuthType=auth/munge
# AuthAltTypes=auth/local  <-- enable only if the plugin is verified present

# Accounting storage
AccountingStorageType=accounting_storage/slurmdbd
AccountingStorageHost=cluster-hn
AccountingStoragePort=6819

# State & logging
StateSaveLocation=/var/spool/slurmctld
SlurmctldLogFile=/var/log/slurm/slurmctld.log
SlurmctldPidFile=/var/run/slurm/slurmctld.pid
SlurmUser=slurm
```

## 4. Systemd Service Hardening

Services must run as the correct user and write to their PID/log locations.

Create directories:

```bash
sudo mkdir -p /var/spool/slurmctld /var/run/slurm /var/log/slurm
sudo chown -R slurm:slurm /var/spool/slurmctld /var/run/slurm /var/log/slurm
```

Source-built Slurm looks under `/usr/local/slurm/etc/`; link the configs there:

```bash
sudo mkdir -p /usr/local/slurm/etc/
sudo ln -sf /etc/slurm/slurm.conf /usr/local/slurm/etc/slurm.conf
sudo ln -sf /etc/slurm/slurmdbd.conf /usr/local/slurm/etc/slurmdbd.conf
```

## 5. Deployment Order ("Clean Sweep")

Follow this sequence to avoid Cluster ID mismatches and permission errors:

1. **Reset state:**

   ```bash
   sudo systemctl stop slurmctld slurmdbd
   sudo rm -rf /var/spool/slurmctld/*   # clears ClusterID conflicts
   ```

2. **Start the database daemon:**

   ```bash
   sudo systemctl start slurmdbd
   ```

3. **Register the cluster (crucial handshake) — only after slurmdbd is active:**

   ```bash
   sudo sacctmgr -i add cluster demo-cluster
   ```

4. **Start the controller:**

   ```bash
   sudo systemctl reset-failed slurmctld
   sudo systemctl start slurmctld
   ```

## 6. Troubleshooting Checklist

| Issue | Fix |
| :--- | :--- |
| Access denied (1045) | Check for duplicate `StoragePass` entries in `slurmdbd.conf`. |
| Auth plugin failure | Ensure `AuthType=auth/munge` is primary; disable `auth/local`. |
| Cluster ID mismatch | Wipe `/var/spool/slurmctld/` and restart `slurmctld`. |
| Communication failure | Copy `/etc/munge/munge.key` from head node to workers; restart Munge. |

More recovery procedures: [../troubleshooting/SLURM-RUNBOOK.md](../troubleshooting/SLURM-RUNBOOK.md).
