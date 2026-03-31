This guide provides a clean, step-by-step configuration for Slurm 25.11.4 based on our troubleshooting. It ensures the **Database (SlurmDBD)**, **Controller (Slurmctld)**, and **Munge** are perfectly synchronized.

---

## 1. Prerequisites: MariaDB Setup
Slurm requires a MySQL-compatible backend. MariaDB is the standard choice.

```bash
# Install MariaDB
sudo apt update && sudo apt install mariadb-server -y

# Secure and Configure the Database for Slurm
sudo mysql -u root <<EOF
CREATE DATABASE IF NOT EXISTS slurm_acct_db;
DROP USER IF EXISTS 'slurm'@'localhost';
CREATE USER 'slurm'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('slurm123');
GRANT ALL PRIVILEGES ON slurm_acct_db.* TO 'slurm'@'localhost';
FLUSH PRIVILEGES;
EOF
```

---

## 2. Slurm Database Daemon (`slurmdbd.conf`)
Create `/etc/slurm/slurmdbd.conf`. This file **must** be owned by `slurm` and have `600` permissions.

```ini
# Authentication
AuthType=auth/munge
DbdAddr=localhost
DbdHost=cluster-hn
SlurmUser=slurm

# Logging & PID
LogFile=/var/log/slurm/slurmdbd.log
PidFile=/var/run/slurm/slurmdbd.pid

# Database Details
StorageType=accounting_storage/mysql
StorageHost=localhost
StoragePass=slurm123
StorageUser=slurm
StorageLoc=slurm_acct_db
```

**Set Permissions:**
```bash
sudo chown slurm: /etc/slurm/slurmdbd.conf
sudo chmod 600 /etc/slurm/slurmdbd.conf
```

---

## 3. Main Controller Configuration (`slurm.conf`)
Update `/etc/slurm/slurm.conf` to link the controller to the database.

```ini
ClusterName=demo-cluster
ControlMachine=cluster-hn
ControlAddr=192.168.196.250

# Authentication (Critical: Primary MUST be munge)
AuthType=auth/munge
# AuthAltTypes=auth/local  <-- Only enable if plugin is verified present

# Accounting Storage
AccountingStorageType=accounting_storage/slurmdbd
AccountingStorageHost=cluster-hn
AccountingStoragePort=6819

# State & Logging
StateSaveLocation=/var/spool/slurmctld
SlurmctldLogFile=/var/log/slurm/slurmctld.log
SlurmctldPidFile=/var/run/slurm/slurmctld.pid
SlurmUser=slurm
```

---

## 4. Systemd Service Hardening
Ensure the services are running as the correct users and can write to their PID/Log locations.

### Create Directories
```bash
sudo mkdir -p /var/spool/slurmctld /var/run/slurm /var/log/slurm
sudo chown -R slurm:slurm /var/spool/slurmctld /var/run/slurm /var/log/slurm
```

### Force Path Symlinks (For Source-Built Slurm)
Since your binary looks in `/usr/local/slurm/etc/`, link your configs there:
```bash
sudo mkdir -p /usr/local/slurm/etc/
sudo ln -sf /etc/slurm/slurm.conf /usr/local/slurm/etc/slurm.conf
sudo ln -sf /etc/slurm/slurmdbd.conf /usr/local/slurm/etc/slurmdbd.conf
```

---

## 5. Deployment Order (The "Clean Sweep")
Follow this sequence to avoid Cluster ID mismatches and permission errors.

1. **Reset State:**
   ```bash
   sudo systemctl stop slurmctld slurmdbd
   sudo rm -rf /var/spool/slurmctld/* # Clears ClusterID conflicts
   ```

2. **Start Database:**
   ```bash
   sudo systemctl start slurmdbd
   ```

3. **Register Cluster (Crucial Handshake):**
   ```bash
   # Run this ONLY after slurmdbd is active
   sudo sacctmgr -i add cluster demo-cluster
   ```

4. **Start Controller:**
   ```bash
   sudo systemctl reset-failed slurmctld
   sudo systemctl start slurmctld
   ```

---

## 6. Troubleshooting Checklist
| Issue | Fix |
| :--- | :--- |
| **Access Denied (1045)** | Check for duplicate `StoragePass` entries in `slurmdbd.conf`. |
| **Auth Plugin Failure** | Ensure `AuthType=auth/munge` is primary; disable `auth/local`. |
| **Cluster ID Mismatch** | Wipe `/var/spool/slurmctld/` and restart `slurmctld`. |
| **Communication Failure** | Copy `/etc/munge/munge.key` from head-node to workers and restart Munge. |



**Would you like me to generate a script that automates the Munge key synchronization across your worker nodes?**
