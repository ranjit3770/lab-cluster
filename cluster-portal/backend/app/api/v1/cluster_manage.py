import os
import subprocess
import threading
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from app.api import deps

router = APIRouter()

ANSIBLE_DIR = os.getenv("ANSIBLE_DIR", "/opt/amritacluster/lab-cluster/ansible")
ANSIBLE_PLAYBOOKS = os.path.join(ANSIBLE_DIR, "playbooks", "deployment")
ANSIBLE_INVENTORY = os.path.join(ANSIBLE_DIR, "inventory", "hosts.ini")
ANSIBLE_CFG = os.path.join(ANSIBLE_DIR, "ansible.cfg")

_run_state: Dict[str, Dict[str, Any]] = {}
_state_lock = threading.Lock()


class ClusterSetupRequest(BaseModel):
    target_nodes: Optional[str] = None


class ClusterAppendRequest(BaseModel):
    node_ip: str
    node_name: str
    ssh_port: int = 22
    ssh_user: str = "root"
    ssh_password: Optional[str] = None
    node_os: str = "ubuntu"


class ClusterManageStatusResponse(BaseModel):
    task_id: str
    status: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    return_code: Optional[int] = None
    message: str


class ClusterManageLogsResponse(BaseModel):
    task_id: str
    stdout: str
    stderr: str


def _run_ansible_playbook(
    task_id: str,
    playbook: str,
    tags: Optional[str] = None,
    extra_args: Optional[List[str]] = None,
    inventory: Optional[str] = None,
) -> None:
    global _run_state

    playbook_path = os.path.join(ANSIBLE_PLAYBOOKS, playbook)
    if not os.path.exists(playbook_path):
        with _state_lock:
            _run_state[task_id] = {
                "status": "failed",
                "return_code": -1,
                "stderr": f"Playbook not found: {playbook_path}",
                "completed_at": datetime.utcnow().isoformat(),
            }
        return

    inventory_path = inventory or ANSIBLE_INVENTORY
    if not os.path.exists(inventory_path):
        with _state_lock:
            _run_state[task_id] = {
                "status": "failed",
                "return_code": -1,
                "stderr": f"Inventory not found: {inventory_path}",
                "completed_at": datetime.utcnow().isoformat(),
            }
        return

    cmd = [
        "ansible-playbook",
        "-i", inventory_path,
        playbook_path,
        "--timeout", "600",
    ]

    if tags:
        cmd.extend(["--tags", tags])

    if extra_args:
        cmd.extend(extra_args)

    env = os.environ.copy()
    env["ANSIBLE_HOST_KEY_CHECKING"] = "False"
    env["ANSIBLE_STDOUT_CALLBACK"] = "yaml"

    with _state_lock:
        _run_state[task_id] = {
            "status": "running",
            "started_at": datetime.utcnow().isoformat(),
            "completed_at": None,
            "return_code": None,
            "stdout": "",
            "stderr": "",
            "cmd": " ".join(cmd),
        }

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
            cwd=ANSIBLE_DIR,
        )
        stdout, stderr = proc.communicate(timeout=900)

        with _state_lock:
            _run_state[task_id].update({
                "status": "completed" if proc.returncode == 0 else "failed",
                "return_code": proc.returncode,
                "stdout": stdout[-50000:] if stdout else "",
                "stderr": stderr[-10000:] if stderr else "",
                "completed_at": datetime.utcnow().isoformat(),
            })
    except subprocess.TimeoutExpired:
        proc.kill()
        with _state_lock:
            _run_state[task_id].update({
                "status": "timeout",
                "return_code": -1,
                "stderr": "Playbook execution timed out after 900 seconds",
                "completed_at": datetime.utcnow().isoformat(),
            })
    except Exception as e:
        with _state_lock:
            _run_state[task_id].update({
                "status": "error",
                "return_code": -1,
                "stderr": str(e),
                "completed_at": datetime.utcnow().isoformat(),
            })


@router.post("/setup", response_model=ClusterManageStatusResponse)
def run_cluster_setup(
    background_tasks: BackgroundTasks,
    _: None = Depends(deps.require_roles("admin", "developer")),
) -> Any:
    """
    Run full cluster setup. Executes cluster_manage.yml to configure
    the head node, Slurm, and optionally discover compute nodes.
    """
    with _state_lock:
        running = [t for t, s in _run_state.items() if s.get("status") == "running"]
        if running:
            raise HTTPException(
                status_code=409,
                detail=f"A cluster operation is already in progress (task_id: {running[0]}).",
            )

    task_id = str(uuid.uuid4())[:8]

    background_tasks.add_task(
        _run_ansible_playbook,
        task_id,
        "cluster_manage.yml",
        tags="setup,always",
    )

    return {
        "task_id": task_id,
        "status": "started",
        "message": "Cluster setup started. Use /cluster-manage/status/{task_id} to poll for completion.",
    }


