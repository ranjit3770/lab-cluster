from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from pydantic import BaseModel
from typing import Optional
import json
from threading import Thread
import time

from app.schemas import JobRequest, JobResponse
from app.slurm import submit_job, get_slurm_env, get_slurm_jwt
from app.planner import plan_resources
from app.streamer import combined_log_stream
from app.status import job_status, cancel_job
from app.models import insert_job_log, update_job_status, get_job_log_status
from app.config import MYSQL_CONFIG, SLURM_REST_URL, SLURM_JWT_USER
import mysql.connector
import requests

def setup_database():
    import mysql.connector
    from app.config import MYSQL_CONFIG
    import subprocess
    import os
    
    db_name = MYSQL_CONFIG["database"]
    db_user = MYSQL_CONFIG["user"]
    db_pass = MYSQL_CONFIG["password"]
    db_host = MYSQL_CONFIG["host"]
    db_port = MYSQL_CONFIG["port"]

    
    print(f"ENSURING JOB DATABASE '{db_name}' EXISTS...")
    
    # CLI Repair Attempt (Most robust for Linux host environments)
    try:
        # Check if mysql command exists
        devnull = open(os.devnull, 'w')
        if subprocess.call(["which", "mysql"], stdout=devnull, stderr=devnull) == 0:
            # Try CLI with portal's default root password (Amma@123)
            root_p = os.getenv("MYSQL_ROOT_PASSWORD", "Amma@123")
            
            # Helper to run mysql command with optional password
            def run_mysql(cmd):
                # Try with password and explicit host/port, disabling SSL for internal network
                res = subprocess.run(["mysql", "-h", db_host, "-P", str(db_port), "--ssl=0", "-u", "root", f"-p{root_p}", "-e", cmd], capture_output=True, text=True)
                if res.returncode != 0:
                    # Try without password but with host/port
                    subprocess.run(["mysql", "-h", db_host, "-P", str(db_port), "--ssl=0", "-u", "root", "-e", cmd], check=False)

            run_mysql(f"CREATE DATABASE IF NOT EXISTS {db_name};")
            run_mysql(f"CREATE USER IF NOT EXISTS '{db_user}'@'%' IDENTIFIED BY '{db_pass}';")
            run_mysql(f"GRANT ALL PRIVILEGES ON {db_name}.* TO '{db_user}'@'%';")
            # CRITICAL: Grant access to strach_portal for maintenance and config checks
            run_mysql(f"GRANT ALL PRIVILEGES ON strach_portal.* TO '{db_user}'@'%';")
            run_mysql("FLUSH PRIVILEGES;")
            
            # Also try sudo as fallback (pointing to the database host/port, disabling SSL)
            subprocess.run(["sudo", "mysql", "-h", db_host, "-P", str(db_port), "--ssl=0", "-e", f"CREATE DATABASE IF NOT EXISTS {db_name};"], check=False)
            subprocess.run(["sudo", "mysql", "-h", db_host, "-P", str(db_port), "--ssl=0", "-e", f"CREATE USER IF NOT EXISTS '{db_user}'@'%' IDENTIFIED BY '{db_pass}';"], check=False)
            subprocess.run(["sudo", "mysql", "-h", db_host, "-P", str(db_port), "--ssl=0", "-e", f"GRANT ALL PRIVILEGES ON {db_name}.* TO '{db_user}'@'%';"], check=False)
            subprocess.run(["sudo", "mysql", "-h", db_host, "-P", str(db_port), "--ssl=0", "-e", f"GRANT ALL PRIVILEGES ON strach_portal.* TO '{db_user}'@'%';"], check=False)
            subprocess.run(["sudo", "mysql", "-h", db_host, "-P", str(db_port), "--ssl=0", "-e", "FLUSH PRIVILEGES;"], check=False)
    except Exception as e:
        print(f"CLI DB setup attempt skipped: {e}")

    # Create tables via connection
    try:
        # Fallback to creating DB via connection if user exists but DB doesn't
        try:
            db_creator = mysql.connector.connect(host=db_host, port=db_port, user=db_user, password=db_pass)
            cursor = db_creator.cursor()
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {db_name}")
            db_creator.commit()
            cursor.close()
            db_creator.close()
        except:
            pass

        # Real connection to sync tables
        db = mysql.connector.connect(host=db_host, port=db_port, user=db_user, password=db_pass, database=db_name)
        cur = db.cursor()
        
        # 1. Expand job_logs
        cur.execute("""
            CREATE TABLE IF NOT EXISTS job_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_id VARCHAR(100) NOT NULL UNIQUE,
                username VARCHAR(100),
                project_name VARCHAR(200),
                entry_point VARCHAR(200),
                total_cpu INT,
                total_ram INT,
                resource_mode VARCHAR(50),
                walltime VARCHAR(100),
                command_args TEXT,
                requirements_path VARCHAR(1000),
                status VARCHAR(50),
                
                # New Slurm-native columns
                job_type VARCHAR(50),
                partition_name VARCHAR(100),
                ntasks INT,
                cpus_per_task INT,
                gpu_count INT DEFAULT 0,
                quota_status VARCHAR(50) DEFAULT 'NORMAL',
                warnings TEXT,
                optimized_script MEDIUMTEXT,
                planner_explanation TEXT,
                node_distribution TEXT,
                audit_log_path VARCHAR(1000),

                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        """)
        db.commit()

        # 2. Create user_quota
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_quota (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(100) NOT NULL UNIQUE,
                max_cpu INT DEFAULT 8,
                max_ram_gb INT DEFAULT 16,
                max_gpu_count INT DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        """)
        db.commit()

        # 3. Create job_runtime (tracks Jupyter ports, compute nodes, tokens)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS job_runtime (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_id VARCHAR(100) NOT NULL UNIQUE,
                slurm_job_id VARCHAR(100),
                username VARCHAR(100),
                port INT,
                token VARCHAR(200),
                node VARCHAR(200),
                job_type VARCHAR(50),
                status VARCHAR(50) DEFAULT 'PENDING',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.commit()

        # Soft migration: add token/status to job_runtime if missing
        for col_name, col_type in [("token", "VARCHAR(200)"), ("status", "VARCHAR(50) DEFAULT 'PENDING'")]:
            try:
                cur.execute(f"SHOW COLUMNS FROM job_runtime LIKE '{col_name}'")
                if not cur.fetchone():
                    cur.execute(f"ALTER TABLE job_runtime ADD COLUMN {col_name} {col_type}")
                    db.commit()
            except: pass
        
        # 4. Create local job_queue for quota enforcement
        print("ALEMBIC-LESS MIGRATION: Creating job_queue table...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS job_queue (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_id VARCHAR(100) NOT NULL UNIQUE,
                username VARCHAR(100) NOT NULL,
                status VARCHAR(50) DEFAULT 'WAITING',
                priority INT DEFAULT 0,
                payload TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.commit()

        # Check if payload column exists
        try:
            cur.execute("SHOW COLUMNS FROM job_queue LIKE 'payload'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE job_queue ADD COLUMN payload TEXT")
                db.commit()
        except: pass

        # 5. Soft Migrations
        cols_to_add = [
            ("job_type", "VARCHAR(50)"),
            ("partition_name", "VARCHAR(100)"),
            ("ntasks", "INT"),
            ("cpus_per_task", "INT"),
            ("gpu_count", "INT DEFAULT 0"),
            ("quota_status", "VARCHAR(50) DEFAULT 'NORMAL'"),
            ("warnings", "TEXT"),
            ("optimized_script", "MEDIUMTEXT"),
            ("planner_explanation", "TEXT"),
            ("node_distribution", "TEXT"),
            ("audit_log_path", "VARCHAR(1000)")
        ]
        
        for col_name, col_type in cols_to_add:
            try:
                cur.execute(f"SHOW COLUMNS FROM job_logs LIKE '{col_name}'")
                if not cur.fetchone():
                    cur.execute(f"ALTER TABLE job_logs ADD COLUMN {col_name} {col_type}")
                    db.commit()
            except: pass

        cur.close()
        db.close()
        print("JOB DATABASE TABLES AND METADATA SYNCED.")
    except Exception as e:
        print(f"JOB DATABASE SETUP ERROR: {e}")

setup_database()

# --- Background Queue Processor ---

def queue_worker():
    """
    Periodically checks the local job_queue and attempts to dispatch jobs to Slurm
    if the user's quota allows.
    """
    print("[QUEUE-WORKER] Started background dispatcher.")
    from app.slurm import get_slurm_usage, get_db_limit, get_user_quota, submit_job
    from app.models import update_job_status
    
    import mysql.connector
    from app.config import MYSQL_CONFIG
    
    while True:
        try:
            db = mysql.connector.connect(**MYSQL_CONFIG)
            cur = db.cursor(dictionary=True)
            
            # Fetch WAITING jobs ordered by priority and time
            cur.execute("SELECT * FROM job_queue WHERE status = 'WAITING' ORDER BY priority DESC, created_at ASC")
            queued_jobs = cur.fetchall()
            
            for q_job in queued_jobs:
                local_job_id = q_job['job_id']
                username = q_job['username']
                payload_str = q_job['payload']
                
                if not payload_str:
                    continue
                
                try:
                    job_dict = json.loads(payload_str)
                    # Use a simple object to mimic JobRequest
                    from types import SimpleNamespace
                    job_obj = SimpleNamespace(**job_dict)
                    
                    # 1. Check current usage
                    live_cpu, live_ram = get_slurm_usage(username)
                    limits = get_db_limit(username)
                    local_quota = get_user_quota(username)
                    
                    # prioritized quota source
                    cpu_limit = limits.get('cpu_limit') if limits else None
                    if not cpu_limit:
                        cpu_limit = local_quota.get('max_cpu') if local_quota else 8
                        
                    ram_limit = limits.get('memory_limit_gb') if limits else None
                    if not ram_limit:
                        ram_limit = local_quota.get('max_ram_gb') if local_quota else 16
                    
                    requested_cpu = getattr(job_obj, 'total_cpu', 1)
                    requested_ram = getattr(job_obj, 'total_ram', 1)
                    
                    can_dispatch = False
                    # First job MUST ALWAYS go to Slurm
                    if live_cpu == 0 and live_ram == 0:
                        can_dispatch = True
                    elif (live_cpu + requested_cpu) <= cpu_limit and (live_ram + requested_ram) <= ram_limit:
                        can_dispatch = True
                    
                    if can_dispatch:
                        print(f"[QUEUE-WORKER] Dispatching job {local_job_id} for {username}...")
                        
                        # Atomic Promotion: submit_job now handles the log/runtime transition
                        slurm_id, warnings, quota_meta, j_port, j_token, orchestration_meta = submit_job(job_obj, bypass_quota=True, replace_id=local_job_id)
                        
                        if slurm_id and slurm_id != "QUOTA_EXCEEDED":
                            # 3. Mark as DISPATCHED in queue (Real Slurm ID is now in job_logs)
                            cur2 = db.cursor()
                            cur2.execute("DELETE FROM job_queue WHERE job_id = %s", (local_job_id,))
                            db.commit()
                            cur2.close()
                            
                            # 4. Update Main Gateway Database (strach_portal)
                            try:
                                gw_db = mysql.connector.connect(
                                    host=MYSQL_CONFIG["host"],
                                    port=MYSQL_CONFIG["port"],
                                    user=MYSQL_CONFIG["user"],
                                    password=MYSQL_CONFIG["password"],
                                    database="strach_portal"
                                )
                                gw_cur = gw_db.cursor()
                                # Requirements: Match the local_job_id in gateway and promote to real Slurm ID
                                gw_cur.execute(
                                    "UPDATE jobs SET slurm_job_id = %s, status = 'PENDING' WHERE slurm_job_id = %s",
                                    (slurm_id, local_job_id)
                                )
                                gw_db.commit()
                                gw_cur.close()
                                gw_db.close()
                            except Exception as gw_e:
                                print(f"[QUEUE-WORKER] Failed to update gateway DB: {gw_e}")
                            
                            print(f"[QUEUE-WORKER] Job {local_job_id} successfully promoted to Slurm {slurm_id}")
                except Exception as e:
                    print(f"[QUEUE-WORKER] Error processing queued job {local_job_id}: {e}")
            
            cur.close()
            db.close()
        except Exception as e:
            print(f"[QUEUE-WORKER] Loop error: {e}")
            
        time.sleep(10) # Run every 10 seconds

# Start worker thread
Thread(target=queue_worker, daemon=True).start()

from fastapi import Request
from fastapi.responses import JSONResponse
import mysql.connector
from app.config import MYSQL_CONFIG

# Maintenance Check Logic for Job-API (Cross-Database Check)
def check_maintenance(client_ip: str):
    try:
        # Connect to the MAIN portal database to check global maintenance state
        # Assume it's on the same host but named strach_portal
        db = mysql.connector.connect(
            host=MYSQL_CONFIG["host"],
            user=MYSQL_CONFIG["user"],
            password=MYSQL_CONFIG["password"],
            database="strach_portal"
        )
        cursor = db.cursor(dictionary=True)
        
        # 1. Check Mode
        cursor.execute("SELECT value FROM system_settings WHERE `key` = 'maintenance_mode'")
        mode = cursor.fetchone()
        
        if mode and mode['value'].lower() == 'true':
            # 2. Check Whitelist
            cursor.execute("SELECT id FROM maintenance_ips WHERE ip_address = %s", (client_ip,))
            whitelisted = cursor.fetchone()
            
            if not whitelisted:
                return True # Is in maintenance for this user
        
        cursor.close()
        db.close()
    except:
        # Fall open if DB check fails
        pass
    return False

from starlette.middleware.cors import CORSMiddleware

app = FastAPI(title="SLURM Job Submission API")

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Since it's internal API, but we can list if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def maintenance_middleware(request: Request, call_next):
    # Skip for root/health checks
    if request.url.path in ["/", "/health"]:
        return await call_next(request)
        
    if check_maintenance(request.client.host):
        response = JSONResponse(
            status_code=503,
            content={"detail": "WORKLOAD SUBSYSTEM MAINTENANCE: Compute fabric is currently restricted.", "maintenance": True}
        )
        # Manually add CORS headers for early 503 response
        origin = request.headers.get("origin")
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        return response
    return await call_next(request)

@app.get("/", response_class=HTMLResponse)
def root():
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>HPC Job API | Dispatcher Active</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Fira+Code:wght@400&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg: #030712;
                --primary: #fb7185;
                --primary-glow: rgba(251, 113, 133, 0.2);
                --success: #10b981;
                --card-bg: rgba(17, 24, 39, 0.7);
                --card-border: rgba(31, 41, 55, 1);
            }
            body {
                margin: 0;
                padding: 0;
                background: var(--bg);
                color: #f3f4f6;
                font-family: 'Inter', sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                overflow: hidden;
            }
            .grid {
                position: fixed;
                inset: 0;
                background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0);
                background-size: 40px 40px;
                z-index: -1;
            }
            .container {
                background: var(--card-bg);
                backdrop-filter: blur(12px);
                border: 1px solid var(--card-border);
                padding: 3rem;
                border-radius: 1.5rem;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
                max-width: 500px;
                width: 90%;
                text-align: center;
                animation: fadeIn 0.8s ease-out;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .badge {
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                background: rgba(16, 185, 129, 0.1);
                color: var(--success);
                padding: 0.5rem 1rem;
                border-radius: 9999px;
                font-size: 0.875rem;
                font-weight: 600;
                border: 1px solid rgba(16, 185, 129, 0.2);
                margin-bottom: 1.5rem;
            }
            .pulse {
                width: 8px;
                height: 8px;
                background: var(--success);
                border-radius: 50%;
                box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
                100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
            }
            h1 {
                margin: 0;
                font-size: 2.25rem;
                font-weight: 800;
                letter-spacing: -0.025em;
                background: linear-gradient(to bottom right, #fff, #9ca3af);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            p {
                color: #9ca3af;
                margin: 1rem 0 2rem 0;
                line-height: 1.6;
            }
            .terminal {
                background: #000;
                border-radius: 0.75rem;
                padding: 1rem;
                text-align: left;
                font-family: 'Fira Code', monospace;
                font-size: 0.8125rem;
                margin-bottom: 2rem;
                border: 1px solid #1f2937;
            }
            .line { display: block; margin-bottom: 0.25rem; }
            .key { color: var(--primary); }
            .val { color: #f3f4f6; }
            .btn {
                display: inline-block;
                background: var(--primary);
                color: #fff;
                padding: 0.75rem 2rem;
                border-radius: 0.75rem;
                font-weight: 600;
                text-decoration: none;
                transition: all 0.2s;
            }
            .btn:hover {
                transform: scale(1.02);
                box-shadow: 0 0 20px var(--primary-glow);
            }
        </style>
    </head>
    <body>
        <div class="grid"></div>
        <div class="container">
            <div class="badge">
                <div class="pulse"></div>
                DISPATCHER ACTIVE
            </div>
            <h1>Compute Dispatcher</h1>
            <p>HPC Workload Orchestration and Slurm Bridge API tier is currently processing fabric requests.</p>
            
            <div class="terminal">
                <span class="line"><span class="key">status:</span> <span class="val">"ready"</span></span>
                <span class="line"><span class="key">engine:</span> <span class="val">"Slurm-v0.0.41 (REST Enabled)"</span></span>
                <span class="line"><span class="key">concurrency:</span> <span class="val">"Active / 4-Workers"</span></span>
            </div>

            <a href="/docs" class="btn">API Explorer</a>
        </div>
    </body>
    </html>
    """

@app.get("/health")
def health():
    return {"status": "healthy", "service": "slurm-job-api"}

@app.get("/slurm/ping")
def ping_slurm():
    """Verify connectivity to Slurm REST API using JWT logic."""
    jwt = get_slurm_jwt()
    if not jwt:
        return {"ping": "FAILED", "reason": "Could not generate JWT token."}
    
    headers = {
        "X-SLURM-USER-NAME": SLURM_JWT_USER,
        "X-SLURM-USER-TOKEN": jwt
    }
    try:
        res = requests.get(f"{SLURM_REST_URL}/ping", headers=headers, timeout=5)
        return res.json()
    except Exception as e:
        return {"ping": "FAILED", "reason": str(e)}

@app.post("/plan")
def plan(job: JobRequest):
    """Preview the optimized Slurm plan without submitting to sbatch."""
    try:
        optimized = plan_resources(job)
        return {
            "status": "PLANNED",
            "warnings": optimized.get("warnings", []),
            "explanation": optimized.get("explanations", []),
            "expected_node_distribution": optimized.get("node_distribution", []),
            "allocation": {
                "ntasks": optimized.get("ntasks"),
                "cpus_per_task": optimized.get("cpus_per_task"),
                "mem_per_cpu_mb": optimized.get("mem_per_cpu"),
                "allocation_mode": optimized.get("allocation_mode"),
                "expected_node_count": optimized.get("expected_node_count"),
                "partition": optimized.get("partition"),
            },
            "sbatch_directives": optimized.get("sbatch_directives", []),
            "cluster_snapshot": optimized.get("cluster_snapshot", {}),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@app.post("/submit", response_model=JobResponse)
def submit(job: JobRequest):
    print(f"[SUBMIT] Incoming for {job.username}")
    
    # Check current usage vs quota before even attempting sbatch
    try:
        job_id, warnings, quota_meta, jupyter_port, jupyter_token, orchestration_meta = submit_job(job)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    
    if job_id == "QUOTA_EXCEEDED":
        # Handle Local Queueing
        from app.models import queue_job_locally
        local_id = queue_job_locally(job)
        if local_id:
            return {
                "job_id": local_id,
                "status": "WAITING",
                "warnings": ["Job queued locally: User resource quota exceeded."],
                **quota_meta,
                "explanation": orchestration_meta.get("plan", {}).get("explanations", []),
                "expected_node_distribution": orchestration_meta.get("plan", {}).get("node_distribution", []),
                "allocation": {
                    "status": "WAITING",
                    "reason": "quota_exceeded"
                }
            }
        else:
            raise HTTPException(status_code=500, detail="Quota exceeded and local queueing failed.")

    if not job_id:
        raise HTTPException(status_code=500, detail="Slurm submission failed unexpectedly.")

    result = {
        "job_id": job_id, 
        "status": "PENDING", 
        "warnings": warnings,
        **quota_meta,
        "optimized_sbatch_script": orchestration_meta.get("optimized_sbatch_script"),
        "explanation": orchestration_meta.get("explanation"),
        "expected_node_distribution": orchestration_meta.get("expected_node_distribution"),
        "allocation": orchestration_meta.get("allocation"),
        "audit_log_path": orchestration_meta.get("audit_log_path"),
    }
    if jupyter_port:
        result["jupyter_port"] = jupyter_port
    if jupyter_token:
        result["jupyter_token"] = jupyter_token
    return result

@app.get("/jupyter-url/{job_id}")
def get_jupyter_url(job_id: str):
    """
    Resolve the full Jupyter access URL for a running job.
    Queries Slurm for the allocated node and combines with stored port/token.
    """
    import subprocess as sp
    try:
        db = mysql.connector.connect(**MYSQL_CONFIG)
        cur = db.cursor(dictionary=True)
        cur.execute("SELECT * FROM job_runtime WHERE job_id = %s", (job_id,))
        runtime = cur.fetchone()
        cur.close()
        db.close()
        
        if not runtime:
            raise HTTPException(status_code=404, detail="No runtime info found for this job.")
        
        port = runtime.get('port')
        token = runtime.get('token', '')
        node = runtime.get('node')
        
        # Try to resolve node from Slurm if not yet known
        if not node:
            try:
                output = sp.check_output([
                    "squeue", "-j", str(job_id), "--noheader", "--format=%N"
                ], env=get_slurm_env()).decode().strip()
                if output:
                    node = output
                    # Persist the discovered node
                    try:
                        db2 = mysql.connector.connect(**MYSQL_CONFIG)
                        cur2 = db2.cursor()
                        cur2.execute("UPDATE job_runtime SET node=%s, status='RUNNING' WHERE job_id=%s", (node, job_id))
                        db2.commit()
                        cur2.close()
                        db2.close()
                    except: pass
            except:
                pass
        
        if not node:
            return {
                "status": "PENDING",
                "message": "Job is waiting for resources. Jupyter URL will be available once running.",
                "port": port
            }
        
        url = f"http://{node}:{port}"
        if token:
            url += f"?token={token}"
        
        return {
            "status": "RUNNING",
            "url": url,
            "port": port,
            "node": node,
            "token": token
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to resolve Jupyter URL: {str(e)}")

@app.get("/logs/{username}/{job_id}")
def logs(username: str, job_id: str):
    return StreamingResponse(
        combined_log_stream(username, job_id),
        media_type="text/plain"
    )

@app.get("/status/{job_id}")
def get_job_status_endpoint(job_id: str):
    s = job_status(job_id)
    # Fetch Quota Meta from DB
    try:
        db = mysql.connector.connect(**MYSQL_CONFIG)
        cur = db.cursor(dictionary=True)
        
        # If it's a local queued job (starts with LOCAL-)
        if job_id.startswith("LOCAL-"):
            cur.execute("SELECT status, quota_status FROM job_logs WHERE job_id=%s", (job_id,))
            row = cur.fetchone()
            cur.close()
            db.close()
            return {
                "job_id": job_id,
                "status": "WAITING",
                "quota_status": row['quota_status'] if row else "NORMAL"
            }
            
        cur.execute("SELECT status, quota_status FROM job_logs WHERE job_id=%s", (job_id,))
        row = cur.fetchone()
        cur.close()
        db.close()
        
        db_s = row['status'] if row else None
        q_s = row['quota_status'] if row else "NORMAL"
        
        # If Slurm doesn't have it in active queue, check DB/Sacct
        if s == "NOT_FOUND":
            # If it's a real Slurm job but not in squeue, it might be COMPLETED in DB/Sacct
            # Or if it's LOCAL-xxxx, it's still in the local queue WAITING
            if db_s in ["COMPLETED", "FAILED", "CANCELLED", "WAITING"]:
                return {
                    "job_id": job_id,
                    "status": db_s,
                    "quota_status": q_s
                }
            
            # Default fallback for missing jobs that aren't explicitly unfinished in DB
            return {
                "job_id": job_id,
                "status": "CANCELLED", 
                "quota_status": q_s
            }
            
        return {"job_id": job_id, "status": s, "quota_status": q_s}
    except:
        return {"job_id": job_id, "status": s, "quota_status": "NORMAL"}

@app.post("/cancel/{job_id}")
def cancel(job_id: str):
    try:
        # 1. Check if it's a local queued job (LOCAL- / Q- prefix)
        if job_id.startswith("LOCAL-") or job_id.startswith("Q-"):
            db = mysql.connector.connect(**MYSQL_CONFIG)
            cur = db.cursor()
            cur.execute("DELETE FROM job_queue WHERE job_id = %s", (job_id,))
            cur.execute("UPDATE job_logs SET status = 'CANCELLED' WHERE job_id = %s", (job_id,))
            db.commit()
            cur.close()
            db.close()
            return {"job_id": job_id, "status": "CANCELLED"}

        # 2. Real Slurm Termination via REST
        from app.status import cancel_job
        res = cancel_job(job_id)
        if res == "CANCELLED":
            from app.models import update_job_status
            update_job_status(job_id, 'CANCELLED')
            return {"job_id": job_id, "status": "CANCELLED"}
        else:
            raise HTTPException(status_code=500, detail=f"Slurm REST cancellation failed: {res}")
    except Exception as e:
        print(f"[ERROR] Cancel failed for {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Cancel failed: {str(e)}")

@app.post("/bulk-delete")
def bulk_delete(payload: dict):
    """
    Bulk delete jobs.
    Payload: {"job_ids": ["slurm_id1", "Q-localid2"]}
    """
    job_ids = payload.get("job_ids", [])
    results = []
    
    db = mysql.connector.connect(**MYSQL_CONFIG)
    cur = db.cursor()
    
    import subprocess as sp
    for jid in job_ids:
        try:
            jid_str = str(jid)
            if jid_str.startswith("LOCAL-") or jid_str.startswith("Q-"):
                cur.execute("DELETE FROM job_queue WHERE job_id = %s", (jid_str,))
                cur.execute("DELETE FROM job_logs WHERE job_id = %s", (jid_str,))
                results.append({"job_id": jid_str, "status": "DELETED"})
            else:
                # 1. Scancel first (CRITICAL RULE: DO NOT LEAVE ORPHAN JOBS)
                try: 
                    sp.run(["scancel", jid_str], check=False, env=get_slurm_env())
                    # Simple verification
                    time.sleep(0.5)
                except: pass
                
                # 2. Only then purge from DB
                cur.execute("DELETE FROM job_logs WHERE job_id = %s", (jid_str,))
                cur.execute("DELETE FROM job_runtime WHERE job_id = %s", (jid_str,))
                results.append({"job_id": jid_str, "status": "DELETED"})
        except Exception as e:
            results.append({"job_id": str(jid), "status": "ERROR", "detail": str(e)})
            
    db.commit()
    cur.close()
    db.close()
    return {"results": results}
