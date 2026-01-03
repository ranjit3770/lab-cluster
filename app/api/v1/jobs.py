import json
import logging
import asyncio
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.models.database import get_db
from app.models.models import JobStatus
from app.schemas.job import JobResponse
from app.core.errors import JobExecutionError
from app.services.db import DatabaseService
from app.services.environment import EnvironmentService
from app.services.dependency import DependencyService
from app.services.slurm import SlurmService
from app.services.cgroups import CgroupService

router = APIRouter()
logger = logging.getLogger(__name__)

# Core Service Instantiation (Stateful services instantiated per request or usually globally if stateless)
# For simplicity, we instantiate per request or globally. 
# Since they are mostly stateless logic wrappers, global is fine, but DB needs session.
env_service = EnvironmentService()
dep_service = DependencyService()
slurm_service = SlurmService()
cgroup_service = CgroupService()

@router.post("/jobs", response_class=StreamingResponse)
async def submit_job(
    user_id: str = Form(...),
    username: str = Form(...),
    main_script: UploadFile = File(..., description="Main Python script to execute"),
    requirements_file: UploadFile = File(None, description="Optional requirements.txt"),
    dependency_path: str = Form(None, description="Optional server path containing data or modules"),
    db: Session = Depends(get_db)
):
    """
    Submit a Job:
    - user_id, username
    - main_script: The .py file to run.
    - requirements_file: Dependencies to install.
    - dependency_path: Direct server path to copy data or helper modules from.
    """
    db_service = DatabaseService(db)
    
    # Basic Validation
    if not main_script.filename.endswith(".py"):
        raise HTTPException(status_code=400, detail="Main script must be a .py file")

    async def submission_generator():
        job_id = None
        slurm_id = None
        
        try:
            yield f"Status: Starting Submission for User: {username} ({user_id})\n"
            
            # 1. Quota Check
            yield "Status: Validating User Quota...\n"
            quota = db_service.get_user_quota(user_id)
            db_service.check_concurrent_limit(user_id)
            
            # 2. Create Job Record
            # We explicitly know the script name now
            job = db_service.create_job_record(user_id, script_path=main_script.filename)
            job_id = job.id
            yield f"Status: Job Record Created (ID: {job_id})\n"

            # 3. Environment Setup
            yield "Status: Setting up User Environment...\n"
            env_service.ensure_user_environment(user_id)
            
            # 4. Job Directory Creation
            # Check Disk Quota Phase 1
            yield "Status: Check Disk Quota (Phase 1)...\n"
            current_usage = await asyncio.to_thread(env_service.get_current_disk_usage_mb, user_id)
            if current_usage >= quota.disk_quota_mb:
                 raise ResourceQuotaExceededError(f"Disk quota exceeded (Used: {current_usage}MB)")

            job_dir = env_service.create_job_directory(user_id, str(job_id))
            
            # 5. Handle File Uploads
            yield f"Status: Writing files to {job_dir}...\n"
            
            # A. Main Script
            script_path = job_dir / main_script.filename
            with open(script_path, "wb") as f:
                content = await main_script.read()
                f.write(content)
            
            # B. Requirements File (Optional)
            if requirements_file:
                req_path = job_dir / "requirements.txt"
                with open(req_path, "wb") as f:
                    content = await requirements_file.read()
                    f.write(content)
                    
            # C. Dependency Path (Optional - Server Side Copy)
            if dependency_path:
                yield f"Status: Copying dependencies from {dependency_path}...\n"
                import shutil
                from pathlib import Path as LibPath
                
                src_path = LibPath(dependency_path)
                if not src_path.exists():
                    raise JobExecutionError(f"Dependency path {dependency_path} does not exist on server")
                
                try:
                    if src_path.is_dir():
                        # Copy contents of directory to job_dir
                        for item in src_path.iterdir():
                            dest = job_dir / item.name
                            if item.is_dir():
                                shutil.copytree(item, dest, dirs_exist_ok=True)
                            else:
                                shutil.copy2(item, dest)
                    else:
                        # Copy single file
                        shutil.copy2(src_path, job_dir / src_path.name)
                except Exception as e:
                    raise JobExecutionError(f"Failed to copy dependencies: {str(e)}")

            # 6. Dependency Installation
            if requirements_file:
                yield "Status: Installing dependencies from requirements.txt...\n"
                await asyncio.to_thread(
                    dep_service.install_dependencies, 
                    user_id, str(job_id), env_service
                )
                
                # Check Disk Quota Phase 2
                yield "Status: Check Disk Quota (Phase 2)...\n"
                current_usage = await asyncio.to_thread(env_service.get_current_disk_usage_mb, user_id)
                if current_usage > quota.disk_quota_mb:
                    env_service.cleanup_job_directory(user_id, str(job_id))
                    raise ResourceQuotaExceededError(f"Disk quota exceeded after install (Used: {current_usage}MB)")
            else:
                 yield "Status: No requirements.txt provided, skipping install.\n"
            
            # 7. Sbatch Generation
            yield "Status: Generating SLURM script...\n"
            venv_python = env_service.get_python_path(user_id)
            slurm_service.generate_sbatch_script(
                str(job_id), user_id, job_dir, venv_python, main_script.filename, quota
            )

            # 8. Submission
            yield "Status: Submitting to SLURM Cluster...\n"
            slurm_id = await asyncio.to_thread(slurm_service.submit_job, job_dir)
            
            # Update DB
            db_service.update_job_slurm_id(job_id, slurm_id)
            db_service.update_job_status(job_id, JobStatus.PENDING)
            
            yield f"Status: Submitted Successfully! SLURM Job ID: {slurm_id}\n"

            # 9. Cgroup Enforcement
            yield "Status: Enforcing Cgroup I/O Limits...\n"
            await asyncio.to_thread(
                cgroup_service.enforce_limits,
                str(job_id), slurm_id, 
                1000, 
                job_dir, quota, slurm_service
            )
            
            yield f"Status: Job {job_id} Fully Accepted and Running.\n"

        except Exception as e:
            logger.error(f"Job Submission Failed: {e}")
            yield f"Error: {str(e)}\n"
            
            if job_id:
                try:
                    db_service.update_job_status(job_id, JobStatus.FAILED)
                    if slurm_id and not isinstance(e, JobExecutionError):
                         slurm_service.cancel_job(slurm_id)
                except Exception:
                    pass

    return StreamingResponse(submission_generator(), media_type="text/plain")

