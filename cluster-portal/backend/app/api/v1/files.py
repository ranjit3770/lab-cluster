import os
import shutil
import datetime
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.api import deps
from app.core.config import settings
from app.models.user import User

router = APIRouter()

def get_user_storage_path(username: str) -> str:
    path = os.path.join(settings.DATA_STORAGE, username)
    if not os.path.exists(path):
        os.makedirs(path, exist_ok=True)
    return path

def safe_path_join(base: str, *paths: str) -> str:
    """ Joins paths and ensures the result is within the base directory. """
    joined = os.path.normpath(os.path.join(base, *paths))
    if not joined.startswith(os.path.normpath(base)):
        raise HTTPException(status_code=400, detail="Invalid path traversal attempt")
    return joined

@router.get("/list")
def list_files(
    path: str = Query("", description="Relative path from user root"),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    user_root = get_user_storage_path(current_user.username)
    target_path = safe_path_join(user_root, path)
    
    if not os.path.isdir(target_path):
        raise HTTPException(status_code=404, detail="Directory not found")
    
    

    items = []
    for entry in os.scandir(target_path):
        info = entry.stat()
        mtime = datetime.datetime.fromtimestamp(info.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
        items.append({
            "name": entry.name,
            "isFolder": entry.is_dir(),
            "size": f"{info.st_size / 1024:.1f} KB" if not entry.is_dir() else "--",
            "modified": mtime,
            "type": "Folder" if entry.is_dir() else entry.name.split('.')[-1].upper() if '.' in entry.name else "File"
        })
    
    return items

@router.post("/upload")
async def upload_file(
    path: str = Query("", description="Target directory relative to user root"),
    overwrite: bool = Query(True, description="Overwrite if exists"),
    file: UploadFile = File(...),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    user_root = get_user_storage_path(current_user.username)
    target_dir = safe_path_join(user_root, path)
    
    if not os.path.isdir(target_dir):
        os.makedirs(target_dir, exist_ok=True)
        
    file_path = os.path.join(target_dir, file.filename)
    
    if not overwrite and os.path.exists(file_path):
         raise HTTPException(status_code=400, detail=f"File already exists: {file.filename}")

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    print(f"DEBUG: Upload Complete. File saved.")
        
    return {"filename": file.filename, "status": "Uploaded Protocol Finalized"}

@router.delete("/delete")
def delete_file(
    path: str = Query(..., description="Path to file or directory relative to user root"),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    user_root = get_user_storage_path(current_user.username)
    target_path = safe_path_join(user_root, path)
    
    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="Target not found")
        
    if os.path.isdir(target_path):
        shutil.rmtree(target_path)
    else:
        os.remove(target_path)
        
    return {"status": "Object Purged from Cluster"}

@router.get("/download")
def download_file(
    path: str = Query(..., description="Path to file relative to user root"),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    user_root = get_user_storage_path(current_user.username)
    target_path = safe_path_join(user_root, path)
    
    if not os.path.isfile(target_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(target_path, filename=os.path.basename(target_path))

@router.post("/create-folder")
def create_folder(
    path: str = Query(..., description="Path to new folder relative to user root"),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    user_root = get_user_storage_path(current_user.username)
    target_path = safe_path_join(user_root, path)
    
    if os.path.exists(target_path):
        raise HTTPException(status_code=400, detail="Path already exists")
        
    os.makedirs(target_path, exist_ok=True)
    return {"status": "Folder created successfully"}

@router.get("/tree")
def get_file_tree(
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Returns a flat list of all files and folders recursively for the current user.
    Used for frontend selectors (scripts, requirements, and dependency paths).
    """
    user_root = get_user_storage_path(current_user.username)
    tree = []
    
    for root, dirs, files in os.walk(user_root):
        # Calculate relative path from user root
        rel_root = os.path.relpath(root, user_root)
        if rel_root == ".":
            rel_root = ""
            
        # Add directories
        for d in dirs:
            dir_rel_path = os.path.join(rel_root, d).replace("\\", "/")
            tree.append({
                "name": d,
                "path": dir_rel_path,
                "isFolder": True
            })
            
        # Add files
        for f in files:
            file_rel_path = os.path.join(rel_root, f).replace("\\", "/")
            tree.append({
                "name": f,
                "path": file_rel_path,
                "isFolder": False
            })
            
    return tree

@router.post("/rename")
def rename_file(
    path: str = Query(..., description="Original path relative to user root"),
    new_name: str = Query(..., description="New name for the file/folder"),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    user_root = get_user_storage_path(current_user.username)
    target_path = safe_path_join(user_root, path)
    
    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="Original not found")
        
    parent_dir = os.path.dirname(target_path)
    new_name_basename = os.path.basename(new_name)
    new_path = os.path.join(parent_dir, new_name_basename)
    
    if os.path.exists(new_path):
        raise HTTPException(status_code=400, detail="New name already exists")
        
    os.rename(target_path, new_path)
    return {"status": "Object Renamed"}