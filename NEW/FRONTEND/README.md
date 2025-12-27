## 🎨 3. Frontend — What You Can Build Now

### 🔑 Authentication (Shared)

* Login page
* JWT storage (memory / http-only cookie)
* Role-based routing

---

### 👑 Super Admin UI (Mapped 1:1 to Backend)

**Pages**

1. **Dashboard**

   * Global CPU/RAM
   * Free vs allocated

2. **Nodes**

   * Node list
   * Health badge (UP / DEGRADED / DOWN)
   * Free resources

3. **Users**

   * Create / edit user
   * Toggle GLOBAL vs NODE
   * Node-wise quota assignment UI

4. **Jobs**

   * All jobs
   * Status, retries, failures

5. **Resource Requests**

   * Approve / reject
   * Select assignment mode

6. **Audit Logs**

   * Filters by user / node / job

---

### 👤 User UI (Strictly Abstracted)

**Pages**

1. **Dashboard**

   * Resource health: Healthy / In Use / Revoked

2. **Jobs**

   * Submit job form
   * Job list with status
   * Cancel queued job

3. **Job Details**

   * Status timeline
   * Retry count
   * Failure reason (abstracted)

4. **Resource Request**

   * Request more CPU / RAM

🚫 No nodes
🚫 No cluster numbers
🚫 No scheduler details

---

## 🧱 4. Recommended Frontend Stack (Opinionated but Safe)

Since your backend is **FastAPI + JWT**:

### Option A (Recommended)

* **React + TypeScript**
* **Vite**
* **Tailwind CSS**
* **Axios**
* **Zustand / Redux**
* **Role-based route guards**

### Option B

* Next.js (App Router)
* Same API contracts

---

## 🧭 5. Suggested Frontend Development Order

1. Auth + layout
2. User dashboard & jobs
3. Admin dashboard
4. User management UI
5. Node & resource views
6. Polish + UX states (loading, empty, errors)

---

