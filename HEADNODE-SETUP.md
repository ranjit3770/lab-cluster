Perfect 👍
I’ll give you a **clean, copy-paste-ready head node setup** for **Ray**, designed **specifically for your night-only lab cluster**.

This is **production-safe**, **simple**, and **future-proof** (can later run on Kubernetes too).

---

# 🧠 Head Node Setup (Ray) – Step by Step

> **Target**
> Head node = **1 VM**
> OS = **Ubuntu 22.04 LTS**
> Time window = **6 PM – 8 AM**

---

## 🖥️ Head Node Minimum Specs (Confirm First)

| Resource | Recommended            |
| -------- | ---------------------- |
| CPU      | 8 cores                |
| RAM      | 16–24 GB               |
| Disk     | 100 GB SSD             |
| Network  | Same subnet as workers |

---

## 1️⃣ Base OS Preparation (Head VM)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git htop tmux unzip python3-pip python3-venv
```

Set hostname:

```bash
sudo hostnamectl set-hostname ray-head
```

---

## 2️⃣ Python Environment (VERY IMPORTANT)

Use **venv** (do NOT install Ray globally).

```bash
python3 -m venv /opt/rayenv
source /opt/rayenv/bin/activate
pip install --upgrade pip
```

---

## 3️⃣ Install Ray (Stable Version)

```bash
pip install "ray[default]==2.9.3"
```

Verify:

```bash
ray --version
```

---

## 4️⃣ Open Required Ports (Head Node)

| Purpose      | Port        |
| ------------ | ----------- |
| Ray GCS      | 6379        |
| Dashboard    | 8265        |
| Node manager | 10001       |
| Worker ports | 10002–10020 |

```bash
sudo ufw allow 6379
sudo ufw allow 8265
sudo ufw allow 10001
sudo ufw allow 10002:10020/tcp
sudo ufw reload
```

---

## 5️⃣ Start Ray Head Node (Manual Test)

Replace `HEAD_IP` with your VM IP.

```bash
source /opt/rayenv/bin/activate

ray start \
  --head \
  --node-ip-address=HEAD_IP \
  --port=6379 \
  --dashboard-host=0.0.0.0 \
  --dashboard-port=8265 \
  --num-cpus=8 \
  --memory=16e9
```

You should see:

```
Ray runtime started.
Dashboard: http://HEAD_IP:8265
```

✅ **Head node is LIVE**

---

## 6️⃣ Verify Dashboard (Critical)

Open browser:

```
http://HEAD_IP:8265
```

You should see:

* Head node
* CPU & memory
* No workers yet (expected)

---

## 7️⃣ Lock Head Node (IMPORTANT for Labs)

Prevent jobs from running on head:

```bash
ray stop
```

Restart with:

```bash
ray start \
  --head \
  --node-ip-address=HEAD_IP \
  --port=6379 \
  --dashboard-host=0.0.0.0 \
  --num-cpus=0
```

✔️ Head = scheduler only
✔️ Workers do the compute

---

## 8️⃣ Auto-Start at 6 PM (Systemd Service)

Create service:

```bash
sudo nano /etc/systemd/system/ray-head.service
```

```ini
[Unit]
Description=Ray Head Node
After=network.target

[Service]
Type=forking
User=root
ExecStart=/opt/rayenv/bin/ray start --head \
  --node-ip-address=HEAD_IP \
  --port=6379 \
  --dashboard-host=0.0.0.0 \
  --num-cpus=0
ExecStop=/opt/rayenv/bin/ray stop
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl daemon-reexec
sudo systemctl daemon-reload
sudo systemctl enable ray-head
```

---

## 9️⃣ Night-Only Scheduling (CRON)

```bash
sudo crontab -e
```

```cron
# Start Ray at 6 PM
0 18 * * * systemctl start ray-head

# Stop Ray at 8 AM
0 8 * * * systemctl stop ray-head
```

---

## 🔒 Safety Hardening (DON’T SKIP)

1. Disable SSH password login
2. Allow SSH only from admin IPs
3. Run jobs as **non-root users**
4. Hard kill jobs at 7:30 AM

---

## 🧪 Final Validation Test

```bash
ray status
```

Expected:

* Head node running
* 0 workers
* Dashboard active

---

## 🎯 What Comes NEXT (Very Important)

Now you need:

1. **Worker node setup**
2. **Job submission method**
3. **Resource quotas per job**
4. **Auto-cleanup at 8 AM**

I recommend next:

> 👉 **Worker node setup (5–10 min)**

Just say:
**“setup worker nodes next”**
