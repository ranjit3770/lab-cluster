Moving your configuration files and keys to a shared folder is a "Pro" move. It ensures that when you change a setting on the Head Node, the Worker Nodes see that change **instantly** without you having to manually `scp` files to each machine.

Here is the documentation to centralize your Slurm management using the NFS share you just created.

---

## 🛠️ Slurm Centralized Management Guide

### 1. Centralizing the Slurm Configuration
Instead of having three different `slurm.conf` files, we will create one "Master" file in the shared storage and link the nodes to it.

**On the Head Node (`cluster-hn`):**
1. **Move the config to the share:**
   ```bash
   sudo cp /etc/slurm/slurm.conf /home/slurm_shared/slurm.conf
   sudo cp /etc/slurm/gres.conf /home/slurm_shared/gres.conf
   ```
2. **Create a Symbolic Link:**
   (This tells the system: "When you look in `/etc/slurm/`, go find the real file in `/home/slurm_shared/`")
   ```bash
   sudo rm /etc/slurm/slurm.conf
   sudo ln -s /home/slurm_shared/slurm.conf /etc/slurm/slurm.conf
   ```

**On the Worker Nodes (`worker1` & `worker2`):**
1. **Remove local copies and link to the share:**
   ```bash
   sudo rm /etc/slurm/slurm.conf
   sudo ln -s /home/slurm_shared/slurm.conf /etc/slurm/slurm.conf
   sudo ln -s /home/slurm_shared/gres.conf /etc/slurm/gres.conf
   ```



---

### 2. Centralizing the Munge Key
Munge requires the exact same key on all nodes to allow them to talk. While you can keep it in `/etc/munge/`, storing a backup in the shared folder is helpful for adding new nodes quickly.

**On the Head Node:**
```bash
sudo cp /etc/munge/munge.key /home/slurm_shared/munge.key.backup
sudo chmod 400 /home/slurm_shared/munge.key.backup
```

---

### 3. The "New Workflow" for Cluster Changes
Now that everything is linked, updating your cluster is much easier:

1.  **Edit the config once:** `vim /home/slurm_shared/slurm.conf`
2.  **Apply to the whole cluster:**
    ```bash
    # From the head node
    scontrol reconfigure
    ```
    *Because the workers are linked to the shared file, they see the update the millisecond you hit save.*

---

### 4. Running Your First "True" Shared Job
Now that your storage is linked, let's run that GPU job again, but properly this time.

**Run these commands on the Head Node:**
```bash
# 1. Enter the shared area
cd /home/slurm_shared

# 2. Submit the job
sbatch submit_gpu_job.sh

# 3. Wait 5 seconds, then check for the log
ls -l gpu_job_*.log
```

**Why this works:**
* `sbatch` reads the script from `/home/slurm_shared`.
* `worker1` executes the script and writes `gpu_job_37.log` to `/home/slurm_shared`.
* You see the log instantly on `cluster-hn` because both nodes are looking at the same folder.



---

### 🏁 Final Verification
Check if the symbolic link is active on your workers:
```bash
ls -l /etc/slurm/slurm.conf
```
*It should show: `/etc/slurm/slurm.conf -> /home/slurm_shared/slurm.conf`*

**Would you like me to show you how to set up a "Watch" script that monitors your GPU usage across all nodes in real-time?**
