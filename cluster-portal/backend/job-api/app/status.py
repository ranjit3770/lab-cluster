import subprocess

def job_status(job_id):
    """
    Unified Status Fetcher for Production.
    Tries 'squeue' (live) first, then 'sacct' (history).
    """
    try:
        # 1. Try squeue first (running/pending jobs)
        live_out = subprocess.check_output(
            ["squeue", "-j", str(job_id), "--noheader", "--format=%T"],
            stderr=subprocess.STDOUT
        ).decode().strip()
        
        if live_out:
            return live_out.upper()
            
        # 2. Try sacct as fallback (completed jobs)
        out = subprocess.check_output(
            ["sacct", "-j", str(job_id), "--format=State%20", "--noheader", "--parsable"],
            stderr=subprocess.STDOUT
        ).decode().strip()
        
        if out:
            # First line of parsable sacct is usually the job itself
            lines = [line.split('|')[0] for line in out.splitlines() if line]
            if lines:
                return lines[0].strip().upper()
                
        return "UNKNOWN"
    except Exception as e:
        # If both fail, it's either just submitted or absolutely missing
        print(f"DEBUG: Status fetch error for {job_id}: {e}")
        return "NOT_FOUND"

def cancel_job(job_id):
    subprocess.check_call(["scancel", job_id], stderr=subprocess.DEVNULL)
    return "CANCELLED"
