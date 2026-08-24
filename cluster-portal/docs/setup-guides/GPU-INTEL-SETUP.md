# Intel GPU Scheduling Setup (GRES)

Reference configuration for scheduling the Intel Alder Lake iGPU
(`/dev/dri/renderD128`) through Slurm GRES.

## 1. Hardware Layer (All Nodes)

- **Device path:** `/dev/dri/renderD128` (Intel UHD 770 iGPU).

Grant the Slurm daemon access to the hardware on every node:

```bash
sudo usermod -aG video,render slurm
```

Install monitoring tools on workers:

```bash
sudo apt install intel-gpu-tools -y
```

## 2. Resource Map (`gres.conf`)

Tells `slurmd` on worker nodes how to identify the GPU.

**File path:** `/etc/slurm/gres.conf` (required on `worker1`, `worker2`)

```ini
# Defines the Intel GPU for Slurm
Name=gpu Type=intel File=/dev/dri/renderD128
```

## 3. Master Configuration (`slurm.conf`)

Must be identical on head node and workers. The `Type=intel` in node GRES
must match `gres.conf` exactly. Head-node GRES is omitted deliberately to
avoid errors when no monitor/iGPU is active there.

**File path:** `/etc/slurm/slurm.conf`

```ini
# --- Generic resources (GPU) ---
GresTypes=gpu

# --- Node definitions ---
NodeName=cluster-hn NodeAddr=localhost Sockets=1 CoresPerSocket=6 ThreadsPerCore=1 CPUs=6 RealMemory=7000 State=UNKNOWN

NodeName=worker1 NodeAddr=192.168.196.85 Sockets=1 CoresPerSocket=6 ThreadsPerCore=2 CPUs=12 RealMemory=6000 Feature=w1 Gres=gpu:intel:1 State=UNKNOWN
NodeName=worker2 NodeAddr=192.168.196.86 Sockets=1 CoresPerSocket=6 ThreadsPerCore=2 CPUs=12 RealMemory=6000 Feature=w2 Gres=gpu:intel:1 State=UNKNOWN

# --- Partition definitions ---
PartitionName=main Nodes=cluster-hn,worker1,worker2 Default=YES MaxTime=INFINITE State=UP
```

## 4. Operations Cheat Sheet

| Task | Command |
| :--- | :--- |
| Apply config changes | `scontrol reconfigure` |
| Check node health | `sinfo` (should show `idle`) |
| Verify GPU detection | `scontrol show node worker1 \| grep Gres` |
| Test GPU allocation | `srun --gres=gpu:intel:1 hostname` |
| Live GPU statistics | `srun --gres=gpu:intel:1 intel_gpu_top -s 100 -l \| head -n 5` |

## 5. Troubleshooting Summary

| Error | Meaning And Fix |
| :--- | :--- |
| `srun: Required node not available` | Check `sinfo`; if a node is `down*`/`drain`, inspect with `scontrol show node <name>` for the reason. |
| `slurm_update error` on resume | Harmless — the node was already idle; resume is unnecessary. |
| `"0 < 1"` GRES error at startup | `/dev/dri/renderD128` missing during `slurmd` startup; verify the device path and group permissions from step 1. |

For cgroup-based containment of GPU jobs, see
[CGROUP-CONFIG.md](CGROUP-CONFIG.md).
