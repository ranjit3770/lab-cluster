from pydantic_settings import BaseSettings
import os

class Settings(BaseSettings):
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "Strach Portal")
    # Database
    MYSQL_USER: str = os.getenv("MYSQL_USER", "root")
    MYSQL_PASSWORD: str = os.getenv("MYSQL_PASSWORD", "Amma@123")
    MYSQL_SERVER: str = os.getenv("MYSQL_SERVER", "localhost")
    MYSQL_PORT: str = os.getenv("MYSQL_PORT", "3306")
    MYSQL_DB: str = os.getenv("MYSQL_DB", "strach_portal")
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "AuDXpKIAAP4sB3YU-M3UTl2yZWRbp3kRaNPHcdo4t3I")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days
    
    # CORS
    BACKEND_CORS_ORIGINS: list = []

    # Slurm REST API (v0.0.41 + JWT Protocol)
    SLURM_VERSION: str = os.getenv("SLURM_VERSION", "v0.0.41")
    SLURM_REST_URL: str = os.getenv("SLURM_REST_URL", f"http://127.0.0.1:6820/slurm/{SLURM_VERSION}")
    SLURM_NODE_API: str = os.getenv("SLURM_NODE_API", f"http://127.0.0.1:6820/slurm/{SLURM_VERSION}/nodes")
    SLURM_JWT_USER: str = os.getenv("SLURM_JWT_USER", "slurmapi") 
    SLURM_JWT_TOKEN: str = os.getenv("SLURM_JWT_TOKEN", "") 
    SLURM_PATH: str = os.getenv("SLURM_PATH", "/usr/local/slurm/bin:/usr/local/slurm/sbin")
    SLURM_LIB_PATH: str = os.getenv("SLURM_LIB_PATH", "/usr/local/slurm/lib")
    SLURM_SYNC_INTERVAL: int = int(os.getenv("SLURM_SYNC_INTERVAL", "60000"))
    EXTERNAL_JOB_API_URL: str = os.getenv("EXTERNAL_JOB_API_URL", "http://0.0.0.0:9000")
    
    # Branding & Presence
    CLUSTER_NAME: str = os.getenv("CLUSTER_NAME", "Lab Slurm Cluster")
    CLUSTER_DESCRIPTION: str = os.getenv("CLUSTER_DESCRIPTION", "High performance computing environment based on SLURM.")
    
    # Storage
    DATA_STORAGE: str = os.getenv("DATA_STORAGE", "/data_storage")

    # Windows Boot Playbooks
    WINDOWS_PLAYBOOK_DIR: str = os.getenv("WINDOWS_PLAYBOOK_DIR", "/opt/amritacluster/SLURM-COMPLETE-SETUP/windows-boot-testing")

    # Email
    SMTP_TLS: bool = os.getenv("SMTP_TLS", "True").lower() == "true"
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_USER: str = os.getenv("SMTP_USER", "ranjithkumaramrita@gmail.com")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "yjji zelx pcef giot")
    EMAILS_FROM_EMAIL: str = os.getenv("EMAILS_FROM_EMAIL", "ranjithkumaramrita@gmail.com")
    EMAILS_FROM_NAME: str = os.getenv("EMAILS_FROM_NAME", "No Reply")
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "ranjithkumaramrita@gmail.com")

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        from urllib.parse import quote_plus
        password = quote_plus(self.MYSQL_PASSWORD)
        return f"mysql+mysqlconnector://{self.MYSQL_USER}:{password}@{self.MYSQL_SERVER}:{self.MYSQL_PORT}/{self.MYSQL_DB}"

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"

settings = Settings()
