## 🏗️ Correct Architecture

```
Head node (NFS server)
 └── /ray_shared   (on /dev/sda2)

Workers (NFS clients)
 └── /ray_shared   (mounted path, same location)
```

From Ray’s point of view:

* `/ray_shared` exists on **every node**
* Same path
* Same data

---

## 🧱 STEP-BY-STEP (PRODUCTION SAFE)

### 1️⃣ Create shared directory on HEAD node

```bash
mkdir -p /ray_shared
chmod 777 /ray_shared
```

---

### 2️⃣ Install NFS server on HEAD node

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

### 3️⃣ Install NFS client on ALL WORKERS

On `.90`, `.91`, `.92`:

```bash
apt install -y nfs-common
```

Create mount point:

```bash
mkdir -p /ray_shared
```

Mount it:

```bash
mount 192.168.196.250:/ray_shared /ray_shared
```

Verify:

```bash
df -h | grep ray_shared
```

---

### 4️⃣ Make it PERMANENT (important)

Edit `/etc/fstab` on **ALL workers**:

```bash
nano /etc/fstab
```

Add:

```text
192.168.196.250:/ray_shared /ray_shared nfs defaults,_netdev 0 0
```

Now it survives reboot ✅

---

## ✅ What you should store in `/ray_shared`

This directory is now **permanent and cluster-wide**.

Use it for:

| Use case          | Recommended |
| ----------------- | ----------- |
| Trained ML models | ✅           |
| Datasets          | ✅           |
| Logs              | ✅           |
| Job outputs       | ✅           |
| Checkpoints       | ✅           |

❌ **Do NOT** use it for Ray internal temp (`--temp-dir`)
Ray temp must be **node-local** (for performance).

---

## ⚠️ Important distinction (DO NOT mix these)

| Purpose                 | Correct Location        |
| ----------------------- | ----------------------- |
| Ray temp (`--temp-dir`) | Local disk on each node |
| Shared job outputs      | NFS (`/ray_shared`)     |
| runtime_env cache       | Local disk              |
| Models / artifacts      | NFS                     |

---

## 🔧 How to use it in your scripts

Example: save trained model

```python
import joblib

joblib.dump(model, "/ray_shared/models/spam_model.joblib")
```

This works **from any worker**.

---

## 🧠 Best practice for your cluster (recommended setup)

### ✔ Node-local (fast)

* `/mnt/ray_tmp` → Ray temp dir

### ✔ Shared (persistent)

* `/ray_shared` → NFS from head node

This is exactly how **enterprise Ray clusters** are set up.

---

## 🏁 Final Answer (Clear Verdict)

| Question                                | Answer |
| --------------------------------------- | ------ |
| Can I use head node disk directly?      | ❌ No   |
| Can I create a permanent shared folder? | ✅ Yes  |
| Does it need to exist on all nodes?     | ✅ Yes  |
| Best method                             | ✅ NFS  |
| Should Ray temp use this folder?        | ❌ No   |

---
