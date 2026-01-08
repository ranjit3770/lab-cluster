import subprocess

def job_status(job_id):
    try:
        out = subprocess.check_output(
            ["sacct", "-j", job_id, "--format=State", "--noheader"],
            stderr=subprocess.DEVNULL
        ).decode().strip()
        return out.split()[0] if out else "UNKNOWN"
    except:
        return "NOT_FOUND"

def cancel_job(job_id):
    subprocess.check_call(["scancel", job_id], stderr=subprocess.DEVNULL)
    return "CANCELLED"
