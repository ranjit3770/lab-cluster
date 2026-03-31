from typing import Any, List, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.dev_node import DevNode as DevNodeModel
from app.models.node import Node as NodeModel
from app.schemas.node import Node as NodeSchema
import pytz
from datetime import datetime
from app.core.slurm_api import slurm_client

router = APIRouter()

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
    slurm_map = {node.get("name", "").lower().strip(): node for node in slurm_data}
    slurm_ip_map = {}
    for node in slurm_data:
        for addr_key in ["address", "node_addr", "hostname", "node_hostname", "addr"]:
            addr = node.get(addr_key)
            if addr and isinstance(addr, str):
                slurm_ip_map[addr.lower().strip()] = node
    
    # 2. Fetch Authoritative DevNodes (Source of Truth for Identity)
    dev_nodes = db.query(DevNodeModel).all()
    
    ist = pytz.timezone('Asia/Kolkata')
    current_time = datetime.now(ist)
    
    nodes = []
    seen_slurm_names = set()
    
    def get_val(val, default=0):
        if isinstance(val, dict): return val.get("number", default)
        if isinstance(val, list) and val: return get_val(val[0], default)
        return val if val is not None else default

    # A. Process DevNodes First (Authoritative IPs and Names)
    for i, dn in enumerate(dev_nodes):
        name_lower = dn.name.lower().strip()
        ip_lower = dn.ip_address.lower().strip()
        
        # Match with Slurm Telemetry
        s_node = slurm_map.get(name_lower) or slurm_ip_map.get(ip_lower)
        
        if s_node:
            # Robust State Detection (supports 'state' and 'node_state')
            raw_state = s_node.get("node_state") or s_node.get("state") or ["unknown"]
            state_str = raw_state[0] if isinstance(raw_state, list) and raw_state else str(raw_state)
            seen_slurm_names.add(s_node.get("name", "").lower().strip())
            
            payload = {
                "name": dn.name, # Use dev_node name as primary label
                "ip_address": dn.ip_address,
                "status": state_str.lower(),
                "operating_system": s_node.get("operating_system", "Linux"),
                "cpu_total": get_val(s_node.get("cpus"), 0),
                "cpu_used": get_val(s_node.get("alloc_cpus"), 0),
                "cores_total": get_val(s_node.get("cores"), 0),
                "sockets": get_val(s_node.get("sockets"), 0),
                "threads_per_core": get_val(s_node.get("threads"), 1),
                "cpu_load": get_val(s_node.get("cpu_load"), 0),
                "memory_total_mb": get_val(s_node.get("real_memory"), 0),
                "memory_used_mb": get_val(s_node.get("alloc_memory"), 0),
                "free_memory_mb": get_val(s_node.get("free_mem"), 0),
                "slurm_version": s_node.get("version", "N/A"),
                "last_updated": current_time,
                "dev_node_id": dn.id
            }
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
