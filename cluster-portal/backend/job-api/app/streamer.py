import os, time
from app.config import DATA_ROOT, LOG_SLEEP

from app.status import job_status
from app.models import update_job_status

def combined_log_stream(username, job_id):
    base = f"{DATA_ROOT}/{username}/slurm_logs"
    out = f"{base}/{username}_{job_id}.out"
    err = f"{base}/{username}_{job_id}.err"

    if not (os.path.exists(out) or os.path.exists(err)):
        status = job_status(job_id)
        if status == "PENDING":
             yield "Job is accepted by Slurm and is queued or starting."
        elif status == "UNKNOWN":
             yield "Job status unknown. It may have failed or not submitted properly."
        elif status == "RUNNING":
             yield "Job started, logs will appear shortly."
        elif status == "COMPLETED":
             yield "No logs generated."
        else:
             yield "Logs unavailable."
        return

    try:
        if os.path.exists(out):
            with open(out, "r") as f:
                for line in f:
                    if line.startswith("[SYSTEM LOG]"):
                        yield line
                    else:
                        yield f"[SCRIPT LOGS] {line}"
        if os.path.exists(err):
            with open(err, "r") as f:
                for line in f:
                    yield f"[stderr] {line}"
    except Exception as e:
        yield f"[ERROR] Failed to read logs: {e}\n"
