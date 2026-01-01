import sys
import os
import shutil
import subprocess
from app.core.config import settings

def check_venv_module():
    """
    On Ubuntu, the venv module is often separated in python3-venv package.
    """
    try:
        import ensurepip
        import venv
        print("[INFO] 'venv' module is available.")
        return True
    except ImportError:
        print("[ERROR] 'venv' module missing. On Ubuntu, run: sudo apt install python3-venv")
        return False

def check_python_version():
    print(f"[INFO] Python Version: {sys.version}")
    if sys.version_info < (3, 8):
        print("[ERROR] Python 3.8+ is required.")
        return False
    return True

def check_imports():
    try:
        import fastapi
        import sqlalchemy
        import pymysql
        import pydantic
        print("[INFO] Critical packages imported successfully.")
        return True
    except ImportError as e:
        print(f"[ERROR] Import failed: {e}")
        return False

def check_slurm_binaries():
    binaries = ["sbatch", "squeue", "sacct", "scancel"]
    missing = []
    for binary in binaries:
        path = os.path.join(settings.SLURM_BIN_PATH, binary)
        # On Windows dev where SLURM isn't present, this will fail. 
        # We'll just check if it exists or if we are on linux.
        if os.name == 'nt' and not os.path.exists(path):
            # Just a warning on Windows
            print(f"[WARN] SLURM binary '{binary}' not found or not executable (Expected on Windows Dev).")
            continue
            
        if os.name != 'nt' and not shutil.which(binary, path=settings.SLURM_BIN_PATH):
             missing.append(binary)
    
    if missing:
        print(f"[ERROR] Missing SLURM binaries in {settings.SLURM_BIN_PATH}: {missing}")
        return False
    
    print("[INFO] SLURM binary check passed (or skipped on Windows).")
    return True

def check_cgroups():
    if os.name == 'nt':
        print("[WARN] Skipping Cgroups check on Windows.")
        return True
        
    if not os.path.exists(settings.CGROUP_ROOT):
        print(f"[ERROR] Cgroup root not found at {settings.CGROUP_ROOT}. Is Cgroup v2 enabled and SLURM configured?")
        return False
    
    print("[INFO] Cgroup root detected.")
    return True

def check_db_connection():
    try:
        from sqlalchemy import create_engine, text
        engine = create_engine(settings.DATABASE_URL)
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1"))
            print(f"[INFO] Database connection successful. Result: {result.scalar()}")
        return True
    except Exception as e:
        print(f"[ERROR] Database connection failed: {e}")
        return False

if __name__ == "__main__":
    print("--- FastAPI Job Execution API Troubleshooter ---")
    steps = [
        check_python_version,
        check_venv_module,
        check_imports,
        check_slurm_binaries,
        check_cgroups,
        check_db_connection
    ]
    
    all_passed = True
    for step in steps:
        print(f"\nRunning {step.__name__}...")
        if not step():
            all_passed = False
            
    if all_passed:
        print("\n[SUCCESS] All checks passed.")
        sys.exit(0)
    else:
        print("\n[FAILURE] Some checks failed.")
        sys.exit(1)
