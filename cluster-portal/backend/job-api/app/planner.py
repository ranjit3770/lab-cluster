import requests
from app.config import SLURM_NODE_API

import requests_unixsocket

def get_nodes():
    # 1. Fetch Dynamic URL from Main Portal Database
    try:
        from app.config import MYSQL_CONFIG
        import mysql.connector
        
        db = mysql.connector.connect(
            host=MYSQL_CONFIG["host"],
            user=MYSQL_CONFIG["user"],
            password=MYSQL_CONFIG["password"],
            database="strach_portal"
        )
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT value FROM system_settings WHERE `key` = 'slurm_rest_url'")
        result = cursor.fetchone()
        cursor.close()
        db.close()
        
        url_base = result['value'] if result else SLURM_NODE_API.replace('/nodes', '')
    except Exception as e:
        print(f"[RECOVERY] DB Fetch failed for Slurm REST URL: {e}")
        url_base = SLURM_NODE_API.replace('/nodes', '')

    # 2. Construct final endpoint
    url_base = url_base.rstrip('/')
    final_url = f"{url_base}/nodes"

    # 3. Intelligent Request Execution
    try:
        if final_url.startswith("http+unix"):
            with requests_unixsocket.Session() as session:
                r = session.get(final_url, timeout=5)
        else:
            r = requests.get(final_url, timeout=5)
            
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[CRITICAL] Slurm Node API Unreachable at {final_url}: {e}")
        raise

def plan_resources(total_cpu, total_ram, mode):
    response_data = get_nodes()

    # Slurm REST API returns a dict. The list of nodes is in response_data["nodes"]
    # We use .get("nodes", []) to avoid a KeyError if the API returns an error message instead
    nodes = response_data.get("nodes", [])

    # 4. Fetch Allowed Node Names from DevNodes Hub
    allowed_nodes = set()
    try:
        from app.config import MYSQL_CONFIG
        import mysql.connector
        db = mysql.connector.connect(
            host=MYSQL_CONFIG["host"],
            user=MYSQL_CONFIG["user"],
            password=MYSQL_CONFIG["password"],
            database="strach_portal"
        )
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT name FROM dev_nodes")
        # Strip names to avoid issues with invisible characters (\r or spaces)
        allowed_nodes = {row['name'].strip() for row in cursor.fetchall() if row.get('name')}
        cursor.close()
        db.close()
    except Exception as e:
        print(f"[RECOVERY] DB Fetch failed for DevNodes names: {e}")

    total_free_cpu = 0
    total_free_ram = 0
    free_nodes = []

    print(f"DEBUG Resource Planner: Found {len(nodes)} total nodes from Slurm, {len(allowed_nodes)} authorized nodes from Registry.")

    # Normalize allowed nodes to uppercase for robust matching
    allowed_nodes_upper = {name.upper() for name in allowed_nodes}
    print(f"DEBUG Resource Planner: Target Registry Names (Upper): {allowed_nodes_upper}")

    for n in nodes:
        node_name_raw = n.get("name", "")
        # Get host component (e.g., 'worker1' from 'worker1.local')
        node_shortname = node_name_raw.split('.')[0].upper()
        node_fullname = node_name_raw.upper()
        
        print(f"DEBUG Resource Planner: Evaluating Slurm Node '{node_name_raw}' (Short: '{node_shortname}', Full: '{node_fullname}')")
        
        # 1. Direct Match
        is_match = node_fullname in allowed_nodes_upper or node_shortname in allowed_nodes_upper
        
        # 2. Fuzzy Match (User Friendly Fallback: strip hyphens and check containment)
        if not is_match:
            # Example: 'WORKER-NODE1' (Registry) vs 'WORKER1' (Slurm)
            for registry_name in allowed_nodes_upper:
                clean_reg = registry_name.replace('-', '').replace(' ', '')
                clean_slurm = node_shortname.replace('-', '').replace(' ', '')
                if clean_reg == clean_slurm or clean_slurm in clean_reg or clean_reg in clean_slurm:
                    is_match = True
                    print(f"DEBUG Resource Planner: FUZZY MATCH FOUND: {node_name_raw} matched with {registry_name}")
                    break

        if not is_match:
            print(f"DEBUG Resource Planner: REJECTED - No match for '{node_name_raw}' in {allowed_nodes_upper}")
            continue
            
        # Get resources (Slurm v0.0.44 typically uses 'cpus' and 'real_memory')
        cpu = n.get("cpus", n.get("free_cpus", n.get("alloc_idle_cpus", 0)))
        # Memory is in MB
        real_mem = n.get("real_memory", 0)
        alloc_mem = n.get("alloc_memory", 0)
        available_ram = real_mem - alloc_mem
        if available_ram < 0: available_ram = 0
        
        total_free_cpu += cpu
        total_free_ram += available_ram
        free_nodes.append((node_name_raw, cpu, available_ram))
        print(f"DEBUG Resource Planner: ACCEPTED '{node_name_raw}' -> {cpu} CPU, {available_ram}MB RAM.")

    if not free_nodes:
        # Fallback: if allowed_nodes is not empty but no matching nodes found in Slurm list
        print(f"DEBUG Resource Planner: CRITICAL MATCH FAILURE. Registry has {len(allowed_nodes)}, but Slurm list of {len(nodes)} gave zero matches.")
        raise ValueError(f"No authorized compute nodes found in Slurm cluster. (Registry: {len(allowed_nodes)} names, Slurm: {len(nodes)} nodes)")

    if mode == "random":
        if total_free_cpu < total_cpu or total_free_ram < total_ram:
            raise ValueError(f"Insufficient cluster resources (Requested: {total_cpu} CPU, {total_ram}MB RAM | Available: {total_free_cpu} CPU, {total_free_ram}MB RAM)")
        return {"type": "random", "ntasks": total_cpu, "cpus_per_task": 1, "mem": total_ram}

    if mode == "node_wise":
        # FIX: The previous greedy allocation produced per-node tuples like
        # [(worker1, 4, 8192), (worker2, 2, 4096)] that could NOT be accurately
        # expressed in SBATCH flags. The old SBATCH generation used only the
        # first node's values, silently requesting incorrect resources.
        #
        # Corrected approach: Validate that total cluster capacity can satisfy
        # the request, then return a task-based resource shape. Slurm's own
        # scheduler handles optimal node placement — that is its core job.
        if total_free_cpu < total_cpu or total_free_ram < total_ram:
            raise ValueError(
                f"Node-wise validation failed: Insufficient resources across "
                f"{len(free_nodes)} authorized nodes. "
                f"(Requested: {total_cpu} CPU, {total_ram} RAM | "
                f"Available: {total_free_cpu} CPU, {total_free_ram} RAM)"
            )
        return {"type": "node_wise", "ntasks": total_cpu, "cpus_per_task": 1, "mem": total_ram}

    raise ValueError("Invalid resource_mode")

