import os
from pydantic_settings import BaseSettings
from pydantic import Field, SecretStr

class Settings(BaseSettings):
    # Application Info
    APP_NAME: str = "FastAPI Job Execution API"
    VERSION: str = "1.1"
    
    # API Configuration
    API_V1_STR: str = "/api/v1"
    
    # Database Configuration (MySQL)
    # Defaulting to localhost for dev, but should be set via env vars
    DB_HOST: str = Field(default="localhost", description="MySQL Host")
    DB_PORT: int = Field(default=3306, description="MySQL Port")
    DB_USER: str = Field(default="job_exec_user", description="MySQL User")
    DB_PASSWORD: str = Field(default="securepassword", description="MySQL Password") # Should be SecretStr in prod, keeping str for simple URL const
    DB_NAME: str = Field(default="slurm_job_db", description="MySQL Database Name")
    
    @property
    def DATABASE_URL(self) -> str:
        return f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    # Filesystem Configuration
    BASE_JOB_DIR: str = Field(default="/var/lib/job-exec/users", description="Base path for user job workspaces")
    
    # SLURM Configuration
    SLURM_BIN_PATH: str = Field(default="/usr/bin", description="Path to SLURM binaries (sbatch, squeue, etc)")
    
    # Cgroups Configuration
    CGROUP_ROOT: str = Field(default="/sys/fs/cgroup/slurm", description="Root of SLURM cgroups v2")
    
    # Security
    INTERNAL_API_KEY: SecretStr = Field(default="change-me-in-production", description="API Key for internal service auth")

    model_config = {
        "env_file": ".env",
        "case_sensitive": True
    }

settings = Settings()
