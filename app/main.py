from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas import JobRequest, JobResponse
from app.slurm import submit_job
from app.streamer import combined_log_stream
from app.status import job_status, cancel_job
from app.models import insert_job_log, update_job_status, get_job_log_status

app = FastAPI(title="SLURM Job Submission API")

@app.post("/submit", response_model=JobResponse)
def submit(job: JobRequest):
    print("Payload: ", job)
    job_id = submit_job(job)
    insert_job_log(job_id, job)
    return {"job_id": job_id, "status": "SUBMITTED"}

@app.get("/logs/{username}/{job_id}")
def logs(username: str, job_id: str):
    return StreamingResponse(
        combined_log_stream(username, job_id),
        media_type="text/plain"
    )

@app.get("/status/{job_id}")
def get_job_status_endpoint(job_id: str):
    s = job_status(job_id)
    if s == "NOT_FOUND":
        # Fallback to DB
        db_s = get_job_log_status(job_id)
        if db_s:
            s = db_s
    return {"job_id": job_id, "status": s}

@app.post("/cancel/{job_id}")
def cancel(job_id: str):
    try:
        s = cancel_job(job_id)
        update_job_status(job_id, s)
        return {"job_id": job_id, "status": s}
    except:
        raise HTTPException(status_code=400, detail="Cancel failed")
