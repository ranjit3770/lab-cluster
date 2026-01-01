import logging
import subprocess
from pathlib import Path
from typing import List

from app.core.errors import JobExecutionError
from app.services.environment import EnvironmentService

logger = logging.getLogger(__name__)

class DependencyError(JobExecutionError):
    pass

class DependencyService:
    # Hard limit on requirements lines to prevent abuse
    MAX_REQUIREMENTS_LINES = 50
    # Timeout for pip install in seconds
    INSTALL_TIMEOUT_SECONDS = 60

    def install_dependencies(self, user_id: str, job_id: str, env_service: EnvironmentService):
        """
        Detects requirements.txt in the job directory and installs dependencies
        into the user's virtual environment.
        """
        job_dir = env_service.get_job_dir(user_id, job_id)
        req_file = job_dir / "requirements.txt"

        if not req_file.exists():
            logger.debug(f"No requirements.txt found for job {job_id}. Skipping installation.")
            return

        logger.info(f"requirements.txt found for job {job_id}. processing...")

        # 1. Validate Line Count (Security Check)
        self._validate_requirements_file(req_file)

        # 2. Resolve Venv Python Path
        python_executable = env_service.get_python_path(user_id)

        # 3. Execute Pip Install
        self._run_pip_install(python_executable, req_file)

    def _validate_requirements_file(self, req_file: Path):
        """
        Parses requirements.txt to enforce limits.
        """
        try:
            with open(req_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                
                # Filter out empty lines and comments
                clean_lines = [
                    line.strip() for line in lines 
                    if line.strip() and not line.strip().startswith('#')
                ]
                
                if len(clean_lines) > self.MAX_REQUIREMENTS_LINES:
                    raise DependencyError(
                        f"requirements.txt exceeds limit of {self.MAX_REQUIREMENTS_LINES} packages "
                        f"(found {len(clean_lines)})."
                    )
                    
        except UnicodeDecodeError:
             raise DependencyError("requirements.txt must be a valid UTF-8 text file.")
        except IOError as e:
            raise DependencyError(f"Failed to read requirements.txt: {e}")

    def _run_pip_install(self, python_path: str, req_file: Path):
        """
        Runs pip install securely.
        """
        cmd = [
            python_path, "-m", "pip", "install",
            "-r", str(req_file),
            "--no-cache-dir", # Prevent disk bloat
            "--disable-pip-version-check",
            "--no-warn-script-location"
        ]

        logger.info(f"Running pip install for {req_file}...")
        
        try:
            # Enforce timeout and capture output for debugging
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.INSTALL_TIMEOUT_SECONDS,
                shell=False # Security Critical
            )

            if result.returncode != 0:
                logger.error(f"Pip install failed: {result.stderr}")
                raise DependencyError(
                    f"Dependency installation failed. stderr: {result.stderr.strip()}"
                )
                
            logger.info("Dependency installation successful.")

        except subprocess.TimeoutExpired:
            logger.error("Pip install timed out.")
            raise DependencyError(
                f"Dependency installation timed out after {self.INSTALL_TIMEOUT_SECONDS} seconds."
            )
        except subprocess.CalledProcessError as e:
            # Should be caught by returncode check, but strictly speaking run() without check=True 
            # doesn't raise this unless check=True is passed. 
            # I used check=False (default) effectively by manually checking returncode above, 
            # but let's leave this catch block just in case I switch to check=True later.
            logger.error(f"Pip process error: {e}")
            raise DependencyError(f"Dependency installation process error: {e}")
        except FileNotFoundError:
             raise DependencyError(f"Python executable not found at {python_path}")
