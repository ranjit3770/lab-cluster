Below is a **production-grade FastAPI project structure** that **maps 1:1 to your FINAL SRS + API map**.
This is **how an enterprise backend would actually be laid out** — scalable, testable, and Ray-safe.

![Image](https://miro.medium.com/0%2AyGZ5EF4hsMe2JSOu)

![Image](https://admin.wac.co/uploads/Microservice_Architecture_f548e0b471.png)

![Image](https://miro.medium.com/1%2AEQba0DDDihKAgguILPaOoA.png)

---

# 🧱 FastAPI Project Structure

**Multi-User Compute Resource & Job Execution Platform (Ray)**

---

## 📁 Root Layout

```text
ray-compute-platform/
│
├── app/
│   ├── main.py
│   ├── core/
│   ├── api/
│   ├── models/
│   ├── schemas/
│   ├── services/
│   ├── scheduler/
│   ├── workers/
│   ├── ray_executor/
│   ├── utils/
│   └── db/
│
├── alembic/
├── scripts/
├── tests/
├── .env
├── requirements.txt
└── README.md
```

---

## 🚀 Entry Point

### `app/main.py`

```python
from fastapi import FastAPI
from app.api import router as api_router
from app.core.startup import init_system

app = FastAPI(title="Ray Compute Platform")

app.include_router(api_router)

@app.on_event("startup")
async def startup():
    await init_system()
```

---

## ⚙️ Core System (Policies & Security)

```text
app/core/
├── config.py           # env, settings
├── security.py         # JWT, role checks
├── dependencies.py     # auth guards
├── startup.py          # ray, schedulers, workers
└── constants.py        # enums, states
```

**Why:**
Central authority for **roles, enforcement, and invariants**.

---

## 🌐 API Layer (Matches Endpoint Map Exactly)

```text
app/api/
├── router.py
├── auth.py
├── users.py
├── jobs.py
├── admin/
│   ├── users.py
│   ├── cluster.py
│   ├── nodes.py
│   ├── jobs.py
│   ├── audit_logs.py
│   └── resource_requests.py
├── internal/
│   ├── scheduler.py
│   ├── retry.py
│   ├── heartbeat.py
│   └── idle.py
└── system.py
```

### Router Composition

```python
# app/api/router.py
from fastapi import APIRouter
from app.api import auth, jobs, users, system
from app.api.admin import users as admin_users

router = APIRouter()

router.include_router(auth.router, prefix="/auth")
router.include_router(jobs.router, prefix="/jobs")
router.include_router(users.router)
router.include_router(admin_users.router, prefix="/admin")
router.include_router(system.router)
```

✔ Users can’t accidentally touch admin routes
✔ Internal endpoints isolated

---

## 🗃️ Database Layer (MySQL)

```text
app/db/
├── session.py      # mysql connector / pool
├── base.py         # declarative base
└── init_db.py
```

---

## 🧬 Models (ORM – Mirrors SRS)

```text
app/models/
├── user.py
├── node.py
├── job.py
├── quota.py
├── resource_request.py
├── audit_log.py
└── enums.py
```

**Example**

```python
class User(Base):
    id
    assignment_mode
    max_cpu
    max_memory
    retry_limit
    resource_state
```

---

## 📦 Schemas (Pydantic – API Contracts)

```text
app/schemas/
├── auth.py
├── user.py
├── job.py
├── node.py
├── quota.py
├── audit.py
└── resource_request.py
```

✔ API validation
✔ Clean separation from DB models

---

## 🧠 Services (Business Logic Layer)

```text
app/services/
├── user_service.py
├── quota_service.py
├── job_service.py
├── node_service.py
├── audit_service.py
├── resource_request_service.py
└── health_service.py
```

**Rule:**

> API layer = thin
> Service layer = enforcement + decisions

---

## 🧮 Scheduler (STEP-6 Core Brain)

```text
app/scheduler/
├── scheduler.py         # main scheduling logic
├── queue.py             # FIFO queues
├── placement.py         # GLOBAL vs NODE
├── validator.py         # quota & health checks
└── retry_policy.py
```

This enforces:

* Single job per user
* Node filtering
* Retry rules
* Capacity checks

---

## 🔁 Background Workers (STEP-5 & STEP-7)

```text
app/workers/
├── retry_worker.py      # infra retry engine
├── idle_worker.py       # idle quota sweeper
├── heartbeat_watcher.py # node health transitions
└── metrics_worker.py
```

Run via:

* FastAPI background tasks
* systemd
* Celery / APScheduler (optional)

---

## ⚡ Ray Execution Binding

```text
app/ray_executor/
├── client.py        # ray.init, ray.shutdown
├── tasks.py         # @ray.remote jobs
├── node_binding.py  # custom node resources
└── runtime.py
```

**NODE mode example**

```python
@ray.remote(
    num_cpus=cpu,
    memory=memory,
    resources={"node:node-3": 1}
)
def run_job():
    ...
```

✔ Backend fully controls Ray
✔ Users never touch Ray

---

## 🛠️ Utilities

```text
app/utils/
├── time.py
├── exceptions.py
├── logging.py
└── helpers.py
```

---

## 🧪 Tests (Strongly Recommended)

```text
tests/
├── test_scheduler.py
├── test_quota_enforcement.py
├── test_retry_logic.py
├── test_node_health.py
└── test_api_permissions.py
```

---

## 🧠 Why This Structure Is Correct

✔ Enforces SRS **by design**, not by convention
✔ Prevents role leaks
✔ Supports node-wise scaling
✔ Ray is isolated and replaceable
✔ Easy to audit & test

This is **not a toy FastAPI app** — this is **production-grade backend architecture**.

---

## 🔜 What Next?

Reply with:

* **DB** → Full MySQL schema (tables + constraints)
* **CODE-1** → `User + Quota` implementation
* **CODE-2** → Scheduler logic (GLOBAL vs NODE)
* **CODE-3** → Ray executor + retry wiring

You now have a **complete blueprint** to build this system cleanly.
