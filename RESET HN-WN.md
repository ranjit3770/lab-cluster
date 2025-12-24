Excellent question 👍
This is **exactly what you should have** before moving further.

Below is a **SAFE, CLEAN, REPEATABLE reset + rejoin procedure** for **Ray HEAD and WORKER nodes**.
You can run this **any time** (debugging, mistakes, reconfiguration, lab resets).

---

# 🔄 Ray Cluster Reset & Rejoin (Canonical Procedure)

> Use this when:
>
> * Worker not joining
> * Resource counts wrong
> * Changing CPU / RAM limits
> * Before nightly runs
> * Before re-deployment

---

## 🧠 Golden Rules (Read Once)

1. **Always stop WORKERS first**
2. **Then stop HEAD**
3. **Reset in this order**
4. **Start HEAD first**
5. **Then start WORKERS**

Never break this order.

---

## 🧹 PART A — Reset (Clean Shutdown)

---

### 1️⃣ On EACH WORKER node

```bash
source /opt/rayenv/bin/activate
ray stop --force
```

Verify:

```bash
ps aux | grep ray | grep -v grep
```

→ should return nothing

Optional deep cleanup (safe):

```bash
rm -rf /tmp/ray
```

---

### 2️⃣ On HEAD node (after all workers stopped)

```bash
source /opt/rayenv/bin/activate
ray stop --force
```

Verify:

```bash
ps aux | grep ray | grep -v grep
```

Optional deep cleanup:

```bash
rm -rf /tmp/ray
```

---

## 🔁 PART B — Rejoin (Fresh Start)

---

### 3️⃣ Start HEAD node (Scheduler-only mode)

On **HEAD VM**:

```bash
source /opt/rayenv/bin/activate

ray start \
  --head \
  --node-ip-address=<HEAD_IP> \
  --port=6379 \
  --dashboard-host=0.0.0.0 \
  --dashboard-port=8265 \
  --num-cpus=0
```

Verify:

```bash
ray status
```

Expected:

```
Active:
 1 ray-head
```

---

### 4️⃣ Start WORKER nodes (one by one)

On **each worker**:

```bash
source /opt/rayenv/bin/activate

ray start \
  --address=192.168.196.250:6380 \
  --node-ip-address=$(hostname -I | awk '{print $1}') \
  --num-cpus=12 \
  --memory=8589934592 \
  --object-store-memory=6442450944

```

Verify from **HEAD**:

```bash
ray status
```

Expected:

```
Active:
 ray-head
 ray-worker-1
 ray-worker-2
```

---

## ✅ PART C — Health Check (MANDATORY)

From head node:

```bash
ray status
```

You should see:

* No pending nodes
* No failures
* Correct CPU / RAM totals

Dashboard:

```
http://<HEAD_IP>:8265
```

---

## 🧪 PART D — Quick Functional Test

On head node:

```python
python3
```

```python
import ray
ray.init(address="auto")

@ray.remote(num_cpus=1)
def ping():
    return "OK"

ray.get([ping.remote() for _ in range(4)])
```

✔️ Confirms:

* Workers execute tasks
* Scheduler works
* No head execution (if CPUs = 0)

---

## 🛑 Emergency Reset (If Things Go VERY Wrong)

Use only if cluster is stuck:

```bash
sudo systemctl stop ray-head ray-worker
ray stop --force
pkill -f ray
rm -rf /tmp/ray
reboot
```

---

## 🧠 Best Practice (Lab Environment)

* Run this reset **daily at 5:50 PM**
* Start cluster **fresh at 6:00 PM**
* Stop everything **7:30–8:00 AM**

---

## 🟢 Summary (Memorize This)

```
STOP WORKERS
STOP HEAD
CLEAN /tmp/ray
START HEAD
START WORKERS
VERIFY
```

This guarantees **zero ghost state**.

---

When you’re ready, say:

> **“Proceed with job submission + resource quotas”**

I’ll continue from here cleanly 🚀
