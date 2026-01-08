import requests
from app.config import SLURM_NODE_API

def get_nodes():
    r = requests.get(SLURM_NODE_API, timeout=5)
    r.raise_for_status()
    return r.json()["nodes"]

def plan_resources(total_cpu, total_ram, mode):
    nodes = get_nodes()

    total_free_cpu = 0
    total_free_ram = 0
    free_nodes = []

    for n in nodes:
        cpu = n.get("free_cpus", n.get("alloc_idle_cpus", 0))
        ram = n.get("free_memory", n.get("real_memory", 0) - n.get("alloc_memory", 0)) // 1024
        total_free_cpu += cpu
        total_free_ram += ram
        free_nodes.append((n["name"], cpu, ram))

    if mode == "random":
        if total_free_cpu < total_cpu or total_free_ram < total_ram:
            raise ValueError("Insufficient cluster resources")
        return {"type": "random", "ntasks": total_cpu, "mem": total_ram}

    if mode == "node_wise":
        allocation = []
        cpu_left, ram_left = total_cpu, total_ram

        free_nodes.sort(key=lambda x: (x[1], x[2]), reverse=True)

        for node, cpu, ram in free_nodes:
            if cpu_left <= 0 or ram_left <= 0:
                break
            allocation.append((node, min(cpu, cpu_left), min(ram, ram_left)))
            cpu_left -= min(cpu, cpu_left)
            ram_left -= min(ram, ram_left)

        if cpu_left > 0 or ram_left > 0:
            raise ValueError("Node-wise allocation not possible")

        return {"type": "node_wise", "nodes": allocation}

    raise ValueError("Invalid resource_mode")

