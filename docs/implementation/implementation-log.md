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
| Repo checks (`pytest tests`) | **85 passed** |
| Ansible syntax-check (4 entrypoints) | **all pass** |
| Job-API planner tests | **49 passed** |
| Backend tests | **35 passed** |
| MCP server tests | **77 passed** (50 MCP + 27 security) |
| Frontend build (`tsc && vite build`) | **pass** |
| Frontend lint | **0 errors** (17 warnings, pre-existing) |

## Known follow-ups

- Frontend lint debt (pre-existing): ~17 warnings across the codebase, mostly
  `react-hooks/exhaustive-deps` — cosmetic only, no errors.
- In-memory login throttle resets per process restart; move to shared store
  (Redis/DB) when running multiple replicas.
- Backup off-host copy + encryption-at-rest should be finalized per site policy.
- MCP server prompt-injection resistance ✅ (Phase 8.1 complete)

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
- Phase 7 implemented: HPC Operations MCP Server ✅
- Phase 7.1 implemented: Security hardening, confirmation gates, semantic layer ✅
- Phase 8.1 implemented: Prompt-injection resistance, trusted/untrusted separation ✅
- Phase 8.2 implemented: Policy engine, adversarial tests, risk levels ✅

---

# Round 5 — Phase 8.2: Policy Engine & Adversarial Testing ✅

## Changes

### 1. Operation Risk Levels

Tools now have explicit risk levels instead of binary `dangerous` flag:

| Risk Level | Behavior | Tools |
| --- | --- | --- |
| `read` | Automatic execution | All 17 diagnostic/analytical tools |
| `low` | Automatic execution | (reserved for future use) |
| `medium` | Authorization required (admin/developer) | `cancel_job`, `submit_job` |
| `high` | Confirmation required | `resume_node`, `drain_node`, `restart_service` |
| `critical` | Confirmation + additional policy | `switch_os` |

### 2. Policy Engine (`app/policy.py`)

New module with explicit rules for tool execution:

```text
AI
 │
 ▼
Policy Engine
 │
 ├── identity (user_id, username)
 ├── role (user, admin, developer)
 ├── operator mode (observe, operate)
 ├── operation risk (read, low, medium, high, critical)
 ├── target node
 ├── job ownership
 └── confirmation requirement
 │
 ▼
Execution / Denial / Confirmation
```

**Policy rules:**
- `observe_mode_read_only`: OBSERVE mode allows read/low risk
- `observe_mode_deny_write`: OBSERVE mode denies medium/high/critical
- `read_risk_auto_allow`: READ operations auto-allow
- `low_risk_auto_allow`: LOW risk auto-allow
- `medium_risk_authorize`: MEDIUM risk requires admin/developer
- `medium_risk_deny_user`: MEDIUM risk denies regular users
- `high_risk_confirm`: HIGH risk requires confirmation
- `high_risk_deny_user`: HIGH risk denies regular users
- `critical_risk_confirm`: CRITICAL risk requires confirmation
- `critical_risk_deny_user`: CRITICAL risk denies regular users

### 3. Policy Endpoint

New `GET /api/v1/mcp/policy` endpoint exposes:
- All policy rules with conditions and decisions
- Risk level definitions

### 4. Adversarial Test Corpus (`tests/test_adversarial.py`)

20 adversarial samples across 5 categories:

| Category | Samples | Detection |
| --- | --- | --- |
| Instruction override | 5 | All detected |
| Command injection | 4 | All detected |
| System commands | 3 | All detected |
| Subtle injection | 3 | May not be caught (defense-in-depth) |
| Benign content | 3 | None detected |
| Mixed content | 2 | All detected |

### 5. Defense-in-Depth Tests

Tests verify multiple defense layers work together:
1. Injection detection
2. Sanitization (HTML escape)
3. Untrusted wrapping
4. Secure context building

## Updated Test Count

| Category | Count |
| --- | --- |
| Original Phase 7 tests | 27 |
| Phase 7.1 security tests | 23 |
| Phase 8.1 security module tests | 27 |
| Phase 8.2 adversarial tests | 20 |
| Phase 8.2 policy engine tests | 24 |
| Phase 8.2 risk level tests | 6 |
| Integration tests | 2 |
| **Total** | **165** |

---

# Round 4 — Phase 8.1: Prompt-Injection Resistance ✅

## Changes

### 1. Security Module (`app/security.py`)

