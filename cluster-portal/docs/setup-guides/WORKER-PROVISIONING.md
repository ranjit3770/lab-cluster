# Worker Provisioning Script

`provision_worker.sh` joins a new worker node to the cluster in one run. It
assumes the head node is the source of truth and the NFS share
(`/home/slurm_shared`) distributes configuration files.

Because `cgroup.conf` and `slurmdbd.conf` live in the shared directory, the
script handles them correctly: workers get symlinks for shared configs; the
database credentials file stays local to the head node only.

## The Script

Run on any **new worker node**:

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

echo "Starting Slurm worker provisioning..."

# 1. Install required packages
echo "Installing Slurm, Munge, NFS, and Intel drivers..."
sudo apt update && sudo apt install -y munge nfs-common intel-gpu-tools slurm-wlm

# 2. Mount shared storage
echo "Mounting NFS shared storage..."
sudo mkdir -p $SHARED_DIR
if ! grep -qs "$SHARED_DIR" /etc/fstab; then
    echo "$HEAD_NODE_IP:$SHARED_DIR $SHARED_DIR nfs defaults 0 0" | sudo tee -a /etc/fstab
fi
sudo mount -a

# 3. Set up Munge (security handshake)
echo "Synchronizing Munge key..."
# Expects munge.key.backup to exist in the shared folder
sudo cp $SHARED_DIR/munge.key.backup $MUNGE_DIR/munge.key
sudo chown munge:munge $MUNGE_DIR/munge.key
sudo chmod 400 $MUNGE_DIR/munge.key
sudo systemctl restart munge

# 4. Intel GPU permissions
echo "Granting GPU access to slurm user..."
sudo usermod -aG video,render slurm

# 5. Symbolic links to centralized configs
echo "Creating symbolic links for Slurm configs..."
sudo mkdir -p $SLURM_CONF_DIR

# Remove existing local files to prevent conflicts
sudo rm -f $SLURM_CONF_DIR/slurm.conf $SLURM_CONF_DIR/gres.conf $SLURM_CONF_DIR/cgroup.conf

# Link to the master files on the NFS share
sudo ln -s $SHARED_DIR/slurm.conf $SLURM_CONF_DIR/slurm.conf
sudo ln -s $SHARED_DIR/gres.conf $SLURM_CONF_DIR/gres.conf
sudo ln -s $SHARED_DIR/cgroup.conf $SLURM_CONF_DIR/cgroup.conf

# NOTE: slurmdbd.conf is NOT linked on workers — they do not run the DB service.

# 6. Start the compute daemon
echo "Starting slurmd service..."
sudo systemctl enable slurmd
sudo systemctl restart slurmd

echo "Provisioning complete. Check 'sinfo' on the head node."
```

## Configuration File Handling

| File | Purpose | Shared? | Worker action |
| :--- | :--- | :--- | :--- |
| `slurm.conf` | Main cluster logic | Yes | Linked via NFS |
| `gres.conf` | GPU hardware map | Yes | Linked via NFS |
| `cgroup.conf` | Resource constraints | Yes | Linked via NFS |
| `slurmdbd.conf` | Database credentials | No | Keep on head node only |

## Deployment Steps

**1. On the head node** — publish master files to the share so the script can
find them:

```bash
sudo cp /etc/slurm/slurm.conf /home/slurm_shared/
sudo cp /etc/slurm/gres.conf /home/slurm_shared/
sudo cp /etc/slurm/cgroup.conf /home/slurm_shared/
sudo cp /etc/munge/munge.key /home/slurm_shared/munge.key.backup
```

**2. On the new worker** — download and run:

```bash
chmod +x provision_worker.sh
./provision_worker.sh
```

After provisioning, any change to files in `/home/slurm_shared/` propagates to
all workers with `scontrol reconfigure`.

> The production cluster performs equivalent steps idempotently through the
> Ansible append workflow — see
> [Append a New Slurm Worker Node](../../../docs/APPEND-NEW-NODE.md).
