from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Internal backend service for executing compute jobs on SLURM."
)

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.VERSION}

@app.get("/")
def root():
    return {"message": "FastAPI Job Execution API is running. Access via Internal Portal only."}

from app.api.v1.jobs import router as jobs_router
app.include_router(jobs_router, prefix=settings.API_V1_STR, tags=["jobs"])
