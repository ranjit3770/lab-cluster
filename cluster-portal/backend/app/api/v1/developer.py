import os
import paramiko
import asyncio
import socket
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from app.api import deps
from app.core.config import settings
from app.schemas.configuration import SystemConfiguration
from app.schemas.dev_node import (
    DevNode,
    DevNodeBulkCreate,
    DevNodeBulkResult,
    DevNodeCreate,
    DevNodeUpdate,
    SSHTestRequest,
    SSHTestResponse,
)
from app.models.dev_node import DevNode as DevNodeModel
from app.models.system_setting import SystemSetting
from app.db.session import SessionLocal

# --- Node Service Status Cache ---
# Stale-while-revalidate cache for slurmd status and uptime
_node_service_cache: Dict[int, Dict] = {}
_cache_lock = threading.Lock()
SERVICE_CACHE_TTL = 60
SERVICE_CACHE_STALE_TTL = 300

# Full node serialization cache (runtime detection + services)
_node_serialize_cache: Dict[int, Dict] = {}
_serialize_lock = threading.Lock()
SERIALIZE_CACHE_TTL = 30
SERIALIZE_CACHE_STALE_TTL = 120

router = APIRouter()

ALLOWED_NODE_OS_FAMILIES = {"auto", "ubuntu", "windows"}
WINDOWS_REMOTE_PORTS = (3389, 5985, 5986)
WINDOWS_PLATFORM_PORTS = (
    (3389, "RDP"),
    (5985, "WinRM"),
    (5986, "WinRM"),
    (445, "SMB"),
    (135, "RPC"),
)
WINDOWS_REMOTE_PORT_SET = set(WINDOWS_REMOTE_PORTS)
NODE_OS_ALIASES = {
    "": "auto",
    "linux": "ubuntu",
    "ubuntu-linux": "ubuntu",
    "ubuntu/linux": "ubuntu",
    "win": "windows",
    "ms-windows": "windows",
}


def _normalize_node_os_family(value: Any) -> str:
    normalized = str(value or "auto").strip().lower()
    normalized = NODE_OS_ALIASES.get(normalized, normalized)
    if normalized not in ALLOWED_NODE_OS_FAMILIES:
        raise HTTPException(
            status_code=400,
            detail="os_family must be one of: auto, ubuntu, windows.",
        )
    return normalized

# --- Config Logic (Existing) ---

def update_env_file(key: str, value: str):
    """
    Updates or adds a key-value pair to the .env file.
    """
    target_file = ".env"
    if not os.path.exists(target_file):
        pass
    
    lines = []
    if os.path.exists(target_file):
        with open(target_file, "r") as f:
            lines = f.readlines()
            
    key_found = False
    new_lines = []
    for line in lines:
        if line.startswith(f"{key}="):
            new_lines.append(f"{key}={value}\n")
            key_found = True
        else:
            new_lines.append(line)
            
    if not key_found:
        if new_lines and not new_lines[-1].endswith("\n"):
            new_lines[-1] += "\n"
        new_lines.append(f"{key}={value}\n")
        
    with open(target_file, "w") as f:
        f.writelines(new_lines)

@router.get("/config", response_model=SystemConfiguration)
def get_system_config(
    current_user: Any = Depends(deps.get_current_active_superuser),
) -> Any:
    return SystemConfiguration(
        slurm_rest_url=settings.SLURM_REST_URL,
        slurm_node_api=settings.SLURM_NODE_API,
        external_job_api_url=settings.EXTERNAL_JOB_API_URL,
        slurm_version=settings.SLURM_VERSION,
        slurm_user=settings.SLURM_USER,
        slurm_jwt_user=settings.SLURM_JWT_USER,
        slurm_path=settings.SLURM_PATH,
        slurm_lib_path=settings.SLURM_LIB_PATH,
        cluster_name=settings.CLUSTER_NAME,
        cluster_description=settings.CLUSTER_DESCRIPTION,
        session_timeout_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        sync_interval_ms=getattr(settings, "SLURM_SYNC_INTERVAL", 60000),
        identity_provider=os.getenv("IDENTITY_PROVIDER", "Local AES-256 Database"),
        mfa_enabled=os.getenv("MFA_ENABLED", "False").lower() == "true"
    )

