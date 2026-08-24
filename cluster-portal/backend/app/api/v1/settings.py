from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.api import deps
from app.core import audit
from app.models.system_setting import SystemSetting, MaintenanceIP
from pydantic import BaseModel

router = APIRouter()

class SettingSchema(BaseModel):
    key: str
    value: str
    description: Optional[str] = None

    class Config:
        from_attributes = True

class MaintenanceIPSchema(BaseModel):
    id: int
    ip_address: str
    label: Optional[str] = None

    class Config:
        from_attributes = True

class MaintenanceIPCreate(BaseModel):
    ip_address: str
    label: Optional[str] = None

@router.get("", response_model=List[SettingSchema])
def get_settings(
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_superuser),
) -> Any:
    return db.query(SystemSetting).all()

@router.put("/{key}")
def update_setting(
    key: str,
    value: str,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_superuser),
) -> Any:
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    old_value = setting.value
    setting.value = value
    db.commit()
    audit.record(
        db, action="setting.update", user=current_user,
        resource=f"setting:{key}", detail=f"'{old_value}' -> '{value}'",
        request=request,
    )
    return {"status": "updated", "key": key, "value": value}

# --- Maintenance IP Management ---

@router.get("/maintenance/ips", response_model=List[MaintenanceIPSchema])
def get_maintenance_ips(
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_superuser)
):
    return db.query(MaintenanceIP).all()

@router.post("/maintenance/ips", response_model=MaintenanceIPSchema)
def add_maintenance_ip(
    ip_in: MaintenanceIPCreate,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_superuser)
):
    existing = db.query(MaintenanceIP).filter(MaintenanceIP.ip_address == ip_in.ip_address).first()
    if existing:
        raise HTTPException(status_code=400, detail="IP already whitelisted")
    
    ip = MaintenanceIP(ip_address=ip_in.ip_address, label=ip_in.label)
    db.add(ip)
    db.commit()
    db.refresh(ip)
    audit.record(
        db, action="maintenance_ip.add", user=current_user,
        resource=f"ip:{ip_in.ip_address}", detail=ip_in.label,
        request=request,
    )
    return ip

@router.delete("/maintenance/ips/{ip_id}")
def remove_maintenance_ip(
    ip_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_superuser)
):
    ip = db.query(MaintenanceIP).filter(MaintenanceIP.id == ip_id).first()
    if not ip:
        raise HTTPException(status_code=404, detail="Enrty not found")
    removed_ip = ip.ip_address
    db.delete(ip)
    db.commit()
    audit.record(
        db, action="maintenance_ip.remove", user=current_user,
        resource=f"ip:{removed_ip}", request=request,
    )
    return {"message": "IP removed from whitelist"}
