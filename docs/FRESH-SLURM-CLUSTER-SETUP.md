# Fresh Slurm Cluster Setup

This document is the future reference procedure for a fresh Slurm cluster setup or a full cluster rebuild using the Ansible playbooks in this repository.

Use this when:

- building the cluster for the first time
- rebuilding Slurm across the cluster
- intentionally rerunning the full deployment flow

Do not use this procedure just to add one worker to an already working cluster. For that, use [Append a New Slurm Worker Node](APPEND-NEW-NODE.md).

## Recommended Entrypoint

Run the guided management playbook:

```bash
cd /opt/amritacluster/SLURM-COMPLETE-SETUP/ansible
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory/hosts.ini playbooks/deployment/cluster_manage.yml --ask-vault-pass
```

When prompted:

```text
Type setup for full cluster setup, or append to add one new worker:
```

Type:

```text
setup
```

For the append-only node prompt, press Enter because it is not used in setup mode.

## Direct Full Setup Command

You can run the full setup playbook directly:

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory/hosts.ini playbooks/deployment/step4_main.yml --ask-vault-pass
```

Before `slurm.conf` is written, the setup displays detected CPU and RAM for every Slurm node and asks what CPU/RAM should be advertised to Slurm. Press Enter to use detected values, enter caps at the prompts, or pass caps non-interactively:

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory/hosts.ini playbooks/deployment/step4_main.yml --ask-vault-pass -e slurm_cpu_cap_per_node=12 -e slurm_memory_cap_mb_per_node=12288
```

The guided `cluster_manage.yml` command is preferred because it gives one consistent operator entrypoint for both setup and append operations.

## Prerequisites

Before running full setup, confirm:

- `hosts.ini` has the correct head node under `[head_nodes]`.
- All Slurm worker nodes are listed under `[cluster_nodes]`.
- Each Linux host has a reachable `ansible_host` IP.
- SSH access works from the Ansible control node.
- The configured Ansible user can become root, or is already root.
- Nodes are booted into Linux.
- Package repositories are reachable, or required package caches are already available.
- The cluster can tolerate a full Slurm setup/rebuild workflow.

## Inventory Example

Use this pattern in `hosts.ini`:

```ini
[head_nodes]
head_node ansible_host=172.17.181.171 ansible_ip=172.17.181.171 ansible_connection=ssh

[cluster_nodes]
worker_node1  ansible_host=172.17.181.143
worker_node2  ansible_host=172.17.181.144
worker_node3  ansible_host=172.17.181.145
```

The inventory name becomes the Slurm node name by replacing underscores with hyphens:

```text
head_node     -> head-node
worker_node1  -> worker-node1
```

Keep inventory naming consistent. The Slurm configuration generator depends on it.

## What Full Setup Does

The full setup sequence is defined in `step4_main.yml`.

It imports these playbooks:

```text
slurm/step1_cleanup_slurm.yml
slurm/step2_install_dependencies.yml
slurm/step3_setup_munge_perms.yml
slurm/step4_sync_munge_key.yml
slurm/step5_verify_munge.yml
slurm/step6_build_slurm.yml
slurm/step7_setup_slurm_env.yml
slurm/step8_configure_slurm_dynamic.yml
slurm/step8_1_setup_slurmdb.yml
slurm/step8_2_fix_slurmdbd.yml
slurm/step9_deploy_services.yml
slurm/step10_start_slurm.yml
slurm/step10-1_fixes.yml
slurm/step11_online_verification.yml
finally/repair_unknown_slurm_nodes.yml
```

High-level behavior:

1. Cleans old Slurm and Munge files from workers.
2. Installs required build/runtime packages.
3. Prepares Munge directories and permissions.
4. Creates or reads the Munge key on the head node.
5. Copies the Munge key to workers.
6. Verifies Munge communication.
7. Builds and installs Slurm.
8. Creates Slurm users, directories, symlinks, and runtime paths.
9. Generates `slurm.conf` from inventory and real hardware facts.
10. Configures SlurmDBD and accounting pieces on the head node.
11. Deploys systemd service units.
12. Starts Slurm services.
13. Repairs unhealthy Slurm states.
14. Verifies `slurmd` is active on all workers.

## Operator Prompts During Full Setup

Some imported playbooks may ask for confirmation, for example:

- cleanup reboot confirmation
- APT cache update confirmation

Read each prompt carefully. For a fresh rebuild, answer according to the maintenance window and node state.

If a playbook asks whether to reboot after cleanup, choose the option that matches the current maintenance plan. A clean reboot is often expected during a fresh rebuild.