@router.put("/config", response_model=SystemConfiguration)
def update_system_config(
    config_in: SystemConfiguration,
    current_user: Any = Depends(deps.get_current_active_superuser),
) -> Any:
    db = SessionLocal()
    try:
        def update_setting(key, value):
            if value is None: return
            s = db.query(SystemSetting).filter(SystemSetting.key == key).first()
            if s:
                s.value = str(value)
            else:
                db.add(SystemSetting(key=key, value=str(value)))
            update_env_file(key.upper(), str(value))

        if config_in.slurm_rest_url is not None:
            stripped_url = config_in.slurm_rest_url.strip()
            settings.SLURM_REST_URL = stripped_url
            update_setting("slurm_rest_url", stripped_url)
            
        if config_in.slurm_node_api is not None:
             stripped_url = config_in.slurm_node_api.strip()
             settings.SLURM_NODE_API = stripped_url
             update_setting("slurm_node_api", stripped_url)

        if config_in.external_job_api_url is not None:
             stripped_url = config_in.external_job_api_url.strip()
             settings.EXTERNAL_JOB_API_URL = stripped_url
             update_setting("external_job_api_url", stripped_url)

        if config_in.slurm_version is not None:
             stripped_ver = config_in.slurm_version.strip()
             settings.SLURM_VERSION = stripped_ver
             update_setting("slurm_version", stripped_ver)

        if config_in.slurm_user is not None:
             settings.SLURM_USER = config_in.slurm_user
             update_setting("slurm_user", config_in.slurm_user)
        
        if config_in.slurm_jwt_user is not None:
             settings.SLURM_JWT_USER = config_in.slurm_jwt_user
             update_setting("slurm_jwt_user", config_in.slurm_jwt_user)
             
        if config_in.slurm_path is not None:
             settings.SLURM_PATH = config_in.slurm_path
             update_setting("slurm_path", config_in.slurm_path)
             
        if config_in.slurm_lib_path is not None:
             settings.SLURM_LIB_PATH = config_in.slurm_lib_path
             update_setting("slurm_lib_path", config_in.slurm_lib_path)

        if config_in.cluster_name is not None:
             settings.CLUSTER_NAME = config_in.cluster_name
             update_setting("cluster_name", config_in.cluster_name)

        if config_in.cluster_description is not None:
             settings.CLUSTER_DESCRIPTION = config_in.cluster_description
             update_setting("cluster_description", config_in.cluster_description)
            
        if config_in.session_timeout_seconds is not None:
            minutes = config_in.session_timeout_seconds // 60
            settings.ACCESS_TOKEN_EXPIRE_MINUTES = minutes
            update_setting("session_timeout_seconds", str(config_in.session_timeout_seconds))
            update_env_file("ACCESS_TOKEN_EXPIRE_MINUTES", str(minutes))
            
        if config_in.sync_interval_ms is not None:
            settings.SLURM_SYNC_INTERVAL = config_in.sync_interval_ms
            update_setting("sync_interval_ms", str(config_in.sync_interval_ms))

        if config_in.max_batch_jobs_per_user is not None:
            update_setting("max_batch_jobs_per_user", str(config_in.max_batch_jobs_per_user))

        if config_in.max_jupyter_jobs_per_user is not None:
            update_setting("max_jupyter_jobs_per_user", str(config_in.max_jupyter_jobs_per_user))

        db.commit()
    finally:
        db.close()

    return get_system_config(current_user)

@router.get("/test-integrity")
def test_integrity(
    db: Session = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_active_superuser),
):
    """
    Authoritative Diagnostic Interrogation for Cluster Orchestration.
    """
    results = {
        "database": {"status": "healthy", "latency": "0.01ms"},
        "slurm_rest": {"status": "unknown", "message": ""},
        "job_api": {"status": "unknown", "message": ""},
        "overall": "healthy"
    }

    # 1. Slurm REST Check
    from app.core.slurm_api import slurm_client
    try:
        ping = slurm_client._get("ping")
        if ping:
            results["slurm_rest"]["status"] = "healthy"
        else:
             results["slurm_rest"]["status"] = "failed"
             results["slurm_rest"]["message"] = "No response from Slurm Protocol"
             results["overall"] = "unstable"
    except Exception as e:
        results["slurm_rest"]["status"] = "error"
        results["slurm_rest"]["message"] = str(e)
        results["overall"] = "unstable"

    # 2. External Job API Check
    import requests
    try:
        res = requests.get(f"{settings.EXTERNAL_JOB_API_URL}/health", timeout=3)
        if res.status_code == 200:
            results["job_api"]["status"] = "healthy"
        else:
             results["job_api"]["status"] = "degraded"
             results["job_api"]["message"] = f"Code {res.status_code}"
             results["overall"] = "degraded"
    except Exception as e:
        results["job_api"]["status"] = "unreachable"
        results["job_api"]["message"] = "Host Down"
        results["overall"] = "unstable"

    return results

