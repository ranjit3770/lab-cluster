You’ve done it. Those `intel_gpu_top` lines are the heartbeat of a working cluster. The fact that `scontrol update` gave you an "Invalid node state transition" is actually a **good sign**—it means the nodes were already healthy and didn't need a manual "resume" to wake up.

Here is your final, consolidated **GPU Cluster Blueprint**. This is the single source of truth for your current working setup.

---

## 📄 Final Intel GPU Slurm Setup Document

### 1. The Hardware Layer (All Nodes)

To allow Slurm to bridge the gap between software requests and silicon hardware:

- **Device Path:** `/dev/dri/renderD128` (The Intel Alder Lake iGPU).
- **Permissions:** Run on **every node** to ensure the Slurm daemon can access the hardware:
  ```bash
  sudo usermod -aG video,render slurm
  ```
- **Monitoring Tools:** Install on **Workers** to verify usage:
  ```bash
  sudo apt install intel-gpu-tools -y
  ```

---

### 2. The Resource Map (`gres.conf`)

This file tells the `slurmd` service on the worker nodes how to identify the GPU hardware.

**File Path:** `/etc/slurm/gres.conf` (Required on **worker1** and **worker2**)

```ini
# Defines the Intel GPU for Slurm
Name=gpu Type=intel File=/dev/dri/renderD128
```

---

### 3. The Master Configuration (`slurm.conf`)

This defines the "rules of the house." It must be **identical** on the Head Node and all Workers.

**File Path:** `/etc/slurm/slurm.conf`

```ini
# --- GENERIC RESOURCES (GPU) ---
GresTypes=gpu

# --- NODE DEFINITIONS ---
# Head Node: GRES is omitted here to prevent errors if no monitor/iGPU is active.
NodeName=cluster-hn NodeAddr=localhost Sockets=1 CoresPerSocket=6 ThreadsPerCore=1 CPUs=6 RealMemory=7000 State=UNKNOWN

# Workers: Type 'intel' must match gres.conf exactly.
NodeName=worker1 NodeAddr=192.168.196.85 Sockets=1 CoresPerSocket=6 ThreadsPerCore=2 CPUs=12 RealMemory=6000 Feature=w1 Gres=gpu:intel:1 State=UNKNOWN
NodeName=worker2 NodeAddr=192.168.196.86 Sockets=1 CoresPerSocket=6 ThreadsPerCore=2 CPUs=12 RealMemory=6000 Feature=w2 Gres=gpu:intel:1 State=UNKNOWN

# --- PARTITION DEFINITIONS ---
PartitionName=main Nodes=cluster-hn,worker1,worker2 Default=YES MaxTime=INFINITE State=UP
```

---

### 4. Verified Operations Cheat Sheet

| Task                     | Command                                                        |
| :----------------------- | :------------------------------------------------------------- |
| **Apply Config Changes** | `scontrol reconfigure`                                         |
| **Check Node Health**    | `sinfo` (Should show `idle`)                                   |
| **Verify GPU Detection** | `scontrol show node worker1 \| grep Gres`                      |
| **Test GPU Allocation**  | `srun --gres=gpu:intel:1 hostname`                             |
| **See Live GPU Stats**   | `srun --gres=gpu:intel:1 intel_gpu_top -s 100 -l \| head -n 5` |

---

### 5. Final Troubleshooting Summary

- **`srun: Required node not available`**: Check `sinfo`. If a node is `down*` or `drain`, run `scontrol show node <name>` to see the **Reason**.
- **`slurm_update error`**: If you try to `resume` a node that is already `idle`, Slurm will throw this error. It’s harmless.
- **"0 < 1" GRES Error**: This happens if `/dev/dri/renderD128` isn't found during `slurmd` startup. Check your `gres.conf` path and permissions.

---

### 🏁 Success!

Your cluster is fully optimized for scheduling Intel GPU workloads.

**Would you like me to show you how to install the Intel Compute Runtime (OpenCL/Level Zero) so you can actually run Python (PyTorch/TensorFlow) or C++ code on these GPUs?**
