-- Database Schema for FastAPI Job Execution API
-- Target DB: MySQL 5.7+ / 8.0
-- This file only contains the 'jobs' table. 
-- User quotas are fetched from the portal database.

CREATE DATABASE IF NOT EXISTS slurm_jobs_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE slurm_jobs_db;

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
-- User Setup (Run as Root)
-- -----------------------------------------------------
-- CREATE USER IF NOT EXISTS 'job_exec_user'@'localhost' IDENTIFIED BY 'Amrita@123';
-- GRANT ALL PRIVILEGES ON slurm_jobs_db.* TO 'job_exec_user'@'localhost';
-- GRANT SELECT ON strach_portal.users TO 'job_exec_user'@'localhost'; -- Required to read quotas
-- FLUSH PRIVILEGES;

-- Grant select access to the portal's users table
GRANT SELECT ON strach_portal.users TO 'job_exec_user'@'localhost';
FLUSH PRIVILEGES;