## Slurm Configuration Generation

`slurm/step8_configure_slurm_dynamic.yml` builds Slurm configuration from:

- `[head_nodes]`
- `[cluster_nodes]`
- each node `ansible_host`
- each node hardware topology from `slurmd -C`
- GPU render device presence when available

Important details:

- `SelectType` is set to `select/cons_tres`.
- `SelectTypeParameters` is set to `CR_Core_Memory`.
- `ProctrackType` is set to `proctrack/cgroup`.
- `TaskPlugin` is set to `task/cgroup`.
- `JobAcctGatherType` is set to `jobacct_gather/cgroup`.
- CPU, core, thread, and memory values are generated from actual node topology unless explicit CPU/RAM caps are provided.
- `cgroup.conf` enables CPU, RAM, swap, and device constraints.
- GPU GRES is only configured when the expected render device exists.
- Windows inventory groups are not used for Slurm node definitions.

## Expected Successful Result

At the end of a successful full setup:

- `slurmctld` is running on the head node.
- `slurmdbd` is running on the head node if configured by the imported tasks.
- `slurmd` is active on every worker.
- final verification prints Slurm state.
- unhealthy states such as `UNKNOWN`, `INVALID`, `DOWN`, and `DRAIN` are repaired where possible.

Final `sinfo` should show the cluster partition and nodes in a healthy state, typically `idle` or an expected transient Slurm state while heartbeats settle.

## Post-Setup Verification

The playbooks already perform verification. If you want to rerun playbook-driven verification only, use:

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory/hosts.ini playbooks/deployment/finally/repair_unknown_slurm_nodes.yml --ask-vault-pass
```

This checks and repairs unhealthy Slurm nodes and verifies worker `slurmd` service state.

## If Full Setup Fails

Do not start changing Slurm manually unless there is an emergency. Use the failing task name and playbook output to identify the stage.

Common failure areas:

### SSH or inventory failure

Meaning:

Ansible cannot reach one or more nodes.

Fix:

Confirm the node is powered on, booted into Linux, and has the correct `ansible_host` in `hosts.ini`.

### APT or package failure

Meaning:

Packages could not be installed or package locks were present.

Fix:

The playbooks include tasks to fix interrupted `dpkg` and remove apt locks. Rerun the playbook after confirming package repositories are reachable.

### Slurm source download timeout

Meaning:

The Slurm archive could not be downloaded.

Fix:

Rerun when network access to the source is stable, or place the expected archive in `/usr/src` on the relevant nodes through your approved process and rerun.

Expected archive:

```text
/usr/src/slurm-25.11.4.tar.bz2
```

### slurmd not active

Meaning:

One or more workers did not start `slurmd`.

Fix:

Rerun the repair workflow:

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory/hosts.ini playbooks/deployment/finally/repair_unknown_slurm_nodes.yml --ask-vault-pass
```

### Nodes remain UNKNOWN, INVALID, DOWN, or DRAIN

Meaning:

Slurm sees the node, but it is not healthy yet.

Fix:

Run the repair workflow:

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory/hosts.ini playbooks/deployment/finally/repair_unknown_slurm_nodes.yml --ask-vault-pass
```

If the same node remains unhealthy, inspect the playbook output for the exact failed stage and service status details.

## Syntax Check

To validate the full setup entrypoint without changing cluster machines:

```bash
ANSIBLE_LOCAL_TEMP=/tmp/ansible-local ansible-playbook -i inventory/hosts.ini playbooks/deployment/cluster_manage.yml --syntax-check
ANSIBLE_LOCAL_TEMP=/tmp/ansible-local ansible-playbook -i inventory/hosts.ini playbooks/deployment/step4_main.yml --syntax-check
```

During syntax check, this warning can appear because append mode creates a runtime group dynamically:

```text
Could not match supplied host pattern, ignoring: new_slurm_nodes
```

This warning is expected during syntax check and does not mean the setup path is broken.

## Fresh Setup Checklist

Before setup:

- Verify `hosts.ini`.
- Confirm all listed nodes are reachable by SSH.
- Confirm nodes are booted into Linux.
- Confirm vault password is available if encrypted variables are present.
- Confirm a maintenance window exists for cleanup/reboot/build activity.

During setup:

- Run `cluster_manage.yml`.
- Choose `setup`.
- Answer confirmation prompts carefully.
- Watch for failed tasks and host names in the recap.

After setup:

- Confirm the final play recap has no failed Linux nodes.
- Confirm the final Slurm state is printed.
- Confirm worker `slurmd` verification reports `active`.
- Save or commit the final inventory and playbook changes.
