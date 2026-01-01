import logging
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import datetime

from app.models.models import Job, UserQuota, JobStatus
from app.core.errors import ResourceQuotaExceededError, JobNotFoundError, InvalidJobStateError

logger = logging.getLogger(__name__)

class DatabaseService:
    def __init__(self, db: Session):
        self.db = db

    def get_user_quota(self, user_id: str) -> UserQuota:
        """
        Fetch resource quotas for a specific user.
        If no specific quota exists, could return default or raise error.
        Checklist requires strict enforcement, so we assume a record MUST exist 
        or we fall back to a safe default if strictness allows (but SRS implies admin-defined).
        
        For this implementation: We will attempt to find the user. 
        If not found, we will create a default quota record (or raise error depending on policy).
        Given SRS 'Fetch quotas & resource limits from MySQL', let's create a default entry on first access 
        to ensure system usability, or just return it.
        """
        quota = self.db.query(UserQuota).filter(UserQuota.user_id == user_id).first()
        if not quota:
            # Auto-create default quota for new users as per 'New user -> env auto-created' flow implication?
            # SRS doesn't explicitly say we auto-create quota, but we need it. 
            # Let's create with defaults defined in the model.
            logger.info(f"No quota found for user {user_id}. Creating default quota.")
            quota = UserQuota(user_id=user_id)
            self.db.add(quota)
            self.db.commit()
            self.db.refresh(quota)
        return quota

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
