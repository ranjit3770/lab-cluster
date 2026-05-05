CREATE DATABASE IF NOT EXISTS slurm_jobs;
USE slurm_jobs;

CREATE TABLE job_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id VARCHAR(32) NOT NULL,
    username VARCHAR(64) NOT NULL,
    project_name VARCHAR(128) NOT NULL,
    entry_point VARCHAR(256) NOT NULL,
    total_cpu INT NOT NULL,
    total_ram INT NOT NULL,
    resource_mode ENUM('random','node_wise') NOT NULL,
    walltime VARCHAR(16) NOT NULL,
    command_args TEXT NULL,
    requirements_path VARCHAR(512) NULL,
    status VARCHAR(32) DEFAULT 'SUBMITTED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_job_id (job_id),
    INDEX idx_user (username),
    INDEX idx_project (project_name),
    INDEX idx_status (status)
);
