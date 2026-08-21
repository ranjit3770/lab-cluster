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
from app.core.slurm_api import get_slurm_env
import os

router = APIRouter()

def _safe_int(value, default=0):
    try:
        raw = str(value).strip()
        if not raw or raw.upper() in {"N/A", "NA", "NONE", "NULL", "UNKNOWN", "(NULL)"}:
            return default
        return int(float(raw.rstrip("M").rstrip("G")))
    except Exception:
        return default

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
    sync_needed = False
    from datetime import datetime, timedelta
    
    for job in jobs:
        if job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.UNKNOWN]:
            continue

        if job.status in [JobStatus.PENDING, JobStatus.WAITING, JobStatus.RUNNING] and job.slurm_job_id:
            try:
                # Call external API: GET /status/{job.slurm_job_id}
                print(f"DEBUG: Syncing Job {job.id} (Slurm ID: {job.slurm_job_id})")
                res = requests.get(
                    f"{settings.EXTERNAL_JOB_API_URL}/status/{job.slurm_job_id}", 
                    timeout=4
                )
                
                print(f"DEBUG: External API Response: {res.status_code} - {res.text}")

                if res.status_code == 200:
                    try:
                        data = res.json()
                        ext_status = data.get("status") if isinstance(data, dict) else str(data)
                    except ValueError:
                        ext_status = res.text.strip().replace('"', '')

                    if ext_status:
                        normalized_status = ext_status.lower()
                        print(f"DEBUG: Normalized External Status: {normalized_status}")
                        
                        if normalized_status in ["not_found", "unknown"]:
                            job.status = JobStatus.UNKNOWN
                            sync_needed = True
                        elif normalized_status != job.status.value:
                            if any(x in normalized_status for x in ["complete", "compl"]):
                                job.status = JobStatus.COMPLETED
                            elif any(x in normalized_status for x in ["cancel", "cncl", "timeout"]):
                                job.status = JobStatus.CANCELLED
                            elif any(x in normalized_status for x in ["fail", "node_fail", "out_of_mem", "boot_fail", "revoked", "preempt"]):
                                job.status = JobStatus.FAILED
                            elif any(x in normalized_status for x in ["run", "exec"]):
                                job.status = JobStatus.RUNNING
                            elif any(x in normalized_status for x in ["pend", "subm", "queue"]):
                                job.status = JobStatus.PENDING
                            elif any(x in normalized_status for x in ["wait", "quota"]):
                                job.status = JobStatus.WAITING
                            else:
                                if normalized_status in ['cd', 'f', 'to', 'nf', 'oom', 'rv', 'pr']:
                                    job.status = JobStatus.FAILED
                                elif normalized_status == 'cg':
                                    job.status = JobStatus.RUNNING
                                else:
                                    job.status = JobStatus.UNKNOWN
                            
                            # Update Quota Info
                            if isinstance(data, dict) and data.get("quota_status"):
                                job.quota_status = data.get("quota_status")

                            if isinstance(data, dict) and job.status == JobStatus.FAILED:
                                reason = data.get("reason") or data.get("detail") or "Slurm reported job failure."
                                exit_code = data.get("exit_code") or ""
                                node = data.get("node_list") or data.get("batch_host") or ""
                                stdout = data.get("stdout") or ""
                                stderr = data.get("stderr") or ""
                                job.error_log = "\n".join([
                                    f"Slurm job failed: {reason}",
                                    f"Exit code: {exit_code}" if exit_code else "",
                                    f"Node: {node}" if node else "",
                                    f"Stdout: {stdout}" if stdout else "",
                                    f"Stderr: {stderr}" if stderr else "",
                                ]).strip()
                                
                            sync_needed = True
            except Exception as e:
                # Log error but don't block list retrieval
                print(f"Status sync failed for Job {job.id}: {e}")
        elif job.status == JobStatus.WAITING and not job.slurm_job_id:
            # For WAITING jobs without slurm_job_id, we can't sync with slurm, but we might 
            # want to check if they've been promoted. But the status returned by job-api 
            # for a Q- ID is WAITING anyway. 
            pass

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

    # 3. Resource Quota Aggregation & Enforcement (SOFT VALIDATION)
    # Goal: Warn if over quota, but always allow submission unless it's a massive system-breaking request
    is_privileged = current_user.role in ["admin", "developer"]
    requested_cpu = job_in.total_cpu or 1
    requested_ram = job_in.total_ram or 1
    
    warnings = []
    if not is_privileged:
        # Fetch current user's aggregate usage for advisory warnings
        current_cpu_sum = 0
        current_ram_sum = 0
        try:
            import subprocess
            output = subprocess.check_output(
                ["squeue", "-u", current_user.username, "--noheader", "--format=%C %m"],
                env=get_slurm_env()
            ).decode()
            for line in output.strip().split('\n'):
                if not line.strip(): continue
                parts = line.split()
                if len(parts) >= 2:
                    current_cpu_sum += _safe_int(parts[0], 0)
                    ram_str = parts[1].rstrip('M').rstrip('G')
                    try:
                        val = _safe_int(ram_str, 0)
                        if 'G' in parts[1]: val *= 1024
                        current_ram_sum += float(val) / 1024.0
                    except:
                        pass
        except Exception:
            pass
        
        user_cpu_hard_limit = current_user.cpu_limit or 100 # Default fallback
        user_ram_hard_limit = current_user.memory_limit_gb or 256
        
        if (current_cpu_sum + requested_cpu) > user_cpu_hard_limit:
            warnings.append(f"ADVISORY: You are utilizing {current_cpu_sum}/{user_cpu_hard_limit} CPUs. This submission may experience queuing delays.")
        if (current_ram_sum + requested_ram) > user_ram_hard_limit:
            warnings.append(f"ADVISORY: You are utilizing {current_ram_sum}/{user_ram_hard_limit}GB RAM. This submission may experience queuing delays.")

    # 4. Initialize DB Record
    job = Job(
        **job_in.dict(exclude={'status'}),
        owner_id=current_user.id,
        status=JobStatus.PENDING
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # 5. Dispatch to External Slurm Service
    user_root = get_user_storage_path(current_user.username)
    script_full_path = safe_path_join(user_root, job_in.script_path)
    if job_in.script_path != "__jupyter__" and not os.path.exists(script_full_path):
        job.status = JobStatus.FAILED
        job.error_log = f"Source script not found: {job_in.script_path}"
        db.commit()
        raise HTTPException(status_code=404, detail="Source file not found")

    rel_path = job_in.script_path.strip("/")
    req_abs_path = safe_path_join(user_root, job_in.requirements_path) if job_in.requirements_path else None

    try:
        # Build payload — backend handles all Slurm-native mapping
        payload = {
            "username": current_user.username,
            "project_name": job_in.job_name,
            "entry_point": rel_path,
            "total_cpu": requested_cpu,
            "total_ram": requested_ram,
            "resource_mode": job_in.resource_mode or "node_wise",
            "time": job_in.walltime or "00:30:00",
            "command": None,
            "command_args": "", 
            "requirements_path": req_abs_path,
            
            # Slurm-native fields (backend derives defaults if None)
            "ntasks": job_in.ntasks,
            "cpus_per_task": job_in.cpus_per_task,
            "job_type": job_in.job_type or "single_node",
            "partition": job_in.partition,
            "gpu_count": job_in.gpu_count or 0,
            "mem_per_cpu": job_in.mem_per_cpu,
            "constraint": job_in.constraint
        }

        response = requests.post(
            f"{settings.EXTERNAL_JOB_API_URL}/submit",
            json=payload,
            timeout=30
        )
        
        if response.status_code in [200, 201]:
            res_data = response.json()
            
            job.slurm_job_id = str(res_data.get("job_id"))
            job.status = res_data.get("status", JobStatus.PENDING)
            
            # Combine warnings (advisory only, never blocking)
            ext_warnings = res_data.get("warnings", [])
            all_warnings = warnings + ext_warnings
            
            # Build clean output log
            log_lines = [f"Job submitted successfully. ID: {job.slurm_job_id}"]

            allocation = res_data.get("allocation") or {}
            if allocation:
                job.ntasks = allocation.get("ntasks") or job.ntasks
                job.cpus_per_task = allocation.get("cpus_per_task") or job.cpus_per_task
                job.mem_per_cpu = allocation.get("mem_per_cpu_mb") or job.mem_per_cpu
                log_lines.append(
                    "Optimized allocation: "
                    f"{allocation.get('ntasks')} tasks x {allocation.get('cpus_per_task')} CPU/task, "
                    f"{allocation.get('mem_per_cpu_mb')}MB per CPU"
                )

            explanations = res_data.get("explanation") or []
            for explanation in explanations:
                log_lines.append(f"[PLAN] {explanation}")

            distribution = res_data.get("expected_node_distribution") or []
            if distribution:
                compact = ", ".join(
                    f"{item.get('node')}:{item.get('tasks')} tasks"
                    for item in distribution[:12]
                )
                log_lines.append(f"Expected node distribution: {compact}")

            if res_data.get("audit_log_path"):
                log_lines.append(f"Submission audit log: {res_data.get('audit_log_path')}")
            
            # Jupyter access info
            jupyter_port = res_data.get("jupyter_port")
            jupyter_token = res_data.get("jupyter_token")
            if jupyter_port:
                log_lines.append(f"Jupyter port: {jupyter_port}")
                if jupyter_token:
                    log_lines.append(f"Access token: {jupyter_token}")
                log_lines.append("Jupyter URL will be available once the job starts running on a compute node.")
            
            if all_warnings:
                for w in all_warnings:
                    log_lines.append(f"[INFO] {w}")
            
            job.output_log = "\n".join(log_lines)
            if job.status == JobStatus.WAITING:
                # Requirement: Use the LOCAL- ID returned by job-api
                # log_lines was already set above
                pass
        else:
            job.status = JobStatus.FAILED
            job.error_log = f"Submission error ({response.status_code}): {response.text}"
            
    except Exception as e:
        job.status = JobStatus.FAILED
        job.error_log = f"Connection error: {str(e)}"
    
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

@router.get("/{job_id}/jupyter-url")
def get_jupyter_url(
    job_id: int,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user),
):
    """
    Resolve the Jupyter access URL for a running Jupyter job.
    Proxies to the Job-API's jupyter-url endpoint.
    """
    job = db.query(Job).options(joinedload(Job.owner)).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if current_user.role != "admin" and job.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if not job.slurm_job_id:
        raise HTTPException(status_code=400, detail="Job has no Slurm ID yet")
    
    if job.script_path != "__jupyter__":
        raise HTTPException(status_code=400, detail="This is not a Jupyter job")
    
    try:
        res = requests.get(
            f"{settings.EXTERNAL_JOB_API_URL}/jupyter-url/{job.slurm_job_id}",
            timeout=10
        )
        if res.status_code == 200:
            return res.json()
        else:
            raise HTTPException(status_code=res.status_code, detail=res.text)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to resolve Jupyter URL: {str(e)}")

