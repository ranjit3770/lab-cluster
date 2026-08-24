# Runbook: Node DOWN

Fast path for a single worker showing DOWN/DRAINED in Slurm.

## Triage

```bash
sinfo -N -o "%N %T %E"                  # find the node + reason
scontrol show node <node> | grep -i reason
```

## Decision tree by last-known OS state

| Situation | Action |
| --- | --- |
| Node was switched to Windows (dual-boot) | Boot back to Ubuntu: `playbooks/os-switching/boot_to_ubuntu.yml`, then resume |
| slurmd dead on an otherwise healthy Ubuntu host | SSH in, restart slurmd, resume |
| Hardware/power/network issue | Fix infra; Slurm marks it UP when slurmd re-registers |
| Repeated failures | Drain intentionally and file a repair request |

### 1. Wrong OS / dual-boot recovery

```bash
cd ansible
ansible-playbook -i inventory/hosts.ini \
    playbooks/os-switching/boot_to_ubuntu.yml -e target_hosts=<node> --ask-vault-pass
# wait for the machine to boot into Ubuntu and slurmd to register
```

### 2. Restart slurmd

```bash
ssh <node> sudo systemctl restart slurmd
```

### 3. Resume the node

```bash
sudo scontrol update nodename=<node> state=resume
# or run the cron watchdog manually:
./scripts/slurm-resume-nodes.sh
```

## Verification

```bash
sinfo -N -n <node>          # state = IDLE
srun -w <node> hostname     # job lands on it
```

## Notes

- The resume watchdog (`scripts/slurm-resume-nodes.sh`) auto-resumes nodes that
  come back healthy; keep its cron entry alive.
- If `Reason=Low socket*core*thread count` etc. appears right after reboot,
  check `/etc/slurm/slurm.conf` on the node matches the controller config.
