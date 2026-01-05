import os
import shutil
import subprocess
import logging
from pathlib import Path
from typing import List

from app.core.config import settings
from app.core.errors import JobExecutionError

logger = logging.getLogger(__name__)

class EnvironmentError(JobExecutionError):
    pass

class EnvironmentService:
    @staticmethod
    def _get_user_base_dir(username: str) -> Path:
        # User path: /data_storage/{username}/
        return Path(settings.BASE_JOB_DIR) / username
    
    @staticmethod
    def _get_user_venv_dir(username: str) -> Path:
        return EnvironmentService._get_user_base_dir(username) / "venv"

    @staticmethod
    def get_job_dir(username: str, job_id: str) -> Path:
        return EnvironmentService._get_user_base_dir(username) / "jobs" / str(job_id)

    def ensure_user_environment(self, username: str):
        """
        Ensures the user workspace exists:
        1. Base Directory: /data_storage/{username}/ (700)
        2. Venv: /data_storage/{username}/venv
        """
        base_dir = self._get_user_base_dir(username)
        
        try:
            # 1. Create Base Directory
            if not base_dir.exists():
                logger.info(f"Creating base directory for user {username}: {base_dir}")
                base_dir.mkdir(parents=True, exist_ok=True)
                # Strict permissions: rwx------ (Owner only)
                os.chmod(base_dir, 0o700)

            # 2. Check/Create Virtualenv
            venv_dir = self._get_user_venv_dir(username)
            if not venv_dir.exists():
                logger.info(f"Creating venv for user {username}: {venv_dir}")
                self._create_venv(venv_dir)

        except OSError as e:
            logger.error(f"Failed to setup environment for user {username}: {e}")
            raise EnvironmentError(f"Failed to create user environment: {str(e)}")

    def _create_venv(self, venv_path: Path):
        """
        Create a virtual environment using the system python (sys.executable or 'python3').
        shell=True is FORBIDDEN.
        """
        try:
            # Use 'python3' or 'python' -m venv
            # Assuming 'python3' is available in the container/host path.
            cmd = ["python3", "-m", "venv", str(venv_path)]
            
            logger.debug(f"Executing: {' '.join(cmd)}")
            result = subprocess.run(
                cmd,
                check=True,
                capture_output=True,
                text=True,
                shell=False  # Explicitly False
            )
            # Make sure the venv directory is also secure?
            # Default helper creates it 755 usually, but parent is 700, so it's implicitly secure from others.
            
        except subprocess.CalledProcessError as e:
            logger.error(f"Venv creation failed: {e.stderr}")
            raise EnvironmentError(f"Virtualenv creation failed: {e.stderr.strip()}")

    def create_job_directory(self, username: str, job_id: str) -> Path:
        """
        Create the job-specific directory. 
        /data_storage/{username}/jobs/{job_id}/
        
        This assumes 'ensure_user_environment' has been called once previously, 
        but we can rely on parents=True just in case.
        """
        job_dir = self.get_job_dir(username, job_id)
        
        if job_dir.exists():
            # Should technically never happen if UUID is unique
            raise EnvironmentError(f"Job directory {job_dir} already exists.")
            
        try:
            logger.info(f"Creating job directory: {job_dir}")
            job_dir.mkdir(parents=True, exist_ok=True)
            os.chmod(job_dir, 0o700)
            return job_dir
        except OSError as e:
            logger.error(f"Failed to create job directory {job_dir}: {e}")
            raise EnvironmentError(f"Failed to create job workspace: {str(e)}")

    def cleanup_job_directory(self, username: str, job_id: str):
        """
        Clean up job directory on failure or completion (if policy dictates).
        For now, useful for rollback.
        """
        job_dir = self.get_job_dir(username, job_id)
        if job_dir.exists():
            try:
                shutil.rmtree(job_dir)
                logger.info(f"Deleted job directory: {job_dir}")
            except OSError as e:
                logger.error(f"Failed to cleanup job directory {job_dir}: {e}")
                # Don't raise, just log. Cleanup failures shouldn't crash the request logic usually.

    def get_python_path(self, username: str) -> str:
        """
        Get absolute path to the user's venv python executable.
        """
        venv_dir = self._get_user_venv_dir(username)
        # Linux/Unix standard path
        python_bin = venv_dir / "bin" / "python"
        
        # Windows fallback (For Dev only, though SRS assumes Linux)
        if os.name == 'nt':
            python_bin = venv_dir / "Scripts" / "python.exe"
            
        return str(python_bin)

    def get_current_disk_usage_mb(self, username: str) -> int:
        """
        Calculate total disk usage for a user in MB.
        Uses 'du -sm' for speed and efficient summary.
        """
        user_dir = self._get_user_base_dir(username)
        if not user_dir.exists():
            return 0
            
        try:
            # -s: summary, -m: megabytes
            if os.name == 'nt':
                 # Windows fallback (slow recursive walk)
                 total_size = 0
                 for dirpath, dirnames, filenames in os.walk(user_dir):
                     for f in filenames:
                         fp = os.path.join(dirpath, f)
                         total_size += os.path.getsize(fp)
                 return int(total_size / (1024 * 1024))
            
            # Linux: strict du usage
            cmd = ["du", "-sm", str(user_dir)]
            output = subprocess.check_output(cmd, text=True)
            # Output format: "123    /path/to/dir"
            size_mb = int(output.split()[0])
            return size_mb
        except (subprocess.CalledProcessError, ValueError, IndexError) as e:
            logger.error(f"Failed to calculate disk usage: {e}")
            return 0

    def get_system_uid(self, username: str) -> int:
        """
        Get the system UID for a given username on Linux.
        """
        if os.name == 'nt':
            return 1000
            
        try:
            cmd = ["id", "-u", username]
            output = subprocess.check_output(cmd, text=True).strip()
            return int(output)
        except Exception as e:
            logger.warning(f"Could not find UID for user {username}: {e}. Falling back to 1000.")
            return 1000
