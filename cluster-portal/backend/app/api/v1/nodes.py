from typing import Any, List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.dev_node import DevNode as DevNodeModel
from app.models.node import Node as NodeModel
from app.schemas.node import Node as NodeSchema
import pytz
from datetime import datetime
from app.core.slurm_api import slurm_client
import re

router = APIRouter()

def get_val(val, default=0):
    if isinstance(val, dict):
        return val.get("number", default)
    if isinstance(val, list) and val:
        return get_val(val[0], default)
    return val if val is not None else default

def normalize_key(value: Optional[str]) -> str:
    return str(value or "").lower().strip()

def short_key(value: Optional[str]) -> str:
    value = normalize_key(value)
    return value.split(".", 1)[0] if "." in value else value

def compact_key(value: Optional[str]) -> str:
    return "".join(ch for ch in normalize_key(value) if ch.isalnum())

def node_aliases(value: Optional[str]):
    base = normalize_key(value)
    short = short_key(value)
    compact = compact_key(value)
    aliases = {base, short, compact}

    # Common portal labels: HEAD-NODE -> head/cluster-hn, WORKER_NODE1 -> worker1.
    if "head" in compact:
        aliases.update({"head", "headnode", "clusterhn", "cluster-hn"})
    worker_match = re.search(r"worker(?:node|noe)?(\d+)", compact)
    if worker_match:
        aliases.add(f"worker{worker_match.group(1)}")

    return {alias for alias in aliases if alias}

def slurm_node_name(node: Dict[str, Any]) -> str:
    return (
        node.get("name")
        or node.get("node_name")
        or node.get("hostname")
        or node.get("node_hostname")
        or "unknown"
    )

def slurm_node_address(node: Dict[str, Any]) -> Optional[str]:
    for key in ["address", "node_addr", "hostname", "node_hostname", "addr"]:
        value = node.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None

def slurm_state(node: Dict[str, Any]) -> str:
    raw_state = node.get("node_state") or node.get("state") or ["unknown"]
    if isinstance(raw_state, list):
        return str(raw_state[0] if raw_state else "unknown").lower()
    return str(raw_state or "unknown").lower()

def slurm_payload(node: Dict[str, Any], current_time, dev_node: Optional[DevNodeModel] = None):
    name = slurm_node_name(node)
    address = slurm_node_address(node)
    return {
        "name": dev_node.name if dev_node else name,
        "ip_address": dev_node.ip_address if dev_node else address,
        "status": slurm_state(node),
        "operating_system": node.get("operating_system", "Linux"),
        "cpu_total": get_val(node.get("cpus"), 0),
        "cpu_used": get_val(node.get("alloc_cpus"), 0),
        "cores_total": get_val(node.get("cores") or get_val(node.get("sockets"), 0) * get_val(node.get("cores_per_socket"), 1), 0),
        "sockets": get_val(node.get("sockets"), 0),
        "threads_per_core": get_val(node.get("threads") or node.get("threads_per_core"), 1),
        "cpu_load": get_val(node.get("cpu_load"), 0),
        "memory_total_mb": get_val(node.get("real_memory") or node.get("memory"), 0),
        "memory_used_mb": get_val(node.get("alloc_memory"), 0),
        "free_memory_mb": get_val(node.get("free_mem"), 0),
        "slurm_version": node.get("version") or node.get("slurm_version", "N/A"),
        "last_updated": current_time,
        "dev_node_id": dev_node.id if dev_node else None
    }

@router.get("/", response_model=List[NodeSchema])
def read_nodes(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user = Depends(deps.get_current_active_user),
) -> Any:
    # 1. LIVE DATA FROM SLURM
    slurm_data = slurm_client.get_nodes() or []
    
    # Map slurm nodes by lowercase name and various address fields for authoritative enrichment
    slurm_map = {}
    slurm_ip_map = {}
    for node in slurm_data:
        s_name = slurm_node_name(node)
        for key in node_aliases(s_name):
            if key:
                slurm_map[key] = node
            
        for addr_key in ["address", "node_addr", "hostname", "node_hostname", "addr"]:
            addr = node.get(addr_key)
            if addr and isinstance(addr, str):
                for key in node_aliases(addr):
                    if key:
                        slurm_ip_map[key] = node
    
    # 2. Fetch Authoritative DevNodes (Source of Truth for Identity)
    dev_nodes = db.query(DevNodeModel).all()
    
    ist = pytz.timezone('Asia/Kolkata')
    current_time = datetime.now(ist)
    
    nodes = []

    # A. Process DevNodes First (Authoritative IPs and Names)
    for i, dn in enumerate(dev_nodes):
        # Match with Slurm Telemetry
        s_node = (
            next((slurm_map[key] for key in node_aliases(dn.name) if key in slurm_map), None)
            or next((slurm_ip_map[key] for key in node_aliases(dn.ip_address) if key in slurm_ip_map), None)
        )
        
        if s_node:
            payload = slurm_payload(s_node, current_time, dn)
        else:
            # Authorized but not yet recognized by Slurmfabric
            payload = {
                "name": dn.name,
                "ip_address": dn.ip_address,
                "status": "authorized",
                "operating_system": "Linux (SSH)",
                "cpu_total": 0,
                "cpu_used": 0,
                "cores_total": 0,
                "sockets": 0,
                "threads_per_core": 0,
                "cpu_load": 0,
                "memory_total_mb": 0,
                "memory_used_mb": 0,
                "free_memory_mb": 0,
                "slurm_version": "N/A",
                "last_updated": current_time,
                "dev_node_id": dn.id
            }
            
        nodes.append(payload)
        
        # PERSIST: Sync to the 'nodes' table (Audit Trail)
        existing_node = db.query(NodeModel).filter(NodeModel.name == dn.name).first()
        if existing_node:
            for key, value in payload.items():
                if hasattr(existing_node, key) and key != "dev_node_id":
                    setattr(existing_node, key, value)
        else:
            filtered_payload = {k: v for k, v in payload.items() if k != "dev_node_id"}
            db.add(NodeModel(**filtered_payload))

    db.commit()
    
    # Sort: Head node first (cluster-hn), then alphabetically
    nodes.sort(key=lambda x: (x['name'].lower() != 'cluster-hn', x['name'].lower()))
    
    # Assign temporary IDs for frontend map keys
    for i, n in enumerate(nodes):
        n['id'] = i + 1
        
    return nodes

@router.get("/{node_id}", response_model=NodeSchema)
def read_node(
    node_id: int,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user),
) -> Any:
    node = db.query(NodeModel).filter(NodeModel.id == node_id).first()
    if not node:
         raise HTTPException(status_code=404, detail="Node interrogation via index not enabled.")
    return node
