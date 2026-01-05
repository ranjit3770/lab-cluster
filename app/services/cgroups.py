import os
import time
import logging
from pathlib import Path
from app.core.config import settings
from app.core.errors import JobExecutionError
from app.services.slurm import SlurmService

logger = logging.getLogger(__name__)

class CgroupError(JobExecutionError):
    pass

class CgroupService:
    # Timeout waiting for SLURM to create the cgroup (Seconds)
    CGROUP_WAIT_TIMEOUT = 10
    CGROUP_POLL_INTERVAL = 0.5

    def _get_device_maj_min(self, path: Path) -> str:
        """
        Derive the Major:Minor device numbers for the filesystem at the given path.
        """
        try:
            stat_info = os.stat(path)
            # st_dev holds the device ID
            dev_id = stat_info.st_dev
            major = os.major(dev_id)
            minor = os.minor(dev_id)
            return f"{major}:{minor}"
        except OSError as e:
            raise CgroupError(f"Failed to determine block device for {path}: {e}")

    def enforce_limits(
        self, 
        job_id: str, 
        slurm_job_id: int, 
        uid: int, 
        job_dir: Path, 
        quota, 
        slurm_service: SlurmService
    ):
        """
        Enforce Strict I/O limits via Cgroups v2.
        Fails-Closed: If enforcement fails, the job IS CANCELLED.
        """
        # 0. Check if we are on Windows (Dev mode shortcut)
        if os.name == 'nt':
            logger.warning("Windows System detected: Skipping Cgroup enforcement (Mock Compliance).")
            return

        logger.info(f"Starting Cgroup enforcement for Job {job_id} (SLURM {slurm_job_id})")

        try:
            # 1. Determine Target Device (Where the job is running/writing)
            device_key = self._get_device_maj_min(job_dir)
            
            # 2. Construct Limit String
            # io.max format: "$MAJ:$MIN rb=$BPS wb=$BPS riops=$IOPS wiops=$IOPS"
            # DB stores MB/s, io.max wants Bytes/s
            rb_bps = quota.read_limit_mb_s * 1024 * 1024
            wb_bps = quota.write_limit_mb_s * 1024 * 1024
            
            limit_str = (
                f"{device_key} "
                f"rb={rb_bps} "
                f"wb={wb_bps} "
                f"riops={quota.read_iops} "
                f"wiops={quota.write_iops}"
            )

            # 3. Locate Cgroup Directory (Flexible Search)
            # SLURM structures vary (uid_{uid}/job_{id} or just job_{id})
            # We search for the specific job directory under the root
            
            cgroup_root = Path(settings.CGROUP_ROOT)
            io_max_file = None
            
            logger.info(f"Searching for Cgroup directory in {cgroup_root}...")
            
            start_time = time.time()
            found_path = None
            
            while time.time() - start_time < self.CGROUP_WAIT_TIMEOUT:
                # Search recursively for the job directory
                # Pattern: **/job_{slurm_job_id}
                matches = list(cgroup_root.glob(f"**/job_{slurm_job_id}"))
                if matches:
                    found_path = matches[0]
                    io_max_file = found_path / "io.max"
                    if io_max_file.exists():
                        break
                time.sleep(self.CGROUP_POLL_INTERVAL)

            if not io_max_file or not io_max_file.exists():
                # Debug: list what we DO see in the root
                existing = [str(p.name) for p in cgroup_root.iterdir() if p.is_dir()]
                raise CgroupError(
                    f"Cgroup 'io.max' not found for SLURM {slurm_job_id} after {self.CGROUP_WAIT_TIMEOUT}s. "
                    f"Checked root: {cgroup_root}. Found folders: {existing}. "
                    "Note: If this is a multi-node cluster, ensure the API is running on the same node as the job."
                )
            
            logger.info(f"Found Cgroup at {found_path}")

            # 4. Apply Limits
            logger.debug(f"Writing limits to {io_max_file}: {limit_str}")
            with open(io_max_file, 'w') as f:
                f.write(limit_str)
            
            logger.info(f"Successfully enforced I/O limits for Job {job_id}")

        except Exception as e:
            logger.critical(f"Cgroup Enforcement FAILED for Job {job_id}: {e}")
            logger.critical("FAIL-CLOSED: Cancelling Job...")
            
            # EMERGENCY CANCELLATION
            try:
                slurm_service.cancel_job(slurm_job_id)
            except Exception as cancel_exc:
                logger.critical(f"Failed to cancel job during emergency abort! {cancel_exc}")
            
            # Re-raise to ensure API reports failure
            raise CgroupError(f"I/O Enforcement Failed, Job Cancelled. Reason: {e}")
