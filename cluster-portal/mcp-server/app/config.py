from pydantic_settings import BaseSettings
import os


class Settings(BaseSettings):
    PROJECT_NAME: str = "HPC Operations MCP Server"

    PORTAL_API_URL: str = os.getenv("PORTAL_API_URL", "http://localhost:8000")
    JOB_API_URL: str = os.getenv("JOB_API_URL", "http://localhost:9000")

    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")

    MYSQL_HOST: str = os.getenv("MYSQL_SERVER", "localhost")
    MYSQL_PORT: int = int(os.getenv("MYSQL_PORT", "3307"))
    MYSQL_USER: str = os.getenv("MYSQL_USER", "root")
    MYSQL_PASSWORD: str = os.getenv("MYSQL_PASSWORD", "")
    MYSQL_DB: str = os.getenv("MYSQL_DB", "strach_portal")

    MCP_REQUIRE_AUTH: bool = os.getenv("MCP_REQUIRE_AUTH", "true").lower() in ("1", "true")
    MCP_AUDIT_ENABLED: bool = os.getenv("MCP_AUDIT_ENABLED", "true").lower() in ("1", "true")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.SECRET_KEY:
            import secrets
            self.SECRET_KEY = secrets.token_hex(32)

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"


settings = Settings()
