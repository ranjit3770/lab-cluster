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
    project_folder: UploadFile = File(..., description="Project folder as a Zip file"),
    db: Session = Depends(get_db)
):
    """
    Submit a job with Streaming Response (Plain Text Logs).
    Accepts a Zip file in 'project_folder' field.
    """
    db_service = DatabaseService(db)
    
    # Validation: Check if it is a zip
    if not project_folder.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are accepted for project_folder")

    async def submission_generator():
        job_id = None
        slurm_id = None
        
        try:
            yield "Status: Starting Submission...\n"
            
            # 2. Quota Check (DB)
            yield "Status: Validating User Quota & Concurrency...\n"
            quota = db_service.get_user_quota(user_id)
            db_service.check_concurrent_limit(user_id)
            
            # 3. Create Job Record
            # We don't know the script name yet, will update later or assume default
            job = db_service.create_job_record(user_id, script_path="Main.py (Pending Discovery)")
            job_id = job.id
            yield f"Status: Job Record Created (ID: {job_id})\n"

            # 4. Environment Setup
            yield "Status: Setting up User Environment...\n"
            env_service.ensure_user_environment(user_id)
            
            # 5. Job Directory & File Extraction
            # Check Disk Quota Phase 1 (Pre-Alloc)
            yield "Status: Verifying Disk Quota (Phase 1)...\n"
            current_usage = await asyncio.to_thread(env_service.get_current_disk_usage_mb, user_id)
            if current_usage >= quota.disk_quota_mb:
                 raise ResourceQuotaExceededError(f"Disk quota exceeded (Used: {current_usage}MB, Limit: {quota.disk_quota_mb}MB)")

            job_dir = env_service.create_job_directory(user_id, str(job_id))
            yield f"Status: extracting project files to {job_dir}...\n"
            
            # Save Zip temporarily
            zip_path = job_dir / "project.zip"
            content = await project_folder.read()
            with open(zip_path, "wb") as f:
                f.write(content)
                
            # Extract Zip
            import zipfile
            import os
            try:
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(job_dir)
                os.remove(zip_path) # Clean up zip
            except zipfile.BadZipFile:
                raise JobExecutionError("Invalid Zip file provided")
                
            # 6. Discovery: Find requirements.txt and main script
            # Simple heuristic: Look provided requirements.txt in root or first found
            yield "Status: Discovering dependencies and scripts...\n"
            
            # Recurse to find files
            script_name = None
            found_reqs = False
            
            for root, dirs, files in os.walk(job_dir):
                for file in files:
                    # Look for python script to run? 
                    # If multiple, this is ambiguous. SRS implies "Uploaded scripts".
                    # Let's default to searching for 'main.py' or 'run.py', else take the first .py
                    if not script_name and file.endswith(".py"):
                        script_name = os.path.relpath(os.path.join(root, file), job_dir)
                    
                    if file == "requirements.txt":
                       found_reqs = True

            if not script_name:
                raise JobExecutionError("No Python script (.py) found in project folder")
                
            # Update DB with discovered script path
            # We need to create a new session or use existing? 
            # Existing session 'db' is bound in outer scope, we are in generator.
            # Generator runs async, 'db' session use might be tricky if not careful with threading 
            # but usually fine if sync logic is blocking.
            # Ideally we use db_service again.
            # db_service.update_job_script(job_id, script_name) # Method not implemented yet, skipping for now or adding todo.
            
            yield f"Status: Discovered entry script: {script_name}\n"

            # 6. Dependency Install
            if found_reqs:
                yield "Status: Installing dependencies (this may take a moment)...\n"
                await asyncio.to_thread(
                    dep_service.install_dependencies, 
                    user_id, str(job_id), env_service
                )
                
                # 7. Disk Quota Phase 2 (Post-Install)
                yield "Status: Verifying Disk Quota (Phase 2)...\n"
                current_usage = await asyncio.to_thread(env_service.get_current_disk_usage_mb, user_id)
                if current_usage > quota.disk_quota_mb:
                    # Cleanup job if quota exceeded by install
                    env_service.cleanup_job_directory(user_id, str(job_id))
                    raise ResourceQuotaExceededError(
                        f"Disk quota exceeded after installation (Used: {current_usage}MB, Limit: {quota.disk_quota_mb}MB)"
                    )
            else:
                 yield "Status: No requirements.txt found, skipping install.\n"
            
            # 8. Sbatch Generation
            yield "Status: Generating SLURM script...\n"
            venv_python = env_service.get_python_path(user_id)
            slurm_service.generate_sbatch_script(
                str(job_id), user_id, job_dir, venv_python, script_name, quota
            )

            # 9. Submission
            yield "Status: Submitting to SLURM Cluster...\n"
            slurm_id = await asyncio.to_thread(slurm_service.submit_job, job_dir)
            
            # Update DB
            db_service.update_job_slurm_id(job_id, slurm_id)
            db_service.update_job_status(job_id, JobStatus.PENDING)
            
            yield f"Status: Submitted Successfully! SLURM Job ID: {slurm_id}\n"

            # 10. Cgroup Enforcement
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
            
            # Cleanup / Cancel
            if job_id:
                try:
                    db_service.update_job_status(job_id, JobStatus.FAILED)
                    if slurm_id and not isinstance(e, JobExecutionError):
                         slurm_service.cancel_job(slurm_id)
                except:
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
