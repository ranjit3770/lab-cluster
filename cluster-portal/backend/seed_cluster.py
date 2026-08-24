import sys
import os
import logging
from datetime import datetime

# Ensure backend path is in sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from app.models.node import Node
from app.models.cluster import ClusterHealth
from app.models.user import User, UserRole
from app.core.security import get_password_hash

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def seed_cluster():
    db = SessionLocal()
    try:
        # Cluster Health seeding (keep for heartbeat status UI)
        logger.info("Seeding Cluster Health...")
        health = db.query(ClusterHealth).first()
        if not health:
            health = ClusterHealth()
            db.add(health)
        
        health.slurmctld_status = "running"
        health.slurmdbd_status = "running"
        health.cluster_status = "healthy"
        health.last_heartbeat = datetime.utcnow()
        health.updated_at = datetime.utcnow()
        
        # WE NO LONGER SEED HARDCODED NODES.
        # Live nodes will be interrogated directly from Slurm REST API.
        
        db.commit()
        logger.info("Cluster initialization check complete (Production Ready).")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding cluster: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_cluster()
