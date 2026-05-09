import os
import subprocess
import tempfile
import json
from typing import Any, Optional
from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.api import deps
from app.core.config import settings
from app.models.dev_node import DevNode as DevNodeModel

router = APIRouter()


class PlaybookCreds(BaseModel):
    ansible_user: Optional[str] = None
    ansible_password: Optional[str] = None


class BulkActionRequest(BaseModel):
    node_ids: list[int]
    ansible_user: Optional[str] = None
    ansible_password: Optional[str] = None

PLAYBOOK_DIR = os.getenv(
    "WINDOWS_PLAYBOOK_DIR",
    "/opt/amritacluster/SLURM-COMPLETE-SETUP/windows-boot-testing"
)


def _run_playbook(
    playbook_path: str,
    node_ip: str,
    node_name: str,
    ansible_user: str = "Administrator",
    ansible_password: Optional[str] = None,
    extra_vars: Optional[dict] = None,
) -> dict:
    if not os.path.exists(playbook_path):
        raise HTTPException(status_code=500, detail=f"Playbook not found: {playbook_path}")

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".ini", delete=False, prefix=f"inventory_{node_name}_"
    ) as f:
        f.write(f"[windows]\n{node_ip}\n\n")
        f.write(f"[windows:vars]\n")
        f.write("ansible_connection=winrm\n")
        f.write("ansible_port=5985\n")
        f.write("ansible_winrm_server_cert_validation=ignore\n")
        f.write("ansible_winrm_transport=ntlm\n")
        f.write(f"ansible_user={ansible_user}\n")
        if ansible_password:
            f.write(f"ansible_password={ansible_password}\n")
        f.write(f"\n[windows_nodes:children]\nwindows\n")
        inventory_path = f.name

    vars_json = {"ansible_host": node_ip}
    if extra_vars:
        vars_json.update(extra_vars)

    cmd = [
        "ansible-playbook",
        "-i", inventory_path,
        playbook_path,
        "-e", json.dumps(vars_json),
        "--timeout", "30",
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )
        return {
            "success": result.returncode == 0,
            "return_code": result.returncode,
            "stdout": result.stdout[-2000:] if result.stdout else "",
            "stderr": result.stderr[-2000:] if result.stderr else "",
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "return_code": -1,
            "stdout": "",
            "stderr": "Playbook execution timed out after 120 seconds",
        }
    except Exception as e:
        return {
            "success": False,
            "return_code": -1,
            "stdout": "",
            "stderr": str(e),
        }
    finally:
        try:
            os.unlink(inventory_path)
        except OSError:
            pass


