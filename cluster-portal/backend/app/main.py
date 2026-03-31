import sys
import subprocess
import os

def install_requirements():
    print("Dependencies missing. Attempting to install from requirements.txt...")
    req_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "requirements.txt")
    if os.path.exists(req_path):
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", req_path])
            print("Successfully installed dependencies.")
        except Exception as e:
            print(f"Failed to install dependencies: {e}")
    else:
        print(f"requirements.txt not found at {req_path}")

try:
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse, HTMLResponse
    from starlette.middleware.cors import CORSMiddleware
except (ImportError, ModuleNotFoundError):
    install_requirements()
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse, HTMLResponse
    from starlette.middleware.cors import CORSMiddleware




import sqlalchemy as sa
from app.api.v1.api import api_router
from app.core.config import settings
from app.db.session import engine
from app.db.base import Base

# Robust Database Initialization
def ensure_db_initialized():
    import subprocess
    import os

    # Extract connection details from environment/settings for raw CLI calls
    db_name = settings.MYSQL_DB
    db_user = settings.MYSQL_USER
    db_pass = settings.MYSQL_PASSWORD
    
    print(f"ENSURING DATABASE '{db_name}' EXISTS...")

    # CLI ATTMPT (Highest chance for root users on Linux)
    try:
        # Check if mysql command exists
        devnull = open(os.devnull, 'w')
        if subprocess.call(["which", "mysql"], stdout=devnull, stderr=devnull) == 0:
            # Try with -p since root likely has a password, targeting MYSQL_SERVER
            print(f"Provisioning database '{db_name}' using CLI (Host: {settings.MYSQL_SERVER})...")
            subprocess.run(["mysql", "-h", settings.MYSQL_SERVER, "--ssl=0", "-u", "root", f"-p{db_pass}", "-e", f"CREATE DATABASE IF NOT EXISTS {db_name};"], check=False)
            # Try sudo as fallback
            subprocess.run(["sudo", "mysql", "-h", settings.MYSQL_SERVER, "--ssl=0", "-e", f"CREATE DATABASE IF NOT EXISTS {db_name};"], check=False)
            
            # Ensure user exists and has permissions
            fix_cmd = f"CREATE USER IF NOT EXISTS '{db_user}'@'%' IDENTIFIED BY '{db_pass}'; GRANT ALL PRIVILEGES ON {db_name}.* TO '{db_user}'@'%'; FLUSH PRIVILEGES;"
            subprocess.run(["mysql", "-h", settings.MYSQL_SERVER, "--ssl=0", "-u", "root", f"-p{db_pass}", "-e", fix_cmd], check=False)
            subprocess.run(["sudo", "mysql", "-h", settings.MYSQL_SERVER, "--ssl=0", "-e", fix_cmd], check=False)
            print("CLI setup attempt complete.")
    except Exception as cli_e:
        print(f"CLI REPAIR ATTEMPT FAILED (Expected if not on Linux or mysql CLI missing): {cli_e}")

    # SQLAlchemy ATTEMPT to sync models
    try:
        print("SYNCING MODELS VIA SQLALCHEMY...")
        from app.db.base import Base
        Base.metadata.create_all(bind=engine)
        print("Model sync successful.")
    except Exception as sync_e:
        print(f"MODEL SYNC FAILED: {sync_e}")
        # Final attempt: try to connect without DB name to create it if it didn't exist
        try:
            from sqlalchemy import create_engine
            from urllib.parse import quote_plus
            root_url = f"mysql+mysqlconnector://{db_user}:{quote_plus(db_pass)}@{settings.MYSQL_SERVER}:{settings.MYSQL_PORT}"
            temp_engine = create_engine(root_url)
            with temp_engine.connect() as conn:
                conn.execute(sa.text(f"CREATE DATABASE IF NOT EXISTS {db_name}"))
            print(f"Created database '{db_name}' via fallback engine.")
            Base.metadata.create_all(bind=engine)
            print("Model sync successful after manual DB creation.")
        except Exception as retry_e:
            print(f"CRITICAL: ALL ATTEMPTS TO INITIALIZE DB FAILED: {retry_e}")

# Run DB initialization
ensure_db_initialized()