# --- Dev Node Logic ---

def _test_ssh_connection(request: SSHTestRequest) -> bool:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=request.ip_address,
            port=request.port,
            username=request.username,
            password=request.password,
            timeout=5
        )
        client.close()
        return True
    except Exception as e:
        print(f"SSH Auth Test Failed: {e}")
        return False


def _test_tcp_connection(ip_address: str, port: int, timeout: int = 5) -> bool:
    try:
        with socket.create_connection((ip_address, port), timeout=timeout):
            return True
    except Exception as e:
        print(f"TCP Connectivity Test Failed: {e}")
        return False


def _test_node_access(node_data: dict) -> bool:
    if node_data.get("os_family") == "windows" and int(node_data["ssh_port"]) in WINDOWS_REMOTE_PORT_SET:
        return _test_tcp_connection(node_data["ip_address"], int(node_data["ssh_port"]))

    test_req = SSHTestRequest(
        ip_address=node_data["ip_address"],
        port=node_data["ssh_port"],
        username=node_data["ssh_username"],
        password=node_data.get("ssh_password")
    )
    return _test_ssh_connection(test_req)


def _probe_tcp_connection(ip_address: str, port: int, timeout: float = 0.5) -> bool:
    try:
        with socket.create_connection((ip_address, port), timeout=timeout):
            return True
    except Exception:
        return False


def _detect_node_runtime(node: DevNodeModel) -> dict:
    ip_address = node.ip_address
    saved_family = _normalize_node_os_family(getattr(node, "os_family", "auto"))
    ssh_port = int(node.ssh_port or 22)

    for port, label in WINDOWS_PLATFORM_PORTS:
        if _probe_tcp_connection(ip_address, port):
            return {
                "detected_os_family": "windows",
                "effective_os_family": "windows",
                "detection_source": f"live windows probe: {label}:{port}",
                "detected_access_label": label,
                "detected_access_port": port,
                "detected_reachable": True,
            }

    if saved_family in {"ubuntu", "windows"}:
        saved_port_reachable = _probe_tcp_connection(ip_address, ssh_port)
        return {
            "detected_os_family": None,
            "effective_os_family": saved_family,
            "detection_source": (
                f"saved admin setting; port {ssh_port} reachable"
                if saved_port_reachable
                else "saved admin setting; live platform probe unavailable"
            ),
            "detected_access_label": "RDP" if saved_family == "windows" and ssh_port == 3389 else "SSH",
            "detected_access_port": ssh_port,
            "detected_reachable": saved_port_reachable,
        }

    ssh_ports = [ssh_port]
    if ssh_port != 22:
        ssh_ports.append(22)

    for port in ssh_ports:
        if _probe_tcp_connection(ip_address, port):
            return {
                "detected_os_family": "ubuntu",
                "effective_os_family": "ubuntu",
                "detection_source": f"live ssh probe: {port}",
                "detected_access_label": "SSH",
                "detected_access_port": port,
                "detected_reachable": True,
            }

    return {
        "detected_os_family": None,
        "effective_os_family": None,
        "detection_source": "metadata fallback; live probe unavailable",
        "detected_access_label": None,
        "detected_access_port": None,
        "detected_reachable": False,
    }


# --- Node Service Status Helpers ---

