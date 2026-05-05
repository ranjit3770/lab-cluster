import os

MYSQL_CONFIG = {
    "host": os.getenv("MYSQL_SERVER", "localhost"),
    "port": int(os.getenv("MYSQL_PORT", "3306")),
    "user": os.getenv("MYSQL_USER", "slurm_user"),
    "password": os.getenv("MYSQL_PASSWORD", "slurmJob_Sub"),
    "database": os.getenv("MYSQL_DB", "slurm_jobs")
}

# Slurm REST API Protocol (v0.0.41 Standardized with TCP/JWT)
SLURM_VERSION = os.getenv("SLURM_VERSION", "v0.0.41")
SLURM_REST_URL = os.getenv("SLURM_REST_URL", f"http://127.0.0.1:6820/slurm/{SLURM_VERSION}")
SLURM_JWT_USER = os.getenv("SLURM_JWT_USER", "slurmapi")
SLURM_JWT_TOKEN = os.getenv("SLURM_JWT_TOKEN", "") # Use token if pre-generated

# Slurm Environment Variables
SLURM_PATH = os.getenv("SLURM_PATH", "/usr/local/slurm/bin:/usr/local/slurm/sbin")
SLURM_LIB_PATH = os.getenv("SLURM_LIB_PATH", "/usr/local/slurm/lib")

DATA_ROOT = os.getenv("DATA_STORAGE", os.getenv("DATA_ROOT", "/data_storage"))
LOG_SLEEP = float(os.getenv("LOG_SLEEP", "0.5"))
