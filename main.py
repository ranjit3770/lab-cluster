from fastapi import FastAPI
from app.core.config import settings

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Internal backend service for executing compute jobs on SLURM."
)

@app.get("/health")
def health_check():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.VERSION}

@app.get("/")
def root():
    return {"message": "FastAPI Job Execution API is running. Access via Internal Portal only."}

from app.api.v1.jobs import router as jobs_router
app.include_router(jobs_router, prefix="/api/v1", tags=["jobs"])
