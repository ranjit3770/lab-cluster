Perfect — this is **doable**, and you only need **5–10 GB free per worker** to make Ray **stable**.

Below is a **minimal, safe, step-by-step cleanup plan** that works on Ubuntu **without breaking the system**.

I’ll keep this **practical and conservative**.

---

# 🎯 Goal (Very Clear)

✔ Free **5–10 GB** on **each worker**
✔ Use it **only for Ray temp**
✔ Keep **all job outputs on `/ray_shared`**
✔ Stop `/tmp/ray` warnings permanently

---

# 🧠 First: Where space is actually going (from your `df -h`)

On workers you have:

```
/dev/nvme0n1p6   78G   67G   6.7G   91%   /
```

So you need to reclaim **just ~5–8 GB**.

The biggest, **safe-to-clean** sources are:

1. APT cache
2. Old logs (journald)
3. Snap cache (very big on Ubuntu)
4. Old Ray sessions

---

# ✅ STEP 1 — Clean APT cache (SAFE)

```bash
apt clean
apt autoremove -y
```

Typical gain: **0.5 – 2 GB**

---

# ✅ STEP 2 — Shrink system logs (SAFE & IMPORTANT)

Check current size:

```bash
journalctl --disk-usage
```

Limit logs to **200 MB**:

```bash
journalctl --vacuum-size=200M
```

Typical gain: **1–3 GB**

---

# ✅ STEP 3 — Clean old Ray temp (CRITICAL)

```bash
ray stop -f
rm -rf /tmp/ray/session_*
```

Typical gain: **1–5 GB** (often more)

---

# ✅ STEP 4 — Reduce Snap cache (BIGGEST WIN on Ubuntu)

Snap keeps **multiple versions** by default.

### Remove disabled snaps:

```bash
snap list --all | awk '/disabled/{print $1, $3}' | \
while read snapname revision; do
  snap remove "$snapname" --revision="$revision"
done
```

### Limit future snap versions:

```bash
snap set system refresh.retain=2
```

Typical gain: **2–6 GB**

---

# ✅ STEP 5 — Verify free space

```bash
df -h /
```

You should now see **≥12–15 GB free**.

This is **more than enough** for Ray.

---

# 🧱 STEP 6 — Create minimal Ray temp directory (LOCAL)

```bash
mkdir -p /var/tmp/ray_tmp
chmod 777 /var/tmp/ray_tmp
```

This directory will:

* Be local
* Use reclaimed disk
* Only store Ray internals

---

# 🚀 STEP 7 — Restart Ray on WORKERS (MINIMAL CONFIG)

### On each worker (`.90`, `.91`, `.92`):

```bash
ray stop -f

ray start \
  --address=192.168.196.250:6379 \
  --node-ip-address=<WORKER_IP> \
  --num-cpus=12 \
  --memory=8589934592 \
  --temp-dir=/var/tmp/ray_tmp
```

---

# 🚀 STEP 8 — Restart Ray on HEAD NODE (unchanged logic)

(Head node already has disk, but keep clean)

```bash
mkdir -p /mnt/ray_tmp
chmod 777 /mnt/ray_tmp

ray stop -f

ray start \
  --head \
  --node-ip-address=192.168.196.250 \
  --num-cpus=8 \
  --memory=17179869184 \
  --resources='{"node:ray-head": 1}' \
  --dashboard-host=0.0.0.0 \
  --dashboard-port=8265 \
  --metrics-export-port=8080 \
  --ray-client-server-port=10001 \
  --temp-dir=/mnt/ray_tmp
```

---

# 🔍 STEP 9 — Confirm warnings are gone

On any node:

```bash
python3 - <<EOF
import ray
ray.init()
print(ray.available_resources())
EOF
```

You should **NO LONGER see**:

```
file_system_monitor.cc: ... over 95% full
```

---

# 🧠 Why this works (important reassurance)

* Workers now have **small local scratch space**
* Ray temp + spilling work correctly
* **NO job data is stored locally**
* All outputs still go to **`/ray_shared`**
* Cluster is **stable**

This is the **minimum disk Ray needs** — nothing extra.

---

# 🏁 Final Result

| Item               | Status                  |
| ------------------ | ----------------------- |
| Worker local disk  | ✅ Freed 5–10 GB         |
| Ray temp dir       | ✅ Local & safe          |
| NFS shared storage | ✅ Used only for outputs |
| Ray warnings       | ❌ Gone                  |
| Cluster stability  | ✅ Restored              |

---

## 🔜 Optional (but smart next step)

Once things are stable, I strongly recommend:

* Add a **cron job** to clean old `/tmp/ray/session_*`
* Monitor disk via `df -h` weekly

If you want, I can:

* Give a **1-line cron cleanup**
* Show **Ray disk usage metrics**
* Tune Ray to **reduce spilling**

Just tell me 👍
