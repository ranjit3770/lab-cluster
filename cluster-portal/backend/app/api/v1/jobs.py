import requests
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from app.api import deps
from app.models.job import Job, JobStatus
from app.models.system_setting import SystemSetting
from app.schemas.job import Job as JobSchema, JobCreate
from app.core.config import settings
from app.api.v1.files import get_user_storage_path, safe_path_join
import os

router = APIRouter()

@router.get("", response_model=List[JobSchema])
def read_jobs(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user = Depends(deps.get_current_active_user),
) -> Any:
    """
    Retrieve jobs. Admins see all, users see their own.
    """
    if current_user.role == "admin":
        jobs = db.query(Job).options(joinedload(Job.owner)).order_by(Job.created_at.desc()).offset(skip).limit(limit).all()
    else:
        jobs = db.query(Job).filter(Job.owner_id == current_user.id).order_by(Job.created_at.desc()).offset(skip).limit(limit).all()

    # Proactive Status Synchronization
    # Check status of PENDING/RUNNING jobs against external source
    sync_needed = False
    for job in jobs:
        if job.status in [JobStatus.PENDING, JobStatus.RUNNING] and job.slurm_job_id:
            try:
                # Call external API: GET /status/{job.slurm_job_id}
                print(f"DEBUG: Syncing Job {job.id} (Slurm ID: {job.slurm_job_id})")
                res = requests.get(
                    f"{settings.EXTERNAL_JOB_API_URL}/status/{job.slurm_job_id}", 
                    timeout=4
                )
                
                print(f"DEBUG: External API Response: {res.status_code} - {res.text}")

                if res.status_code == 200:
                    # Expecting {"status": "string", ...} or just a status string depending on API
                    # Robustly handle both dict and string
                    try:
                        data = res.json()
                        ext_status = data.get("status") if isinstance(data, dict) else str(data)
                    except ValueError:
                        # If not JSON, maybe simple string
                        ext_status = res.text.strip().replace('"', '')

                    if ext_status:
                        # Normalize to lowercase to match internal Enum
                        normalized_status = ext_status.lower()
                        print(f"DEBUG: Normalized External Status: {normalized_status}")
                        
                        # Direct mapping check
                        if normalized_status != job.status.value:
                            # Map external states to internal states if strict schema
                            # SLURM states: COMPLETED, FAILED, RUNNING, PENDING, TIMEOUT, CANCELLED
                            # Broaden detection to catch all SLURM failure/terminal states
                            # Common SLURM states: COMPLETED, FAILED, RUNNING, PENDING, TIMEOUT, CANCELLED, NODE_FAIL, PREEMPTED, REVOKED, OUT_OF_MEMORY
                            if any(x in normalized_status for x in ["complete", "compl"]):
                                job.status = JobStatus.COMPLETED
                            elif any(x in normalized_status for x in ["fail", "timeout", "node_fail", "out_of_mem", "boot_fail", "revoked", "preempt"]):
                                job.status = JobStatus.FAILED
                            elif any(x in normalized_status for x in ["cancel", "cncl"]):
                                job.status = JobStatus.CANCELLED
                            elif any(x in normalized_status for x in ["run", "exec"]):
                                job.status = JobStatus.RUNNING
                            elif any(x in normalized_status for x in ["pend", "subm", "queue"]):
                                job.status = JobStatus.PENDING
                            else:
                                # Safe map of common SLURM terminal states that aren't explicit fails
                                if normalized_status in ['cd', 'f', 'to', 'nf', 'oom', 'rv', 'pr']:
                                    job.status = JobStatus.FAILED
                                if normalized_status == 'cg':
                                    job.status = JobStatus.RUNNING
                            
                            sync_needed = True
            except Exception as e:
                # Log error but don't block list retrieval
                print(f"Status sync failed for Job {job.id}: {e}")

    if sync_needed:
        db.commit()

    return jobs

