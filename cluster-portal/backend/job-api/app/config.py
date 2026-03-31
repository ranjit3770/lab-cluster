import os

MYSQL_CONFIG = {
    "host": os.getenv("MYSQL_SERVER", "localhost"),
    "user": os.getenv("MYSQL_USER", "slurm_user"),
    "password": os.getenv("MYSQL_PASSWORD", "slurmJob_Sub"),
    "database": os.getenv("MYSQL_DB", "slurm_jobs")
}

# The Slurm Node API and Version should be managed through the environment (v0.0.44 Standard)
SLURM_VERSION = os.getenv("SLURM_VERSION", "v0.0.44")
SLURM_NODE_API = os.getenv("SLURM_NODE_API", f"http+unix://%2Frun%2Fslurmrestd%2Fslurmrestd.socket/slurm/{SLURM_VERSION}/nodes")

DATA_ROOT = os.getenv("DATA_STORAGE", os.getenv("DATA_ROOT", "/data_storage"))
LOG_SLEEP = float(os.getenv("LOG_SLEEP", "0.5"))