@router.post("/bulk-delete", response_model=dict)
def bulk_delete_jobs(
    *,
    db: Session = Depends(deps.get_db),
    payload: dict,
    current_user = Depends(deps.get_current_active_user),
) -> Any:
    """
    Bulk delete jobs.
    """
    import sqlalchemy as sa
    job_ids = payload.get("job_ids", [])
    if not job_ids:
        return {"deleted": 0}

    # Fetch jobs to verify ownership
    if current_user.role == "admin":
        # Check by Slurm ID (string) or internal ID (int)
        all_jobs = db.query(Job).filter(
            sa.or_(
                Job.slurm_job_id.in_([str(jid) for jid in job_ids]),
                Job.id.in_([jid for jid in job_ids if isinstance(jid, int)])
            )
        ).all()
    else:
        all_jobs = db.query(Job).filter(
            Job.owner_id == current_user.id,
            sa.or_(
                Job.slurm_job_id.in_([str(jid) for jid in job_ids]),
                Job.id.in_([jid for jid in job_ids if isinstance(jid, int)])
            )
        ).all()

    if not all_jobs:
        return {"deleted": 0}

    # Collect actual IDs to send to external API
    external_ids = [j.slurm_job_id for j in all_jobs if j.slurm_job_id]
    
    try:
        if external_ids:
            # 1. External API Bulk Delete
            requests.post(
                f"{settings.EXTERNAL_JOB_API_URL}/bulk-delete",
                json={"job_ids": external_ids},
                timeout=10
            )
    except:
        pass # Best effort cancellation

    # 2. Local DB Purge
    count = 0
    for j in all_jobs:
        db.delete(j)
        count += 1
    
    db.commit()
    return {"deleted": count}
