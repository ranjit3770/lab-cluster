import os, time
from app.config import DATA_ROOT, LOG_SLEEP

from app.status import job_status

def combined_log_stream(username, job_id):
    base = f"{DATA_ROOT}/{username}/slurm_logs"
    out = f"{base}/{username}_{job_id}.out"
    err = f"{base}/{username}_{job_id}.err"

    # Wait for files to appear or job to finish (fail fast if invalid job)
    waits = 0
    while not (os.path.exists(out) or os.path.exists(err)):
        if waits > 10 and job_status(job_id) in ["FAILED", "COMPLETED", "CANCELLED", "NOT_FOUND"]:
            yield f"Job finished (status: {job_status(job_id)}) but logs were not found.\n"
            return
        time.sleep(LOG_SLEEP)
        waits += 1

    fout = open(out, "r") if os.path.exists(out) else None
    ferr = open(err, "r") if os.path.exists(err) else None

    if fout: fout.seek(0, 0)
    if ferr: ferr.seek(0, 0)

    # Terminal states where we should stop after draining logs
    TERMINAL_STATES = {
        "COMPLETED", "FAILED", "CANCELLED", "TIMEOUT", "NODE_FAIL", 
        "PREEMPTED", "BOOT_FAIL", "DEADLINE", "OUT_OF_MEMORY",
        "NOT_FOUND", "UNKNOWN"
    }

    try:
        while True:
            emitted = False
            if fout:
                line = fout.readline()
                if line:
                    yield line
                    emitted = True
            if ferr:
                line = ferr.readline()
                if line:
                    yield f"[stderr] {line}"
                    emitted = True
            
            if not emitted:
                status = job_status(job_id)
                # First check if the main job status indicates done
                # Note: sacct might return multiple lines/states; we assume job_status handles basic parsing
                if status in TERMINAL_STATES:
                    break
                time.sleep(LOG_SLEEP)
    finally:
        if fout: fout.close()
        if ferr: ferr.close()