@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job_status(job_id: int, db: Session = Depends(get_db)):
    """
    Get current job status (Syncs with SLURM).
    """
    db_service = DatabaseService(db)
    job = db_service.get_job(job_id)
    
    if job.slurm_job_id:
        current_slurm_state = slurm_service.get_job_state(job.slurm_job_id)
        # Update DB if changed
        if current_slurm_state != job.status:
            job = db_service.update_job_status(job_id, current_slurm_state)
            
    return job

@router.delete("/jobs/{job_id}")
def cancel_job(job_id: int, user_id: str, db: Session = Depends(get_db)):
    """
    Cancel a job.
    """
    db_service = DatabaseService(db)
    job = db_service.validate_cancellation(job_id, user_id)
    
    if job.slurm_job_id:
        slurm_service.cancel_job(job.slurm_job_id)
        db_service.update_job_status(job_id, JobStatus.CANCELLED)
        
    return {"message": "Job cancellation requested"}

@router.get("/jobs/{job_id}/logs")
async def stream_logs(job_id: int, db: Session = Depends(get_db)):
    """
    Stream standardized output/error logs.
    """
    db_service = DatabaseService(db)
    job = db_service.get_job(job_id)
    
    # Locate log files
    env_service = EnvironmentService()
    job_dir = env_service.get_job_dir(job.user_id, job_id)
    stdout_path = job_dir / f"{job_id}.o"
    stderr_path = job_dir / f"{job_id}.e"
    
    async def log_generator():
        # Simple tail implementation
        # For simplicity, we just read existing content. 
        # Real-time tailing would require a loop with sleep, checking for job completion.
        
        # Checking if file exists first
        if not stdout_path.exists() and not stderr_path.exists():
            yield f"Waiting for logs... (Job status: {job.status.value})\n"
            return

        # Basic read (non-tailing for this MVP/Snippet)
        # To strictly implement 'stream', we'd loop.
        try:
             # Just reading stdout for demo
            if stdout_path.exists():
                with open(stdout_path, "r") as f:
                    yield f.read()
            if stderr_path.exists():
                yield "\n--- STDERR ---\n"
                with open(stderr_path, "r") as f:
                    yield f.read()
        except Exception as e:
            yield f"Error reading logs: {e}"

    return StreamingResponse(log_generator(), media_type="text/plain")
