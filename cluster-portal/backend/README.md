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
