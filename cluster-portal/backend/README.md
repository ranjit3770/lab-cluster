# Backend Guide — Strach Portal Registry

FastAPI service that owns identity, resource quotas, platform settings, and
the portal's registered access-node inventory. It talks to `slurmrestd`
(Slurm REST API v0.0.44) over a Unix socket and delegates job submission to
the Job-API.

## Architecture

| Aspect | Choice |
| --- | --- |
| Framework | FastAPI + Pydantic v2 |
| Persistence | SQLAlchemy ORM with MariaDB/MySQL |
| Identity | JWT with OAuth2 scopes (Admin, Developer, User) |
| Slurm integration | `requests_unixsocket` against `slurmrestd` |

## Project Structure

| Path | Purpose |
| --- | --- |
| `app/api` | Administrative and researcher endpoints. |
| `app/core` | Configuration (Slurm v0.0.44 standard) and security. |
| `app/models` | Database models for users, nodes, and settings. |
| `app/schemas` | Pydantic validation layer. |
| `seed_cluster.py` | Clean cluster initialization (purges dummy data). |
| `initial_data.py` | Administrative user and system settings provisioning. |

## Registered Node Inventory Contract

The portal backend owns the registered access-node inventory exposed under
`/api/v1/developer/nodes`. This inventory is separate from Ansible host setup
and from Slurm scheduler discovery: it contains only the nodes administrators
want visible for portal access, diagnostics, and grouped Node Management views.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/developer/nodes` | Admin-managed node list used by Slurm Nodes and Node Management. |
| `POST /api/v1/developer/nodes` | Add one access target. |
| `POST /api/v1/developer/nodes/bulk` | Add many access targets in one operation. |
| `PUT /api/v1/developer/nodes/{id}` | Update an entry. |
| `DELETE /api/v1/developer/nodes/{id}` | Remove an entry. |

Each node carries an `os_family` of `auto`, `ubuntu`, or `windows`. The
startup initializer applies a lightweight migration so existing `dev_nodes`
tables gain the `os_family` column without data loss.

`GET /api/v1/developer/nodes` also returns live runtime detection fields for
the Node Management page: Windows RDP/WinRM/SMB/RPC ports (`3389`, `5985`,
`5986`, `445`, `135`) and SSH are probed concurrently, so dual-boot nodes move
between Ubuntu and Windows columns on refresh.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `MYSQL_SERVER`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DB` | Database credentials. |
| `SLURM_REST_URL` | Unix socket URL, e.g. `http+unix://%2Frun%2Fslurmrestd%2Fslurmrestd.socket/slurm/v0.0.44`. |
| `DATA_STORAGE` | Root directory for researcher file synchronization. |
| `MAINTENANCE_MODE` | Boolean flag gating the whole system. |

## Deployment And Initialization

The backend initializes the database on startup via `initial_data.py`.

Data persistence rules:

- **Never** set `Overwrite=True` on existing databases in `initial_data.py`.
- `seed_cluster.py` is for **clean initialization only** — it purges data.

Docker volumes hold the MariaDB data; see the
[portal README](../README.md#running-the-portal) for volume-safe restart and
recreate procedures.

## Job-API Integration

Job submission and Jupyter orchestration are delegated to a dedicated Job-API
service on port 9000. See the [Job-API guide](job-api/README.md).