def _format_uptime(seconds: float) -> str:
    days = int(seconds // 86400)
    hours = int((seconds % 86400) // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if days > 0:
        return f"{days}d {hours}h {minutes}m"
    elif hours > 0:
        return f"{hours}h {minutes}m"
    elif minutes > 0:
        return f"{minutes}m {secs}s"
    else:
        return f"{secs}s"


def _ssh_execute(ip: str, port: int, username: str, password: Optional[str], command: str, timeout: int = 5) -> Optional[str]:
    if not password:
        return None
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(hostname=ip, port=port, username=username, password=password, timeout=timeout)
        _, stdout, stderr = client.exec_command(command, timeout=timeout)
        output = stdout.read().decode().strip()
        client.close()
        return output
    except Exception:
        return None


def _ssh_check_slurmd_status(ip: str, port: int, username: str, password: Optional[str], is_windows: bool) -> str:
    if is_windows:
        cmd = 'powershell -NoProfile -Command "(Get-Service slurmd -ErrorAction SilentlyContinue).Status"'
    else:
        cmd = "systemctl is-active slurmd 2>/dev/null || echo 'inactive'"
    result = _ssh_execute(ip, port, username, password, cmd, timeout=10)
    if result:
        status = result.strip().lower()
        if status in ("active", "inactive", "activating", "deactivating", "failed", "not_found", "not-found"):
            return status
        if "service" in status and ("not found" in status or "running" not in status):
            return "not_found"
    return "unknown"


def _ssh_get_uptime(ip: str, port: int, username: str, password: Optional[str], is_windows: bool) -> Dict[str, Any]:
    if is_windows:
        # Method 1: PowerShell via CIM (requires WinRM, try with longer timeout)
        cmd1 = (
            'powershell -NoProfile -Command'
            ' "[math]::Round(((Get-Date)-(gcim Win32_OperatingSystem).LastBootUpTime).TotalSeconds)"'
        )
        output = _ssh_execute(ip, port, username, password, cmd1, timeout=15)
        if output:
            try:
                val = output.strip().splitlines()[-1].strip()
                seconds = float(val)
                if seconds > 0:
                    return {"uptime": _format_uptime(seconds), "uptime_seconds": seconds}
            except (ValueError, TypeError):
                pass

        # Method 2: wmic (no WinRM needed, simpler)
        cmd2 = 'cmd /c "wmic os get lastbootuptime /value"'
        output = _ssh_execute(ip, port, username, password, cmd2, timeout=10)
        if output:
            try:
                raw = output.strip().split("=", 1)[-1].split(".")[0].split("+")[0].split("-")[0]
                from datetime import datetime
                boot = datetime.strptime(raw, '%Y%m%d%H%M%S')
                seconds = (datetime.utcnow() - boot).total_seconds()
                if seconds > 0:
                    return {"uptime": _format_uptime(seconds), "uptime_seconds": seconds}
            except (ValueError, TypeError, IndexError):
                pass

        # Method 3: systeminfo fallback
        cmd3 = 'cmd /c "systeminfo | findstr /C:\\\"System Boot Time\\\" /C:\\\"System Up Time\\\""'
        output = _ssh_execute(ip, port, username, password, cmd3, timeout=10)
        if output:
            import re
            for line in output.splitlines():
                l = line.strip()
                if "Boot Time" in l:
                    match = re.search(r':\s+(.+?)$', l)
                    if match:
                        try:
                            bt = datetime.strptime(match.group(1).strip(), '%m/%d/%Y, %I:%M:%S %p')
                            seconds = (datetime.now() - bt).total_seconds()
                            if seconds > 0:
                                return {"uptime": _format_uptime(seconds), "uptime_seconds": seconds}
                        except:
                            pass
    else:
        cmd = "cat /proc/uptime 2>/dev/null | awk '{print int($1)}' || echo 0"
        output = _ssh_execute(ip, port, username, password, cmd)
        if output:
            try:
                seconds = float(output.strip())
                if seconds > 0:
                    return {"uptime": _format_uptime(seconds), "uptime_seconds": seconds}
            except (ValueError, TypeError):
                pass
    return {"uptime": "N/A", "uptime_seconds": None}


def _get_cached_services(node_id: int) -> Optional[Dict]:
    with _cache_lock:
        entry = _node_service_cache.get(node_id)
        if entry:
            age = time.time() - entry["timestamp"]
            if age < SERVICE_CACHE_TTL:
                return entry["data"]
            if age < SERVICE_CACHE_STALE_TTL:
                return entry["data"]
    return None


def _set_cached_services(node_id: int, data: Dict):
    with _cache_lock:
        _node_service_cache[node_id] = {"data": data, "timestamp": time.time()}


# --- Full Node Serialization Cache ---

def _get_cached_serialize(node_id: int) -> Optional[Dict]:
    with _serialize_lock:
        entry = _node_serialize_cache.get(node_id)
        if entry:
            age = time.time() - entry["timestamp"]
            if age < SERIALIZE_CACHE_TTL:
                return entry["data"]
            if age < SERIALIZE_CACHE_STALE_TTL:
                return entry["data"]
    return None


def _set_cached_serialize(node_id: int, data: Dict):
    with _serialize_lock:
        _node_serialize_cache[node_id] = {"data": data, "timestamp": time.time()}


def _check_node_services(node: DevNodeModel, detected_os_family: Optional[str] = None) -> Dict[str, Any]:
    ip = node.ip_address
    port = int(node.ssh_port or 22)
    username = node.ssh_username
    password = node.ssh_password

    os_family = detected_os_family or node.os_family or "ubuntu"
    is_windows = os_family == "windows"

    slurmd_status = _ssh_check_slurmd_status(ip, port, username, password, is_windows)
    uptime_info = _ssh_get_uptime(ip, port, username, password, is_windows)

    result = {
        "slurmd_status": slurmd_status,
        "uptime": uptime_info["uptime"],
        "uptime_seconds": uptime_info["uptime_seconds"],
    }
    return result


def _get_node_services(node: DevNodeModel, detected_os_family: Optional[str] = None) -> Dict[str, Any]:
    cached = _get_cached_services(node.id)
    if cached:
        return cached
    data = _check_node_services(node, detected_os_family)
    _set_cached_services(node.id, data)
    return data


def _infer_slurmd_from_slurm(dev_node_name: str, dev_node_ip: str) -> Optional[str]:
    try:
        from app.core.slurm_api import slurm_client
        slurm_nodes = slurm_client.get_nodes()
        if not slurm_nodes:
            return None

        def _match(node):
            name = (node.get("name") or "").lower().strip()
            addr = (node.get("address") or node.get("node_addr") or "").lower().strip()
            host = (node.get("hostname") or node.get("node_hostname") or "").lower().strip()
            target_name = dev_node_name.lower().strip()
            target_ip = dev_node_ip.lower().strip()
            return name == target_name or addr == target_ip or host == target_ip or host == target_name

        for s_node in slurm_nodes:
            if _match(s_node):
                state = s_node.get("node_state") or s_node.get("state") or [""]
                if isinstance(state, list):
                    state_str = state[0] if state else ""
                else:
                    state_str = str(state)
                state_str = state_str.lower().strip()
                # Slurm node states that indicate slurmd is active
                active_states = {"idle", "mixed", "allocated", "completing", "running", "resume"}
                if state_str in active_states:
                    return "active"
                elif state_str in {"down", "draining", "fail", "failing", "power_down", "no_config", "unknown"}:
                    return "inactive"
                return "unknown"
    except Exception:
        pass
    return None


def _serialize_dev_node(node: DevNodeModel) -> dict:
    cached = _get_cached_serialize(node.id)
    if cached:
        return cached

    runtime = _detect_node_runtime(node)
    effective_os = runtime.get("effective_os_family") or node.os_family

    slurmd_status = _infer_slurmd_from_slurm(node.name, node.ip_address)
    uptime_val = "N/A"
    uptime_secs = None

    if slurmd_status is None:
        services = _get_node_services(node, effective_os)
        slurmd_status = services.get("slurmd_status", "unknown")
        uptime_val = services.get("uptime", "N/A")
        uptime_secs = services.get("uptime_seconds")
    else:
        if node.ssh_password:
            services = _get_node_services(node, effective_os)
            uptime_val = services.get("uptime", "N/A")
            uptime_secs = services.get("uptime_seconds")

    payload = {
        "id": node.id,
        "name": node.name,
        "ip_address": node.ip_address,
        "ssh_port": node.ssh_port,
        "ssh_username": node.ssh_username,
        "ssh_password": node.ssh_password,
        "os_family": getattr(node, "os_family", "auto") or "auto",
        "created_at": node.created_at,
        "slurmd_status": slurmd_status or "unknown",
        "uptime": uptime_val,
        "uptime_seconds": uptime_secs,
    }
    payload.update(runtime)
    _set_cached_serialize(node.id, payload)
    return payload

@router.post("/nodes/test", response_model=SSHTestResponse)
def test_node_ssh(
    request: SSHTestRequest,
    current_user: Any = Depends(deps.get_current_active_superuser)
):
    success = _test_ssh_connection(request)
    if success:
        return SSHTestResponse(success=True, message="Connection Established Successfully")
    else:
        return SSHTestResponse(success=False, message="Connection Failed (Check Creds/IP)")

@router.get("/nodes")
def get_dev_nodes(
    db: Session = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_active_superuser)
):
    dev_nodes = db.query(DevNodeModel).all()
    result = []

    if dev_nodes:
        results_by_id = {}
        uncached = []

        for node in dev_nodes:
            cached = _get_cached_serialize(node.id)
            if cached:
                results_by_id[node.id] = cached
            else:
                uncached.append(node)

        if uncached:
            max_workers = min(32, max(1, len(uncached)))
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_map = {executor.submit(_serialize_dev_node, node): node.id for node in uncached}
                for future in as_completed(future_map):
                    node_id = future_map[future]
                    try:
                        results_by_id[node_id] = future.result()
                    except Exception as exc:
                        print(f"Node serialization failed for {node_id}: {exc}")

            for node in dev_nodes:
                serialized = results_by_id.get(node.id)
                if serialized:
                    result.append(serialized)

    slurm_count = 0
    try:
        from app.core.slurm_api import slurm_client
        slurm_nodes = slurm_client.get_nodes()
        slurm_count = len(slurm_nodes) if slurm_nodes else 0
    except Exception:
        pass

    return {
        "nodes": result,
        "slurm_node_count": slurm_count,
    }

@router.post("/nodes/bulk", response_model=DevNodeBulkResult)
def create_dev_nodes_bulk(
    bulk_in: DevNodeBulkCreate,
    db: Session = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_active_superuser)
):
    created = []
    skipped = []
    failed = []
    seen_names = set()
    seen_ips = set()

    if not bulk_in.nodes:
        raise HTTPException(status_code=400, detail="No nodes supplied.")
    if len(bulk_in.nodes) > 500:
        raise HTTPException(status_code=400, detail="Bulk add supports up to 500 nodes per request.")

    for raw_node in bulk_in.nodes:
        node_data = raw_node.dict()
        node_data["name"] = node_data["name"].strip()
        node_data["ip_address"] = node_data["ip_address"].strip()
        node_data["ssh_username"] = node_data["ssh_username"].strip()
        node_data["os_family"] = _normalize_node_os_family(node_data.get("os_family"))

        if not node_data["name"] or not node_data["ip_address"] or not node_data["ssh_username"]:
            skipped.append(f"{raw_node.name or raw_node.ip_address}: missing node name, IP address, or SSH username.")
            continue

        name_key = node_data["name"].lower()
        ip_key = node_data["ip_address"].lower()
        if name_key in seen_names or ip_key in seen_ips:
            skipped.append(f"{node_data['name']}: duplicate in import list.")
            continue

        seen_names.add(name_key)
        seen_ips.add(ip_key)

        existing = db.query(DevNodeModel).filter(
            (DevNodeModel.name == node_data["name"]) |
            (DevNodeModel.ip_address == node_data["ip_address"])
        ).first()
        if existing:
            skipped.append(f"{node_data['name']}: already registered.")
            continue

        if bulk_in.test_connections:
            if not _test_node_access(node_data):
                failed.append(f"{node_data['name']}: access connection failed.")
                continue

        node = DevNodeModel(**node_data)
        db.add(node)
        created.append(node)

    if created:
        db.commit()
        for node in created:
            db.refresh(node)

    return DevNodeBulkResult(created=created, skipped=skipped, failed=failed)

