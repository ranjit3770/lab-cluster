from pydantic_settings import BaseSettings
import os
import secrets


def _csv_env(name: str) -> list:
    raw = os.getenv(name, "")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


class Settings(BaseSettings):
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "Strach Portal")

    # deployment: "development" tolerates missing secrets with warnings,
    # "production" fails fast when required secrets are absent.
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # Database
    MYSQL_USER: str = os.getenv("MYSQL_USER", "root")
    MYSQL_PASSWORD: str = os.getenv("MYSQL_PASSWORD", "")
    MYSQL_SERVER: str = os.getenv("MYSQL_SERVER", "localhost")
    MYSQL_PORT: str = os.getenv("MYSQL_PORT", "3306")
    MYSQL_DB: str = os.getenv("MYSQL_DB", "strach_portal")

    # Job-API database account provisioned at startup (no hardcoded passwords)
    JOB_API_DB_USER: str = os.getenv("JOB_API_DB_USER", "slurm_user")
    JOB_API_DB_PASSWORD: str = os.getenv("JOB_API_DB_PASSWORD", "")

    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days

    # Login throttling / account lockout
    LOGIN_MAX_ATTEMPTS: int = int(os.getenv("LOGIN_MAX_ATTEMPTS", "5"))
    LOGIN_LOCKOUT_SECONDS: int = int(os.getenv("LOGIN_LOCKOUT_SECONDS", "300"))

    # Initial seeded admin password (first boot only). If unset in development
    # a random password is generated and logged once; production must set it.
    ADMIN_INITIAL_PASSWORD: str = os.getenv("ADMIN_INITIAL_PASSWORD", "")

    # CORS
    BACKEND_CORS_ORIGINS: list = _csv_env("BACKEND_CORS_ORIGINS")

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
    CLUSTER_NAME: str = os.getenv("CLUSTER_NAME", "Research Compute Platform")
    CLUSTER_DESCRIPTION: str = os.getenv("CLUSTER_DESCRIPTION", "High performance computing environment based on SLURM.")
    
    # Storage
    DATA_STORAGE: str = os.getenv("DATA_STORAGE", "/data_storage")

    # Email
    SMTP_TLS: bool = os.getenv("SMTP_TLS", "True").lower() == "true"
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    EMAILS_FROM_EMAIL: str = os.getenv("EMAILS_FROM_EMAIL", "")
    EMAILS_FROM_NAME: str = os.getenv("EMAILS_FROM_NAME", "No Reply")
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.SECRET_KEY:
            if self.ENVIRONMENT == "production":
                raise RuntimeError(
                    "SECRET_KEY must be set via environment (or .env) in production."
                )
            # Development fallback: ephemeral key so tokens never outlive process
            import warnings
            warnings.warn(
                "SECRET_KEY not set; generated an ephemeral key. "
                "All sessions invalidate on restart. Set SECRET_KEY for stable tokens.",
                RuntimeWarning,
                stacklevel=2,
            )
            self.SECRET_KEY = secrets.token_hex(32)

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
