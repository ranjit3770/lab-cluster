#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Portal database backup (daily + weekly full)
#
# Dumps both portal databases (identity + job registry) from the MariaDB
# container into a timestamped, gzip-compressed file and prunes old backups
# according to the retention policy.
#
# Usage:
#   ./backup_database.sh [daily|weekly]
#
# Recommended cron (daily 02:15, weekly Sunday 03:15):
#   15 2  * * * /opt/.../cluster-portal/scripts/backup_database.sh daily
#   15 3  * * 0 /opt/.../cluster-portal/scripts/backup_database.sh weekly
#
# Configuration via environment or cluster-portal/.env:
#   MYSQL_ROOT_PASSWORD   (required)
#   BACKUP_DIR            (default /var/backups/portal)
#   DAILY_RETENTION_DAYS  (default 7)
#   WEEKLY_RETENTION_DAYS (default 28)
# Optional hardening:
#   BACKUP_GPG_PASSPHRASE - if set, the archive is symmetrically encrypted
#                           with GPG (AES256) and the plaintext is removed.
#   BACKUP_REMOTE_TARGET  - if set, the finished archive is pushed off-site
#                           via rsync, e.g. "backup@nas:/srv/backups/portal"
#                           or "user@host:/path". Requires key-based SSH.
#
# Exit codes: 0 ok | non-zero on dump/integrity/off-site failure. A failed
# off-site copy does NOT delete the local archive.
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORTAL_DIR="$(dirname "$SCRIPT_DIR")"

MODE="${1:-daily}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/portal}"
DAILY_RETENTION_DAYS="${DAILY_RETENTION_DAYS:-7}"
WEEKLY_RETENTION_DAYS="${WEEKLY_RETENTION_DAYS:-28}"

if [[ -f "$PORTAL_DIR/.env" ]]; then
    # shellcheck disable=SC1091
    set -a; source "$PORTAL_DIR/.env"; set +a
fi

: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD must be set (env or cluster-portal/.env)}"

STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="$BACKUP_DIR/$MODE"
mkdir -p "$OUT_DIR"

DATABASES=("strach_portal" "slurm_jobs")
echo "[backup] mode=$MODE databases=${DATABASES[*]}"

DUMP_FILE="$OUT_DIR/all_databases_$STAMP.sql.gz"
docker exec portal_database sh -c \
    'exec mariadb-dump --all-databases --single-transaction --quick -uroot -p"$MARIADB_ROOT_PASSWORD"' \
    2>/dev/null \
  | gzip > "$DUMP_FILE"

# Fallback for images where the env var is not inherited by exec.
if [[ ! -s "$DUMP_FILE" ]]; then
    docker exec -e MARIADB_ROOT_PASSWORD="$MYSQL_ROOT_PASSWORD" portal_database \
        mariadb-dump --all-databases --single-transaction --quick -uroot -p"$MYSQL_ROOT_PASSWORD" \
        2>/dev/null | gzip > "$DUMP_FILE"
fi

if [[ ! -s "$DUMP_FILE" ]]; then
    rm -f "$DUMP_FILE"
    echo "[backup] ERROR: dump file is empty; aborting." >&2
    exit 1
fi

echo "[backup] wrote $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

RETENTION_DAYS="$DAILY_RETENTION_DAYS"
[[ "$MODE" == "weekly" ]] && RETENTION_DAYS="$WEEKLY_RETENTION_DAYS"

# Verify the archive integrity (gzip -t) — an untestable backup is a theory.
gzip -t "$DUMP_FILE"
echo "[backup] archive integrity OK"

# ---------------------------------------------------------------------------
# Optional: encrypt at rest (GPG symmetric, AES256). Plaintext never lingers.
# ---------------------------------------------------------------------------
if [[ -n "${BACKUP_GPG_PASSPHRASE:-}" ]]; then
    if ! command -v gpg >/dev/null 2>&1; then
        echo "[backup] ERROR: BACKUP_GPG_PASSPHRASE set but gpg not installed." >&2
        exit 1
    fi
    ENC_FILE="${DUMP_FILE%.gz}.sql.gz.gpg"
    printf '%s' "$BACKUP_GPG_PASSPHRASE" \
        | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 \
              --cipher-algo AES256 --symmetric --output "$ENC_FILE" "$DUMP_FILE"
    rm -f "$DUMP_FILE"
    # Prove the archive decrypts cleanly before we trust it.
    printf '%s' "$BACKUP_GPG_PASSPHRASE" \
        | gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 0 \
              --decrypt "$ENC_FILE" >/dev/null
    DUMP_FILE="$ENC_FILE"
    echo "[backup] encrypted archive OK ($(du -h "$DUMP_FILE" | cut -f1))"
fi

# ---------------------------------------------------------------------------
# Optional: off-site copy. Failure is fatal for monitoring but keeps the
# local archive so the next run can retry the transfer.
# ---------------------------------------------------------------------------
if [[ -n "${BACKUP_REMOTE_TARGET:-}" ]]; then
    if ! command -v rsync >/dev/null 2>&1; then
        echo "[backup] ERROR: BACKUP_REMOTE_TARGET set but rsync not installed." >&2
        exit 2
    fi
    REMOTE_SUBDIR="$MODE"
    if rsync --timeout=300 "$DUMP_FILE" "$BACKUP_REMOTE_TARGET/$REMOTE_SUBDIR/"; then
        echo "[backup] off-site copy OK -> $BACKUP_REMOTE_TARGET/$REMOTE_SUBDIR/"
    else
        echo "[backup] ERROR: off-site copy failed (target=$BACKUP_REMOTE_TARGET); keeping local archive." >&2
        exit 3
    fi
fi

PRUNED=$(find "$OUT_DIR" \( -name '*.sql.gz' -o -name '*.sql.gz.gpg' \) \
    -mtime "+$RETENTION_DAYS" -print -delete | wc -l)
echo "[backup] pruned $PRUNED backup(s) older than $RETENTION_DAYS day(s)"
