# Append a New Slurm Worker Node

This document is the future reference procedure for adding one new worker node to the existing Slurm cluster without rebuilding or disturbing already working nodes.

Use this when the cluster is already running and you only want to append a new Linux worker, for example `worker_node29`.

## Important Rule

Do not run the full setup playbook just to add one worker.

Use append mode so the playbook prepares only the new worker, updates Slurm configuration from inventory, reconfigures the controller, starts `slurmd` on the new worker, and verifies all workers are still active.

## Files Involved

- `hosts.ini`
  Inventory file. Add the new worker here under `[cluster_nodes]`.

- `cluster_manage.yml`
  Main operator entrypoint. It asks whether you want full setup or append mode.

- `finally/append_slurm_node.yml`
  Safe append workflow for one new worker.

- `slurm/step8_configure_slurm_dynamic.yml`
  Regenerates `slurm.conf` from inventory and real node hardware.

- `cmds.txt`
  Command reference.

## Prerequisites

Before running append mode, confirm these are true:

- The existing cluster is already working.
- The new machine is booted into Linux.
- The new machine is reachable by SSH from the Ansible control node.
- The SSH user in `hosts.ini` can become root, or is already root.
- The new node IP address is known.
- The new inventory name follows the existing pattern, for example `worker_node29`.
- The Slurm NodeName will be the inventory name with underscores changed to hyphens, for example:
  - Inventory host: `worker_node29`
  - Slurm node name: `worker-node29`

## Step 1: Add the New Worker to Inventory

Edit `hosts.ini` and add the new node only under `[cluster_nodes]`.

Example:

```ini
[cluster_nodes]
worker_node1  ansible_host=172.17.181.143
worker_node2  ansible_host=172.17.181.144
...
worker_node28 ansible_host=172.17.181.170
worker_node29 ansible_host=172.17.181.172
```

Do not add the new worker under `[head_nodes]`.

If this cluster also has matching Windows inventory entries, add those only if your Windows workflow needs them. The Slurm append playbook uses `[cluster_nodes]`.

## Step 2: Run the Single Management Playbook

From the repository directory:

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
append
```

When prompted:

```text
For append only, enter the new inventory host name, example worker_node29:
```

Type the new inventory host name:

```text
worker_node29
```

## Direct Append Command

You can also run the append playbook directly:

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory/hosts.ini playbooks/deployment/finally/append_slurm_node.yml --ask-vault-pass
```

When prompted, enter:

```text
Inventory host name to append from hosts.ini, example worker_node29:
worker_node29

Type append to prepare only this new node and update Slurm config:
append
```

The preferred operator command is still `cluster_manage.yml`, because it gives one clear entrypoint for both full setup and append mode.

## What Append Mode Does

Append mode performs these actions through Ansible only:

1. Confirms append mode.
2. Confirms the requested node exists in `hosts.ini` under `[cluster_nodes]`.
3. Creates a temporary runtime group named `new_slurm_nodes`.
4. Reads the existing Munge key from the head node.
5. Uses the cached Slurm source archive from the head node when available.
6. Prepares only the new worker:
   - sets hostname to the Slurm node name
   - updates local `/etc/hosts`
   - fixes interrupted `dpkg`
   - installs required packages
   - creates `slurm` user and group
   - creates Munge directories
   - copies the existing Munge key
   - starts Munge
   - installs or builds Slurm only if missing
   - creates Slurm runtime directories
   - installs `slurmd.service`
7. Regenerates Slurm configuration from inventory and real hardware.
8. Reconfigures `slurmctld` on the head node.
9. Starts and verifies `slurmd` on the new worker.
10. Resumes the new Slurm node if needed.
11. Shows final `sinfo`.
12. Verifies `slurmd` is active on every worker.

## What Append Mode Does Not Do

Append mode does not intentionally:

- purge existing workers
- reboot existing workers
- rebuild Slurm on existing workers
- stop jobs on existing workers
- remove existing Slurm state
- run the full cleanup playbook

