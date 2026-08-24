# Slurm REST Daemon (slurmrestd) Setup

How to run `slurmrestd` with its own systemd unit. Three areas need attention:
user identity, plugin configuration, and socket permissions.

## 1. Create The `slurmrestd` User

For security the REST daemon runs as its own unprivileged user, separate from
the `slurm` user. Without this user the unit fails (exit code `217/USER`):

```bash
sudo useradd -m -r -s /bin/false slurmrestd
```

## 2. Configure `slurm.conf`

Add or update in `/etc/slurm/slurm.conf` so `slurmrestd` can authenticate:

```ini
AuthAltTypes=auth/local
# For JWT (JSON Web Token) authentication later:
# AuthAltTypes=auth/jwt
```

`auth/local` lets the REST daemon talk to the controller over the local Unix
socket.

## 3. Deploy The Systemd Unit

Create `/etc/systemd/system/slurmrestd.service`:

```ini
[Unit]
Description=Slurm REST Daemon
After=network.target slurmctld.service
Requires=slurmctld.service

[Service]
Type=simple
User=slurmrestd
Group=slurmrestd
RuntimeDirectory=slurmrestd
# RuntimeDirectory creates /run/slurmrestd/ with correct ownership automatically
ExecStart=/usr/local/slurm/sbin/slurmrestd -a rest_auth/local unix:/run/slurmrestd/slurmrestd.socket
Environment="LD_LIBRARY_PATH=/usr/local/slurm/lib/slurm:/usr/local/slurm/lib"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 4. Enable And Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable slurmrestd
sudo systemctl start slurmrestd
```

## 5. Verify

The daemon listens on a Unix socket, so test with curl's
`--unix-socket` option.

OpenAPI handshake check:

```bash
sudo curl --unix-socket /run/slurmrestd/slurmrestd.socket http://localhost/slurm/v0.0.40/ping
sudo curl --unix-socket /run/slurmrestd/slurmrestd.socket http://localhost/slurm/v0.0.44/nodes
```

(Adjust the version path to match the installed Slurm OpenAPI plugin; v0.0.44
is used by this cluster.)

## Troubleshooting Tips

| Symptom | Check |
| :--- | :--- |
| Missing `.so` library errors | `/usr/local/slurm/lib` actually contains the Slurm shared libraries referenced in `LD_LIBRARY_PATH`. |
| Version mismatch errors | `slurmrestd` binary version matches `slurmctld` (both come from the same source build). |
| Other users cannot reach the API | Socket permissions: add `UMask=007` under `[Service]` or adjust group access on `/run/slurmrestd`. |

Portal-side usage of this API is described in
[../../REST-USAGE.md](../../REST-USAGE.md).
