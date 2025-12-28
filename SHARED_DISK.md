# 1️⃣ Shared Folder Setup (One-Time)

## 🔹 Head node (192.168.196.250)

```bash
mkdir -p /ray_shared
chmod 777 /ray_shared
```

### Install & configure NFS

```bash
apt update
apt install -y nfs-kernel-server
```

Edit exports:

```bash
nano /etc/exports
```

Add:

```text
/ray_shared 192.168.196.0/24(rw,sync,no_subtree_check,no_root_squash)
```

Apply:

```bash
exportfs -ra
systemctl restart nfs-kernel-server
```

---

## 🔹 ALL worker nodes (.90, .91, .92)

```bash
apt install -y nfs-common
mkdir -p /ray_shared
mount 192.168.196.250:/ray_shared /ray_shared
```

### Make it permanent

```bash
nano /etc/fstab
```

Add:

```text
192.168.196.250:/ray_shared /ray_shared nfs defaults,_netdev 0 0
```

Verify:

```bash
df -h | grep ray_shared
```

✔ Now `/ray_shared` is **permanent + cluster-wide**

---

# 2️⃣ What `/ray_shared` is used for (IMPORTANT)

✅ Trained models
✅ Logs
✅ Job outputs
✅ Artifacts

❌ NOT for Ray temp
❌ NOT for runtime_env cache

Ray temp should still be **node-local**.

---

# 3️⃣ Updated `ray_runner.py` (FINAL, CLEAN)

This version:

* Ships code via `runtime_env`
* Installs dependencies automatically
* Writes outputs to `/ray_shared`
* Single user
* CPU & memory aware
* Safe for production

---

## 📄 `ray_runner.py`

```python
import ray
import importlib
from pathlib import Path
import json
import time
import os

# --------------------------------------------------
# Job-level runtime environment
# --------------------------------------------------
PROJECT_DIR = str(Path(__file__).parent.resolve())
SHARED_DIR = "/ray_shared"

os.makedirs(SHARED_DIR, exist_ok=True)

ray.init(
    address="auto",
    runtime_env={
        "working_dir": PROJECT_DIR,
        "pip": [
            "scikit-learn==1.7.2",
            "numpy",
            "scipy",
            "joblib",
            "threadpoolctl",
        ],
    },
)

# --------------------------------------------------
# Ray task
# --------------------------------------------------
@ray.remote
def run_script(module_name: str, cpu: int, mem_gb: int):
    start = time.time()

    print(f"[Ray] Running {module_name}")
    importlib.import_module(module_name)

    result = {
        "script": module_name,
        "status": "completed",
        "cpu": cpu,
        "memory_gb": mem_gb,
        "finished_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "duration_sec": round(time.time() - start, 2),
    }

    # Persist result to shared storage
    output_file = f"{SHARED_DIR}/{module_name}_result.json"
    with open(output_file, "w") as f:
        json.dump(result, f, indent=2)

    print(f"[Ray] {module_name} finished → {output_file}")
    return result


def submit_script(module_name, cpu, mem_gb, run_on_head=False):
    opts = {
        "num_cpus": cpu,
        "memory": mem_gb * 1024**3,
    }

    if run_on_head:
        opts["resources"] = {"node:ray-head": 1}

    return run_script.options(**opts).remote(
        module_name, cpu, mem_gb
    )


# --------------------------------------------------
# MAIN
# --------------------------------------------------
if __name__ == "__main__":
    jobs = [
        submit_script("spam_detection_example", 2, 2),
        submit_script("ticket_categorization_example", 2, 2),
        submit_script("document_labeling_example", 4, 4),
        submit_script("multi_label_document_example", 6, 6, run_on_head=True),
    ]

    results = ray.get(jobs)

    print("\n=== JOB RESULTS ===")
    for r in results:
        print(r)
```

---

# 4️⃣ What you’ll see after running

```bash
python3 ray_runner.py
```

### In Ray dashboard

```
http://192.168.196.250:8265
```

* Tasks distributed across workers
* CPU & memory enforced
* No `/tmp` warnings (after temp-dir fix)

### In shared storage

```bash
ls /ray_shared
```

Example:

```text
spam_detection_example_result.json
ticket_categorization_example_result.json
document_labeling_example_result.json
multi_label_document_example_result.json
```

These files are:

* Written by **workers**
* Readable from **head**
* Persistent across restarts

---

# 5️⃣ Final Architecture (Correct & Scalable)

| Component        | Location            |
| ---------------- | ------------------- |
| Ray temp         | Local disk per node |
| Code shipping    | Ray runtime_env     |
| Dependencies     | runtime_env pip     |
| Outputs / models | `/ray_shared` (NFS) |
| Scheduling       | Ray                 |

This is **exactly how real Ray platforms are built**.

---
