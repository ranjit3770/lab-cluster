from fastapi import APIRouter
from app.api.v1 import login, users, dashboard, nodes, jobs, requests, files, feedback, developer

api_router = APIRouter()
api_router.include_router(login.router, tags=["login"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(dashboard.router, prefix="/system-info", tags=["dashboard"])
api_router.include_router(nodes.router, prefix="/compute-resources", tags=["compute"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
api_router.include_router(requests.router, prefix="/requests", tags=["requests"])
api_router.include_router(files.router, prefix="/files", tags=["files"])
api_router.include_router(feedback.router, prefix="/feedback", tags=["feedback"])
api_router.include_router(developer.router, prefix="/developer", tags=["developer"])
from app.api.v1 import settings
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