@router.post("", response_model=JobSchema, status_code=status.HTTP_201_CREATED)
def create_job(
    *,
    db: Session = Depends(deps.get_db),
    job_in: JobCreate,
    current_user = Depends(deps.get_current_active_user),
) -> Any:
    """
    Create new job and dispatch to external Slurm service.
    """
    # 1. Validation: Prevent duplicate job designations for the same user
    existing_job = db.query(Job).filter(
        Job.job_name == job_in.job_name,
        Job.owner_id == current_user.id,
        Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING])
    ).first()
    
    if existing_job:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A workload named '{job_in.job_name}' is already active in your registry. Please use a unique designation."
        )

    # 2. Check Concurrent Limits
    is_jupyter = job_in.script_path == "__jupyter__"
    
    # Get current job counts for user
    active_batch = db.query(Job).filter(
        Job.owner_id == current_user.id,
        Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING]),
        Job.script_path != "__jupyter__"
    ).count()

    active_jupyter = db.query(Job).filter(
        Job.owner_id == current_user.id,
        Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING]),
        Job.script_path == "__jupyter__"
    ).count()

    # Get system limits
    def get_limit(key, default):
        s = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        return int(s.value) if s and s.value.isdigit() else default

    limit_batch = get_limit("max_batch_jobs_per_user", 10)
    limit_jupyter = get_limit("max_jupyter_jobs_per_user", 2)

    if is_jupyter and active_jupyter >= limit_jupyter:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Jupyter session quota reached ({limit_jupyter}). Please terminate existing sessions before creating more."
        )
    
    if not is_jupyter and active_batch >= limit_batch:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Batch job limit reached ({limit_batch}). Please wait for active jobs to complete or increase your quota."
        )

    # 3. Resource Quota Aggregation & Enforcement
    # Sum up resources currently in use by this user across all active states
    active_usage = db.query(Job).filter(
        Job.owner_id == current_user.id,
        Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING])
    ).all()
    
    current_cpu_sum = sum(getattr(j, 'total_cpu', 1) for j in active_usage) or 0
    current_ram_sum = sum(getattr(j, 'total_ram', 1) for j in active_usage) or 0
    
    user_cpu_hard_limit = current_user.cpu_limit or 1
    user_ram_hard_limit = current_user.memory_limit_gb or 1
    is_privileged = current_user.role in ["admin", "developer"]

    # 3.1 Resource Normalization
    requested_cpu = job_in.total_cpu or 1
    requested_ram = job_in.total_ram or 1

    if not is_privileged:
        # Check individual job request against HARD LIMIT
        if requested_cpu > user_cpu_hard_limit:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Requested CPU ({requested_cpu}) exceeds your quota ({user_cpu_hard_limit})"
            )
        if requested_ram > user_ram_hard_limit:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Requested RAM ({requested_ram}GB) exceeds your quota ({user_ram_hard_limit}GB)"
            )

        # Check aggregate usage
        if (current_cpu_sum + requested_cpu) > user_cpu_hard_limit:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Total CPU limit exceeded. You have {current_cpu_sum}/{user_cpu_hard_limit} cores active. Requesting {requested_cpu} more."
            )
        if (current_ram_sum + requested_ram) > user_ram_hard_limit:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Total RAM limit exceeded. You have {current_ram_sum}/{user_ram_hard_limit}GB active. Requesting {requested_ram}GB more."
            )

    # 3.2 specialized config
    if is_jupyter:
        job_in.total_cpu = requested_cpu
        job_in.total_ram = requested_ram
        job_in.walltime = job_in.walltime or "24:00:00"
        job_in.resource_mode = job_in.resource_mode or "node_wise"
    else:
        # SBATCH configuration
        job_in.total_cpu = requested_cpu
        job_in.total_ram = requested_ram

    # 4. Initialize DB Record
    job = Job(
        **job_in.dict(exclude={'status'}),
        owner_id=current_user.id,
        status=JobStatus.PENDING
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # 2. Preparation for External Call
    user_root = get_user_storage_path(current_user.username)
    script_full_path = safe_path_join(user_root, job_in.script_path)
    
    if job_in.script_path != "__jupyter__" and not os.path.exists(script_full_path):
        job.status = JobStatus.FAILED
        job.error_log = f"Source script not found: {job_in.script_path}"
        db.commit()
        raise HTTPException(status_code=404, detail=f"Script file not found in cluster storage: {job_in.script_path}")

    # Determine Project Name and Entry Point
    # If script_path is "project/main.py", project_name="project", entry_point="main.py"
    # If script_path is "main.py", project_name="root", entry_point="main.py"
    
    # Normalize paths

    rel_path = job_in.script_path.strip("/")
   
    # User Request: Pass full path (e.g. test/demo_test.py) as entry_point
    # properly instead of splitting it.
    project_name = "root"
    entry_point = rel_path

    # Determine requirements file path (Absolute path required by API)
    req_abs_path = None
    if job_in.requirements_path:
        req_abs_path = safe_path_join(user_root, job_in.requirements_path)
    # else:
    #     # Auto-detection removed per user request (Step 3506)
    #     # Do not implicitly pass requirements if not selected.
    #     pass

    try:
        # 3. Dispatch to External Service (JSON Payload)
        payload = {
            "username": current_user.username,
            "project_name": project_name,
            "entry_point": entry_point,
            "total_cpu": job_in.total_cpu or 1,
            "total_ram": job_in.total_ram or 1,
            "resource_mode": job_in.resource_mode or "node_wise",
            "time": job_in.walltime or "00:10:00",
            "command_args": "", # Future extension
            "requirements_path": req_abs_path
        }

        # Clean None values if necessary, or API robustness
        # API expects requirements_path is optional string.
        
        print(f"DEBUG: Submitting payload to SLURM API: {payload}")

        response = requests.post(
            f"{settings.EXTERNAL_JOB_API_URL}/submit",
            json=payload,
            timeout=30
        )
        
        if response.status_code in [200, 201]:
            # Success: External service accepted the job
            res_data = response.json()
            # res_data example: {"job_id": "123456", "status": "SUBMITTED"}
            
            job.slurm_job_id = str(res_data.get("job_id"))
            job.status = JobStatus.PENDING # Map 'SUBMITTED' to 'PENDING'
            job.output_log = f"Job dispatched successfully. ID: {job.slurm_job_id}"
        else:
            # Failure
            job.status = JobStatus.FAILED
            job.error_log = f"External API Error ({response.status_code}): {response.text}"
            
    except Exception as e:
        job.status = JobStatus.FAILED
        job.error_log = f"Dispatch Interruption: {str(e)}"
    
    db.commit()
    db.refresh(job)
    return job

@router.get("/{job_id}", response_model=JobSchema)
def read_job(
    job_id: int,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user),
) -> Any:
    """
    Get job by ID.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if current_user.role != "admin" and job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return job

@router.delete("/{job_id}", response_model=JobSchema)
def delete_job(
    *,
    db: Session = Depends(deps.get_db),
    job_id: int,
    current_user = Depends(deps.get_current_active_user),
) -> Any:
    """
    Delete a job and cancel it remotely.
    """
    job = db.query(Job).options(joinedload(Job.owner)).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if current_user.role != "admin" and job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Remote Cancellation
    if job.slurm_job_id and job.status in [JobStatus.PENDING, JobStatus.RUNNING]:
        try:
             requests.post(
                f"{settings.EXTERNAL_JOB_API_URL}/cancel/{job.slurm_job_id}",
                timeout=10
            )
             print(f"Cancelled remote job {job.slurm_job_id}")
        except Exception as e:
            print(f"Failed to cancel remote job: {e}")

    db.delete(job)
    db.commit()
    return job

@router.post("/{job_id}/stop", response_model=JobSchema)
def stop_job(
    *,
    db: Session = Depends(deps.get_db),
    job_id: int,
    current_user = Depends(deps.get_current_active_user),
) -> Any:
    """
    Stop an active job.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if current_user.role not in ["admin", "developer"] and job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Remote Cancellation
    if job.slurm_job_id and job.status in [JobStatus.PENDING, JobStatus.RUNNING]:
        try:
             requests.post(
                f"{settings.EXTERNAL_JOB_API_URL}/cancel/{job.slurm_job_id}",
                timeout=10
            )
             job.status = JobStatus.CANCELLED
             db.commit()
             db.refresh(job)
        except Exception as e:
            print(f"Failed to stop remote job: {e}")
            raise HTTPException(status_code=500, detail="Failed to communicate with cluster controller.")

    return job

@router.get("/{job_id}/logs")
def stream_job_logs(
    job_id: int,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user),
):
    """
    Proxy live logs from the external Job API.
    """
    job = db.query(Job).options(joinedload(Job.owner)).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    if current_user.role != "admin" and job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if not job.slurm_job_id:
        # If no external ID, just return static logs as a stream
        def iter_static():
             yield (job.output_log or "No external ID. Logs not available.").encode('utf-8')
        return StreamingResponse(iter_static(), media_type="text/plain")

    # Proxy to internal endpoint: /logs/{username}/{job_id}
    target_url = f"{settings.EXTERNAL_JOB_API_URL}/logs/{job.owner.username}/{job.slurm_job_id}"
    
    def iter_file():
        try:
            with requests.get(target_url, stream=True, timeout=60) as r:
                if r.status_code != 200:
                   yield f"Connection Error: {r.status_code} - {r.text}".encode('utf-8')
                   return
                
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:
                        yield chunk
        except Exception as e:
            yield f"Stream Interrupted: {str(e)}".encode('utf-8')

    return StreamingResponse(iter_file(), media_type="text/plain")
