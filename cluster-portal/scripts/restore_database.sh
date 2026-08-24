#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Portal database restore
#
# Restores a backup produced by backup_database.sh INTO THE RUNNING
# portal_database container. This is a destructive operation: every database
# present in the dump is dropped and recreated from the archive.
#
# Usage:
#   ./restore_database.sh <backup.sql.gz|backup.sql.gz.gpg> [--force]
#
# Safety:
#   - Refuses to run while the backend/job-api containers are up unless
#     --force is passed (writers must be stopped first).
#   - Always performs integrity verification before touching the DB.
#   - Encrypted (.gpg) archives are decrypted on the fly; set
#     BACKUP_GPG_PASSPHRASE in the environment or cluster-portal/.env.
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORTAL_DIR="$(dirname "$SCRIPT_DIR")"
if [[ -f "$PORTAL_DIR/.env" ]]; then
    # shellcheck disable=SC1091
    set -a; source "$PORTAL_DIR/.env"; set +a
fi

DUMP_FILE="${1:-}"
FORCE="${2:-}"

if [[ -z "$DUMP_FILE" || ! -f "$DUMP_FILE" ]]; then
    echo "Usage: $0 <backup.sql.gz> [--force]" >&2
    exit 1
fi

gzip -t "$DUMP_FILE" || { echo "ERROR: archive failed integrity check." >&2; exit 1; }

DECRYPT_OK=1
restore_stream() {
    gunzip -c "$DUMP_FILE"
}
if [[ "$DUMP_FILE" == *.gpg ]]; then
    : "${BACKUP_GPG_PASSPHRASE:?BACKUP_GPG_PASSPHRASE must be set for encrypted backups}"
    # Verify decryptability before stopping anything.
    printf '%s' "$BACKUP_GPG_PASSPHRASE" \
        | gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 0 \
              --decrypt "$DUMP_FILE" | gzip -t \
        || { echo "ERROR: encrypted archive failed decryption/integrity check." >&2; exit 1; }
    restore_stream() {
        printf '%s' "$BACKUP_GPG_PASSPHRASE" \
            | gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 0 \
                  --decrypt "$DUMP_FILE"
    }
fi

for svc in portal_backend portal_job_api; do
    if docker ps --format '{{.Names}}' | grep -q "^$svc$" && [[ "$FORCE" != "--force" ]]; then
        echo "ERROR: $svc is running. Stop the portal stack first:" >&2
        echo "  cd cluster-portal && docker compose stop backend job-api" >&2
        echo "Or pass --force to restore anyway (NOT recommended)." >&2
        exit 1
    fi
done

echo "[restore] restoring $DUMP_FILE into portal_database ..."
restore_stream | docker exec -i -e MARIADB_ROOT_PASSWORD="$MYSQL_ROOT_PASSWORD" \
    portal_database sh -c 'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD"'

echo "[restore] done. Restart the stack:"
echo "  cd cluster-portal && docker compose start backend job-api"
