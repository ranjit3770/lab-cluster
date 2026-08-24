# Implementation Log — Production Hardening (Phases 1–6)

Companion to `requirement.md`. Status of each roadmap item after implementation.

## Phase 1 — Security (+0.35 target) ✅

| Item | Change |
| --- | --- |
| Secrets removed | All hardcoded credentials deleted (`Amma@123`, `slurmJob_Sub`, JWT key, SMTP app-password, seed passwords). Compose now requires `MYSQL_ROOT_PASSWORD` / `JOB_API_DB_PASSWORD` (`:?` syntax). See `cluster-portal/.env.example`. |
| SECRET_KEY policy | Required via env; production (`ENVIRONMENT=production`) fails fast without it; dev gets ephemeral key + warning. |
| Server-side RBAC | `deps.require_roles()` factory + fixed 403 semantics; `POST /users/` now requires privileged role (was **unauthenticated**); only developers may create/delete admin/developer accounts; job ownership checks verified server-side. |
| Login throttling | Per username+IP sliding lockout (5 attempts → 429 for 5 min, configurable), reset on success. |
| Audit logging | New `audit_logs` table + `app/core/audit.py`; wired into login failures, user lifecycle, setting changes, maintenance-IP whitelist; JSON emitted to stdout for aggregation. |
| CORS | No longer wildcard-with-credentials by default; configured via `BACKEND_CORS_ORIGINS`. |

## Phase 2 — Testing & reliability ✅

- **17 API integration tests** (`backend/tests/test_api_integration.py`): real HTTP via TestClient on SQLite; auth flows, refresh-token misuse, RBAC matrix, privilege-escalation guard, job ownership, observability endpoints.
- `app.main` boot provisioning now skippable (`PORTAL_SKIP_STARTUP_PROVISIONING=1`) so imports are side-effect free under test.
- **16 planner failure-scenario tests** (`job-api/tests/test_planner_failures.py`): invalid CPU/memory, Slurm unreachable, dead/excluded/allowlisted-away nodes, capacity overflow, queue-vs-fail semantics, directive sanity.
- Found & fixed real bug: planner could pack tasks onto unhealthy nodes if a snapshot source leaked them (defense-in-depth filter added).
- Found & fixed real bug: `POST /jobs` without `script_path` returned 500 → now 422.
- CI backend job updated to install the minimal FastAPI/JWT deps for integration tests.

## Phase 3 — Observability ✅

- `observability.py` (stdlib-only, mirrored in both services): JSON log formatter (`LOG_FORMAT=json`), Prometheus text registry with request counters + latency histograms.
- Endpoints: `/health` (liveness), `/ready` (dependency check: DB), `/metrics` (gated by `METRICS_ENABLED=1`, enabled by default in compose).
- Audit events share the structured-JSON stdout channel.

## Phase 4 — Production deployment & DR ✅

- `cluster-portal/scripts/backup_database.sh` — daily/weekly dumps of both DBs, gzip-verified, retention-pruned (7d/28d).
- `cluster-portal/scripts/restore_database.sh` — integrity-checked restore with writer-safety guard.
- `docs/disaster-recovery.md` — backup policy, tested-restore drill procedure, Detection→Diagnosis→Recovery→Verification for 8 failure scenarios.

## Phase 5 — Maintainability ✅

- `job-api/app/slurm.py` (776 L monolith) → package split by responsibility:
  `env.py` (CLI env + JWT), `parsers.py` (output parsing), `quota.py`
  (limits + live usage), `jupyter.py` (session helpers),
  `submit.py` (script generation + dispatch). Facade `__init__.py`
  keeps every existing import working; all 41 tests pass unchanged.
- `planner.py`: kept as pipeline module (already single-purpose); hardened as above.

## Phase 6 — Governance & docs ✅

- `docs/architecture.md`, `docs/security.md`, `docs/disaster-recovery.md`.
- Runbooks: `node-down`, `slurm-down`, `controller-failure`, `database-failure`,
  `munge-failure`, `incident-response`.
- README documentation index updated with the Operations & Governance section.

## Verification (CI-equivalent, run locally)

| CI job | Result |
| --- | --- |
| Repo checks (`pytest tests`) | **83 passed** |
| Ansible syntax-check (4 entrypoints) | **all pass** |
| Job-API planner tests | **41 passed** |
| Backend tests | **30 passed** (13 schema + 17 integration) |
| Frontend build (`tsc && vite build`) | **pass** |
| Frontend lint | ⚠️ 109 pre-existing errors (branch-wide, untouched by this work) |

## Known follow-ups

- Frontend lint debt (pre-existing): ~109 errors across 37 files, mostly
  `no-explicit-any` and unused catch bindings.
- In-memory login throttle resets per process restart; move to shared store
  (Redis/DB) when running multiple replicas.
