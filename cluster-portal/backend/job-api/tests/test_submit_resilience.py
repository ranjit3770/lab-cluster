"""Resilience (chaos-style) tests for the job submission path.

Simulates component disappearances — slurmrestd unreachable, invalid JWT
(401/403), missing JWT file, sbatch CLI failure, quota pressure — and asserts
the service fails *gracefully*: clean exceptions or safe fallbacks, never
silent corruption. Everything external is monkeypatched; no cluster needed.
"""

import requests
import pytest
from types import SimpleNamespace

from app.slurm import submit as submit_mod


def fake_plan(job):
    """Deterministic planner output so no cluster snapshot is required."""
    return {
        "ntasks": 1,
        "cpus_per_task": 2,
        "mem": 4,
        "mem_per_cpu": 2048,
        "partition": "normal",
        "gpu_count": 0,
        "job_type": "batch",
        "warnings": [],
        "requested_cpu": 2,
        "request_id": "chaos-0001",
        "explanations": [],
        "node_distribution": [],
    }


@pytest.fixture
def job(tmp_path, monkeypatch):
    """A minimal batch job with the filesystem redirected into tmp_path."""
    monkeypatch.setattr(submit_mod, "plan_resources", fake_plan)
    monkeypatch.setattr(submit_mod, "DATA_ROOT", str(tmp_path))
    return SimpleNamespace(
        username="student1",
        project_name="chaos",
        entry_point=None,
        command="python train.py",
        command_args="",
        requirements_path="",
        total_cpu=2,
        total_ram=4,
        time="00:10:00",
        job_type="batch",
        partition=None,
        gpu=False,
        gpu_count=0,
        constraint=None,
    )


@pytest.fixture
def quiet_fs(monkeypatch):
    """Keep the chmod/chown hardening from touching the real system."""
    monkeypatch.setattr(submit_mod.os, "chmod", lambda *a, **k: None)
    monkeypatch.setattr(submit_mod.os, "chown", lambda *a, **k: None)
    import subprocess as sp
    monkeypatch.setattr(sp, "run", lambda *a, **k: None)


@pytest.fixture
def happy_quota(monkeypatch):
    """Quota sources report plenty of headroom."""
    monkeypatch.setattr(submit_mod, "get_db_limit", lambda u: None)
    monkeypatch.setattr(
        submit_mod, "get_user_quota", lambda u: {"max_cpu": 64, "max_ram_gb": 128}
    )
    monkeypatch.setattr(submit_mod, "get_slurm_usage", lambda u: (0, 0))


@pytest.fixture
def stub_logging(monkeypatch):
    """Successful submissions must not require a live job-registry DB."""
    from types import SimpleNamespace as NS

    monkeypatch.setattr("app.models.insert_job_log", lambda *a, **k: None)

    fake_cursor = NS(execute=lambda *a, **k: None, close=lambda: None)
    fake_db = NS(cursor=lambda: fake_cursor, commit=lambda: None, close=lambda: None)
    monkeypatch.setattr("app.database.get_db", lambda: fake_db)


def _fake_rest(monkeypatch, status_code=200, payload=None, exc=None):
    """Replace requests.post used by the REST submit path."""
    calls = []

    def fake_post(url, json=None, headers=None, timeout=None):
        calls.append(url)
        if exc:
            raise exc
        return SimpleNamespace(status_code=status_code, text="boom", json=lambda: payload or {})

    monkeypatch.setattr(submit_mod.requests, "post", fake_post)
    return calls


# ---------------------------------------------------------------------------
# slurmrestd disappears
# ---------------------------------------------------------------------------

def test_slurmrestd_down_raises_clean_error(job, quiet_fs, happy_quota, monkeypatch):
    monkeypatch.setattr(submit_mod, "get_slurm_jwt", lambda: "valid-token")
    _fake_rest(monkeypatch, exc=requests.ConnectionError("connection refused"))
    with pytest.raises(Exception, match="Slurm submission failed"):
        submit_mod.submit_job(job)


def test_slurmrestd_500_raises_clean_error(job, quiet_fs, happy_quota, monkeypatch):
    monkeypatch.setattr(submit_mod, "get_slurm_jwt", lambda: "valid-token")
    _fake_rest(monkeypatch, status_code=500)
    with pytest.raises(Exception, match="Slurm submission failed"):
        submit_mod.submit_job(job)


