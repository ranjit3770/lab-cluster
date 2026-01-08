import os, time
from app.config import DATA_ROOT, LOG_SLEEP

def combined_log_stream(username, job_id):
    base = f"{DATA_ROOT}/{username}/slurm_logs"
    out = f"{base}/{username}_{job_id}.out"
    err = f"{base}/{username}_{job_id}.err"

    print(f"DEBUG: Looking for logs at:\n  OUT: {out}\n  ERR: {err}")

    while not (os.path.exists(out) or os.path.exists(err)):
        print(f"DEBUG: Waiting for logs... {out} or {err}")
        time.sleep(LOG_SLEEP)

    fout = open(out, "r") if os.path.exists(out) else None
    ferr = open(err, "r") if os.path.exists(err) else None

    if fout: fout.seek(0, 2)
    if ferr: ferr.seek(0, 2)

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
                time.sleep(LOG_SLEEP)
    finally:
        if fout: fout.close()
        if ferr: ferr.close()
