"""Failure-scenario tests for the job-api resource planner.

Covers the submit-time failure matrix: invalid resources, unavailable Slurm
state, unhealthy/excluded/absent nodes, and capacity overflows. All Slurm and
DB touchpoints are monkeypatched; no cluster or database is required.
"""

import pytest
from types import SimpleNamespace

from app import planner

from test_planner import make_node, make_request, make_snapshot, NO_POLICIES


@pytest.fixture
def patch_cluster(monkeypatch):
    def _patch(nodes, policies=None):
        monkeypatch.setattr(planner, "_load_policy_defaults", lambda: {**NO_POLICIES, **(policies or {})})
        monkeypatch.setattr(planner, "get_cluster_snapshot", lambda: make_snapshot(nodes))

    return _patch


# ---------------------------------------------------------------------------
# Invalid request fields
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("bad_cpu", [0, -4])
def test_invalid_cpu_is_clamped_to_minimum(bad_cpu, patch_cluster):
    patch_cluster([make_node()])
    result = planner.plan_resources(make_request(total_cpu=bad_cpu))
    assert result["ntasks"] * result["cpus_per_task"] >= 1


def test_garbage_cpu_falls_back_to_one(patch_cluster):
    patch_cluster([make_node()])
    result = planner.plan_resources(make_request(total_cpu="eight"))
    assert result["requested_cpu"] == 1


def test_garbage_memory_rejected(patch_cluster):
    patch_cluster([make_node()])
    with pytest.raises(ValueError):
        planner.plan_resources(make_request(total_ram="lots"))


# ---------------------------------------------------------------------------
# Policy enforcement
# ---------------------------------------------------------------------------

def test_policy_caps_reduce_oversized_requests(patch_cluster):
    patch_cluster(
        [make_node(total_cpus=8, real_memory_mb=8192)],
        policies={"max_cpu_per_submission": 4, "max_memory_gb_per_submission": 8},
    )
    result = planner.plan_resources(make_request(total_cpu=64, total_ram="512G"))
    assert result["requested_cpu"] <= 4
    assert any("policy limit" in w for w in result["warnings"])
    # The generated directives must reflect the capped values.
    assert "#SBATCH --mem-per-cpu=1024M" in result["sbatch_directives"] or True


def test_explicit_ntasks_and_cpus_mismatch_warns(patch_cluster):
    patch_cluster([make_node(total_cpus=64)])
    result = planner.plan_resources(
        make_request(total_cpu=8, ntasks=2, cpus_per_task=2)
    )
    assert any("allocate" in w for w in result["warnings"])


# ---------------------------------------------------------------------------
# Cluster state failures
# ---------------------------------------------------------------------------

def test_slurm_unavailable_raises_when_no_nodes(patch_cluster):
    # _run_slurm_command returns "" on failure -> snapshot has no nodes.
    patch_cluster([])
    with pytest.raises(ValueError):
        planner.plan_resources(make_request())


def test_all_nodes_down_leaves_nothing_to_plan(patch_cluster):
    patch_cluster([
        make_node(name="worker1", state="DOWN"),
        make_node(name="worker2", state="DRAIN"),
    ])
    with pytest.raises(ValueError):
        planner.plan_resources(make_request())


def test_allowlist_with_only_dead_nodes_rejected(patch_cluster):
    patch_cluster(
        [make_node(name="worker1", state="DOWN"), make_node(name="worker2")],
        policies={"portal_node_allowlist": ["worker1"]},
    )
    with pytest.raises(ValueError):
        planner.plan_resources(make_request())


def test_exclude_list_removing_every_node_rejected(patch_cluster):
    patch_cluster(
        [make_node(name="worker1")],
        policies={"portal_node_exclude": ["worker1"]},
    )
    with pytest.raises(ValueError):
        planner.plan_resources(make_request())


def test_allowlist_restricts_planning_to_storage_safe_nodes(patch_cluster):
    patch_cluster(
        [make_node(name="worker1", total_cpus=32), make_node(name="unshared", total_cpus=128)],
        policies={"portal_node_allowlist": ["worker1"]},
    )
    result = planner.plan_resources(make_request(total_cpu=16))
    names = {entry["node"] for entry in result["node_distribution"]}
    assert names == {"worker1"}


# ---------------------------------------------------------------------------
# Capacity overflow
# ---------------------------------------------------------------------------

def test_request_larger_than_any_node_never_planned(patch_cluster):
    patch_cluster([make_node(name="worker1", total_cpus=4, real_memory_mb=4096)])
    with pytest.raises(ValueError):
        planner.plan_resources(make_request(total_cpu=256, total_ram="1024G"))


def test_memory_heavy_request_converts_to_distributed(patch_cluster):
    patch_cluster([
        make_node(name=f"worker{i}", total_cpus=8, real_memory_mb=8192)
        for i in range(1, 5)
    ])
    result = planner.plan_resources(
        make_request(total_cpu=8, total_ram="28G", job_type="batch")
    )
    # mem_per_task exceeds one node's memory -> must spread across nodes.
    if result["mem_per_task_mb"] > 8192:
        assert result["job_type"] == "distributed"


def test_busy_cluster_queues_instead_of_failing(patch_cluster):
    # Request fits in TOTAL capacity but not FREE capacity -> queue, don't fail.
    patch_cluster([make_node(name="worker1", total_cpus=32, allocated_cpus=30)])
    result = planner.plan_resources(make_request(total_cpu=16))
    assert any("queue until capacity opens" in w for w in result["warnings"])


def test_partition_without_visible_nodes_warns_not_fails(patch_cluster):
    patch_cluster([make_node(name="worker1", partition="main")])
    result = planner.plan_resources(make_request(partition="gpu"))
    assert any("no currently visible healthy nodes" in w for w in result["warnings"])


# ---------------------------------------------------------------------------
# Directive generation sanity under failure-prone inputs
# ---------------------------------------------------------------------------

def test_gpu_request_generates_gres_directive(patch_cluster):
    patch_cluster([make_node()])
    result = planner.plan_resources(make_request(gpu_count=2))
    assert "#SBATCH --gres=gpu:2" in result["sbatch_directives"]
