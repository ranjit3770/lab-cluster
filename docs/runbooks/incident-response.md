# Runbook: Incident Response

## Scope
Use when there is evidence of unauthorized access, credential leakage, or
abuse of compute resources through the portal or cluster.

## Immediate actions (first 15 minutes)

1. **Contain access**
   - Enable maintenance mode (blocks non-admin traffic):
     `PUT /api/v1/settings/maintenance_mode?value=true` as admin.
   - Suspend suspicious accounts:
     `PUT /api/v1/users/<id>` with `is_active=false`.

2. **Preserve evidence before restarting anything**
   ```bash
   docker logs portal_backend  > /tmp/incident_backend_$(date +%F_%H%M).log
   docker logs portal_job_api  > /tmp/incident_jobapi_$(date +%F_%H%M).log
   docker exec portal_database mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" -e \
       "SELECT * FROM strach_portal.audit_logs ORDER BY id DESC LIMIT 500;" > /tmp/incident_audit.txt
   ```

3. **Rotate credentials if compromise is confirmed**
   - `SECRET_KEY` (invalidates every JWT immediately), then restart backend.
   - `MYSQL_ROOT_PASSWORD`, `JOB_API_DB_PASSWORD` in `.env`; update MariaDB
     accounts accordingly.
   - Affected user passwords via admin UI.

## Investigation checklist

- [ ] Which accounts/tokens were involved? (`audit_logs`, login failures)
- [ ] Source IPs — unexpected subnets? (`client_ip` column)
- [ ] What jobs ran under the affected accounts?
      `sacct -u <user> --starttime=<window>`
- [ ] Files created/modified under `/data_storage/<user>/`?
- [ ] Any new admin-role accounts created? (`audit_logs action='user.create'`)

## Recovery
1. Fix the exploited path (patch, rotate, reconfigure).
2. Disable maintenance mode.
3. Announce resolution + timeline to users.

## Post-incident review (within 48h)
Document: what happened, detection latency, blast radius, remediation, and one
hardening action that makes recurrence impossible rather than unlikely.
File the review alongside this runbook.
