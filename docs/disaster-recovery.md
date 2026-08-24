# Disaster Recovery

## Objectives

| Metric | Target | How it is met |
| --- | --- | --- |
| **RPO** (max data loss) | ≤ 24 h daily tier, ≤ 7 d weekly tier | Cron 02:15 daily / Sunday 03:15 weekly; tighten by adding intra-day runs. |
| **RTO** (max restore time) | ≤ 30 min | Restore is scripted (`restore_database.sh`); drill quarterly to keep the evidence fresh. |
| Retention (local) | daily × 7 d, weekly × 28 d | Pruned automatically per run. |
| Encryption | AES256 at rest (GPG symmetric), local + off-site | `BACKUP_GPG_PASSPHRASE`; store passphrase in the site vault — never beside the backups. |
| Off-site copy | required for production | `BACKUP_REMOTE_TARGET` (rsync/key-SSH). A backup inside the same failure domain is not DR. |
| Drill frequency | quarterly + after every real restore | See restore-drill below; record outcome in ops log. |

## Backup policy

| Item | Value |
| --- | --- |
| Scope | Both MariaDB databases (`strach_portal`, `slurm_jobs`) — dumped with `--all-databases` |
| Frequency | Daily dump (cron 02:15) + weekly full (Sunday 03:15) |
| Retention | Daily: 7 days · Weekly: 28 days (pruned automatically) |
| Location | `$BACKUP_DIR/{daily,weekly}/` (default `/var/backups/portal`) + off-site mirror |
| Encryption | Optional GPG symmetric AES256 per archive (`BACKUP_GPG_PASSPHRASE`) |
| Integrity | Every run verifies gzip stream and (if encrypted) full decryptability; empty dumps abort loudly |

### Setup

```bash
cd cluster-portal/scripts
crontab -e
# add:
15 2 * * * /opt/amritacluster/lab-cluster/cluster-portal/scripts/backup_database.sh daily
15 3 * * 0 /opt/amritacluster/lab-cluster/cluster-portal/scripts/backup_database.sh weekly
```

Encryption + off-site copy are enabled in `cluster-portal/.env`:

```bash
BACKUP_GPG_PASSPHRASE=<from-site-vault>
BACKUP_REMOTE_TARGET=backup@nas.example.edu:/srv/backups/hpc-portal
```

With those set, each backup run: dumps → gzip-verifies → **encrypts and deletes
plaintext** → proves decryptability → **rsyncs off-site** (transfer failure is a
non-zero exit but keeps the local archive for retry) → prunes by retention.

## Restore procedure

```bash
cd cluster-portal
docker compose stop backend job-api        # quiesce writers
./scripts/restore_database.sh /var/backups/portal/daily/all_databases_YYYYMMDD_HHMMSS.sql.gz[.gpg]
docker compose start backend job-api
curl -fs http://localhost:8000/ready       # must report database ok
```

The script refuses to run while writers are up (unless `--force`),
integrity-checks the archive, and decrypts `.gpg` archives on the fly.

> **A backup that has never been restored is only a theory.** Perform a full
> restore into a scratch container quarterly and verify row counts + login.

```bash
# Quarterly restore drill (isolated):
docker run -d --name restore-drill -e MARIADB_ROOT_PASSWORD=drill mariadb:10.6
# plain archive:
gunzip -c /var/backups/portal/daily/<file>.sql.gz | \
    docker exec -i restore-drill mariadb -uroot -pdrill
# or encrypted archive:
gpg -d /var/backups/portal/daily/<file>.sql.gz.gpg | gunzip -c | \
    docker exec -i restore-drill mariadb -uroot -pdrill
docker exec restore-drill mariadb -uroot -pdrill -e \
    "SELECT COUNT(*) FROM \`strach_portal\`.users;"
docker rm -f restore-drill
```

Time the drill end-to-end: that measured number is your evidence-backed RTO.

## Failure scenarios

Each scenario follows: Detection → Diagnosis → Recovery → Verification.

### Controller failure (slurmctld)

1. **Detection**: jobs stuck; `sinfo` unreachable; portal Nodes page stale.
2. **Diagnosis**: `systemctl status slurmctld`; check `/var/log/slurm/slurmctld.log`.
3. **Recovery**: `ansible-playbook ansible/playbooks/deployment/finally/restart_workers.yml`
   or directly `sudo systemctl restart slurmctld`.
4. **Verification**: `sinfo` shows nodes; new test job reaches RUNNING.

### Database failure (MariaDB container)

1. **Detection**: `/health` OK but `/ready` returns 503 with `database: error`.
2. **Diagnosis**: `docker logs portal_database --tail 100`; `df -h` for disk-full.
3. **Recovery**:
   - Container crash-looping: `docker compose up -d database` after fixing config/disk.
   - Data corruption: follow **Restore procedure** above.
4. **Verification**: `/ready` = 200; login works; recent jobs visible.

### Job-API failure

1. **Detection**: submissions fail with "Failed to communicate with cluster controller";
   `curl -f http://localhost:9000/health` non-200.
2. **Diagnosis**: `docker logs portal_job_api --tail 200`.
3. **Recovery**: `docker compose restart job-api`; if planning fails due to Slurm
   state, resolve the node/controller issue first.
4. **Verification**: submit a trivial job; confirm slurm_job_id recorded.

### Portal backend failure

1. **Detection**: frontend errors; `curl -f http://localhost:8000/health` non-200.
2. **Diagnosis**: `docker logs portal_backend --tail 200`.
3. **Recovery**: `docker compose restart backend`. If migrations fail, check
   startup logs for `CRITICAL: ALL ATTEMPTS TO INITIALIZE DB FAILED`.
4. **Verification**: login via UI; Dashboard renders live data.

### Worker failure

1. **Detection**: node DOWN in `sinfo`; resume watchdog log in `logs/`.
2. **Diagnosis**: SSH to node; `systemctl status slurmd`; check dual-boot state —
   the machine may have been left booting Windows.
3. **Recovery**: switch back to Ubuntu via
   `playbooks/os-switching/boot_to_ubuntu.yml`, then
   `scripts/slurm-resume-nodes.sh` or `scontrol update nodename=<node> state=resume`.
4. **Verification**: node IDLE in `sinfo`; test job can land on it.

### Network failure

1. **Detection**: mass node DOWN; SSH/RDP probes failing in Node Management.
2. **Diagnosis**: from head node ping worker IPs; check switch uplinks.
3. **Recovery**: restore switching/network infra; workers rejoin slurmd automatically.
4. **Verification**: `sinfo` all IDLE; Node Management probes green.

### Munge failure

1. **Detection**: slurmd/slurmrestd auth errors ("Munge authentication failed").
2. **Diagnosis**: compare `munge.key` checksums across nodes:
   `sha256sum /etc/munge/munge.key`.
3. **Recovery**: resync key (step4 playbook:
   `playbooks/deployment/slurm/step4_sync_munge_key.yml`), restart munge on
   affected hosts, then restart slurmd.
4. **Verification**: `munge -n | unmunge` locally and remotely succeeds.

### Dual-boot switch failure

1. **Detection**: node boots wrong OS; Node Management probe shows closed ports.
2. **Diagnosis**: which OS is active (RDP vs SSH reachability).
3. **Recovery**: targeted playbooks in `playbooks/os-switching/`
   (`set_grub_default_targeted.yml`, `boot_to_ubuntu.yml`,
   `set_ubuntu_boot_from_windows_targeted.yml`).
4. **Verification**: node reachable over SSH; `scontrol update ... state=resume`.

See also `docs/runbooks/` for step-by-step operational procedures.
