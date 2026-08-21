This script is the "Master Provisioner" for your specific environment. It assumes you are using the **Head Node** as the Source of Truth and the **NFS Share** as the distribution point for your configuration files.

Since you have `cgroup.conf` and `slurmdbd.conf` in your directory, this script ensures those are handled correctly (linked for workers, kept local for the DB).

---

### 📜 The Ultimate Slurm Worker Provisioner (`provision_worker.sh`)

Run this script on any **new worker node** to join it to the cluster instantly.

```bash
#!/bin/bash
# -------------------------------------------------------------------------
# Slurm Worker Auto-Provisioning Script (Intel GPU + Shared Config Edition)
# -------------------------------------------------------------------------

# --- SETTINGS ---
HEAD_NODE_IP="192.168.196.250"
SHARED_DIR="/home/slurm_shared"
SLURM_CONF_DIR="/etc/slurm"
MUNGE_DIR="/etc/munge"

echo "🛠️  Starting Slurm Worker Provisioning..."

# 1. Install Required Packages
echo "📦 Installing Slurm, Munge, NFS, and Intel Drivers..."
sudo apt update && sudo apt install -y munge nfs-common intel-gpu-tools slurm-wlm

# 2. Mount Shared Storage
echo "📂 Mounting NFS Shared Storage..."
sudo mkdir -p $SHARED_DIR
if ! grep -qs "$SHARED_DIR" /etc/fstab; then
    echo "$HEAD_NODE_IP:$SHARED_DIR $SHARED_DIR nfs defaults 0 0" | sudo tee -a /etc/fstab
fi
sudo mount -a

# 3. Setup Munge (Security Handshake)
echo "🔑 Synchronizing Munge Key..."
# Expects munge.key.backup to exist in the shared folder
sudo cp $SHARED_DIR/munge.key.backup $MUNGE_DIR/munge.key
sudo chown munge:munge $MUNGE_DIR/munge.key
sudo chmod 400 $MUNGE_DIR/munge.key
sudo systemctl restart munge

# 4. Intel GPU Permissions
echo "🎮 Granting GPU access to Slurm user..."
sudo usermod -aG video,render slurm

# 5. Symbolic Linking of Centralized Configs
echo "🔗 Creating Symbolic Links for Slurm Configs..."
sudo mkdir -p $SLURM_CONF_DIR

# Remove existing local files to prevent conflicts
sudo rm -f $SLURM_CONF_DIR/slurm.conf $SLURM_CONF_DIR/gres.conf $SLURM_CONF_DIR/cgroup.conf

# Link to the "Master" files on the NFS share
sudo ln -s $SHARED_DIR/slurm.conf $SLURM_CONF_DIR/slurm.conf
sudo ln -s $SHARED_DIR/gres.conf $SLURM_CONF_DIR/gres.conf
sudo ln -s $SHARED_DIR/cgroup.conf $SLURM_CONF_DIR/cgroup.conf

# NOTE: slurmdbd.conf is NOT linked on workers as they don't run the DB service.

# 6. Start the Compute Daemon
echo "🚦 Starting slurmd service..."
sudo systemctl enable slurmd
sudo systemctl restart slurmd

echo "✅ Provisioning Complete! Check 'sinfo' on the Head Node."
```

---

### 📋 Configuration File Breakdown

Based on your `ls /etc/slurm/` output, here is how each file is handled:

| File | Purpose | Shared? | Worker Action |
| :--- | :--- | :--- | :--- |
| **slurm.conf** | Main Cluster Logic | **Yes** | Linked via NFS |
| **gres.conf** | GPU Hardware Map | **Yes** | Linked via NFS |
| **cgroup.conf** | Resource Constraints | **Yes** | Linked via NFS |
| **slurmdbd.conf** | Database Credentials | **No** | **Keep on Head Node Only.** Workers do not need DB passwords. |

---

### 🚀 Final Deployment Steps

1.  **On the Head Node:** Move your master files to the share so the script can find them.
    ```bash
    sudo cp /etc/slurm/slurm.conf /home/slurm_shared/
    sudo cp /etc/slurm/gres.conf /home/slurm_shared/
    sudo cp /etc/slurm/cgroup.conf /home/slurm_shared/
    sudo cp /etc/munge/munge.key /home/slurm_shared/munge.key.backup
    ```
2.  **On the New Worker:** Download and run the script.
    ```bash
    chmod +x provision_worker.sh
    ./provision_worker.sh
    ```

**Your cluster is now a "Single Point of Management" system.** Any change you make to the files in `/home/slurm_shared/` will propagate to all workers the moment you run `scontrol reconfigure`.

**Would you like me to explain how to configure the `cgroup.conf` file specifically to prevent users from accidentally crashing the OS by using too much RAM?**
