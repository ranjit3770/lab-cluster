# Runbook: Controller Failure (slurmctld)

## Symptoms
- All jobs stuck; `squeue` errors or hangs.
- Portal Nodes page frozen at stale data.
- `systemctl status slurmctld` → failed/inactive.

## Procedure

1. **Check service + logs**
   ```bash
   systemctl status slurmctld
   tail -100 /var/log/slurm/slurmctld.log
   ```

2. **Common quick fixes**
   | Log signature | Fix |
   | --- | --- |
   | `error: slurmdbd` connection refused | fix slurmdbd first (`docs/runbooks/database-failure.md` covers MariaDB) |
   | state dir permission errors | `chown -R slurm:slurm /var/spool/slurmctld` |
   | config parse error after an edit | revert `/etc/slurm/slurm.conf`; validate with `slurmctld -t` |

3. **Restart**
   ```bash
   sudo systemctl restart slurmctld
   # or via Ansible:
   cd ansible && ansible-playbook -i inventory/hosts.ini \
       playbooks/deployment/finally/restart_workers.yml
   ```

4. **If the state is corrupted** (jobs vanish / daemon crash-loops)
   - Stop slurmctld.
   - Move aside `/var/spool/slurmctld/` (keep a copy!).
   - Start slurmctld — it rebuilds state; queued jobs are lost and must be resubmitted.

## Verification

```bash
systemctl is-active slurmctld
sinfo                       # nodes report
sbatch --wrap="hostname"    # test job completes
```

## Prevention
- Keep `slurmctld -t` (config validation) in change procedures before restarting.
- Monitor `systemctl is-active slurmctld` from the portal health checks or cron.
