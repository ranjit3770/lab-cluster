from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
import traceback

from app.api import deps
from app.schemas.dashboard import (
    DashboardStats,
    ClusterStatusSchema,
    ResourcesSchema,
    UtilizationSchema,
    JobStatsSchema,
    UserStatsSchema,
    RequestStatsSchema
)
from app.models.user import User, UserRole
from app.models.request import Request
from app.core.slurm_api import slurm_client

router = APIRouter()

def get_slurm_value(field_value, default=0):
    if isinstance(field_value, dict):
        return field_value.get("number", default)
    if isinstance(field_value, list) and field_value:
        return get_slurm_value(field_value[0], default)
    return field_value if field_value is not None else default

@router.get("/overview", response_model=DashboardStats)
def get_dashboard_stats(
        db: Session = Depends(deps.get_db),
        current_user=Depends(deps.get_current_active_user),
):
    try:
        return _get_stats_internal(db)
    except Exception as e:
        print(f"DASHBOARD LOGIC ERROR: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Dashboard error: {str(e)}")

@router.get("/maintenance-status")
def get_maintenance_status(
    db: Session = Depends(deps.get_db),
):
    """
    Public Endpoint for System Info Interrogation.
    Allows guests and users to check maintenance state and branding.
    """
    from app.models.system_setting import SystemSetting
    from app.core.config import settings
    
    is_maintenance = db.query(SystemSetting).filter(SystemSetting.key == "maintenance_mode").first()
    maintenance_active = is_maintenance.value.lower() == "true" if is_maintenance else False
    
    return {
        "maintenance_active": maintenance_active,
        "cluster_name": settings.CLUSTER_NAME,
        "cluster_description": settings.CLUSTER_DESCRIPTION
    }

def _get_stats_internal(db: Session):
    # --- 1. SLURM LIVE DATA ---
    slurm_nodes = slurm_client.get_nodes()
    slurm_jobs = slurm_client.get_jobs()

    # --- 2. CLUSTER STATUS ---
    from app.models.dev_node import DevNode as DevNodeModel
    dev_nodes = db.query(DevNodeModel).all()
    dev_names = {dn.name.lower().strip() for dn in dev_nodes}
    dev_ips = {dn.ip_address.lower().strip() for dn in dev_nodes}

    # Filter slurm nodes to only include those registered in our Terminal Hub (DevNodes)
    full_node_list = slurm_nodes if isinstance(slurm_nodes, list) else []
    node_list = []
    for n in full_node_list:
        n_name = n.get("name", "").lower().strip()
        # Check all possible Slurm network address fields
        n_addr = (n.get("address") or n.get("node_addr") or n.get("hostname") or n.get("node_hostname") or n.get("addr") or "").strip().lower()
        
        if n_name in dev_names or (n_addr and n_addr in dev_ips):
            node_list.append(n)
            
    job_list = slurm_jobs if isinstance(slurm_jobs, list) else []

    is_alive = slurm_nodes is not None
    cluster_status = ClusterStatusSchema(
        slurmctld_status="running" if is_alive else "stopped",
        slurmdbd_status="running" if is_alive else "unknown",
        cluster_status="healthy" if is_alive else "down",
        last_heartbeat=datetime.utcnow()
    )

    # --- 3. RESOURCES & UTILIZATION ---
    cpu_total = 0
    cpu_used = 0
    mem_total = 0
    mem_used = 0
    gpu_total = 0
    active_nodes = 0

    for s_node in node_list:
        # Robust field extraction (supports various OpenAPI schemas)
        c_tot = get_slurm_value(s_node.get("cpus"))
        c_usd = get_slurm_value(s_node.get("alloc_cpus"))
        m_tot = get_slurm_value(s_node.get("real_memory"))
        m_usd = get_slurm_value(s_node.get("alloc_memory"))

        cpu_total += c_tot
        cpu_used += c_usd
        mem_total += m_tot
        mem_used += m_usd

        # Robust State Detection (supports 'state' and 'node_state')
        raw_state = s_node.get("node_state") or s_node.get("state") or ["unknown"]
        state = raw_state[0].lower() if isinstance(raw_state, list) and raw_state else str(raw_state).lower()

        if state in ["idle", "allocated", "mixed", "completing"]:
            active_nodes += 1

        gres = s_node.get("gres", "")
        if gres and "gpu" in gres:
            try:
                gpu_total += int(gres.split(":")[-1])
            except (ValueError, IndexError):
                pass

    resources = ResourcesSchema(
        cpu_total=cpu_total,
        memory_total_mb=mem_total,
        node_count=len(node_list),
        active_nodes=active_nodes,
        gpu_total=gpu_total
    )

    utilization = UtilizationSchema(
        cpu_used_percent=round((cpu_used / cpu_total * 100), 1) if cpu_total > 0 else 0.0,
        memory_used_percent=round((mem_used / mem_total * 100), 1) if mem_total > 0 else 0.0,
        gpu_used_percent=0.0
    )

    # --- 4. JOBS (Sourced from authoritative Database for history)
    from app.models.job import Job as JobModel
    
    # Query database for all job counts to match JobsPage statistics
    running = db.query(JobModel).filter(JobModel.status == "running").count()
    pending = db.query(JobModel).filter(JobModel.status == "pending").count()
    completed_all = db.query(JobModel).filter(JobModel.status == "completed").count()
    failed_all = db.query(JobModel).filter(JobModel.status == "failed").count()
    cancelled_all = db.query(JobModel).filter(JobModel.status == "cancelled").count()
    
    # Today's total count for secondary context
    midnight_at = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_count = db.query(JobModel).filter(JobModel.created_at >= midnight_at).count()

    jobs_stats = JobStatsSchema(
        running=running,
        pending=pending,
        completed=completed_all,
        failed=failed_all,
        cancelled=cancelled_all,
        total=running + completed_all + failed_all + cancelled_all,
        today_count=today_count
    )
    
    # --- 5. DATABASE STATS ---
    from sqlalchemy import func
    total_users = db.query(User).filter(User.role != UserRole.DEVELOPER).count()
    pending_requests = db.query(Request).filter(Request.status == "pending").count()
    alloc_data = db.query(func.sum(User.cpu_limit), func.sum(User.memory_limit_gb)).filter(User.role != UserRole.DEVELOPER).first()
    
    resources.cpu_allocated = int(alloc_data[0] or 0)
    resources.memory_allocated_mb = int(alloc_data[1] or 0) * 1024

    # --- 6. MAINTENANCE MODE ---
    from app.models.system_setting import SystemSetting
    is_maintenance = db.query(SystemSetting).filter(SystemSetting.key == "maintenance_mode").first()
    maintenance_active = is_maintenance.value.lower() == "true" if is_maintenance else False

    return DashboardStats(
        cluster_status=cluster_status,
        resources=resources,
        utilization=utilization,
        jobs=jobs_stats,
        users=UserStatsSchema(total_users=total_users),
        requests=RequestStatsSchema(pending_requests=pending_requests),
        maintenance_active=maintenance_active
    )