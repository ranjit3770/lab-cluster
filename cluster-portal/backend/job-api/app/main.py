from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from app.schemas import JobRequest, JobResponse
from app.slurm import submit_job
from app.streamer import combined_log_stream
from app.status import job_status, cancel_job

from app.models import insert_job_log, update_job_status, get_job_log_status

def setup_database():
    import mysql.connector
    from app.config import MYSQL_CONFIG
    import subprocess
    import os
    
    db_name = MYSQL_CONFIG["database"]
    db_user = MYSQL_CONFIG["user"]
    db_pass = MYSQL_CONFIG["password"]
    db_host = MYSQL_CONFIG["host"]
    
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
                # Try with password and explicit host 'database', disabling SSL for internal network
                res = subprocess.run(["mysql", "-h", db_host, "--ssl=0", "-u", "root", f"-p{root_p}", "-e", cmd], capture_output=True, text=True)
                if res.returncode != 0:
                    # Try without password but with host
                    subprocess.run(["mysql", "-h", db_host, "--ssl=0", "-u", "root", "-e", cmd], check=False)

            run_mysql(f"CREATE DATABASE IF NOT EXISTS {db_name};")
            run_mysql(f"CREATE USER IF NOT EXISTS '{db_user}'@'%' IDENTIFIED BY '{db_pass}';")
            run_mysql(f"GRANT ALL PRIVILEGES ON {db_name}.* TO '{db_user}'@'%';")
            # CRITICAL: Grant access to strach_portal for maintenance and config checks
            run_mysql(f"GRANT SELECT ON strach_portal.* TO '{db_user}'@'%';")
            run_mysql("FLUSH PRIVILEGES;")
            
            # Also try sudo as fallback (pointing to the database host, disabling SSL)
            subprocess.run(["sudo", "mysql", "-h", db_host, "--ssl=0", "-e", f"CREATE DATABASE IF NOT EXISTS {db_name};"], check=False)
            subprocess.run(["sudo", "mysql", "-h", db_host, "--ssl=0", "-e", f"CREATE USER IF NOT EXISTS '{db_user}'@'%' IDENTIFIED BY '{db_pass}';"], check=False)
            subprocess.run(["sudo", "mysql", "-h", db_host, "--ssl=0", "-e", f"GRANT ALL PRIVILEGES ON {db_name}.* TO '{db_user}'@'%';"], check=False)
            subprocess.run(["sudo", "mysql", "-h", db_host, "--ssl=0", "-e", f"GRANT SELECT ON strach_portal.* TO '{db_user}'@'%';"], check=False)
            subprocess.run(["sudo", "mysql", "-h", db_host, "--ssl=0", "-e", "FLUSH PRIVILEGES;"], check=False)
    except Exception as e:
        print(f"CLI DB setup attempt skipped: {e}")

    # Create table via connection
    try:
        # Fallback to creating DB via connection if user exists but DB doesn't
        try:
            db_creator = mysql.connector.connect(host=db_host, user=db_user, password=db_pass)
            cursor = db_creator.cursor()
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {db_name}")
            db_creator.commit()
            cursor.close()
            db_creator.close()
        except:
            pass

        # Real connection to sync tables
        db = mysql.connector.connect(host=db_host, user=db_user, password=db_pass, database=db_name)
        cur = db.cursor()
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
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.commit()
        
        # Soft Migration: ensure updated_at exists
        try:
            cur.execute("SHOW COLUMNS FROM job_logs LIKE 'updated_at'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE job_logs ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
                db.commit()
        except:
            pass
            
        cur.close()
        db.close()
        print("JOB DATABASE TABLES SYNCED.")
    except Exception as e:
        print(f"JOB DATABASE SETUP ERROR: {e}")

setup_database()

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
                <span class="line"><span class="key">engine:</span> <span class="val">"Slurm-v0.0.44"</span></span>
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

@app.post("/submit", response_model=JobResponse)
def submit(job: JobRequest):
    print("Payload: ", job)
    job_id = submit_job(job)
    insert_job_log(job_id, job)
    return {"job_id": job_id, "status": "SUBMITTED"}

@app.get("/logs/{username}/{job_id}")
def logs(username: str, job_id: str):
    return StreamingResponse(
        combined_log_stream(username, job_id),
        media_type="text/plain"
    )

@app.get("/status/{job_id}")
def get_job_status_endpoint(job_id: str):
    s = job_status(job_id)
    if s == "NOT_FOUND":
        # Fallback to DB
        db_s = get_job_log_status(job_id)
        if db_s:
            s = db_s
    return {"job_id": job_id, "status": s}

@app.post("/cancel/{job_id}")
def cancel(job_id: str):
    try:
        s = cancel_job(job_id)
        update_job_status(job_id, s)
        return {"job_id": job_id, "status": s}
    except:
        raise HTTPException(status_code=400, detail="Cancel failed")