@router.post("/append", response_model=ClusterManageStatusResponse)
def run_cluster_append(
    req: ClusterAppendRequest,
    background_tasks: BackgroundTasks,
    _: None = Depends(deps.require_roles("admin", "developer")),
) -> Any:
    """
    Append a new compute node to the existing cluster.
    Creates a per-node inventory and runs cluster_manage.yml with append tags.
    """
    with _state_lock:
        running = [t for t, s in _run_state.items() if s.get("status") == "running"]
        if running:
            raise HTTPException(
                status_code=409,
                detail=f"A cluster operation is already in progress (task_id: {running[0]}).",
            )

    task_id = str(uuid.uuid4())[:8]

    head_node_ip = os.getenv("HEAD_NODE_IP", "172.17.181.171")
    head_node_ssh_user = os.getenv("HEAD_NODE_SSH_USER", "root")
    head_node_ssh_port = os.getenv("HEAD_NODE_SSH_PORT", "22")

    inv_lines = [
        "[head_nodes]",
        f"head_node ansible_host={head_node_ip} ansible_port={head_node_ssh_port} ansible_user={head_node_ssh_user}",
        "",
        "[cluster_nodes]",
        f"{req.node_name} ansible_host={req.node_ip} ansible_port={req.ssh_port} ansible_user={req.ssh_user}",
        "",
        "[head_nodes:vars]",
        "ansible_python_interpreter=/usr/bin/python3",
        "",
        "[cluster_nodes:vars]",
        "ansible_python_interpreter=/usr/bin/python3",
    ]
    if req.ssh_password:
        inv_lines.append(f"{req.node_name} ansible_ssh_pass={req.ssh_password}")
    node_inventory = "\n".join(inv_lines) + "\n"

    import tempfile
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".ini", delete=False, prefix="append_node_"
    ) as f:
        f.write(node_inventory)
        node_inv_path = f.name

    extra_args = [
        "-e", f"new_node_name={req.node_name}",
        "-e", "append_confirmation=append",
    ]

    def cleanup_and_run():
        try:
            _run_ansible_playbook(
                task_id,
                "add_node.yml",
                extra_args=extra_args,
                inventory=node_inv_path,
            )
        finally:
            try:
                os.unlink(node_inv_path)
            except OSError:
                pass

    background_tasks.add_task(cleanup_and_run)

    return {
        "task_id": task_id,
        "status": "started",
        "message": f"Node append started for {req.node_name} ({req.node_ip}). Poll /cluster-manage/status/{task_id} for completion.",
    }


@router.get("/status/{task_id}", response_model=ClusterManageStatusResponse)
def get_task_status(
    task_id: str,
    _: None = Depends(deps.require_roles("admin", "developer")),
) -> Any:
    """Get the current status of a cluster management task."""
    with _state_lock:
        state = _run_state.get(task_id)

    if not state:
        raise HTTPException(status_code=404, detail="Task not found.")

    status = state.get("status", "unknown")
    msg = f"Task {task_id} is {status}."
    rc = state.get("return_code")
    if rc is not None and rc != 0:
        msg += f" Exit code: {rc}."
    err = (state.get("stderr") or "").strip()
    if err:
        msg += f" Error: {err[:200]}"

    return {
        "task_id": task_id,
        "status": status,
        "started_at": state.get("started_at"),
        "completed_at": state.get("completed_at"),
        "return_code": rc,
        "message": msg,
    }


@router.get("/logs/{task_id}", response_model=ClusterManageLogsResponse)
def get_task_logs(
    task_id: str,
    _: None = Depends(deps.require_roles("admin", "developer")),
) -> Any:
    """Get stdout/stderr logs from a cluster management task."""
    with _state_lock:
        state = _run_state.get(task_id)

    if not state:
        raise HTTPException(status_code=404, detail="Task not found.")

    if state.get("status") in ("running", "started"):
        raise HTTPException(status_code=409, detail="Task is still running.")

    return {
        "task_id": task_id,
        "stdout": state.get("stdout") or "No output captured.",
        "stderr": state.get("stderr") or "",
    }


@router.get("/history")
def list_tasks(
    _: None = Depends(deps.require_roles("admin", "developer")),
) -> Any:
    """List all cluster management tasks (last 20)."""
    with _state_lock:
        items = [
            {
                "task_id": tid,
                "status": s.get("status"),
                "started_at": s.get("started_at"),
                "completed_at": s.get("completed_at"),
                "return_code": s.get("return_code"),
            }
            for tid, s in sorted(
                _run_state.items(),
                key=lambda x: x[1].get("started_at", ""),
                reverse=True,
            )
        ][:20]
    return items
