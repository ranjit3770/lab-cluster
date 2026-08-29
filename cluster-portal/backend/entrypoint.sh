#!/bin/bash
set -e

_init_db() {
    local host="${1}"
    local port="${2}"
    local root_pass="${3}"
    local db_user="${4}"
    local db_pass="${5}"
    local db_name="${6}"

    echo "Waiting for MySQL at ${host}:${port}..."
    for i in $(seq 1 60); do
        if mysqladmin ping -h "${host}" -P "${port}" -u root -p"${root_pass}" --protocol=TCP --silent 2>/dev/null; then
            break
        fi
        sleep 1
    done

    echo "Ensuring database user '${db_user}' exists for database '${db_name}'..."
    mysql --protocol=TCP -h "${host}" -P "${port}" -u root -p"${root_pass}" <<-EOSQL 2>/dev/null || true
        CREATE USER IF NOT EXISTS '${db_user}'@'%' IDENTIFIED BY '${db_pass}';
        GRANT ALL PRIVILEGES ON ${db_name}.* TO '${db_user}'@'%';
        FLUSH PRIVILEGES;
EOSQL
}

if [ -n "${MYSQL_SERVER:-}" ] && [ -n "${MYSQL_PORT:-}" ] && [ -n "${MYSQL_ROOT_PASSWORD:-}" ]; then
    _init_db \
        "${MYSQL_SERVER}" \
        "${MYSQL_PORT}" \
        "${MYSQL_ROOT_PASSWORD}" \
        "${MYSQL_USER}" \
        "${MYSQL_PASSWORD}" \
        "${MYSQL_DB}"
fi

exec "$@"
