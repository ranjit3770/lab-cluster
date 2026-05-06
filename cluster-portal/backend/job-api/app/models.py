from app.database import get_db

def insert_job_log(job_id: str, job, plan_data, status="PENDING"):
    import json

    def to_int(value, default=0):
        try:
            raw = str(value).strip()
            if not raw or raw.upper() in {"N/A", "NA", "NONE", "NULL", "UNKNOWN", "(NULL)"}:
                return default
            return int(float(raw))
        except Exception:
            return default

    db = get_db()
    cur = db.cursor()

    cur.execute("""
        INSERT INTO job_logs (
            job_id, username, project_name, entry_point,
            total_cpu, total_ram, resource_mode, walltime,
            command_args, requirements_path, status,
            job_type, partition_name, ntasks, cpus_per_task,
            gpu_count, warnings, planner_explanation, node_distribution
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, (
        job_id,
        job.username,
        job.project_name,
        job.entry_point,
        job.total_cpu,
        to_int(plan_data.get("mem", job.total_ram), 1),
        job.resource_mode,
        job.time,
        job.command_args,
        job.requirements_path,
        status,
        plan_data.get("job_type"),
        plan_data.get("partition"),
        plan_data.get("ntasks"),
        plan_data.get("cpus_per_task"),
        plan_data.get("gpu_count", 0),
        ", ".join(plan_data.get("warnings", [])),
        "\n".join(plan_data.get("explanations", [])),
        json.dumps(plan_data.get("node_distribution", []), default=str),
    ))

    db.commit()
    cur.close()
    db.close()


def update_job_status(job_id: str, status: str):
    db = get_db()
    cur = db.cursor()
    cur.execute(
        "UPDATE job_logs SET status=%s WHERE job_id=%s",
        (status, job_id)
    )
    db.commit()
    cur.close()
    db.close()

def get_job_log_status(job_id: str):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT status FROM job_logs WHERE job_id=%s", (job_id,))
    row = cur.fetchone()
    cur.close()
    db.close()
    return row[0] if row else None

def queue_job_locally(job):
    """
    Persists a job in the local job_queue table for later dispatch by the background worker.
    """
    import uuid
    import json
    db = get_db()
    cur = db.cursor()
    
    local_id = f"LOCAL-{uuid.uuid4().hex[:8]}"
    
    # Extract data for serialized payload
    # Handles both JobRequest pydantic and SimpleNamespace
    try:
        if hasattr(job, 'dict'):
             payload_dict = job.dict()
        else:
             payload_dict = {
                "username": job.username,
                "project_name": job.project_name,
                "entry_point": job.entry_point,
                "total_cpu": job.total_cpu,
                "total_ram": job.total_ram,
                "resource_mode": getattr(job, 'resource_mode', "node_wise"),
                "time": getattr(job, 'time', "00:10:00"),
                "command": getattr(job, 'command', None),
                "command_args": getattr(job, 'command_args', ""),
                "requirements_path": getattr(job, 'requirements_path', ""),
                "ntasks": getattr(job, 'ntasks', None),
                "cpus_per_task": getattr(job, 'cpus_per_task', None),
                "job_type": getattr(job, 'job_type', "single_node"),
                "partition": getattr(job, 'partition', None),
                "gpu_count": getattr(job, 'gpu_count', 0),
                "mem_per_cpu": getattr(job, 'mem_per_cpu', None),
                "constraint": getattr(job, 'constraint', None)
            }
    except:
        payload_dict = {"error": "serialization_failed"}
    
    payload_str = json.dumps(payload_dict)
    
    try:
        # 1. Insert into job_logs with WAITING status
        # Note: we need to pass a mock plan_data since it's not yet planned
        mock_plan = {
            "job_type": getattr(job, 'job_type', "single_node"),
            "partition": getattr(job, 'partition', None),
            "ntasks": getattr(job, 'ntasks', 1),
            "cpus_per_task": getattr(job, 'cpus_per_task', 1),
            "gpu_count": getattr(job, 'gpu_count', 0),
            "warnings": ["User quota exceeded. Queued locally."]
        }
        insert_job_log(local_id, job, mock_plan, status="WAITING")
        
        # 2. Insert into job_queue
        cur.execute("""
            INSERT INTO job_queue (job_id, username, status, payload)
            VALUES (%s, %s, 'WAITING', %s)
        """, (local_id, job.username, payload_str))
        
        db.commit()
    except Exception as e:
        print(f"[ERROR] Local queuing failed: {e}")
        return None
    finally:
        cur.close()
        db.close()
        
    return local_id
