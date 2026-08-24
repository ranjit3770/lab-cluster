"""Unit tests for the job-api resource planner.

The planner reads live Slurm state at submit time. These tests exercise the
pure parsing/planning logic and monkeypatch the Slurm/DB touchpoints, so no
Slurm installation or database is required.
"""

import pytest
from types import SimpleNamespace

from app import planner


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_node(
    name="worker-node1",
    state="IDLE",
    total_cpus=16,
    allocated_cpus=0,
    real_memory_mb=32768,
    free_memory_mb=32768,
    partition="main",
):
    return {
        "name": name,
        "state": state,
        "partition": partition,
        "total_cpus": total_cpus,
        "allocated_cpus": allocated_cpus,
        "free_cpus": max(0, total_cpus - allocated_cpus),
        "real_memory_mb": real_memory_mb,
        "allocated_memory_mb": 0,
        "free_memory_mb": free_memory_mb,
        "features": "",
        "gres": "",
        "load": "0",
        "boot_time": "",
        "slurmd_start_time": "2026-01-01T00:00:00",
    }


def make_snapshot(nodes, source="scontrol"):
    healthy = [n for n in nodes if n["state"] not in planner.UNHEALTHY_STATES]
    return {
        "source": source,
        "nodes": nodes,
        "all_nodes_seen": len(nodes),
        "total_cpus": sum(n["total_cpus"] for n in healthy),
        "free_cpus": sum(n["free_cpus"] for n in healthy),
        "total_memory_mb": sum(n["real_memory_mb"] for n in healthy),
        "free_memory_mb": sum(n["free_memory_mb"] for n in healthy),
        "max_node_cpus": max([n["total_cpus"] for n in healthy], default=0),
        "max_node_memory_mb": max([n["real_memory_mb"] for n in healthy], default=0),
        "queue": {"pending": 0, "running": 0, "other": 0},
    }


NO_POLICIES = {
    "max_cpu_per_submission": 0,
    "max_memory_gb_per_submission": 0,
    "default_partition": "",
    "fair_share_weight": 0,
    "portal_node_allowlist": [],
    "portal_node_exclude": [],
}


def make_request(total_cpu=8, total_ram="16G", **extra):
    req = SimpleNamespace(
        username="testuser",
        project_name="ci-test",
        entry_point="",
        total_cpu=total_cpu,
        total_ram=total_ram,
        time="01:00:00",
        command=None,
        ntasks=None,
        cpus_per_task=None,
        mem_per_cpu=None,
        job_type=None,
        partition=None,
        gpu_count=0,
        constraint=None,
    )
    for key, value in extra.items():
        setattr(req, key, value)
    return req


@pytest.fixture
def patch_cluster(monkeypatch):
    """Detach plan_resources from live Slurm and portal DB."""

    def _patch(nodes, policies=None):
        monkeypatch.setattr(planner, "_load_policy_defaults", lambda: {**NO_POLICIES, **(policies or {})})
        monkeypatch.setattr(planner, "get_cluster_snapshot", lambda: make_snapshot(nodes))

    return _patch


# ---------------------------------------------------------------------------
# Memory parsing
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "value,expected",
    [
        ("64G", 64 * 1024),
        ("64000M", 64000),
        ("1", 1024),          # bare number means GiB
        (2, 2048),            # int input also GiB
        ("1.5G", 1536),
        ("512K", 1),          # sub-MB rounds up to at least 1 MB
    ],
)
def test_parse_memory_to_mb(value, expected):
    assert planner._parse_memory_to_mb(value) == expected


def test_parse_memory_rejects_garbage():
    with pytest.raises(ValueError):
        planner._parse_memory_to_mb("lots")


@pytest.mark.parametrize(
    "value,expected",
    [("1024", 1024), (512, 512), ("2G", 2048)],
)
def test_parse_mem_per_cpu_to_mb(value, expected):
    assert planner._parse_mem_per_cpu_to_mb(value) == expected


# ---------------------------------------------------------------------------
# Slurm output parsers
# ---------------------------------------------------------------------------

SCONTROL_LINE = (
    "NodeName=worker-node17 NodeAddr=172.17.181.170 State=IDLE+CLOUD "
    "CPUTot=12 CPUAlloc=2 RealMemory=12288 FreeMem=8000 "
    "AvailableFeatures=w28 Gres=gpu:intel:1 Partitions=main"
)


def test_parse_scontrol_nodes_extracts_fields():
    nodes = planner._parse_scontrol_nodes(SCONTROL_LINE + "\n\n")
    assert len(nodes) == 1
    node = nodes[0]
    assert node["name"] == "worker-node17"
    assert node["state"] == "IDLE"           # suffix after '+' dropped
    assert node["total_cpus"] == 12
    assert node["free_cpus"] == 10           # CPUTot - CPUAlloc
    assert node["free_memory_mb"] == 8000    # FreeMem preferred over Real-Alloc
    assert node["partition"] == "main"


def test_parse_scontrol_nodes_skips_header_lines():
    assert planner._parse_scontrol_nodes("ClusterName=demo") == []


SINFO_LINE = "worker-node2|idle|12|6000|4/8/0/12|main"


def test_parse_sinfo_nodes_fallback_format():
    nodes = planner._parse_sinfo_nodes(SINFO_LINE)
    assert len(nodes) == 1
    node = nodes[0]
    assert node["name"] == "worker-node2"
    assert node["state"] == "IDLE"
    assert node["total_cpus"] == 12
    assert node["free_cpus"] == 8
    assert node["real_memory_mb"] == 6000


