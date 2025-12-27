# 🗄️ MySQL Database Schema

**Multi-User Compute Resource & Job Execution Platform**

> Engine: **InnoDB**
> Charset: **utf8mb4**
> All timestamps are **UTC**

---

## 1️⃣ users

```sql
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('USER', 'SUPER_ADMIN') NOT NULL DEFAULT 'USER',

    assignment_mode ENUM('GLOBAL', 'NODE') NOT NULL,
    max_cpu INT NOT NULL,
    max_memory_mb INT NOT NULL,
    retry_limit INT NOT NULL DEFAULT 0,

    resource_state ENUM(
        'HEALTHY',
        'IN_USE',
        'TEMPORARILY_UNAVAILABLE',
        'IDLE_REVOKED'
    ) NOT NULL DEFAULT 'HEALTHY',

    last_job_at DATETIME NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

🔒 **Enforced**

* No per-job resources
* Assignment mode fixed per user
* Retry policy embedded

---

## 2️⃣ nodes

```sql
CREATE TABLE nodes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    node_uid VARCHAR(100) UNIQUE NOT NULL,

    total_cpu INT NOT NULL,
    total_memory_mb INT NOT NULL,

    free_cpu INT NOT NULL,
    free_memory_mb INT NOT NULL,

    health_status ENUM(
        'UP',
        'DEGRADED',
        'DOWN',
        'MAINTENANCE'
    ) NOT NULL DEFAULT 'UP',

    last_heartbeat_at DATETIME NOT NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

🫀 **Heartbeat-driven authority**

---

## 3️⃣ user_node_quotas (NODE-wise binding)

```sql
CREATE TABLE user_node_quotas (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    node_id BIGINT NOT NULL,

    assigned_cpu INT NOT NULL,
    assigned_memory_mb INT NOT NULL,

    CONSTRAINT fk_unq_user_node UNIQUE (user_id, node_id),
    CONSTRAINT fk_unq_user_node_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_unq_user_node_node
        FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
```

🚫 Exists **ONLY if assignment_mode = NODE**

---

## 4️⃣ jobs

```sql
CREATE TABLE jobs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,

    status ENUM(
        'SUBMITTED',
        'QUEUED',
        'RUNNING',
        'COMPLETED',
        'FAILED',
        'RETRY_WAITING',
        'CANCELLED'
    ) NOT NULL DEFAULT 'SUBMITTED',

    failure_type ENUM('INFRA', 'USER') NULL,
    retry_count INT NOT NULL DEFAULT 0,

    assigned_node_id BIGINT NULL,
    ray_task_id VARCHAR(255) NULL,

    command TEXT NOT NULL,
    arguments JSON NULL,

    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME NULL,
    finished_at DATETIME NULL,

    CONSTRAINT fk_jobs_user
        FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_jobs_node
        FOREIGN KEY (assigned_node_id) REFERENCES nodes(id)
);
```

🧠 **Scheduler guarantees**

```
UNIQUE (user_id WHERE status = RUNNING)
```

(enforced at service layer)

---

## 5️⃣ resource_requests

```sql
CREATE TABLE resource_requests (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,

    requested_cpu INT NOT NULL,
    requested_memory_mb INT NOT NULL,

    status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',

    approved_mode ENUM('GLOBAL', 'NODE') NULL,
    approved_by BIGINT NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,

    CONSTRAINT fk_rr_user
        FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_rr_admin
        FOREIGN KEY (approved_by) REFERENCES users(id)
);
```

---

## 6️⃣ audit_logs (Immutable)

```sql
CREATE TABLE audit_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    actor_type ENUM('USER', 'SUPER_ADMIN', 'SYSTEM') NOT NULL,
    actor_id BIGINT NULL,

    action_type VARCHAR(100) NOT NULL,
    target_type ENUM('USER', 'JOB', 'NODE', 'SYSTEM') NOT NULL,
    target_id BIGINT NULL,

    previous_state JSON NULL,
    new_state JSON NULL,

    reason TEXT NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

🧾 **Append-only by policy**

---

## 7️⃣ scheduler_queue (FIFO)

```sql
CREATE TABLE scheduler_queue (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    job_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    priority INT NOT NULL DEFAULT 0,

    enqueued_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sq_job
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    CONSTRAINT fk_sq_user
        FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 8️⃣ system_settings

```sql
CREATE TABLE system_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value VARCHAR(255) NOT NULL
);
```

Examples:

```
IDLE_DAYS = 30
HEARTBEAT_TIMEOUT = 30
```

---

## 🔒 CRITICAL DATABASE GUARANTEES

### ✅ Enforced via schema + services

* Users cannot over-allocate nodes
* Node health gates scheduling
* Retry count bounded
* Audit history immutable
* NODE mode strictly bound

---

## 📊 Logical Relationships Summary

```
users
 ├── jobs
 ├── resource_requests
 ├── user_node_quotas ── nodes
 │
 └── audit_logs

nodes
 ├── jobs
 └── user_node_quotas
```

---

## ✅ SRS COVERAGE CHECK

| Feature          | Covered |
| ---------------- | ------- |
| Node-wise quotas | ✅       |
| Retry policy     | ✅       |
| Idle revocation  | ✅       |
| Scheduler FIFO   | ✅       |
| Heartbeat health | ✅       |
| Audit trail      | ✅       |
| Admin control    | ✅       |

**No missing tables. No redundant tables.**

---
