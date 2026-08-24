# Runbook: Database Failure (portal MariaDB)

Covers the `portal_database` container (identity DB `strach_portal` +
job registry `slurm_jobs`). For the Slurm accounting DB (slurmdbd), see
`cluster-portal/backend/job-api/QUOTA-AND-JOB-LIFECYCLE.md`.

## Symptoms
- Login fails with 500s; Dashboard empty.
- `GET :8000/ready` returns 503 with `checks.database: error: ...`.
- Backend logs: `CRITICAL: ALL ATTEMPTS TO INITIALIZE DB FAILED`.

## Diagnosis

```bash
docker ps | grep portal_database            # is it up?
docker logs portal_database --tail 100      # crash loop? corrupt InnoDB?
df -h                                       # disk full is the #1 cause
curl -fs http://localhost:8000/ready        # confirm dependency view
```

## Recovery paths

### A. Container stopped but data intact

```bash
cd cluster-portal
docker compose up -d database
# backend reconnects automatically (pool_pre_ping)
```

### B. Disk full

```bash
# free space, then restart:
docker compose restart database backend job-api
```
Also prune old docker artifacts if needed (`docker system df`).

### C. Data corruption / unrecoverable → restore from backup

Follow **Restore procedure** in `docs/disaster-recovery.md`:

```bash
docker compose stop backend job-api
MYSQL_ROOT_PASSWORD=$(grep MYSQL_ROOT_PASSWORD .env | cut -d= -f2) \
    ./scripts/restore_database.sh /var/backups/portal/daily/<latest>.sql.gz
docker compose start backend job-api
```

Jobs submitted since the last backup are gone from the registry; running Slurm
work continues but their rows must be reconciled manually:

```sql
-- compare live queue vs registry
SELECT id, job_name, slurm_job_id, status FROM strach_portal.jobs
WHERE status IN ('PENDING','RUNNING','WAITING');
```

## Verification

```bash
curl -f http://localhost:8000/ready         # {"status":"ready", ...}
# UI login works; recent jobs visible on /jobs
```

## Prevention
- Keep daily+weekly backups running (cron entries in `docs/disaster-recovery.md`)
  and perform the quarterly restore drill.
- Alert on `disk_used_pct` of the Docker volume host.