- Backup off-host copy + encryption-at-rest should be finalized per site policy.

---

# Round 2 — Production polish (from `log-to-plan.md` review)

The post-Round-1 review rated the project **9.7–9.8/10** and listed the final
gaps. All four "production polish" items are now implemented.

## R2-1 — Shared login throttling ✅

Throttle state moved from an in-process dict to a new `login_attempts` DB table
(`app/models/login_attempt.py` + `app/core/login_throttle.py`), so lockout is
consistent across every Gunicorn worker *and* survives restarts. No new
infrastructure (Redis) was added — the existing shared MariaDB already meets
the requirement.

- Lockout enforced before credential verification; correct passwords cannot
  bypass an active lockout (regression-tested).
- Fail-open semantics: if the throttle store is unavailable, logins proceed
  rather than locking the whole cluster out of itself.
- Stale rows purged (`purge_expired`).

## R2-2 — Encrypted off-site backups + RPO/RTO ✅

- `backup_database.sh`: optional GPG symmetric AES256 encryption (plaintext is
  deleted after encryption; decryptability proven before trusting the archive)
  and optional rsync-based off-site push (`BACKUP_REMOTE_TARGET`; transfer
  failure exits non-zero but preserves the local archive for retry).
- `restore_database.sh`: transparent `.gpg` support (decrypts on the fly,
  verifies decryptability before stopping writers); root password now passed
  inside the container instead of the host process list.
- `docs/disaster-recovery.md`: objectives table with explicit **RPO ≤ 24 h /
  RTO ≤ 30 min**, retention, encryption, off-site requirements, drill cadence;
  drill instructions cover encrypted archives and timing as RTO evidence.
- New knobs documented in `cluster-portal/.env.example`.

## R2-3 — Frontend lint debt → 0 errors ✅

**109 errors → 0 errors** (17 pre-existing warnings remain; none are errors,
so `npm run lint`, `tsc -b`, and `vite build` all pass). Fixed properly, not
suppressed:

| Rule | Count | Fix |
| --- | --- | --- |
| `no-explicit-any` | 64 | New shared `src/api/types.ts` domain types (UserPayload, FileEntry, PlatformConfig, IntegrityReport, …) typed into the api layer generics; axios catches routed through a typed `apiErrorMessage()` helper (`src/api/errors.ts`) handling FastAPI `{detail}` shapes; Monaco editor described via minimal interfaces; write-only state and needless casts removed. |
| `no-unused-vars` | 31 | Optional catch bindings (`catch {}`), dead destructures/imports removed. |
| `no-empty` / empty interface / prefer-const | 6 | Comments documenting best-effort semantics; type alias; const. |
| `react-refresh/only-export-components` | 4 | Variants moved to `button-variants.ts` / `badge-variants.ts`; hooks split into `useAuth.ts` / `useTheme.ts` (+ `auth-core.ts` / `theme-core.ts`). |
| `set-state-in-effect` / `immutability` | 4 | React's during-render state-adjustment pattern (route-change resets, token-change re-derivation of user); AuthContext user now derived from the JWT synchronously instead of set in an effect. |

## R2-4 — Resilience / chaos testing ✅

- Backend `tests/test_resilience.py` (4): `/health` stays 200 while `/ready`
  returns 503 during a DB outage; readiness recovers without restart;
  maintenance middleware falls **open** when its DB check explodes (no
  self-lockout); matches the DR runbook contract.
- Job-API `tests/test_submit_resilience.py` (8): slurmrestd down / 5xx /
  job-less 200 → loud clean failures; JWT missing or 401/403 → automatic sbatch
  CLI fallback (asserted REST is never contacted when JWT unavailable);
  sbatch also dead → descriptive failure; hard quota breach queues locally
  with zero Slurm contact; audit artifacts (.sbatch/.json) survive failed
  submissions.
- Throttle fail-open covered by construction (`ExplodingSession`) via the
  backend resilience suite's design + login suite.

## Verification after Round 2 (CI-equivalent, local)

| CI job | Result |
| --- | --- |
| Repo checks (`pytest tests`) | **85 passed** |
| Ansible syntax-check (entrypoints) | **all pass** |
| Job-API planner tests | **49 passed** (41 + 8 resilience) |
| Backend tests | **35 passed** (31 integration incl. lockout + 4 resilience) |
| Frontend lint | **0 errors** (17 warnings, pre-existing) |
| Frontend build (`tsc -b && vite build`) | **pass** |

## Remaining known follow-ups (updated)

- 17 frontend warnings (`react-hooks/exhaustive-deps` style) — cosmetic.
- Off-site backup target must be provisioned per site (rsync endpoint +
  vault-stored passphrase) — scripts and docs are ready.
- Phase 7 candidate (per review): HPC Operations MCP layer on top of the
  existing APIs, going through the same authz/audit layers.
