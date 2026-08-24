# Runbook: Slurm Down / Cluster Unresponsive

Use when multiple nodes are DOWN, jobs won't schedule, or Slurm commands hang
cluster-wide.

## Triage order

```bash
systemctl is-active slurmctld slurmdbd munge slurmd   # on head node
sinfo                                                 # hangs => controller/db issue
squeue                                                # hangs => slurmdbd likely
```

| Finding | Go to |
| --- | --- |
| slurmctld inactive/crashing | `controller-failure.md` |
| slurmdbd down | below |
| Munge auth errors | `munge-failure.md` |
| All nodes DOWN after network change | below |

## slurmdbd down

```bash
systemctl status slurmdbd
tail -50 /var/log/slurm/slurmdbd.log
sudo systemctl restart slurmdbd      # must be up BEFORE slurmctld restarts
sudo systemctl restart slurmctld
```

If MariaDB backing slurmdbd is unhealthy, see
`cluster-portal/backend/job-api/docs` guides + SLURMDBD-SETUP under
`cluster-portal/docs/setup-guides/`.

## Mass node DOWN after network/maintenance window

1. Confirm workers can reach the controller:
   ```bash
   for h in worker1 worker2; do ssh $h ping -c1 head-node >/dev/null && echo "$h ok"; done
   ```
2. Restart slurmd on affected nodes:
   ```bash
   cd ansible
   ansible-playbook -i inventory/hosts.ini playbooks/deployment/finally/restart_workers.yml
   ```
3. Resume any nodes stuck DOWN:
   ```bash
   sudo scontrol update nodename=<node> state=resume
   ```

## Portal impact check

After Slurm is healthy:

- `curl -f http://localhost:9000/health` — Job-API up.
- Submit a trivial job through the portal; confirm it reaches RUNNING and the
  Jobs page reflects live state.

## Escalation

If state looks corrupted or daemons crash-loop after two clean restarts,
capture `/var/log/slurm/*` excerpts and follow
`docs/disaster-recovery.md#controller-failure-slurmctld`.
