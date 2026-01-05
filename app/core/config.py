import os
from pydantic_settings import BaseSettings
from pydantic import Field, SecretStr

class Settings(BaseSettings):
    # Application Info
    APP_NAME: str = "FastAPI Job Execution API"
    VERSION: str = "1.1"
    
    # API Configuration
    API_V1_STR: str = "/slurm-job/v1"
    APP_PORT: int = 9000
    
    # Database Configuration (MySQL)
    # Defaulting to localhost for dev, but should be set via env vars
    DB_HOST: str = Field(default="localhost", description="MySQL Host")
    DB_PORT: int = Field(default=3306, description="MySQL Port")
    DB_USER: str = Field(default="job_exec_user", description="MySQL User")
    DB_PASSWORD: str = Field(default="Amrita@123", description="MySQL Password") # Should be SecretStr in prod, keeping str for simple URL const
    DB_NAME: str = Field(default="slurm_jobs_db", description="MySQL Database Name")
    PORTAL_DB_NAME: str = Field(default="strach_portal", description="Portal Database Name for User Quotas")
    
    @property
    def DATABASE_URL(self) -> str:
        import urllib.parse
        encoded_password = urllib.parse.quote_plus(self.DB_PASSWORD)
        return f"mysql+pymysql://{self.DB_USER}:{encoded_password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    # Filesystem Configuration
    BASE_JOB_DIR: str = Field(default="/data_storage", description="Base path for user job workspaces")
    
    # SLURM Configuration
    SLURM_BIN_PATH: str = Field(default="/usr/bin", description="Path to SLURM binaries (sbatch, squeue, etc)")
    
    # Cgroups Configuration
    CGROUP_ROOT: str = Field(default="/sys/fs/cgroup", description="Root of SLURM cgroups v2")
    
    # Security
    INTERNAL_API_KEY: SecretStr = Field(default="change-me-in-production", description="API Key for internal service auth")

    model_config = {
        "env_file": ".env",
        "case_sensitive": True
    }

settings = Settings()
