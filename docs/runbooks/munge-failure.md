# Runbook: Munge Failure

## Symptoms
- slurmd/slurmrestd log: `Munge authentication failed`, `Invalid credential`.
- Nodes appear in `DRAIN`/down right after a key change.
- Job-API cannot obtain a JWT from `slurmrestd`.

## Procedure

1. **Compare keys cluster-wide**
   ```bash
   for h in head-node worker1 worker2; do
       ssh $h sha256sum /etc/munge/munge.key
   done
   ```
   Every checksum must match the controller's.

2. **Test locally and remotely**
   ```bash
   munge -n | unmunge                 # local round-trip
   ssh worker1 munge -n | unmunge     # cross-host credential
   ```

3. **Resync mismatched keys**
   ```bash
   cd ansible
   ansible-playbook -i inventory/hosts.ini \
       playbooks/deployment/slurm/step4_sync_munge_key.yml
   ```

4. **Restart munge + Slurm daemons on affected hosts**
   ```bash
   ssh <host> sudo systemctl restart munge slurmd
   sudo systemctl restart slurmctld          # controller side
   ```

5. **slurmrestd specifically**
   ```bash
   systemctl status slurmrestd
   curl -s http://127.0.0.1:6820/slurm/v0.0.41/ping -H "X-SLURM-USER-NAME: slurmapi" \
        -H "X-SLURM-USER-TOKEN: $(/usr/local/slurm/bin/scontrol token lifespan=60 | grep -oP 'SLURM_JWT=\K.*')"
   ```

## Verification
```bash
srun hostname        # auth succeeds end-to-end
```

## Prevention
- Any time `munge.key` changes, roll it out with the sync playbook in one pass,
  then restart munge everywhere — mixed-key clusters fail unpredictably.
