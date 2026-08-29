CREATE DATABASE IF NOT EXISTS strach_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS slurm_jobs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'portal_user'@'%' IDENTIFIED BY '${BACKEND_DB_PASSWORD:?Set BACKEND_DB_PASSWORD in cluster-portal/.env}';
GRANT ALL PRIVILEGES ON strach_portal.* TO 'portal_user'@'%';

CREATE USER IF NOT EXISTS 'slurm_user'@'%' IDENTIFIED BY '${JOB_API_DB_PASSWORD:?Set JOB_API_DB_PASSWORD in cluster-portal/.env}';
GRANT ALL PRIVILEGES ON slurm_jobs.* TO 'slurm_user'@'%';

FLUSH PRIVILEGES;
