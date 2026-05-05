from typing import Any, List
from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.api import deps
from app.core import security
from app.core.config import settings
from app.models.user import User, UserRole
from app.models.job import Job, JobStatus
from app.schemas.user import UserSchema, UserCreate, UserUpdate, UserDashboardStats
from app.core.config import settings
import os
import sqlalchemy.exc
import subprocess

router = APIRouter()

@router.get("/me", response_model=UserSchema)
def read_user_me(
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Get current user.
    """
    return current_user

def get_dir_size(start_path = '.'):
    total_size = 0
    try:
        for dirpath, dirnames, filenames in os.walk(start_path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                # skip if it is symbolic link
                if not os.path.islink(fp):
                    total_size += os.path.getsize(fp)
    except Exception:
        pass
    return total_size

@router.get("/me/dashboard", response_model=UserDashboardStats)
def read_user_dashboard(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Get current user's dashboard stats.
    """
    running_jobs = db.query(Job).filter(Job.owner_id == current_user.id, Job.status == "running").count()
    pending_jobs = db.query(Job).filter(Job.owner_id == current_user.id, Job.status == "pending").count()
    completed_jobs = db.query(Job).filter(Job.owner_id == current_user.id, Job.status == "completed").count()
    failed_jobs = db.query(Job).filter(Job.owner_id == current_user.id, Job.status == "failed").count()
    cancelled_jobs = db.query(Job).filter(Job.owner_id == current_user.id, Job.status == "cancelled").count()
    
    # Storage calculation
    user_path = os.path.join(settings.DATA_STORAGE, current_user.username)
    used_bytes = get_dir_size(user_path)
    used_gb = used_bytes / (1024 ** 3)
    
    # Slurm usage check
    cpu_used = 0.0
    ram_used = 0.0
    try:
        output = subprocess.check_output(
            ["squeue", "-u", current_user.username, "--noheader", "--format=%C %m"]
        ).decode()
        for line in output.strip().split('\n'):
            if not line.strip(): continue
            parts = line.split()
            if len(parts) >= 2:
                cpu_used += int(parts[0])
                ram_str = parts[1].rstrip('M').rstrip('G')
                try:
                    val = int(ram_str)
                    if 'G' in parts[1]: val *= 1024
                    ram_used += float(val) / 1024.0
                except:
                    pass
    except Exception:
        pass

    return {
        "cpu_limit": current_user.cpu_limit or 0,
        "memory_limit_gb": current_user.memory_limit_gb or 0,
        "cpu_used": cpu_used,
        "ram_used": ram_used,
        "total_jobs": running_jobs + completed_jobs + failed_jobs + cancelled_jobs,
        "running_jobs": running_jobs,
        "pending_jobs": pending_jobs,
        "completed_jobs": completed_jobs,
        "failed_jobs": failed_jobs,
        "cancelled_jobs": cancelled_jobs,
        "storage_limit_gb": current_user.storage_limit_gb or 15,
        "storage_used_gb": round(used_gb, 4)
    }

@router.post("/", response_model=UserSchema)
def create_user(
    *,
    db: Session = Depends(deps.get_db),
    user_in: UserCreate,
) -> Any:
    """
    Create new user.
    """
    user = db.query(User).filter(User.email == user_in.email).first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists.",
        )
    user_by_username = db.query(User).filter(User.username == user_in.username).first()
    if user_by_username:
         raise HTTPException(
            status_code=400,
            detail="The user with this username already exists.",
        )
    
    db_obj = User(
        full_name=user_in.full_name,
        email=user_in.email,
        username=user_in.username,
        hashed_password=security.get_password_hash(user_in.password),
        role=user_in.role,
        is_active=user_in.is_active,
        cpu_limit=user_in.cpu_limit,
        memory_limit_gb=user_in.memory_limit_gb,
        storage_limit_gb=user_in.storage_limit_gb or 15
    )
    try:
        db.add(db_obj)
        db.commit()
    except sqlalchemy.exc.IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="The user with this email or username already exists (Concurrent collision).",
        )
    db.refresh(db_obj)

    # Create user storage directory and system user
    try:
        username = db_obj.username
        user_path = os.path.join(settings.DATA_STORAGE, username)
        
        # 1. Create system user
        # Check if user already exists in system to avoid errors
        check_user = subprocess.run(['id', username], capture_output=True)
        if check_user.returncode != 0:
            print(f"Provisioning system account for: {username}")
            subprocess.run(['sudo', 'useradd', '-m', username], check=True)
            # Synchronize OS-level password with portal credentials
            p_str = f"{username}:{user_in.password}"
            subprocess.run(['sudo', 'chpasswd'], input=p_str.encode(), check=True)
        
        # 2. Ensure storage path exists
        if not os.path.exists(user_path):
            os.makedirs(user_path, exist_ok=True)
        
        # 3. Assign deep ownership to the system user
        print(f"Delegating storage permissions: {user_path} -> {username}")
        subprocess.run(['sudo', 'chown', '-R', f'{username}:{username}', user_path], check=True)
        
    except subprocess.CalledProcessError as e:
        print(f"OS Orchestration Failure for {db_obj.username}: {e}")
    except Exception as e:
        print(f"Error provisioning environment for user {db_obj.username}: {e}")
        # We don't necessarily want to fail user creation if directory fails, 
        # but in many cases we might. For now, let's just log it.

    return db_obj

@router.get("/", response_model=List[UserSchema])
def read_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_superuser),
) -> Any:
    """
    Retrieve users. Only for admin. Hidden developer role.
    """
    users = db.query(User).filter(User.role != UserRole.DEVELOPER).offset(skip).limit(limit).all()
    return users

@router.put("/{user_id}", response_model=UserSchema)
def update_user(
    *,
    db: Session = Depends(deps.get_db),
    user_id: int,
    user_in: UserUpdate,
    current_user: User = Depends(deps.get_current_active_superuser),
) -> Any:
    """
    Update a user.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = user_in.model_dump(exclude_unset=True)
    if "password" in update_data and update_data["password"]:
        user.hashed_password = security.get_password_hash(update_data["password"])
        del update_data["password"]
    
    for field in update_data:
        setattr(user, field, update_data[field])
    
    try:
        db.add(user)
        db.commit()
    except sqlalchemy.exc.IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="The identity parameters (email or username) are already collision-locked by another user.",
        )
    db.refresh(user)
    return user

@router.delete("/{user_id}", response_model=UserSchema)
def delete_user(
    *,
    db: Session = Depends(deps.get_db),
    user_id: int,
    current_user: User = Depends(deps.get_current_active_superuser),
) -> Any:
    """
    Delete a user. Protections for Admin.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Administrative accounts cannot be deleted directly.")
    
    username = user.username
    user_path = os.path.join(settings.DATA_STORAGE, username)

    # OS-Level De-provisioning
    try:
        # 1. Terminate system account and home directory
        print(f"Revoking system account for: {username}")
        subprocess.run(['sudo', 'userdel', '-r', username], capture_output=True)

        # 2. Nuke designated storage partition
        if os.path.exists(user_path):
            print(f"Purging storage partition: {user_path}")
            subprocess.run(['sudo', 'rm', '-rf', user_path], check=True)
            
    except subprocess.CalledProcessError as e:
        print(f"OS De-provisioning Failure for {username}: {e}")
    except Exception as e:
        print(f"Error purging environment for user {username}: {e}")

    db.delete(user)
    db.commit()
    return user