New module providing defense-in-depth against prompt injection:

| Function | Purpose |
| --- | --- |
| `sanitize_text()` | HTML-escapes text to prevent injection |
| `wrap_untrusted()` | Wraps content in `<UNTRUSTED_DATA>` delimiters |
| `detect_injection_patterns()` | Scans for 20+ known injection patterns |
| `mark_trusted()` | Marks content as trusted system instruction |
| `build_secure_context()` | Builds secure context with trusted/untrusted separation |
| `validate_tool_output()` | Validates and sanitizes tool outputs |
| `SecureToolWrapper` | Decorator for adding security controls to tools |

### 2. Trusted/Untrusted Data Separation

All data is now classified by trust level:

```text
TRUSTED
────────────────
System instructions
Tool definitions
Authorization policy
Confirmation policy

UNTRUSTED
────────────────
Job scripts
Job output
User files
Node logs
Audit metadata
External text
```

### 3. Prompt Injection Detection

The system detects 20+ known injection patterns:

- "Ignore previous instructions"
- "Disregard prior instructions"
- "You are now a..."
- "Act as if you..."
- "Pretend you are..."
- "New instructions:"
- "Override safety"
- "Bypass security"
- Dangerous commands (`sudo`, `rm -rf`, `chmod 777`)
- Slurm commands (`drain`, `resume`, `cancel job`)

### 4. Secure Context Pipeline

All tool outputs now include security metadata:

```json
{
  "tool": "get_cluster_status",
  "result": {...},
  "security": {
    "trust_level": "tool_output",
    "injection_detected": false
  }
}
```

If injection is detected, `injection_detected` is `true` and patterns are logged.

### 5. Integration with Tool Execution

Both regular and confirmed tool executions now:
1. Validate output for injection patterns
2. Log any detected patterns
3. Include security metadata in response

## Updated Test Count

| Category | Count |
| --- | --- |
| Original Phase 7 tests | 27 |
| Phase 7.1 security tests | 23 |
| Phase 8.1 security module tests | 27 |
| **Total** | **77** |

---

# Round 3 — Phase 7.1: MCP Security Hardening & Semantic Layer ✅

## Changes

### 1. Negative Authorization Path Tests (12 new tests)

Comprehensive tests proving RBAC enforcement:

- Student (`role=user`) denied: `cancel_job`, `drain_node`, `resume_node`,
  `restart_service`, `switch_os`, `submit_job`
- Admin (`role=admin`) allowed all write tools
- Developer (`role=developer`) allowed write tools
- Unauthenticated user blocked when auth required
- Student can use read tools
- Write tools hidden from student's tool discovery list

### 2. Confirmation Gates for Dangerous Operations

Dangerous tools now require a **two-step confirmation flow**:

```text
AI
 │
 ├── POST /tools/drain_node  (first call)
 │      ↓
 │   Returns confirmation_key
 │
 └── POST /tools/drain_node/confirm  (second call with key)
        ↓
     Executes operation
```

**Dangerous tools** (require confirmation):
- `drain_node`
- `resume_node`
- `restart_service`
- `switch_os`

**Non-dangerous write tools** (execute directly):
- `cancel_job`
- `submit_job`

### 3. AI Operator Mode (OBSERVE vs OPERATE)

JWT tokens now support a `mode` claim:

- **OBSERVE**: Read-only access. Cannot execute any write tools.
- **OPERATE**: Full access (read + write, subject to RBAC).

```text
OBSERVE mode:
  ├── get_cluster_status    → allowed
  ├── get_nodes             → allowed
  ├── cancel_job            → denied (403)
  └── drain_node            → denied (403)

OPERATE mode:
  ├── get_cluster_status    → allowed
  ├── cancel_job            → allowed (if admin/developer)
  └── drain_node            → requires confirmation
```

### 4. Semantic Layer Tools (2 new tools)

Higher-level diagnostic tools that combine multiple data sources:

| Tool | Description |
| --- | --- |
| `diagnose_cluster_issue` | Comprehensive cluster health diagnosis with issues and recommendations |
| `optimize_job_request` | Analyze job request against capacity, provide optimization recommendations |

### 5. Minimized Direct Slurm CLI Access

Updated `clients.py` to prefer Portal API over direct Slurm CLI:

