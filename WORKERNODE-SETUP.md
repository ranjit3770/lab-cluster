Excellent — let’s set up the **Ray WORKER nodes properly**, with **all required dependencies**, and in a way that is **safe for your night-only lab cluster**.

I’ll keep this **strictly practical and copy-paste ready**.

---

# 🧱 Ray Worker Node Setup (Night Lab Cluster)

> Do **these steps on EACH worker VM / physical machine**
> OS assumed: **Ubuntu 22.04 LTS**
> Network: **same subnet as head node**

---

## 🧠 Worker Node Role (Important)

A worker node:

* ❌ does NOT run dashboard
* ❌ does NOT schedule jobs
* ✅ only executes tasks
* ✅ enforces CPU / RAM limits

---

## 0️⃣ Worker Node Resource Planning (Example)

| Resource         | Value          |
| ---------------- | -------------- |
| CPU              | 16 cores       |
| RAM              | 32 GB          |
| Disk             | 200 GB         |
| Night allocation | 12 CPU / 24 GB |

We will **explicitly tell Ray** what it is allowed to use.

---

## 1️⃣ Base OS Preparation (Worker)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  curl wget git htop tmux unzip \
  python3-pip python3-venv \
  build-essential \
  net-tools
```

Set hostname (important for dashboard clarity):

```bash
sudo hostnamectl set-hostname ray-worker-1
```

(Use `ray-worker-2`, `ray-worker-3`, etc.)

---

## 2️⃣ Python Virtual Environment (MANDATORY)

⚠️ **Ray versions must match head node exactly**

```bash
python3 -m venv /opt/rayenv
source /opt/rayenv/bin/activate
pip install --upgrade pip
```

---

## 3️⃣ Install Ray (Same Version as Head)

> Use **exact version** installed on head node

```bash
pip install "ray[default]==2.9.3"
```

Verify:

```bash
ray --version
```

---

## 4️⃣ Network & Firewall (Worker)

Ray workers need **outbound + inbound** access.

```bash
sudo ufw allow from <HEAD_IP>
sudo ufw allow 10002:10020/tcp
sudo ufw reload
```

Also ensure:

```bash
ping <HEAD_IP>
```

---

## 5️⃣ Join Worker to Head Node (Manual Test)

Replace:

* `<HEAD_IP>` → head VM IP
* adjust CPU/RAM as per your policy

```bash
source /opt/rayenv/bin/activate

ray start \
  --address=<HEAD_IP>:6379 \
  --node-ip-address=$(hostname -I | awk '{print $1}') \
  --num-cpus=12 \
  --memory=24e9 \
  --object-store-memory=6e9
```

Expected output:

```
Ray runtime started.
Connected to Ray cluster.
```

---

## 6️⃣ Verify from Head Node (CRITICAL)

On **head node**, run:

```bash
ray status
```

You should now see:

```
Active:
 1 ray-head
 1 ray-worker-1
```

Resources should show:

```
12.0 CPU
24.0 GiB memory
```

✅ This confirms worker is properly registered.

---

## 7️⃣ Lock Worker for Night-Only Use (Systemd)

Create service:

```bash
sudo nano /etc/systemd/system/ray-worker.service
```

```ini
[Unit]
Description=Ray Worker Node
After=network.target

[Service]
Type=forking
User=root
ExecStart=/opt/rayenv/bin/ray start \
  --address=<HEAD_IP>:6379 \
  --node-ip-address=%H \
  --num-cpus=12 \
  --memory=24e9 \
  --object-store-memory=6e9
ExecStop=/opt/rayenv/bin/ray stop
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable it:

```bash
sudo systemctl daemon-reexec
sudo systemctl daemon-reload
sudo systemctl enable ray-worker
```

---

## 8️⃣ Night Scheduler (CRON)

```bash
sudo crontab -e
```

```cron
# Start worker at 6 PM
0 18 * * * systemctl start ray-worker

# Stop worker at 8 AM
0 8 * * * systemctl stop ray-worker
```

---

## 9️⃣ Optional but STRONGLY Recommended

### A) Custom Resource Tagging (Fair Scheduling)

On worker:

```bash
ray stop
```

```bash
ray start \
  --address=<HEAD_IP>:6379 \
  --resources='{"night_cpu": 12, "night_mem": 24}'
```

Then jobs must request:

```python
@ray.remote(resources={"night_cpu": 4})
def job():
    ...
```

---

### B) Kill All Jobs Before 8 AM (Safety)

On head node (cron at 7:30 AM):

```bash
ray job stop --all
```

---

## 🔍 Common Problems & Fixes

| Issue                | Cause               | Fix                         |
| -------------------- | ------------------- | --------------------------- |
| Worker not visible   | Firewall            | Open ports                  |
| Version mismatch     | Ray versions differ | Match versions              |
| Jobs running on head | Head has CPUs       | Restart with `--num-cpus=0` |
| Memory errors        | OS limit            | Lower `--memory`            |

---

## 🟢 Final Validation Checklist

From head node:

```bash
ray status
```

You should see:

* Head node (0 CPU)
* All workers (expected CPU/RAM)
* No failures

---

## 🚀 What’s NEXT (Very Important)

Now your cluster can **execute jobs**, but you still need:

1. **Job submission method**
2. **Per-job quotas & time limits**
3. **Simple web UI / CLI for students**
4. **Auto cleanup & reporting**

### Recommended next step:

👉 **“setup job submission + resource quotas”**

Say the word and I’ll build it step-by-step.
