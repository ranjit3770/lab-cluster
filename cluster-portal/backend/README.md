# Backend Registry // Strach Portal Gateway

FastAPI-powered core registry for identity, resource quotas, and platform governance. Integrates with Slurm REST API v0.0.44 via Unix Sockets.

## 🏗️ Technical Architecture
- **Framework**: FastAPI + Pydantic v2
- **Persistence**: SQLAlchemy ORM with MariaDB/MySQL
- **Identity**: JWT with OAuth2 Scopes (Admin, Developer, User)
- **Slurm Integration**: Direct communication via `requests_unixsocket` to `slurmrestd`.

## 📂 Project Structure
- `app/api`: Synchronized administrative and researcher endpoints.
- `app/core`: Configuration (Slurm v0.0.44 standard) and security.
- `app/models`: Persistent database schemas for users, nodes, and settings.
- `app/schemas`: Pydantic data validation layer.
- `seed_cluster.py`: Clean cluster initialization (Purges dummy data).
- `initial_data.py`: Administrative user and system settings provisioning.

## 🧭 Portal Inventory Contract

The portal backend owns the registered access-node inventory exposed through `/api/v1/developer/nodes`.

- `GET /api/v1/developer/nodes`: Returns the admin-managed node list used by Slurm Nodes and Node Management.
- `POST /api/v1/developer/nodes`: Adds one access target.
- `POST /api/v1/developer/nodes/bulk`: Adds many access targets in one operation.
- `PUT /api/v1/developer/nodes/{id}` and `DELETE /api/v1/developer/nodes/{id}`: Maintain existing entries.

Each node supports `os_family`: `auto`, `ubuntu`, or `windows`. The startup initializer applies a lightweight migration for existing databases so older `dev_nodes` tables receive the `os_family` column without dropping data.

`GET /api/v1/developer/nodes` also returns live runtime detection fields for the Node Management page. The backend probes Windows RDP/WinRM/SMB/RPC ports (`3389`, `5985`, `5986`, `445`, `135`) and SSH concurrently so dual-boot nodes can move between Ubuntu and Windows columns after refresh.

This inventory is separate from Ansible host setup and from Slurm scheduler discovery. It should contain only the nodes that administrators want visible for portal access, diagnostics, and grouped Node Management views.

## 🚀 Deployment & Initialization
The backend automatically initializes the database on startup via `initial_data.py`.

### Environment Variables (Persistent Context)
- `MYSQL_SERVER`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DB`: Database credentials.
- `SLURM_REST_URL`: Unix socket path (e.g., `http+unix://%2Frun%2Fslurmrestd%2Fslurmrestd.socket/slurm/v0.0.44`).
- `DATA_STORAGE`: Root directory for researcher file synchronization.
- `MAINTENANCE_MODE`: Boolean flag for global system gating.

### Data Persistence 🛑
The backend uses MariaDB volumes in Docker.
- **NEVER** use `Overwrite=True` on existing databases in `initial_data.py`.
- The `seed_cluster.py` script is intended for **CLEAN INITIALIZATION** only.

## 🔗 Integrated Job-API
The backend communicates with a specialized `job-api` (Port 9000) for high-fidelity Python workload submission and Jupyter Hub orchestration.
