# Security Model

## Authentication

- OAuth2 password flow; JWT access tokens (default 30 min) + refresh tokens (7 days).
- `SECRET_KEY` is required from the environment. In production (`ENVIRONMENT=production`)
  startup fails without it; in development an ephemeral key is generated with a warning
  (all sessions invalidate on restart).
- Login throttling: after `LOGIN_MAX_ATTEMPTS` (default 5) failures for a
  username+IP pair, further attempts are rejected with HTTP 429 for
  `LOGIN_LOCKOUT_SECONDS` (default 300). Counters reset on successful login.

## Authorization (RBAC)

Authorization is enforced **server-side** by FastAPI dependencies in
`app/api/deps.py`. The React UI hiding a button is never a control.

| Dependency | Allows |
| --- | --- |
| `get_current_active_user` | Any authenticated, active account |
| `get_current_active_superuser` / `require_roles("admin","developer")` | Admin + developer |
| `require_roles("developer")` | Developer only |

Additional invariants:

- Only developer accounts may create/delete accounts holding `admin` or `developer`
  roles (privilege escalation guard).
- Regular users can only read/modify their own jobs; admins and developers can read all.
- Administrative accounts cannot be deleted through the API.

## Secrets management

Secrets are provided exclusively via environment or `cluster-portal/.env`
(see `.env.example`). There are **no hardcoded credential fallbacks** anywhere in
the stack:

- `MYSQL_ROOT_PASSWORD` — MariaDB root (compose requires it).
- `JOB_API_DB_PASSWORD` — dedicated Job-API DB account (provisioned at backend boot).
- `SECRET_KEY` — JWT signing key.
- `ADMIN_INITIAL_PASSWORD` / `DEVELOPER_INITIAL_PASSWORD` — seeded-account passwords;
  if unset in development, one-time random passwords are generated and logged once.

If a secret leaks: rotate it in `.env`, restart the affected services, and revoke
active sessions by rotating `SECRET_KEY` (invalidates every issued token).

## Audit logging

Privileged and security-relevant actions are written to the `audit_logs` table
and emitted as JSON on stdout:

- login success/failure attempts
- user create/update/delete (with actor, target, fields changed)
- platform setting changes
- maintenance IP whitelist changes

Inspect recent events:

```sql
SELECT timestamp, username, action, resource, status, client_ip
FROM strach_portal.audit_logs ORDER BY id DESC LIMIT 50;
```

## Network exposure

- Backend and Job-API containers use **host networking** and bind to well-known
  ports (8000/9000); restrict reachability with firewall rules where possible.
- CORS origins are configured via `BACKEND_CORS_ORIGINS`; leave empty to disable
  browser cross-origin access entirely (frontend served separately).
- Security headers (`X-Frame-Options`, `nosniff`, HSTS, referrer-policy) are set
  on every response by middleware.

## Reporting issues

See `docs/runbooks/` for operational procedures. For suspected compromise,
follow `runbooks/incident-response.md`.
