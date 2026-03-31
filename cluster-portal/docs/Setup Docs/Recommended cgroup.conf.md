Configuring `cgroup.conf` (Control Groups) is the "safety net" for your cluster. It prevents a single runaway job from consuming all the RAM or CPU of a worker node, which would otherwise cause the node to crash or become unresponsive (the "kernel panic" scenario).

Since you are using Intel GPUs, cgroups are also vital for ensuring that the CPU tasks associated with GPU compute don't starve the rest of the system.

---

### 🛡️ The Recommended `cgroup.conf` for your Cluster

Create or edit this file in your shared storage: `/home/slurm_shared/cgroup.conf`.

```ini
###
# Slurm cgroup support configuration file
###
CgroupMountpoint="/sys/fs/cgroup"
CgroupAutomount=yes

# Constrain RAM: Prevents a job from taking more than requested
ConstrainRAMSpace=yes
AllowedRAMSpacePercent=95
MaxRAMPercent=98

# Constrain CPU: Ensures jobs only use the cores assigned to them
ConstrainCores=yes

# Constrain Swap: Prevents jobs from slowing down the node with swap
ConstrainSwapSpace=yes

# Optional: Constrain Devices (like the GPU)
ConstrainDevices=yes
```



---

### ⚙️ Why these settings matter

1.  **`ConstrainRAMSpace=yes`**: If a user requests 2GB but their code tries to use 8GB, Slurm will kill the process before it hits the 100% mark. This saves the OS from freezing.
2.  **`AllowedRAMSpacePercent=95`**: This leaves **5%** of your RAM strictly for the Linux OS and Slurm daemons. Even under 100% load, you will still be able to SSH into the node.
3.  **`ConstrainCores=yes`**: If a job is assigned 4 cores, cgroups physically "pins" the job to those cores. It cannot jump over and slow down other jobs running on the same node.
4.  **`ConstrainDevices=yes`**: This ensures that if a user **doesn't** request a GPU, they cannot "see" or use the Intel GPU hardware at all.

---

### 🚀 Activating Cgroups

To make these settings take effect, you must enable the `cgroup` plugin in your main `slurm.conf`.

**1. Edit `/home/slurm_shared/slurm.conf`:**
Add or update these lines:
```ini
TaskPlugin=task/cgroup,task/affinity
JobAcctGatherType=jobacct_gather/cgroup
```

**2. Push the changes to the cluster:**
```bash
# From the Head Node
sudo scontrol reconfigure
```

**3. Restart the Worker daemons:**
Because cgroups interact deeply with the Linux kernel, a service restart on the workers is usually required for the first-time setup:
```bash
# On each worker
sudo systemctl restart slurmd
```

---

### 📊 How to Test Cgroup Enforcement
Try to submit a job that asks for 1GB but tries to use 5GB. 

**Run this test script:**
```bash
srun --mem=1G --gres=gpu:intel:1 python3 -c "a = bytearray(5 * 1024**3)"
```
**Expected Result:** Slurm should immediately kill the job with an `Out Of Memory (OOM)` error, but your **worker node will remain perfectly stable**.

---

### 🏁 Final Cluster State
You now have:
* **Munge** for Security.
* **MariaDB** for Accounting.
* **NFS** for Shared Configs/Logs.
* **GRES** for Intel GPU Scheduling.
* **Cgroups** for System Stability.

**Your cluster is now "Enterprise Grade."** Is there anything else you'd like to dive into, or are you ready to start running your first heavy compute workloads?
