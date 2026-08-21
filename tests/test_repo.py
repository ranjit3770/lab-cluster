"""Repository-level CI checks: YAML validity and documentation links."""

import os
import re
import urllib.parse

import yaml
import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

EXCLUDED_DIRS = {"node_modules", ".git", "__pycache__", "archive"}


def repo_files(relative_dir, pattern):
    base = os.path.join(REPO_ROOT, relative_dir)
    matches = []
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDED_DIRS]
        for filename in filenames:
            if filename.endswith(pattern):
                matches.append(os.path.join(dirpath, filename))
    return sorted(matches)


# ---------------------------------------------------------------------------
# Ansible playbook YAML validity
# ---------------------------------------------------------------------------

def collect_ansible_playbooks():
    playbooks = []
    deployments = os.path.join(REPO_ROOT, "ansible", "playbooks")
    for dirpath, _dirnames, filenames in os.walk(deployments):
        for filename in filenames:
            if filename.endswith((".yml", ".yaml")):
                playbooks.append(os.path.join(dirpath, filename))
    return sorted(playbooks)


@pytest.mark.parametrize("playbook", collect_ansible_playbooks(), ids=lambda p: os.path.relpath(p, REPO_ROOT))
def test_ansible_playbook_yaml_is_valid(playbook):
    with open(playbook, encoding="utf-8") as handle:
        documents = list(yaml.safe_load_all(handle))
    assert documents, f"{playbook} contains no YAML documents"
    assert all(isinstance(doc, (dict, list)) for doc in documents)


def test_inventory_group_vars_parse():
    group_vars = os.path.join(REPO_ROOT, "ansible", "inventory", "group_vars")
    if not os.path.isdir(group_vars):
        pytest.skip("no group_vars directory")
    for filename in sorted(os.listdir(group_vars)):
        path = os.path.join(group_vars, filename)
        if not os.path.isfile(path):
            continue
        content = open(path, encoding="utf-8").read()
        if filename == "all.yml":
            parsed = yaml.safe_load(content)
            assert isinstance(parsed, dict)
        # vault-encrypted files are $ANSIBLE_VAULT payloads; just check the header
        else:
            assert content.strip().startswith("$ANSIBLE_VAULT") or ":" in content


# ---------------------------------------------------------------------------
# Docker Compose validity
# ---------------------------------------------------------------------------

def test_docker_compose_is_valid():
    compose_path = os.path.join(REPO_ROOT, "cluster-portal", "docker-compose.yml")
    with open(compose_path, encoding="utf-8") as handle:
        compose = yaml.safe_load(handle)
    assert isinstance(compose, dict) and "services" in compose


# ---------------------------------------------------------------------------
# GitHub workflow YAML validity
# ---------------------------------------------------------------------------

def test_github_workflows_are_valid_yaml():
    workflow_dir = os.path.join(REPO_ROOT, ".github", "workflows")
    workflow_files = [
        os.path.join(workflow_dir, name)
        for name in sorted(os.listdir(workflow_dir))
        if name.endswith((".yml", ".yaml"))
    ]
    assert workflow_files, "no GitHub workflow definitions found"
    for path in workflow_files:
        with open(path, encoding="utf-8") as handle:
            parsed = yaml.safe_load(handle)
        assert "jobs" in parsed, f"{path} defines no jobs"


# ---------------------------------------------------------------------------
# Markdown link integrity (docs refactor safety net)
# ---------------------------------------------------------------------------

def markdown_files():
    files = []
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDED_DIRS]
        for filename in filenames:
            if filename.endswith(".md"):
                files.append(os.path.join(dirpath, filename))
    return sorted(files)


LINK_PATTERN = re.compile(r"\]\(([^)#]+)(#[^)]*)?\)")


@pytest.mark.parametrize("markdown_path", markdown_files(), ids=lambda p: os.path.relpath(p, REPO_ROOT))
def test_markdown_relative_links_resolve(markdown_path):
    text = open(markdown_path, encoding="utf-8").read()
    broken = []
    for match in LINK_PATTERN.finditer(text):
        target = match.group(1).strip()
        if target.startswith(("http://", "https://", "mailto:", "file:")):
            continue
        resolved = os.path.normpath(
            os.path.join(os.path.dirname(markdown_path), urllib.parse.unquote(target))
        )
        if not os.path.exists(resolved):
            broken.append(target)
    assert not broken, f"broken links in {os.path.relpath(markdown_path, REPO_ROOT)}: {broken}"
