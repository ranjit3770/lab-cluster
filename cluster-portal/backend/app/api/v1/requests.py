from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from app.api import deps
from app.models.request import Request
from app.schemas.request import Request as RequestSchema, RequestCreate, RequestUpdate

router = APIRouter()

@router.get("/", response_model=List[RequestSchema])
def read_requests(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user = Depends(deps.get_current_active_user),
) -> Any:
    """
    Retrieve requests. Admins see all, users see their own.
    """
    if current_user.role == "admin":
        requests = db.query(Request).offset(skip).limit(limit).all()
    else:
        requests = db.query(Request).filter(Request.user_id == current_user.id).offset(skip).limit(limit).all()
    return requests

@router.get("/{request_id}", response_model=RequestSchema)
def read_request(
    request_id: int,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user),
) -> Any:
    """
    Get request by ID.
    """
    request = db.query(Request).filter(Request.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    if current_user.role != "admin" and request.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return request

@router.post("/", response_model=RequestSchema)
def create_request(
    *,
    db: Session = Depends(deps.get_db),
    request_in: RequestCreate,
    current_user = Depends(deps.get_current_active_user),
) -> Any:
    """
    Create a new request. Only standard users can request resources.
    """
    if current_user.role == "admin":
        raise HTTPException(
            status_code=403, 
            detail="Administrative accounts cannot submit resource tickets. Manage allocations via the oversight panel."
        )
    request = Request(
        request_type=request_in.request_type,
        cpu_cores=request_in.cpu_cores,
        ram_gb=request_in.ram_gb,
        storage_gb=request_in.storage_gb,
        status="pending",
        user_id=current_user.id
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request

@router.put("/{request_id}", response_model=RequestSchema)
def update_request(
    *,
    db: Session = Depends(deps.get_db),
    request_id: int,
    request_in: RequestUpdate,
    current_user = Depends(deps.get_current_active_user),
) -> Any:
    """
    Update a request (e.g., status). Only admins can update status.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    request = db.query(Request).filter(Request.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
        
    if request_in.status:
        request.status = request_in.status
        if request_in.status in ["approved", "rejected"]:
            request.resolved_at = datetime.utcnow()
            
    db.add(request)
    db.commit()
    db.refresh(request)
    return request