def test_unhealthy_states_cover_known_bad_states():
    for state in ("DOWN", "DRAIN", "INVAL", "MAINT", "NO_RESPOND", "FAIL", "UNKNOWN"):
        assert state in planner.UNHEALTHY_STATES


# ---------------------------------------------------------------------------
# Packing / capacity estimation
# ---------------------------------------------------------------------------

def test_pack_tasks_prefers_largest_capacity_and_respects_memory():
    big = make_node("big", free_memory_mb=16000)
    small = make_node("small", total_cpus=8, free_memory_mb=4000)
    # Capacities: big -> min(16, 16000//2048)=7 tasks, small -> min(8, 4000//2048)=1 task.
    distribution, remaining = planner._pack_tasks(
        [small, big], ntasks=10, cpus_per_task=1, mem_per_task_mb=2048
    )
    assert distribution[0]["node"] == "big"
    assert distribution[0]["tasks"] == 7
    assert distribution[1]["node"] == "small"
    assert distribution[1]["tasks"] == 1
    assert sum(d["cpus"] for d in distribution) == 8
    assert remaining == 2   # no capacity left; Slurm will queue this remainder


def test_min_nodes_for_capacity_free_vs_total():
    busy = make_node("busy", total_cpus=16, allocated_cpus=12)   # 4 free
    idle = make_node("idle", total_cpus=16, allocated_cpus=10)   # 6 free
    nodes = [busy, idle]
    # 10 CPUs fit on one node by totals, but need two nodes from currently-free CPU.
    assert planner._min_nodes_for_capacity(nodes, 10, 1, 1024, use_total=True) == 1
    assert planner._min_nodes_for_capacity(nodes, 10, 1, 1024, use_total=False) == 2


def test_queue_summary_counts_states(monkeypatch):
    monkeypatch.setattr(
        planner,
        "_run_slurm_command",
        lambda args, timeout=5: "RUNNING\nPENDING\nPENDING\nCOMPLETING\n",
    )
    summary = planner.get_queue_summary()
    assert summary == {"pending": 2, "running": 1, "other": 1}


# ---------------------------------------------------------------------------
# plan_resources end-to-end (with patched cluster snapshot)
# ---------------------------------------------------------------------------

def test_plan_distributed_default(patch_cluster):
    patch_cluster([make_node()])
    result = planner.plan_resources(make_request(total_cpu=8, total_ram="16G"))

    assert result["ntasks"] == 8
    assert result["cpus_per_task"] == 1
    assert result["mem_per_cpu"] == 2048          # 16G spread across 8 tasks
    assert result["allocation_mode"] == "distributed"
    directives = "\n".join(result["sbatch_directives"])
    assert "#SBATCH --ntasks=8" in directives
    assert "#SBATCH --cpus-per-task=1" in directives
    assert "#SBATCH --mem-per-cpu=2048M" in directives
    assert "#SBATCH --distribution=block:block" in directives


def test_plan_multithread_uses_vertical_allocation(patch_cluster):
    patch_cluster([make_node()])
    result = planner.plan_resources(make_request(total_cpu=4, total_ram="8G", job_type="multithread"))

    assert result["ntasks"] == 1
    assert result["cpus_per_task"] == 4
    assert result["mem_per_cpu"] == 2048          # 8G across 4 CPUs
    assert result["allocation_mode"] == "single-node"


def test_plan_explicit_task_shape_warns_on_mismatch(patch_cluster):
    patch_cluster([make_node()])
    result = planner.plan_resources(
        make_request(total_cpu=8, ntasks=2, cpus_per_task=2)
    )
    assert result["ntasks"] == 2 and result["cpus_per_task"] == 2
    assert any("Explicit ntasks" in w for w in result["warnings"])


def test_plan_rejects_impossible_request(patch_cluster):
    patch_cluster([make_node(name="tiny", total_cpus=2)])
    with pytest.raises(ValueError, match="cannot fit"):
        planner.plan_resources(make_request(total_cpu=64, total_ram="128G"))


def test_plan_allows_queueing_when_temporarily_busy(patch_cluster):
    busy = make_node(allocated_cpus=15, free_memory_mb=1000)
    patch_cluster([make_node(), busy])
    result = planner.plan_resources(make_request(total_cpu=32, total_ram="32G"))
    assert any("Slurm will queue" in w for w in result["warnings"])


def test_plan_applies_policy_cpu_cap(patch_cluster):
    patch_cluster([make_node()], policies={"max_cpu_per_submission": 4})
    result = planner.plan_resources(make_request(total_cpu=8))
    # The planner reports and plans against the capped value.
    assert result["requested_cpu"] == 4
    assert result["ntasks"] == 4
    assert any("reduced from 8 to policy limit 4" in w for w in result["warnings"])


def test_plan_filters_by_portal_allowlist(patch_cluster):
    patch_cluster(
        [make_node("worker-a"), make_node("worker-b")],
        policies={"portal_node_allowlist": ["worker-a"]},
    )
    result = planner.plan_resources(make_request(total_cpu=2, total_ram="2G"))
    assigned = {d["node"] for d in result["node_distribution"]}
    assert assigned <= {"worker-a"}
    directives = "\n".join(result["sbatch_directives"])
    assert "--nodelist=worker-a" in directives


def test_plan_gpu_and_partition_directives(patch_cluster):
    patch_cluster([make_node()])
    result = planner.plan_resources(
        make_request(total_cpu=2, total_ram="4G", gpu_count=1, partition="gpu")
    )
    directives = "\n".join(result["sbatch_directives"])
    assert "#SBATCH --gres=gpu:1" in directives
    assert "#SBATCH --partition=gpu" in directives
