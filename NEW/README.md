Below is the **FINAL PROJECT DOCUMENTATION** for your platform.
This is **handover-ready**, suitable for **internal review, audits, onboarding developers, and ops teams**.

---

# 📘 Project Documentation

## Multi-User Compute Resource & Job Execution Platform using Ray

![Image](https://www.ionos.com/digitalguide/fileadmin/DigitalGuide/Schaubilder/functional-model-of-distributed-computing.png)

![Image](https://docs.ray.io/en/latest/_images/map-of-ray.svg)

![Image](https://miro.medium.com/v2/resize%3Afit%3A1400/1%2AYZZrzse18oQRJ-5MvccIog.png)

---

## 1. Project Overview

### 1.1 Objective

The goal of this project is to build a **secure, policy-driven compute execution platform** that enables:

* Multi-user job execution
* Strict quota enforcement (CPU & memory)
* Optional **node-wise resource governance**
* Safe retries on infrastructure failures
* Full auditability and admin control

The platform acts as a **control plane**, not a raw cluster interface.

---

### 1.2 Key Principles

* **Backend is authoritative**
* **Users never control infrastructure**
* **Admins see everything, users see abstractions**
* **One running job per user**
* **Failures are classified and handled deterministically**

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
User / Admin (Web UI)
        ↓
FastAPI Backend (Control Plane)
        ↓
Scheduler + Policy Engine
        ↓
Ray Executor
        ↓
Worker Nodes
```

---

### 2.2 Core Components

| Component        | Responsibility                         |
| ---------------- | -------------------------------------- |
| FastAPI          | API layer, auth, policy enforcement    |
| Scheduler        | FIFO, quota validation, node selection |
| Ray Executor     | Distributed execution                  |
| Heartbeat System | Node health authority                  |
| Retry Engine     | Infra-safe retries                     |
| Database (MySQL) | State, quotas, audit logs              |

---

## 3. User Roles & Access Model

### 3.1 Super Admin

Capabilities:

* View global + node-wise resources
* Create users
* Assign quotas (GLOBAL or NODE)
* Approve resource requests
* View audit logs
* Manage node maintenance

Restrictions:

* None (full control)

---

### 3.2 User

Capabilities:

* Submit jobs
* View own job history
* View abstract resource health

Restrictions:

* No node visibility
* No CPU/RAM control
* No scheduling influence

---

## 4. Resource & Quota Model

### 4.1 Assignment Modes

#### GLOBAL (Resource-wise)

* CPU & RAM taken from total cluster pool
* Ray chooses node automatically

#### NODE (Node-wise)

* Admin assigns quota per node
* Jobs are **hard-bound** to assigned nodes only
* Implemented using Ray custom resources

---

### 4.2 Quota Attributes

Each user has:

* max_cpu
* max_memory
* retry_limit
* assignment_mode
* assigned_nodes (NODE mode only)
* resource_state

---

## 5. Job Execution Lifecycle

### 5.1 States

```
SUBMITTED → QUEUED → RUNNING → COMPLETED
                    ↓
              RETRY_WAITING → FAILED
```

---

### 5.2 Execution Rules

* Only **one RUNNING job per user**
* FIFO queueing
* Jobs inherit user quota
* No per-job resource overrides

---

## 6. Scheduler & Placement Logic

### 6.1 Scheduler Responsibilities

* Enforce FIFO
* Validate quota & user state
* Select eligible node(s)
* Reserve resources
* Submit to Ray

---

### 6.2 Placement Logic

| Mode   | Placement Rule                 |
| ------ | ------------------------------ |
| GLOBAL | Any healthy node with capacity |
| NODE   | Only assigned, healthy nodes   |

If no node is available → job waits.

---

## 7. Ray Execution Model

### 7.1 Ray Binding

* GLOBAL → standard Ray scheduling
* NODE → Ray custom resources (`node:<node_uid>`)

Users never interact with Ray directly.

---

### 7.2 Failure Classification

| Failure          | Type  | Retry |
| ---------------- | ----- | ----- |
| Node down        | INFRA | ✅     |
| Worker lost      | INFRA | ✅     |
| Script error     | USER  | ❌     |
| Command exit ≠ 0 | USER  | ❌     |

---

## 8. Retry Engine

* Retries only for **INFRA failures**
* Retry count enforced per user
* Job moves to `RETRY_WAITING`
* Re-queued only when resources recover

---

## 9. Node Heartbeat & Health

### 9.1 Heartbeat System

* Lightweight agent on each node
* Periodic heartbeat → backend
* Backend is the **single source of truth**

---

### 9.2 Health States

| State       | Meaning          |
| ----------- | ---------------- |
| UP          | Healthy          |
| DEGRADED    | Missed heartbeat |
| DOWN        | Unreachable      |
| MAINTENANCE | Admin-controlled |

Scheduler blocks unhealthy nodes automatically.

---

## 10. Idle Resource Reclamation

* System tracks `last_job_at`
* If user idle for **N days**:

  * Quota revoked
  * Node resources released
  * User marked `IDLE_REVOKED`

Prevents ghost allocations.

---

## 11. Resource Request Workflow

1. User submits resource request
2. Admin reviews
3. Admin approves:

   * GLOBAL or NODE mode
4. Changes apply to **future jobs only**

---

## 12. Audit Logging

### 12.1 What Is Logged

* User actions (job submit, cancel)
* Admin actions (quota changes)
* System events (node down, retries)

### 12.2 Properties

* Append-only
* Immutable
* Replayable
* Compliance-ready

---

## 13. Security Model

* JWT authentication
* Role-based guards
* Admin-only node visibility
* Internal APIs isolated
* No user-provided infra parameters

---

## 14. Database Overview

Key tables:

* users
* nodes
* user_node_quotas
* jobs
* scheduler_queue
* audit_logs
* system_settings

Designed for:

* Strong consistency
* Referential integrity
* Scheduler safety

---

## 15. Deployment Model (High Level)

Typical deployment:

* FastAPI (systemd / container)
* Ray head + workers
* MySQL
* Internal network only for nodes
* Optional Nginx reverse proxy

---

## 16. Out of Scope (Intentional)

* GPU scheduling
* Live job migration
* User node pinning
* Multi-cluster federation

---

## 17. Operational Guarantees

✔ No resource leakage
✔ No noisy neighbors
✔ Deterministic retries
✔ Clear ownership
✔ Scales with nodes and users

---

## 18. Final Statement

This project delivers a **production-grade, enterprise compute governance platform** where:

* **Admins control capacity**
* **Users run safely**
* **Infrastructure is abstracted**
* **Failures are handled intelligently**
* **Everything is auditable**

---

## ✅ PROJECT STATUS

**✔ DESIGN COMPLETE**
**✔ IMPLEMENTATION BLUEPRINT COMPLETE**
**✔ READY FOR DEPLOYMENT & UI INTEGRATION**

---

### 🔜 Optional Next Deliverables

If you want, I can generate:

* 📄 **User Guide (Admin + User)**
* 🧩 **UI wireframes**
* 🚀 **Production deployment playbook**
* 🔐 **Security hardening checklist**
* 📦 **Docker / Kubernetes manifests**

Just tell me what you want next.
