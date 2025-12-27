# 📘 COMPLETE SOFTWARE REQUIREMENTS SPECIFICATION (FINAL)

## Multi-User Compute Resource & Job Execution Platform using Ray

---

## 1. Introduction

### 1.1 Purpose

Define a **policy-driven, quota-enforced compute execution platform** using Ray, supporting **global and node-wise resource governance**, with **strict admin control** and **safe multi-user execution**.

---

### 1.2 Scope

The system provides:

* Per-user CPU & memory quotas
* GLOBAL or NODE-wise assignment
* Single concurrent job per user
* Retry on infrastructure failure
* Idle quota reclamation
* Full cluster visibility for Super Admin

The system explicitly **does not allow**:

* User-defined resource requests per job
* User node selection
* User visibility into cluster topology

---

### 1.3 Definitions

| Term          | Meaning                            |
| ------------- | ---------------------------------- |
| GLOBAL        | Cluster-wide resource pool         |
| NODE          | Resource bound to specific node(s) |
| Infra Failure | Node / Ray worker failure          |
| Retry         | Re-execution after infra failure   |

---

## 2. User Roles

### Super Admin

* Sees global + node-wise capacity
* Assigns quotas (GLOBAL / NODE)
* Approves resource requests
* Controls retry & idle policies

### User

* Submits jobs
* Views quota health only
* No cluster or node visibility

---

## 3. Functional Requirements

---

### 3.1 Cluster Visibility (Admin Only)

* FR-1: Global CPU & memory overview
* FR-2: Node-wise capacity, usage & health

---

### 3.2 User Creation & Quotas

* FR-3: Assignment modes (GLOBAL / NODE)
* FR-4: Multi-node selection
* FR-5: Capacity validation on assignment

User quota includes:

```
max_cpu
max_memory
assignment_mode
assigned_nodes[]
retry_limit
resource_state
```

---

### 3.3 Job Submission

* FR-6: Users submit jobs without resources
* FR-7: Jobs inherit user quota
* FR-8: NODE mode restricts execution nodes
* FR-9: One running job per user (FIFO queue)

---

### 3.4 Job Lifecycle

```
SUBMITTED → QUEUED → RUNNING → COMPLETED
                      ↓
                RETRY_WAITING
                      ↓
                    FAILED
```

---

### 3.5 Failure & Retry

* FR-10: Retry limit per user
* FR-11: Retry only on infra failure
* FR-12: Exhaustion → FAILED

---

### 3.6 Node Heartbeat & Health

* Nodes send heartbeat periodically
* Health states:

  * UP
  * DEGRADED
  * DOWN
  * MAINTENANCE
* DOWN nodes block scheduling immediately

---

### 3.7 Idle Resource Reclamation

* FR-13: Track last job execution
* FR-14: Idle → revoke quota → release nodes
* User state → `IDLE_REVOKED`

---

### 3.8 Resource Requests

* FR-15: Users request additional resources
* FR-16: Admin approves (GLOBAL / NODE)
* Applied to **future jobs only**

---

### 3.9 Resource Health Visibility

* FR-17 (User):

  * Healthy
  * In Use
  * Temporarily Unavailable
  * Revoked

* FR-18 (Admin):

  * Global health
  * Node-wise health
  * Per-user allocations

---

### 3.10 Scheduler & Ray Binding (STEP 6)

* Backend scheduler is authoritative
* GLOBAL → Ray default scheduling
* NODE → Ray custom node resources
* Scheduling blocked on unhealthy nodes
* All decisions audited

---

### 3.11 Audit Logging

All actions logged:

* Admin changes
* Job state transitions
* Retry decisions
* Node health changes

Audit logs are:

* Append-only
* Immutable
* Queryable

---

## 4. Non-Functional Requirements

### Security

* Zero user infra control
* Admin-only node visibility
* Server-side enforcement only

### Reliability

* No resource leakage
* Safe retry handling
* Deterministic state transitions

### Scalability

* Many users
* Many nodes
* Linear node-wise scaling

### Usability

* Simple user UX
* Powerful admin dashboards
* Explicit assignment modes

---

## 5. Out of Scope

* GPU scheduling
* Live job migration
* User pinning
* Multi-cluster federation

---

## 6. Final Statement

This system delivers an **enterprise-grade compute governance platform** where:

* **Admins control capacity**
* **Users run safely**
* **Nodes are governed, not exposed**
* **Ray executes, backend decides**

---

## ✅ STATUS: **FINAL SRS — COMPLETE & IMPLEMENTATION READY**