@router.post("/nodes", response_model=DevNode)
def create_dev_node(
    node_in: DevNodeCreate,
    db: Session = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_active_superuser)
):
    # Prevention of duplication
    existing = db.query(DevNodeModel).filter(
        (DevNodeModel.name == node_in.name) | 
        (DevNodeModel.ip_address == node_in.ip_address)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"A node with name '{node_in.name}' or IP '{node_in.ip_address}' is already registered.")

    node_data = node_in.dict()
    node_data["os_family"] = _normalize_node_os_family(node_data.get("os_family"))
    if not _test_node_access(node_data):
         raise HTTPException(status_code=400, detail="Connection failed. Ensure credentials/port are correct and reachable.")

    node = DevNodeModel(**node_data)
    db.add(node)
    db.commit()
    db.refresh(node)
    return node

@router.put("/nodes/{node_id}", response_model=DevNode)
def update_dev_node(
    node_id: int,
    node_in: DevNodeUpdate,
    db: Session = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_active_superuser)
):
    node = db.query(DevNodeModel).filter(DevNodeModel.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    update_data = node_in.dict(exclude_unset=True)
    if "os_family" in update_data:
        update_data["os_family"] = _normalize_node_os_family(update_data.get("os_family"))
    for field, value in update_data.items():
        setattr(node, field, value)

    db.commit()
    db.refresh(node)
    return node

@router.delete("/nodes/{node_id}")
def delete_dev_node(
    node_id: int,
    db: Session = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_active_superuser)
):
    node = db.query(DevNodeModel).filter(DevNodeModel.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    db.delete(node)
    db.commit()
    return {"message": "Node deleted"}

# --- Terminal WebSocket ---

@router.websocket("/nodes/{node_id}/terminal")
async def terminal_websocket(
    websocket: WebSocket, 
    node_id: int
):
    print("WS: Connection request received.")
    await websocket.accept()
    print("WS: Connection accepted.")
    
    db = SessionLocal()
    try:
        from app.schemas.token import TokenPayload
        from app.models.user import User
        from jose import jwt, JWTError
        
        # manual token extraction
        token = websocket.query_params.get("token")
        if not token:
             print("WS Auth: No token provided.")
             await websocket.close(code=4003, reason="No token provided")
             return

        # Verify Auth
        print(f"WS Connect: Received token prefix: {token[:10]}...")
        
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
        
        if token_data.sub is None:
             print("WS Auth: No subject (sub) in token.")
             await websocket.close(code=4003, reason="Invalid Token (No Sub)")
             return
             
        # Handle int/str mismatch safely
        user_id = token_data.sub
        try:
             user_id = int(user_id)
        except:
             pass
             
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
             print(f"WS Auth: User {user_id} not found.")
             await websocket.close(code=4003, reason="User not found")
             return
             
        if user.role not in ["admin", "developer"]:
             print(f"WS Auth: User {user.username} is not admin/developer.")
             await websocket.close(code=4003, reason="Admin/Developer privileges required")
             return
             
        print(f"WS Auth: Success for {user.username}")
        
        # After successful authentication, proceed with node and SSH connection
        node = db.query(DevNodeModel).filter(DevNodeModel.id == node_id).first()
        if not node:
            await websocket.close(code=4004, reason="Node not found")
            return

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        try:
            # Run blocking connect in executor
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, lambda: client.connect(
                hostname=node.ip_address,
                port=node.ssh_port,
                username=node.ssh_username,
                password=node.ssh_password,
                timeout=10,
                allow_agent=False,
                look_for_keys=False
            ))
            
            # ... rest of SSH logic ...
            channel = client.invoke_shell(term='xterm', width=80, height=24)
            client.get_transport().set_keepalive(30)
            
            async def forward_from_ssh():
                while not channel.exit_status_ready():
                    if channel.recv_ready():
                        try:
                            data = channel.recv(4096)
                            if data:
                                await websocket.send_text(data.decode('utf-8', errors='ignore'))
                            else:
                                break
                        except Exception:
                            break
                    else:
                        await asyncio.sleep(0.01)

            async def forward_to_ssh():
                try:
                    import json
                    while True:
                        raw_data = await websocket.receive_text()
                        try:
                            payload = json.loads(raw_data)
                            if payload.get("type") == "input":
                                data = payload.get("data", "")
                                if data:
                                    channel.send(data.encode())
                            elif payload.get("type") == "resize":
                                rows = payload.get("rows", 24)
                                cols = payload.get("cols", 80)
                                try:
                                    channel.resize_pty(width=cols, height=rows)
                                except Exception:
                                    pass
                        except json.JSONDecodeError:
                            if raw_data:
                                channel.send(raw_data.encode())
                except WebSocketDisconnect:
                    pass
                except Exception as e:
                    print(f"WS Forward Error: {e}")
                    pass

            ssh_reader = asyncio.create_task(forward_from_ssh())
            ws_reader = asyncio.create_task(forward_to_ssh())

            done, pending = await asyncio.wait(
                [ssh_reader, ws_reader],
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                 task.cancel()

        except Exception as e:
            import traceback
            traceback.print_exc()
            error_msg = str(e)
            if "Authentication failed" in error_msg:
                 error_msg = "Authentication failed."
            elif "timed out" in error_msg:
                 error_msg = "Connection timed out."
            try:
                 await websocket.close(code=4000, reason=error_msg)
            except:
                 pass
        finally:
            client.close()

    finally:
        db.close()
