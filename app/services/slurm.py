import logging
import os
import subprocess
import re
from pathlib import Path
from typing import Optional, Dict

from app.core.config import settings
from app.core.errors import JobExecutionError
from app.models.models import JobStatus

logger = logging.getLogger(__name__)

class SlurmError(JobExecutionError):
    pass

class SlurmService:
    def __init__(self):
        import shutil
        self.sbatch_bin = shutil.which("sbatch") or os.path.join(settings.SLURM_BIN_PATH, "sbatch")
        self.scancel_bin = shutil.which("scancel") or os.path.join(settings.SLURM_BIN_PATH, "scancel")
        self.squeue_bin = shutil.which("squeue") or os.path.join(settings.SLURM_BIN_PATH, "squeue")
        self.sacct_bin = shutil.which("sacct") or os.path.join(settings.SLURM_BIN_PATH, "sacct")

    def generate_sbatch_script(
        self, 
        job_id: str, 
        user_id: str, 
        job_dir: Path, 
        venv_python_path: str, 
        user_script_path: str, 
        quota
    ) -> Path:
        """
        Generates the 'run.sbatch' file with strict admin-defined resource limits.
        """
        # Calculate full path to user script relative to job dir or absolute
        # We assume user_script_path is just the filename or relative path inside job_dir
        # But to be safe, we make it relative to job_dir execution context
        # script_path passed from DB is likely the filename uploaded.
        
        script_path = job_dir / user_script_path
        if not script_path.exists():
            raise SlurmError(f"User script not found at {script_path}")

        # Standardizing Sbatch Content
        sbatch_content = [
            "#!/bin/bash",
            f"#SBATCH --job-name={job_id}",
            f"#SBATCH --chdir={job_dir}",
            f"#SBATCH --output={job_id}.o",
            f"#SBATCH --error={job_id}.e",
            f"#SBATCH --cpus-per-task={quota.cpus_per_job}",
            f"#SBATCH --mem-per-cpu={quota.mem_mb_per_cpu}M",
            "", # Standard separator
            "echo '--- Job Started ---'",
            f"exec {venv_python_path} {user_script_path}",
            "echo '--- Job Finished ---'"
        ]

        # Write to file
        sbatch_file = job_dir / "run.sbatch"
        try:
            content = "\n".join(sbatch_content)
            with open(sbatch_file, 'w', encoding='utf-8') as f:
                f.write(content)
            
            # Log the content to terminal for user reference
            print(f"\n--- Generated Sbatch Content (Job {job_id}) ---")
            print(content)
            print(f"--------------------------------------------------\n")
            
            os.chmod(sbatch_file, 0o755)
            return sbatch_file
        except IOError as e:
            raise SlurmError(f"Failed to write sbatch file: {e}")

    def submit_job(self, job_dir: Path) -> int:
        """
        Submits the job using 'sbatch' from the job directory.
        Returns the SLURM Job ID.
        """
        sbatch_file = job_dir / "run.sbatch"
        if not sbatch_file.exists():
             raise SlurmError("run.sbatch file missing")

        cmd = [self.sbatch_bin, "run.sbatch"]
        
        try:
            # Execute sbatch with CWD = job directory
            result = subprocess.run(
                cmd,
                cwd=str(job_dir),
                capture_output=True,
                text=True,
                timeout=10, # Submission should be instant
                shell=False
            )

            if result.returncode != 0:
                raise SlurmError(f"sbatch submission failed: {result.stderr.strip()}")

            # Parse Output: "Submitted batch job 123456"
            match = re.search(r"Submitted batch job (\d+)", result.stdout)
            if not match:
                raise SlurmError(f"Could not parse SLURM Job ID from output: {result.stdout}")

            slurm_id = int(match.group(1))
            logger.info(f"Job submitted successfully. SLURM ID: {slurm_id}")
            return slurm_id

        except subprocess.TimeoutExpired:
            raise SlurmError("sbatch submission timed out")
        except FileNotFoundError:
             # Handle case where sbatch binary isn't found (Dev environment)
             if os.name == 'nt':
                 logger.warning("Windows Dev Environment: Mocking SLURM Submission")
                 return 99999
             raise SlurmError("sbatch binary not found")
        except OSError as e:
            raise SlurmError(f"OS Error during sbatch: {e}")

    def cancel_job(self, slurm_job_id: int):
        """
        Cancels a job using 'scancel'.
        """
        if not slurm_job_id:
            logger.warning("Attempted to cancel job with no SLURM ID")
            return

        cmd = [self.scancel_bin, str(slurm_job_id)]
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode != 0:
                # If job is already done, scancel might fail or warn. We log but don't strictly crash.
                logger.warning(f"scancel output: {result.stderr.strip()}")
            
            logger.info(f"Cancelled SLURM job {slurm_job_id}")
            
        except FileNotFoundError:
             if os.name == 'nt': return
             logger.error("scancel binary missing")

    def get_job_state(self, slurm_job_id: int) -> JobStatus:
        """
        Query job state using squeue (active) or sacct (history).
        Normalizes to SRS-defined JobStatus.
        """
        # 1. Try squeue (Active jobs)
        try:
            cmd = [self.squeue_bin, "--job", str(slurm_job_id), "--noheader", "--format=%T"]
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                state_str = result.stdout.strip()
                if state_str:
                    return self._normalize_slurm_state(state_str)
        except Exception:
            pass # Fall through to sacct
            
        # 2. Try sacct (Completed jobs)
        try:
            cmd = [self.sacct_bin, "--jobs", str(slurm_job_id), "--format=State", "--noheader", "--parsable2"]
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                 # sacct might return multiple lines for steps, take the first one usually (Batch job)
                 lines = result.stdout.strip().split('\n')
                 if lines:
                     # Usually "COMPLETED" or "FAILED"
                     # Sometimes "COMPLETED|0:0"
                     raw_state = lines[0].split('|')[0]
                     return self._normalize_slurm_state(raw_state)
                     
        except Exception as e:
            logger.error(f"Failed to query job state: {e}")
            
        return JobStatus.PENDING # Default fallback? Or Unknown? 

    def _normalize_slurm_state(self, slurm_state: str) -> JobStatus:
        """
        Normalize raw SLURM state string to JobStatus Enum.
        """
        s = slurm_state.upper()
        
        if s in ["RUNNING"]:
            return JobStatus.RUNNING
        if s in ["PENDING", "CONFIGURING", "RESIZING", "REQUEUED"]:
            return JobStatus.PENDING
        if s in ["COMPLETED"]:
            return JobStatus.COMPLETED
        if s in ["FAILED", "BOOT_FAIL", "NODE_FAIL", "OUT_OF_MEMORY", "TIMEOUT"]:
            return JobStatus.FAILED
        if s in ["CANCELLED", "PREEMPTED", "REVOKED"]:
            return JobStatus.CANCELLED
            
        return JobStatus.PENDING # Default conservative
