#!/bin/bash
set -e

# The container exports MARIADB_ROOT_PASSWORD for the entrypoint; fall back to
# the legacy MYSQL_* name in case only that is provided.
ROOT_PASSWORD="${MARIADB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"
if [ -z "$ROOT_PASSWORD" ]; then
    echo "ERROR: neither MARIADB_ROOT_PASSWORD nor MYSQL_ROOT_PASSWORD is set" >&2
    exit 1
fi

mysql -u root -p"${ROOT_PASSWORD}" <<-EOSQL
    CREATE DATABASE IF NOT EXISTS strach_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE DATABASE IF NOT EXISTS slurm_jobs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

    CREATE USER IF NOT EXISTS '${BACKEND_DB_USER}'@'%' IDENTIFIED BY '${BACKEND_DB_PASSWORD}';
    ALTER USER '${BACKEND_DB_USER}'@'%' IDENTIFIED BY '${BACKEND_DB_PASSWORD}';
    GRANT ALL PRIVILEGES ON strach_portal.* TO '${BACKEND_DB_USER}'@'%';

    CREATE USER IF NOT EXISTS '${JOB_API_DB_USER}'@'%' IDENTIFIED BY '${JOB_API_DB_PASSWORD}';
    ALTER USER '${JOB_API_DB_USER}'@'%' IDENTIFIED BY '${JOB_API_DB_PASSWORD}';
    GRANT ALL PRIVILEGES ON slurm_jobs.* TO '${JOB_API_DB_USER}'@'%';

    FLUSH PRIVILEGES;
EOSQL