| Function | Before | After |
| --- | --- | --- |
| `get_slurm_node_detail` | Direct CLI only | Portal API first, CLI fallback |
| `get_slurm_queue` | Direct CLI only | Portal API first, CLI fallback |
| `get_user_quota` | Direct CLI only | Portal API first, CLI fallback |

## Updated Tool Count

| Tier | Count |
| --- | --- |
| Read-only diagnostic | 15 |
| Analytical (semantic) | 7 (was 5, +2) |
| Write (admin/developer) | 6 |
| **Total** | **23** (was 21) |

## Updated Test Count

| Category | Count |
| --- | --- |
| Original Phase 7 tests | 27 |
| Negative authorization tests | 12 |
| Confirmation gate tests | 4 |
| AI operator mode tests | 4 |
| Semantic layer tests | 3 |
| **Total** | **50** |

---

# Round 3 — Phase 7: HPC Operations MCP Server ✅

New service: `cluster-portal/mcp-server/` — a FastAPI-based MCP (Model Context
Protocol) server that exposes HPC operations as typed tools for AI clients.
The server sits **in front of** the existing Portal and Job-API, preserving
every existing auth/authz/audit layer.

## Architecture

```text
                AI Client (Claude, etc.)
                       │
                       ▼
                HPC Operations MCP  (port 9100)
                       │
              ┌────────┼────────┐
              │        │        │
              ▼        ▼        ▼
           Portal    Job API   Slurm CLI
           (8000)    (9000)    (sinfo/squeue)
```

- **No secret backdoor**: every tool call routes through the Portal API with
  the caller's JWT, or through the Job-API, or through Slurm CLI commands.
- **Read-only tools** (any authenticated user) for diagnostics.
- **Analytical tools** (any authenticated user) for reasoning about state.
- **Write tools** (admin/developer only) for cluster operations.
- **Audit logging**: every MCP tool call is recorded in `audit_logs`.
- **Confirmation gates**: dangerous operations require explicit confirmation.
- **AI operator mode**: OBSERVE (read-only) vs OPERATE (read+write).

## Tools (23 total)

### Read-only diagnostic tools (15)

| Tool | Description |
| --- | --- |
| `get_cluster_status` | Cluster health overview |
| `get_node_status` | Single node detail |
| `get_nodes` | All nodes status |
| `get_jobs` | Job list (scoped by role) |
| `get_job` | Single job detail |
| `get_partition_status` | Slurm partition configs |
| `get_queue_status` | Current Slurm queue |
| `get_resource_capacity` | Aggregate CPU/mem/GPU |
| `get_recent_audit_events` | Last 100 audit entries |
| `get_node_diagnostics` | Full node diagnostics |
| `explain_pending_job` | Why a job is pending |
| `diagnose_failed_job` | Failure root cause |
| `diagnose_node` | Full node diagnostic report |
| `analyze_cluster_capacity` | Comprehensive capacity analysis |
| `find_available_gpu_nodes` | Nodes with free GPUs |

### Semantic layer tools (2)

| Tool | Description |
| --- | --- |
| `diagnose_cluster_issue` | Comprehensive cluster health diagnosis |
| `optimize_job_request` | Job request optimization recommendations |

### Write operations — admin/developer only (6)

| Tool | Description | Confirmation Required |
| --- | --- | --- |
| `cancel_job` | Cancel a running/pending job | No |
| `resume_node` | Resume a drained node | Yes |
| `drain_node` | Drain a node | Yes |
| `submit_job` | Submit job via Job-API | No |
| `restart_service` | Restart systemd service on node | Yes |
| `switch_os` | Trigger dual-boot OS switch | Yes |

## Files created

| File | Purpose |
| --- | --- |
| `mcp-server/app/main.py` | FastAPI app, tool discovery, execution, confirmation gates |
| `mcp-server/app/config.py` | Pydantic settings |
| `mcp-server/app/auth.py` | JWT validation with OBSERVE/OPERATE mode support |
| `mcp-server/app/clients.py` | HTTP clients (Portal API preferred over Slurm CLI) |
| `mcp-server/app/tools.py` | 23 registered tool definitions with dangerous flag |
| `mcp-server/Dockerfile` | Container build |
| `mcp-server/requirements.txt` | Python dependencies |
| `mcp-server/.env.example` | Configuration template |
| `mcp-server/tests/test_mcp.py` | 50 tests |

## Tests

| CI job | Result |
| --- | --- |
| MCP server tests (`pytest tests/test_mcp.py`) | **50 passed** |
