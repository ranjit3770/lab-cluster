-- Database Schema for FastAPI Job Execution API
-- Target DB: MySQL 5.7+ / 8.0
-- Version 1.1

CREATE DATABASE IF NOT EXISTS slurm_job_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE slurm_job_db;

-- -----------------------------------------------------
-- Table `user_quotas`
-- Admins define policies here per user.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_quotas` (
  `user_id` VARCHAR(255) NOT NULL,
  `disk_quota_mb` INT NOT NULL DEFAULT 1000 COMMENT 'Max disk usage in MB',
  `cpus_per_job` INT NOT NULL DEFAULT 1 COMMENT 'Force CPUS per task',
  `mem_mb_per_cpu` INT NOT NULL DEFAULT 1024 COMMENT 'Force Mem per CPU in MB',
  `max_concurrent_jobs` INT NOT NULL DEFAULT 5 COMMENT 'Max PENDING+RUNNING jobs',
  
  -- Cgroups v2 I/O Limits
  `read_limit_mb_s` INT NOT NULL DEFAULT 50 COMMENT 'Read BW in MB/s',
  `write_limit_mb_s` INT NOT NULL DEFAULT 50 COMMENT 'Write BW in MB/s',
  `read_iops` INT NOT NULL DEFAULT 500 COMMENT 'Read IOPS',
  `write_iops` INT NOT NULL DEFAULT 500 COMMENT 'Write IOPS',
  
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------
-- Table `jobs`
-- Tracks job lifecycle and SLURM mapping.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `jobs` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `user_id` VARCHAR(255) NOT NULL,
  `slurm_job_id` INT DEFAULT NULL COMMENT 'Assigned by sbatch',
  `status` ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED') DEFAULT 'PENDING',
  `script_path` VARCHAR(1024) DEFAULT NULL,
  
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  KEY `idx_user_status` (`user_id`, `status`),
  KEY `idx_slurm_id` (`slurm_job_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------
-- Default Policy Example
-- -----------------------------------------------------
INSERT IGNORE INTO `user_quotas` 
(`user_id`, `disk_quota_mb`, `cpus_per_job`, `mem_mb_per_cpu`, `max_concurrent_jobs`) 
VALUES 
('default_user', 5000, 2, 2048, 10);




-- Create the database if it doesn't exist
CREATE DATABASE IF NOT EXISTS slurm_job_db;

-- Create the user with the expected password
CREATE USER 'job_exec_user'@'localhost' IDENTIFIED BY 'Amrita@123';

-- Grant all privileges on the database to this user
GRANT ALL PRIVILEGES ON slurm_job_db.* TO 'job_exec_user'@'localhost';

-- Refresh privileges
FLUSH PRIVILEGES;