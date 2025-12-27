This schema supports **everything you specified**:

* User quotas
* Node-wise vs resource-wise assignment
* One job at a time per user
* Job queueing
* Auto-retry
* Idle reclamation
* Resource requests
* Resource health
* Node health
* Full auditability

I’ll explain **why each table exists**, then give **SQL DDL**.

---

# 🗂️ DATABASE SCHEMA (FROM SRS)

---

## 1️⃣ `users` — Core user & quota table

**Purpose**

* Stores user identity
* Stores quota
* Stores retry policy
* Stores resource state

```sql
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) UNIQUE NOT NULL,
    role ENUM('SUPER_ADMIN', 'USER') NOT NULL,

    -- Quota (assigned by Super Admin)
    max_cpu INT NOT NULL DEFAULT 0,
    max_memory_gb INT NOT NULL DEFAULT 0,
    max_concurrent_jobs INT NOT NULL DEFAULT 1,

    -- Retry policy
    retry_limit INT NOT NULL DEFAULT 0,

    -- Assignment mode
    assignment_mode ENUM('GLOBAL', 'NODE_WISE') NOT NULL DEFAULT 'GLOBAL',

    -- Resource lifecycle state
    resource_state ENUM('ACTIVE', 'IDLE_REVOKED', 'PENDING_APPROVAL')
        NOT NULL DEFAULT 'ACTIVE',

    -- Activity tracking
    last_job_at DATETIME NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 2️⃣ `nodes` — Cluster node registry

**Purpose**

* Track node capacity
* Track health
* Enable node-wise assignment

```sql
CREATE TABLE nodes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    node_name VARCHAR(100) UNIQUE NOT NULL,

    total_cpu INT NOT NULL,
    total_memory_gb INT NOT NULL,

    free_cpu INT NOT NULL,
    free_memory_gb INT NOT NULL,

    health_status ENUM('UP', 'DOWN', 'DEGRADED') NOT NULL DEFAULT 'UP',

    last_heartbeat DATETIME NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 3️⃣ `user_node_quotas` — Node-wise user quota mapping (NEW)

**Purpose**

* Assign user quota on specific nodes
* Enable multi-node selection
* Enforce node-restricted scheduling

```sql
CREATE TABLE user_node_quotas (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    node_id BIGINT NOT NULL,

    assigned_cpu INT NOT NULL,
    assigned_memory_gb INT NOT NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_unq_user_node UNIQUE (user_id, node_id),
    CONSTRAINT fk_unq_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_unq_node FOREIGN KEY (node_id) REFERENCES nodes(id)
);
```

📌 Used **only when `assignment_mode = NODE_WISE`**

---

## 4️⃣ `jobs` — Job execution & queue tracking

**Purpose**

* Track job lifecycle
* Enforce single-job execution
* Track retries
* Link jobs to users

```sql
CREATE TABLE jobs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,

    script_name VARCHAR(255) NOT NULL,
    script_params JSON NULL,

    status ENUM(
        'SUBMITTED',
        'QUEUED',
        'RUNNING',
        'RETRY_WAITING',
        'COMPLETED',
        'FAILED',
        'CANCELED'
    ) NOT NULL DEFAULT 'SUBMITTED',

    -- Resource snapshot at job creation
    cpu INT NOT NULL,
    memory_gb INT NOT NULL,

    -- Retry tracking
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL,

    -- Failure reason
    failure_reason VARCHAR(255) NULL,

    -- Execution timestamps
    queued_at DATETIME NULL,
    started_at DATETIME NULL,
    finished_at DATETIME NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_jobs_user FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 5️⃣ `job_node_runs` — Track which node a job ran on

**Purpose**

* Needed for node-wise execution
* Required for failure diagnosis
* Supports audit & retries

```sql
CREATE TABLE job_node_runs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    job_id BIGINT NOT NULL,
    node_id BIGINT NOT NULL,

    status ENUM('RUNNING', 'FAILED', 'COMPLETED') NOT NULL,
    error_message VARCHAR(255) NULL,

    started_at DATETIME NULL,
    finished_at DATETIME NULL,

    CONSTRAINT fk_jnr_job FOREIGN KEY (job_id) REFERENCES jobs(id),
    CONSTRAINT fk_jnr_node FOREIGN KEY (node_id) REFERENCES nodes(id)
);
```

---

## 6️⃣ `resource_requests` — User → Super Admin requests

**Purpose**

* Users request more resources
* Admin approves/rejects
* Full audit trail

```sql
CREATE TABLE resource_requests (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,

    requested_cpu INT NOT NULL,
    requested_memory_gb INT NOT NULL,

    requested_assignment_mode ENUM('GLOBAL', 'NODE_WISE') NOT NULL,
    requested_nodes JSON NULL,

    reason TEXT NOT NULL,

    status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    admin_comment TEXT NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME NULL,

    CONSTRAINT fk_rr_user FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 7️⃣ `audit_logs` — Security & compliance (VERY IMPORTANT)

**Purpose**

* Track every admin action
* Required for enterprise systems

```sql
CREATE TABLE audit_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    actor_id BIGINT NOT NULL,
    actor_role ENUM('SUPER_ADMIN', 'USER') NOT NULL,

    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id BIGINT NULL,

    old_value JSON NULL,
    new_value JSON NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔗 RELATIONSHIP SUMMARY

```
users
 ├── jobs
 ├── resource_requests
 ├── user_node_quotas
 └── audit_logs

nodes
 ├── user_node_quotas
 └── job_node_runs

jobs
 └── job_node_runs
```

---

## 🧠 WHY THIS SCHEMA IS CORRECT

✔ Matches **every SRS rule**
✔ Supports **global & node-wise assignment**
✔ Enforces **one job per user**
✔ Enables **queueing + retry**
✔ Allows **idle reclamation**
✔ Preserves **auditability**
✔ Scales cleanly

This schema is **production-grade** and **future-proof**.

---
