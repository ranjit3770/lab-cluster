import logging
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import datetime

from app.models.models import Job, JobStatus
from app.core.errors import ResourceQuotaExceededError, JobNotFoundError, InvalidJobStateError

logger = logging.getLogger(__name__)

class DatabaseService:
    def __init__(self, db: Session):
        self.db = db

    def get_user_quota(self, user_id: str):
        """
        Fetch resource quotas from the Portal's 'users' table.
        Supports lookup by numeric ID (e.g. '6') or username (e.g. 'test').
        """
        from sqlalchemy import text
        from app.core.config import settings
        from dataclasses import dataclass

        @dataclass
        class Quota:
            user_id: str
            username: str  # Added for path management
            disk_quota_mb: int
            cpus_per_job: int
            mem_mb_per_cpu: int
            max_concurrent_jobs: int = 10
            read_limit_mb_s: int = 50
            write_limit_mb_s: int = 50
            read_iops: int = 500
            write_iops: int = 500

        # Determine if we should query by ID or Username
        if user_id.isdigit():
            query = text(f"SELECT id, username, cpu_limit, memory_limit_mb, storage_limit_gb FROM {settings.PORTAL_DB_NAME}.users WHERE id = :u")
        else:
            query = text(f"SELECT id, username, cpu_limit, memory_limit_mb, storage_limit_gb FROM {settings.PORTAL_DB_NAME}.users WHERE username = :u")
            
        result = self.db.execute(query, {"u": user_id}).fetchone()

        if not result:
            logger.warning(f"User {user_id} not found in portal database. Returning minimal safe defaults.")
            return Quota(user_id=user_id, username=user_id, disk_quota_mb=100, cpus_per_job=1, mem_mb_per_cpu=512)

        # Mapping: 0 in portal usually means unlimited or not set. We use safe minimums.
        cpu = result.cpu_limit if result.cpu_limit and result.cpu_limit > 0 else 1
        mem = result.memory_limit_mb if result.memory_limit_mb and result.memory_limit_mb > 0 else 1024
        storage = result.storage_limit_gb if result.storage_limit_gb and result.storage_limit_gb > 0 else 1
        
        return Quota(
            user_id=str(result.id),
            username=result.username,
            disk_quota_mb=storage * 1024,
            cpus_per_job=cpu,
            mem_mb_per_cpu=mem
        )

    def get_active_job_count(self, user_id: str) -> int:
        """
        Count jobs in PENDING or RUNNING state for the user.
        """
        count = self.db.query(func.count(Job.id))\
            .filter(Job.user_id == user_id)\
            .filter(Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING]))\
            .scalar()
        return count or 0

    def check_concurrent_limit(self, user_id: str):
        """
        Enforce Concurrent Job Limit.
        Raises ResourceQuotaExceededError if limit reached.
        """
        quota = self.get_user_quota(user_id)
        active_count = self.get_active_job_count(user_id)
        
        if active_count >= quota.max_concurrent_jobs:
            logger.warning(f"User {user_id} exceeded max concurrent jobs ({active_count} >= {quota.max_concurrent_jobs})")
            raise ResourceQuotaExceededError(f"Max concurrent jobs limit reached ({quota.max_concurrent_jobs})")
        
        return True

    def create_job_record(self, user_id: str, script_path: str = "") -> Job:
        """
        Create a new job record with PENDING status.
        ID is auto-assigned by DB.
        """
        new_job = Job(
            user_id=user_id,
            status=JobStatus.PENDING,
            script_path=script_path
        )
        self.db.add(new_job)
        self.db.commit()
        self.db.refresh(new_job)
        logger.info(f"Created job record {new_job.id} for user {user_id}")
        return new_job

    def update_job_slurm_id(self, job_id: int, slurm_id: int):
        """
        Update the SLURM job ID after submission.
        """
        job = self.db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise JobNotFoundError(str(job_id))
        
        job.slurm_job_id = slurm_id
        # Status might still be PENDING, SLURM will update it eventually.
        self.db.commit()
        self.db.refresh(job)
        logger.info(f"Mapped Job {job_id} to SLURM ID {slurm_id}")
        return job

    def update_job_failure(self, job_id: int, reason: str):
        """
        Mark a job as FAILED and store the reason.
        """
        job = self.db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = JobStatus.FAILED
            job.failure_reason = reason
            self.db.commit()
            logger.info(f"Recorded failure for Job {job_id}: {reason}")

    def update_job_status(self, job_id: int, status: JobStatus, enforce_valid_transitions: bool = False):
        """
        Update job status.
        """
        job = self.db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise JobNotFoundError(str(job_id))

        # Basic valid transition logic could go here if enforce_valid_transitions is True
        # For now, we trust the caller (SLURM Poller or Internal Logic)
        
        old_status = job.status
        job.status = status
        
        self.db.commit()
        logger.info(f"Job {job_id} status changed: {old_status} -> {status}")
        return job
        
    def get_job(self, job_id: int) -> Job:
        job = self.db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise JobNotFoundError(str(job_id))
        return job

    def  validate_cancellation(self, job_id: int, user_id: str) -> Job:
        """
        Validate if a job can be cancelled by the user.
        """
        job = self.get_job(job_id)
        
        # Ownership check
        if job.user_id != user_id:
             # Using JobNotFoundError to hide existence if unauthorized? 
             # Or explicit error? SRS says "Validate ownership".
             # Common security practice is 404.
             logger.warning(f"Unauthorized cancel attempt for job {job_id} by user {user_id}")
             raise JobNotFoundError(str(job_id)) 
        
        # State check (FR-12: PENDING / RUNNING only)
        if job.status not in [JobStatus.PENDING, JobStatus.RUNNING]:
            raise InvalidJobStateError(job.status, "CANCEL")
            
        return job