@router.post("/nodes/{node_id}/setup-idle")
def setup_idle(
    node_id: int,
    creds: Optional[PlaybookCreds] = Body(None),
    db: Session = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_active_superuser),
):
    node = db.query(DevNodeModel).filter(DevNodeModel.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    node_ip = node.ip_address
    node_name = node.name
    winrm_user = creds.ansible_user if creds and creds.ansible_user else (node.ssh_username or "Administrator")
    winrm_password = creds.ansible_password if creds and creds.ansible_password else node.ssh_password

    grub_playbook = os.path.join(PLAYBOOK_DIR, "boot_to_ubuntu.yml")
    grub_result = _run_playbook(
        grub_playbook, node_ip, node_name,
        ansible_user=winrm_user, ansible_password=winrm_password,
        extra_vars={"skip_reboot": "true"},
    )
    if not grub_result["success"]:
        return {
            "status": "error",
            "step": "grub_config",
            "message": "Failed to configure GRUB boot entry",
            "details": grub_result,
        }

    idle_playbook = os.path.join(PLAYBOOK_DIR, "setup_windows_idle.yml")
    idle_result = _run_playbook(
        idle_playbook, node_ip, node_name,
        ansible_user=winrm_user, ansible_password=winrm_password,
    )
    if not idle_result["success"]:
        return {
            "status": "partial",
            "step": "idle_scheduler",
            "message": "GRUB configured but idle scheduler setup failed",
            "details": idle_result,
        }

    return {
        "status": "success",
        "message": f"Node {node_name} configured: Ubuntu boot entry set, idle scheduler active",
        "details": {"grub": grub_result, "idle": idle_result},
    }


@router.post("/nodes/{node_id}/switch-os")
def switch_os(
    node_id: int,
    creds: Optional[PlaybookCreds] = Body(None),
    db: Session = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_active_superuser),
):
    node = db.query(DevNodeModel).filter(DevNodeModel.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    node_ip = node.ip_address
    node_name = node.name
    winrm_user = creds.ansible_user if creds and creds.ansible_user else (node.ssh_username or "Administrator")
    winrm_password = creds.ansible_password if creds and creds.ansible_password else node.ssh_password

    playbook = os.path.join(PLAYBOOK_DIR, "boot_to_ubuntu.yml")
    result = _run_playbook(playbook, node_ip, node_name,
        ansible_user=winrm_user, ansible_password=winrm_password)

    if result["success"]:
        return {
            "status": "success",
            "message": f"Node {node_name} switching to Ubuntu. System will reboot shortly.",
            "details": result,
        }
    else:
        return {
            "status": "error",
            "message": f"Failed to switch OS for node {node_name}",
            "details": result,
        }


def _bulk_run(
    node_ids: list[int],
    db: Session,
    action: str,
    creds: Optional[PlaybookCreds] = None,
) -> list[dict]:
    results: list[dict] = []
    for node_id in node_ids:
        node = db.query(DevNodeModel).filter(DevNodeModel.id == node_id).first()
        if not node:
            results.append({"node_id": node_id, "status": "error", "message": "Node not found"})
            continue

        node_ip = node.ip_address
        node_name = node.name
        winrm_user = creds.ansible_user if creds and creds.ansible_user else (node.ssh_username or "Administrator")
        winrm_password = creds.ansible_password if creds and creds.ansible_password else node.ssh_password

        if action == "setup_idle":
            grub_playbook = os.path.join(PLAYBOOK_DIR, "boot_to_ubuntu.yml")
            grub_result = _run_playbook(grub_playbook, node_ip, node_name,
                ansible_user=winrm_user, ansible_password=winrm_password,
                extra_vars={"skip_reboot": "true"})
            if not grub_result["success"]:
                results.append({"node_id": node_id, "status": "error", "step": "grub_config", "message": f"GRUB config failed for {node_name}", "details": grub_result})
                continue

            idle_playbook = os.path.join(PLAYBOOK_DIR, "setup_windows_idle.yml")
            idle_result = _run_playbook(idle_playbook, node_ip, node_name,
                ansible_user=winrm_user, ansible_password=winrm_password)
            if not idle_result["success"]:
                results.append({"node_id": node_id, "status": "partial", "step": "idle_scheduler", "message": f"GRUB ok but idle setup failed for {node_name}", "details": idle_result})
                continue

            results.append({"node_id": node_id, "status": "success", "message": f"{node_name} configured for idle"})

        elif action == "switch_os":
            playbook = os.path.join(PLAYBOOK_DIR, "boot_to_ubuntu.yml")
            result = _run_playbook(playbook, node_ip, node_name,
                ansible_user=winrm_user, ansible_password=winrm_password)
            if result["success"]:
                results.append({"node_id": node_id, "status": "success", "message": f"{node_name} switching to Ubuntu"})
            else:
                results.append({"node_id": node_id, "status": "error", "message": f"Switch OS failed for {node_name}", "details": result})

    return results


@router.post("/nodes/bulk/setup-idle")
def bulk_setup_idle(
    request: BulkActionRequest,
    db: Session = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_active_superuser),
):
    creds = PlaybookCreds(ansible_user=request.ansible_user, ansible_password=request.ansible_password) if (request.ansible_user or request.ansible_password) else None
    results = _bulk_run(request.node_ids, db, "setup_idle", creds=creds)
    successes = sum(1 for r in results if r["status"] == "success")
    return {"results": results, "total": len(results), "successful": successes}


@router.post("/nodes/bulk/switch-os")
def bulk_switch_os(
    request: BulkActionRequest,
    db: Session = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_active_superuser),
):
    creds = PlaybookCreds(ansible_user=request.ansible_user, ansible_password=request.ansible_password) if (request.ansible_user or request.ansible_password) else None
    results = _bulk_run(request.node_ids, db, "switch_os", creds=creds)
    successes = sum(1 for r in results if r["status"] == "success")
    return {"results": results, "total": len(results), "successful": successes}
