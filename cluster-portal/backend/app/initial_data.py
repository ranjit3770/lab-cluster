import logging
import mysql.connector
import sys
import os

# Ensure backend path is in sys.path to resolve app imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import base # Ensures all models (User, Job, Node, etc.) are registered
from app.db.session import engine, SessionLocal
from app.models.user import User, UserRole
from app.models.system_setting import SystemSetting, MaintenanceIP
from app.core.security import get_password_hash

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_database():
    try:
        logger.info(f"Connecting to MySQL server at {settings.MYSQL_SERVER}...")
        conn = mysql.connector.connect(
            host=settings.MYSQL_SERVER,
            user=settings.MYSQL_USER,
            password=settings.MYSQL_PASSWORD,
            port=int(settings.MYSQL_PORT)
        )
        cursor = conn.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {settings.MYSQL_DB}")
        logger.info(f"Database '{settings.MYSQL_DB}' checked/created.")
        conn.close()
    except Exception as e:
        logger.error(f"Error checking database: {e}")

def init_db(db: Session) -> None:
    # Create tables
    logger.info("Creating tables...")
    base.Base.metadata.create_all(bind=engine)
    
    # 1. Create Default Admin User
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        logger.info("Seeding Admin User...")
        admin = User(
            full_name="Cluster Administrator",
            username="admin",
            email="admin@cluster.amrita.edu",
            hashed_password=get_password_hash("admin123"),
            role=UserRole.ADMIN,
            is_active=True,
            cpu_limit=0,
            memory_limit_gb=0,
            storage_limit_gb=0
        )
        db.add(admin)
    
    # 2. Create/Update Ranjithks (Admin & Developer Privileges)
    raw_ranjith_pass = "ranjit123"
    ranjith = db.query(User).filter(User.username == "ranjithks").first()
    if not ranjith:
        logger.info("Seeding Ranjithks Administrative User...")
        ranjith = User(
            full_name="RanjithKumar S",
            username="ranjithks",
            email="ranjithks@am.amrita.edu",
            hashed_password=get_password_hash(raw_ranjith_pass),
            role=UserRole.DEVELOPER,
            is_active=True,
            cpu_limit=0,
            memory_limit_gb=0,
            storage_limit_gb=0
        )
        db.add(ranjith)
    else:
        ranjith.role = UserRole.DEVELOPER
        db.add(ranjith)

    db.commit()
    logger.info("Administrative identities synchronized.")
        
    # 3. Create Default System Settings
    settings_seed = [
        ("max_batch_jobs_per_user", "20", "Maximum concurrent batch jobs allowed per person"),
        ("max_jupyter_jobs_per_user", "4", "Maximum concurrent Jupyter sessions allowed per person"),
        ("cluster_name", "Lab Slurm Cluster", "Display name of the HPC environment"),
        ("maintenance_mode", "false", "Whether the system is in maintenance mode"),
        ("slurm_rest_url", settings.SLURM_REST_URL, "Endpoint for the Slurm REST API"),
        ("slurm_node_api", settings.SLURM_NODE_API, "Endpoint for the Slurm Node API"),
        ("max_job_cpu", "64", "Global limit for CPU cores per single job"),
        ("max_job_mem_gb", "128", "Global limit for RAM (GB) per single job"),
        ("max_job_time_hours", "72", "Global walltime limit in hours per job"),
        ("cluster_description", "High performance computing environment based on SLURM.", "Detailed cluster broadcast message")
    ]
    
    for key, val, desc in settings_seed:
        existing = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if not existing:
            s = SystemSetting(key=key, value=val, description=desc)
            db.add(s)
            logger.info(f"Seeded setting: {key} = {val}")
        elif key in ["slurm_rest_url", "slurm_node_api"]:
            existing.value = val # Ensure they are synced with current config
            db.add(existing)

    db.commit()

    # 4. Seed Maintenance IPs
    ips_seed = [
        ("192.168.151.111", "Admin Control Point 1"),
        ("172.17.181.2", "Admin Control Point 2"),
        ("localhost", "Current Node (Auto-Seeded)"),
        ("192.168.199.251", "Researcher Node (Auto-Seeded)")
    ]
    for ip, label in ips_seed:
        existing = db.query(MaintenanceIP).filter(MaintenanceIP.ip_address == ip).first()
        if not existing:
            m = MaintenanceIP(ip_address=ip, label=label)
            db.add(m)
            logger.info(f"Seeded maintenance IP: {ip}")
    db.commit()

def main() -> None:
    logger.info("Initializing service...")
    create_database()
    db = SessionLocal()
    init_db(db)
    db.close()
    logger.info("Service initialized successfully.")

if __name__ == "__main__":
    main()