def test_slurmrestd_accept_without_jobid_raises(job, quiet_fs, happy_quota, monkeypatch):
    """A 200 response without a job_id must not be mistaken for success."""
    monkeypatch.setattr(submit_mod, "get_slurm_jwt", lambda: "valid-token")
    _fake_rest(monkeypatch, status_code=200, payload={"errors": ["bad request"]})
    with pytest.raises(Exception):
        submit_mod.submit_job(job)


# ---------------------------------------------------------------------------
# JWT / munge failures -> sbatch CLI fallback
# ---------------------------------------------------------------------------

def test_missing_jwt_falls_back_to_sbatch(job, quiet_fs, happy_quota, stub_logging, monkeypatch):
    monkeypatch.setattr(submit_mod, "get_slurm_jwt", lambda: None)
    calls = _fake_rest(monkeypatch)  # must never be hit

    monkeypatch.setattr(
        submit_mod, "_submit_script_with_sbatch", lambda u, p, w: "12345"
    )

    result = submit_mod.submit_job(job)
    assert result[0] == "12345"
    assert result[5]["submission_transport"] == "sbatch-cli"
    assert calls == [], "REST endpoint must not be contacted when JWT is unavailable"


def test_auth_failure_falls_back_to_sbatch(job, quiet_fs, happy_quota, stub_logging, monkeypatch):
    """401/403 from slurmrestd (expired JWT / munge breakage) uses sbatch."""
    monkeypatch.setattr(submit_mod, "get_slurm_jwt", lambda: "stale-token")
    calls = _fake_rest(monkeypatch, status_code=403)
    monkeypatch.setattr(submit_mod, "_submit_script_with_sbatch", lambda u, p, w: "777")

    result = submit_mod.submit_job(job)
    assert result[0] == "777"
    assert result[5]["submission_transport"] == "sbatch-cli"
    assert len(calls) >= 1


def test_sbatch_cli_failure_surfaces_as_submission_failure(
    job, quiet_fs, happy_quota, monkeypatch
):
    """Both transports down => loud, descriptive failure (not a hang)."""
    monkeypatch.setattr(submit_mod, "get_slurm_jwt", lambda: None)

    def broken_sbatch(u, p, w):
        raise Exception("sudo: no tty present")

    monkeypatch.setattr(submit_mod, "_submit_script_with_sbatch", broken_sbatch)

    with pytest.raises(Exception, match="sbatch CLI fallback failed|Slurm submission failed"):
        submit_mod.submit_job(job)


# ---------------------------------------------------------------------------
# Quota pressure degrades to queueing, not Slurm contact
# ---------------------------------------------------------------------------

def test_hard_quota_exceeded_queues_without_slurm_contact(job, quiet_fs, monkeypatch):
    monkeypatch.setattr(
        submit_mod, "get_db_limit", lambda u: {"cpu_limit": 4, "memory_limit_gb": 8}
    )
    monkeypatch.setattr(
        submit_mod, "get_user_quota", lambda u: {"max_cpu": 4, "max_ram_gb": 8}
    )
    # User already near quota; the requested 2 CPUs push past the limit.
    monkeypatch.setattr(submit_mod, "get_slurm_usage", lambda u: (3, 2))
    calls = _fake_rest(monkeypatch)

    job_id, warnings, quota_meta, _, _, meta = submit_mod.submit_job(job)
    assert job_id == "QUOTA_EXCEEDED"
    assert calls == [], "over-quota jobs must be queued locally, not submitted"
    assert quota_meta["total_cpu_quota"] == 4


# ---------------------------------------------------------------------------
# Audit artifacts survive failed submissions
# ---------------------------------------------------------------------------

def test_audit_script_written_even_on_rest_failure(
    job, quiet_fs, happy_quota, tmp_path, monkeypatch
):
    monkeypatch.setattr(submit_mod, "get_slurm_jwt", lambda: "valid-token")
    _fake_rest(monkeypatch, exc=requests.ConnectionError("down"))
    with pytest.raises(Exception):
        submit_mod.submit_job(job)

    generated_dir = tmp_path / "student1" / "slurm_logs" / "generated"
    scripts = list(generated_dir.glob("*.sbatch"))
    audits = list(generated_dir.glob("*.json"))
    assert scripts and audits, "audit trail must survive failed submissions"
