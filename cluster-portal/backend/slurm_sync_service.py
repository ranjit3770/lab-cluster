import requests
import time
import logging
import sys
import os
from datetime import datetime

# Adjust path to import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from app.models.node import Node
from app.models.cluster import ClusterHealth
from app.core.slurm_api import slurm_client

import logging
logger = logging.getLogger("SlurmSync")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

def get_slurm_data(endpoint: str):
    """
    Wrapper for slurm_client to match existing signature.
    """
    if endpoint == "nodes":
        return {"nodes": slurm_client.get_nodes()}
    elif endpoint == "jobs":
         return {"jobs": slurm_client.get_jobs()}
    return slurm_client._get(endpoint)

def sync_nodes():
    db = SessionLocal()
    try:
        data = get_slurm_data("nodes")
        if not data or "nodes" not in data:
            # Fallback/Update cluster status as degraded if API is unreachable
            update_cluster_health(db, status="degraded")
            return

        slurm_nodes = data["nodes"]
        logger.info(f"Syncing {len(slurm_nodes)} nodes from Slurm...")

        # Update or create nodes in DB
        for s_node in slurm_nodes:
            node_name = s_node.get("name")
            state = s_node.get("state", ["unknown"])[0] if isinstance(s_node.get("state"), list) else s_node.get("state", "unknown")
            
            node = db.query(Node).filter(Node.name == node_name).first()
            if not node:
                node = Node(name=node_name)
                db.add(node)
            
            # Update resources
            node.status = state.lower()
            node.ip_address = s_node.get("address")
            node.operating_system = s_node.get("operating_system")
            node.cpu_total = s_node.get("cpus", 0)
            node.cpu_used = s_node.get("alloc_cpus", 0)
            node.cpu_load = s_node.get("cpu_load", 0)
            node.memory_total_mb = s_node.get("real_memory", 0)
            node.memory_used_mb = s_node.get("alloc_memory", 0)
            
            # Parse free_mem
            free_mem = s_node.get("free_mem", {})
            if isinstance(free_mem, dict):
                node.free_memory_mb = free_mem.get("number", 0)
            else:
                node.free_memory_mb = 0

            node.gpu_total = 0 
            
            # Simple GPU parsing if available in gres
            gres = s_node.get("gres", "")
            if "gpu" in gres:
                try:
                    # Example: "gpu:1" or "gpu:tesla:1"
                    parts = gres.split(":")
                    node.gpu_total = int(parts[-1])
                except:
                    pass

            node.last_updated = datetime.utcnow()

        db.commit()
        update_cluster_health(db, status="healthy")
        logger.info("Node synchronization complete.")

    except Exception as e:
        db.rollback()
        logger.error(f"Unexpected sync error: {e}")
    finally:
        db.close()

def update_cluster_health(db, status="healthy"):
    health = db.query(ClusterHealth).first()
    if not health:
        health = ClusterHealth()
        db.add(health)
    
    health.cluster_status = status
    health.slurmctld_status = "running" if status == "healthy" else "unknown"
    health.slurmdbd_status = "running" if status == "healthy" else "unknown"
    health.last_heartbeat = datetime.utcnow()
    health.updated_at = datetime.utcnow()
    db.commit()

if __name__ == "__main__":
    print("Starting Slurm Sync Service (Manual Run)")
    sync_nodes()
    print("Run complete.")
