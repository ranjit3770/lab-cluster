* 🔐 Super Admin only
* 👤 User
* ⚙️ System/Internal

---

# 🌐 API DESIGN — ER → ENDPOINTS MAPPING

---

## 1️⃣ Authentication & Identity

### 👤 Login

```
POST /auth/login
```

**Request**

```json
{
  "username": "alice",
  "api_key": "xxxx"
}
```

**Response**

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "role": "USER"
}
```

---

### 👤 Refresh Token

```
POST /auth/refresh
```

---

### 👤 Get Current User (used on every login)

```
GET /me
```

**Response**

```json
{
  "user_id": 42,
  "username": "alice",
  "role": "USER",
  "resource_state": "ACTIVE",
  "quota": {
    "cpu": 2,
    "memory_gb": 2,
    "assignment_mode": "NODE_WISE"
  }
}
```

Used for:

* Login popup logic
* Resource health display
* Job submit enable/disable

---

## 2️⃣ Super Admin — Cluster & Node Management 🔐

### 🔐 Get Global Cluster Resources

```
GET /admin/cluster/summary
```

**Response**

```json
{
  "total_cpu": 64,
  "free_cpu": 24,
  "total_memory_gb": 128,
  "free_memory_gb": 40
}
```

---

### 🔐 List Nodes (Node-wise View)

```
GET /admin/nodes
```

**Response**

```json
[
  {
    "node_id": 1,
    "node_name": "worker-1",
    "total_cpu": 16,
    "free_cpu": 4,
    "total_memory_gb": 32,
    "free_memory_gb": 8,
    "health_status": "UP"
  }
]
```

---

### 🔐 Get Single Node Details

```
GET /admin/nodes/{node_id}
```

---

## 3️⃣ Super Admin — User & Quota Management 🔐

### 🔐 Create User (Global or Node-wise)

```
POST /admin/users
```

**Request**

```json
{
  "username": "alice",
  "max_cpu": 2,
  "max_memory_gb": 2,
  "retry_limit": 2,
  "assignment_mode": "NODE_WISE",
  "nodes": [
    { "node_id": 1, "cpu": 1, "memory_gb": 1 },
    { "node_id": 2, "cpu": 1, "memory_gb": 1 }
  ]
}
```

---

### 🔐 Update User Quota

```
PUT /admin/users/{user_id}/quota
```

Supports:

* Switching GLOBAL ↔ NODE_WISE
* Updating retry limits
* Reassigning nodes

---

### 🔐 List All Users

```
GET /admin/users
```

---

### 🔐 Get User Details (Admin View)

```
GET /admin/users/{user_id}
```

Includes:

* Quota
* Assigned nodes
* Active jobs
* Resource state

---

## 4️⃣ User — Resource Health & Dashboard 👤

### 👤 Get My Resource Health

```
GET /user/resources/health
```

**Response**

```json
{
  "status": "HEALTHY",
  "message": "Resources available"
}
```

---

### 👤 Get My Quota

```
GET /user/quota
```

---

## 5️⃣ User — Job Submission & Queue 👤

### 👤 Submit Job

```
POST /jobs
```

**Request**

```json
{
  "script_name": "fine_tune_model",
  "params": {
    "epochs": 3,
    "dataset": "ds1"
  }
}
```

Backend automatically:

* Applies quota
* Enqueues if job already running

---

### 👤 List My Jobs

```
GET /jobs
```

---

### 👤 Get Job Details

```
GET /jobs/{job_id}
```

Includes:

* Status
* Retry count
* Node run history

---

### 👤 Cancel Job

```
DELETE /jobs/{job_id}
```

Rules:

* RUNNING → cancel allowed
* QUEUED → removed immediately

---

## 6️⃣ Super Admin — Job Oversight 🔐

### 🔐 List All Jobs

```
GET /admin/jobs
```

Supports filters:

```
?status=FAILED
?user_id=42
```

---

### 🔐 Cancel Any Job

```
DELETE /admin/jobs/{job_id}
```

---

## 7️⃣ Failure, Retry & Node Execution (Internal)

### ⚙️ Internal — Register Job Start

```
POST /internal/jobs/{job_id}/start
```

---

### ⚙️ Internal — Register Job Failure

```
POST /internal/jobs/{job_id}/fail
```

**Payload**

```json
{
  "reason": "NODE_FAILURE"
}
```

Triggers:

* Retry logic
* Resource release

---

### ⚙️ Internal — Register Job Completion

```
POST /internal/jobs/{job_id}/complete
```

---

## 8️⃣ Resource Requests (User → Admin)

### 👤 Request More Resources

```
POST /resource-requests
```

**Request**

```json
{
  "requested_cpu": 4,
  "requested_memory_gb": 8,
  "assignment_mode": "GLOBAL",
  "reason": "Model training"
}
```

---

### 🔐 List Pending Requests

```
GET /admin/resource-requests
```

---

### 🔐 Approve / Reject Request

```
POST /admin/resource-requests/{request_id}/approve
POST /admin/resource-requests/{request_id}/reject
```

---

## 9️⃣ Idle Resource Reclamation (System) ⚙️

### ⚙️ Run Idle Reclamation Job

```
POST /internal/reclaim-idle-users
```

Executed by:

* Cron
* Scheduler
* Background worker

---

## 🔟 Audit & Monitoring 🔐

### 🔐 View Audit Logs

```
GET /admin/audit-logs
```

---

## 🔁 ENDPOINT ↔ ER TABLE MAPPING

| Endpoint                 | Table(s)                |
| ------------------------ | ----------------------- |
| /admin/users             | users                   |
| /admin/nodes             | nodes                   |
| /admin/users/quota       | users, user_node_quotas |
| /jobs                    | jobs                    |
| /jobs/{id}               | jobs, job_node_runs     |
| /resource-requests       | resource_requests       |
| /admin/resource-requests | resource_requests       |
| /admin/audit-logs        | audit_logs              |

---

## 🧠 Design Guarantees

✔ Matches ER diagram 1:1
✔ Enforces all SRS rules
✔ Clear role separation
✔ Scalable & secure
✔ Ready for FastAPI routers

---