# Soft migration: Check for missing columns in 'nodes' table
def migrate_schema():
    try:
        inspector = sa.inspect(engine)
        columns = [c['name'] for c in inspector.get_columns('nodes')]
        with engine.begin() as conn:
            for col in ['cpu_total', 'cpu_used', 'memory_total_mb', 'memory_used_mb', 'gpu_total', 'gpu_used', 'cpu_load', 'free_memory_mb', 'cores_total', 'sockets', 'threads_per_core']:
                if col not in columns:
                    print(f"ALEMBIC-LESS MIGRATION: Adding column {col} to nodes table...")
                    conn.execute(sa.text(f"ALTER TABLE nodes ADD COLUMN {col} INTEGER DEFAULT 0"))
            
            if 'slurm_version' not in columns:
                print("ALEMBIC-LESS MIGRATION: Adding slurm_version to nodes table...")
                conn.execute(sa.text("ALTER TABLE nodes ADD COLUMN slurm_version VARCHAR(50)"))
            
            if 'operating_system' not in columns:
                print("ALEMBIC-LESS MIGRATION: Adding operating_system to nodes table...")
                conn.execute(sa.text("ALTER TABLE nodes ADD COLUMN operating_system VARCHAR(255)"))
            
            job_columns = [c['name'] for c in inspector.get_columns('jobs')]
            if 'updated_at' not in job_columns:
                 print("ALEMBIC-LESS MIGRATION: Adding updated_at to jobs table...")
                 conn.execute(sa.text("ALTER TABLE jobs ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"))
            if 'requirements_path' not in job_columns:
                 print("ALEMBIC-LESS MIGRATION: Adding requirements_path to jobs table...")
                 conn.execute(sa.text("ALTER TABLE jobs ADD COLUMN requirements_path VARCHAR(500)"))
            if 'dependency_path' not in job_columns:
                 print("ALEMBIC-LESS MIGRATION: Adding dependency_path to jobs table...")
                 conn.execute(sa.text("ALTER TABLE jobs ADD COLUMN dependency_path VARCHAR(500)"))
            

            user_columns = [c['name'] for c in inspector.get_columns('users')]
            if 'full_name' not in user_columns:
                print("ALEMBIC-LESS MIGRATION: Adding full_name to users table...")
                conn.execute(sa.text("ALTER TABLE users ADD COLUMN full_name VARCHAR(255)"))
            if 'cpu_limit' not in user_columns:
                print("ALEMBIC-LESS MIGRATION: Adding cpu_limit to users table...")
                conn.execute(sa.text("ALTER TABLE users ADD COLUMN cpu_limit INTEGER DEFAULT 0"))

            if 'memory_limit_gb' not in user_columns:
                print("ALEMBIC-LESS MIGRATION: Adding memory_limit_gb to users table...")
                conn.execute(sa.text("ALTER TABLE users ADD COLUMN memory_limit_gb INTEGER DEFAULT 4"))
                if 'memory_limit_mb' in user_columns:
                    print("ALEMBIC-LESS MIGRATION: Migrating RAM from MB to GB...")
                    conn.execute(sa.text("UPDATE users SET memory_limit_gb = ROUND(memory_limit_mb / 1024)"))
            if 'storage_limit_gb' not in user_columns:
                print("ALEMBIC-LESS MIGRATION: Adding storage_limit_gb to users table...")
                conn.execute(sa.text("ALTER TABLE users ADD COLUMN storage_limit_gb INTEGER DEFAULT 15"))

            # Ensure maintenance_ips table exists
            if 'maintenance_ips' not in inspector.get_table_names():
                print("ALEMBIC-LESS MIGRATION: Creating maintenance_ips table...")
                conn.execute(sa.text("""
                    CREATE TABLE maintenance_ips (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        ip_address VARCHAR(50) UNIQUE NOT NULL,
                        label VARCHAR(100),
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """))
    except Exception as e:
        print(f"MIGRATION ERROR (Safe to ignore if columns already exist): {e}")