The existing workers are checked at the end, but they are not rebuilt as part of the append preparation.

## Expected Successful Result

At the end of a successful append, the playbook should show:

- the new worker `slurmd` state as `active`
- all existing worker `slurmd` states as `active`
- final Slurm partition state from `sinfo`

The new node should appear in Slurm using the hyphenated node name.

Example:

```text
worker-node29 state=idle
```

or it may briefly appear as an idle state with Slurm flags while heartbeats settle.

## If the Playbook Fails

Do not fix the cluster manually unless there is an emergency. Use the playbook output to identify which stage failed.

Common failure points:

### New node is not in inventory

Error meaning:

```text
Append was not confirmed, or worker_node29 is not a worker in hosts.ini [cluster_nodes] with ansible_host.
```

Fix:

Add the node under `[cluster_nodes]` with `ansible_host`.

Example:

```ini
worker_node29 ansible_host=172.17.181.172
```

Then rerun append mode.

### SSH is not ready

Meaning:

Ansible cannot connect to the new node.

Fix:

Check that the node is powered on, reachable on the network, and accepts SSH using the same inventory user pattern as the other workers.

Then rerun append mode.

### Slurm archive download times out

Append mode first tries to reuse the Slurm archive cached on the head node:

```text
/usr/src/slurm-25.11.4.tar.bz2
```

If the archive is not cached, it downloads from the Slurm source URL. If external download fails, place the same archive on the head node through your normal approved process, then rerun append mode. The playbook will copy it from the head node cache.

### slurmd does not become active

Meaning:

The new worker was prepared, but `slurmd` failed to start or did not stay active.

Fix:

Rerun append mode after correcting the cause shown in the playbook output. The playbook is idempotent and will skip completed install/build steps where possible.

### Node remains UNKNOWN, INVALID, DOWN, or DRAIN

Meaning:

The node exists in Slurm but is not healthy yet.

Fix:

Rerun:

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory/hosts.ini playbooks/deployment/finally/append_slurm_node.yml --ask-vault-pass
```

If multiple nodes are unhealthy, run the repair workflow:

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory/hosts.ini playbooks/deployment/finally/repair_unknown_slurm_nodes.yml --ask-vault-pass
```

## Full Setup vs Append Mode

Use `setup` only when building or rebuilding the full Slurm cluster:

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory/hosts.ini playbooks/deployment/cluster_manage.yml --ask-vault-pass
```

Prompt answer:

```text
setup
```

Use `append` when adding one new worker to an already working cluster:

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory/hosts.ini playbooks/deployment/cluster_manage.yml --ask-vault-pass
```

Prompt answer:

```text
append
```

## Syntax Check

To validate the playbooks without changing cluster machines:

```bash
ANSIBLE_LOCAL_TEMP=/tmp/ansible-local ansible-playbook -i inventory/hosts.ini playbooks/deployment/cluster_manage.yml --syntax-check
ANSIBLE_LOCAL_TEMP=/tmp/ansible-local ansible-playbook -i inventory/hosts.ini playbooks/deployment/finally/append_slurm_node.yml --syntax-check
```

During syntax check, this warning is expected:

```text
Could not match supplied host pattern, ignoring: new_slurm_nodes
```

Reason:

`new_slurm_nodes` is created dynamically at runtime after the append prompt.

## Operator Checklist

Before append:

- Add the new worker to `hosts.ini`.
- Confirm the new worker IP is correct.
- Confirm the new worker is reachable by SSH.
- Confirm you know the inventory name, for example `worker_node29`.

During append:

- Run `cluster_manage.yml`.
- Choose `append`.
- Enter the new inventory host name.

After append:

- Confirm the playbook reports `slurmd=active` for all workers.
- Confirm the final `sinfo` output contains the new worker.
- Keep the updated `hosts.ini` committed or backed up with the cluster configuration.

