import requests
from app.slurm import get_slurm_jwt, SLURM_JWT_USER, SLURM_REST_URL

def job_status(job_id):
    """
    Unified Status Fetcher via Slurm REST API.
    """
    jwt = get_slurm_jwt()
    if not jwt:
        return "UNKNOWN"
        
    headers = {
        "X-SLURM-USER-NAME": SLURM_JWT_USER,
        "X-SLURM-USER-TOKEN": jwt
    }
    
    try:
        # GET /job/{id} returns details for a single job
        url = f"{SLURM_REST_URL}/job/{job_id}"
        res = requests.get(url, headers=headers, timeout=5)
        
        if res.status_code == 404 and "v0.0.41" not in url:
             f_url = url.replace("v0.0.44", "v0.0.41")
             res = requests.get(f_url, headers=headers, timeout=5)
             
        if res.status_code == 200:
            data = res.json()
            jobs = data.get("jobs", [])
            if jobs:
                # v0.0.41 returns list even for single ID & state might be a list
                state_raw = jobs[0].get("job_state", "UNKNOWN")
                if isinstance(state_raw, list):
                    return state_raw[0].upper() if state_raw else "UNKNOWN"
                return str(state_raw or "UNKNOWN").upper()
        
        return "NOT_FOUND"
    except Exception as e:
        print(f"DEBUG: REST Status fetch error for {job_id}: {e}")
        return "UNKNOWN"

def cancel_job(job_id):
    """
    Cancel job via Slurm REST API.
    """
    jwt = get_slurm_jwt()
    if not jwt:
         return "ERROR"
         
    headers = {
        "X-SLURM-USER-NAME": SLURM_JWT_USER,
        "X-SLURM-USER-TOKEN": jwt
    }
    
    try:
        url = f"{SLURM_REST_URL}/job/{job_id}"
        res = requests.delete(url, headers=headers, timeout=5)
        
        if res.status_code == 404 and "v0.0.41" not in url:
             f_url = url.replace("v0.0.44", "v0.0.41")
             res = requests.delete(f_url, headers=headers, timeout=5)
             
        res.raise_for_status()
        return "CANCELLED"
    except Exception as e:
        print(f"DEBUG: REST Cancel error for {job_id}: {e}")
        return "ERROR"