# Function to seed the database if it's empty
def seed_if_empty():
    from app.db.session import SessionLocal
    try:
        db = SessionLocal()
        # Check if users table exists and has data
        user_count = db.execute(sa.text("SELECT count(*) FROM users")).scalar()
        if user_count == 0:
            print("DATABASE EMPTY: Running initial_data and seed_cluster...")
            
            # 1. Run initial_data.py (Admin/Dev users + Tables)
            init_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "initial_data.py")
            if os.path.exists(init_script):
                print(f"Executing {init_script}...")
                subprocess.run([sys.executable, init_script], check=False)
            
            # 2. Run seed_cluster.py (Clean setup)
            seed_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "seed_cluster.py")
            if os.path.exists(seed_script):
                print(f"Executing {seed_script}...")
                subprocess.run([sys.executable, seed_script], check=False)
                
            print("Database setup and seeding complete.")
        else:
            # Even if not empty, ensure the latest users/schema are synced
            init_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "initial_data.py")
            if os.path.exists(init_script):
                subprocess.run([sys.executable, init_script], check=False)

        db.close()
    except Exception as e:
        print(f"SEEDING CHECK FAILED: {e}")

migrate_schema()
seed_if_empty()

app = FastAPI(title=settings.PROJECT_NAME, openapi_url="/api/v1/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import Request
from app.models.system_setting import MaintenanceIP, SystemSetting
from app.db.session import SessionLocal

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

@app.middleware("http")
async def maintenance_middleware(request: Request, call_next):
    # Skip for docs, root, and administrative endpoints
    if (request.url.path in ["/", "/api/v1/openapi.json", "/docs", "/redoc"] or 
        request.url.path == "/api/v1/system-info/maintenance-status" or
        request.url.path.startswith("/api/v1/settings") or 
        request.url.path.startswith("/api/v1/developer")):
        return await call_next(request)
    
    try:
        db = SessionLocal()
        is_maintenance = db.query(SystemSetting).filter(SystemSetting.key == "maintenance_mode").first()
        
        if is_maintenance and is_maintenance.value.lower() == "true":
            # 1. Allow for Admin/Developer roles (even without IP whitelist)
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                try:
                    from jose import jwt
                    token = auth_header.split(" ")[1]
                    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
                    role = payload.get("role")
                    if role in ["admin", "developer"]:
                        db.close()
                        return await call_next(request)
                except:
                    pass

            # 2. Extract client IP for Whitelist check
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                client_ip = forwarded.split(",")[0].strip()
            else:
                client_ip = request.client.host
            
            whitelisted = db.query(MaintenanceIP).filter(MaintenanceIP.ip_address == client_ip).first()
            
            if not whitelisted:
                response = JSONResponse(
                    status_code=503,
                    content={
                        "detail": "OPERATIONAL LOCK: System is undergoing scheduled maintenance.",
                        "maintenance": True,
                        "your_ip": client_ip
                    }
                )
                # Manually add CORS headers for early 503 response
                origin = request.headers.get("origin")
                if origin:
                    response.headers["Access-Control-Allow-Origin"] = origin
                    response.headers["Access-Control-Allow-Credentials"] = "true"
                    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
                    response.headers["Access-Control-Allow-Headers"] = "*"
                db.close()
                return response
        db.close()
    except Exception as e:
        # Prevent total lockout if DB check fails
        pass

    response = await call_next(request)
    return response

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    print(f"CRITICAL ERROR: {str(exc)}")
    print(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"},
    )

# ... (JSONResponse import was moved to top)

app.include_router(api_router, prefix="/api/v1")

@app.get("/", response_class=HTMLResponse)
def root():
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>HPC Gateway | Operational Status</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Fira+Code:wght@400&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg: #030712;
                --primary: #38bdf8;
                --primary-glow: rgba(56, 189, 248, 0.2);
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
                background: #fff;
                color: #000;
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
                SYSTEM ONLINE
            </div>
            <h1>Management Gateway</h1>
            <p>High-Performance Cluster core management API tier is running in production mode.</p>
            
            <div class="terminal">
                <span class="line"><span class="key">status:</span> <span class="val">"operational"</span></span>
                <span class="line"><span class="key">cluster:</span> <span class="val">"Production"</span></span>
                <span class="line"><span class="key">version:</span> <span class="val">"2.4.0-stable"</span></span>
            </div>

            <a href="/docs" class="btn">Interface Documentation</a>
        </div>
    </body>
    </html>
    """

@app.get("/health")
def health():
    return {"status": "healthy", "service": "portal-backend"}
