Setting up `slurmrestd` is a great way to modernize your cluster management. To make this work with the specific systemd unit you've provided, you need to address three key areas: **User Identity**, **Plugin Configuration**, and **Socket Permissions**.

Since your unit file uses `User=slurmrestd`, the system will fail (likely with that `217/USER` error again) unless that specific user exists.

---

### 1. Create the `slurmrestd` User
For security, `slurmrestd` should run as its own unprivileged user, separate from the `slurm` user.

```bash
sudo useradd -m -r -s /bin/false slurmrestd
```

### 2. Configure `slurm.conf` for REST API
Your `slurmrestd` needs to know how to authenticate. Open your `/etc/slurm/slurm.conf` and ensure these parameters are present:

```ini
# Add or update these lines
AuthAltTypes=auth/local
# If you plan to use JWT (JSON Web Tokens) later, add:
# AuthAltTypes=auth/jwt
```
*Note: `auth/local` allows the REST daemon to communicate with the controller via the local Unix socket you defined.*

### 3. Deploy the Systemd Unit
Create the file exactly as you drafted it:

```bash
sudo nano /etc/systemd/system/slurmrestd.service
```

**Paste your content:**
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
# This creates /run/slurmrestd/ with correct ownership automatically
ExecStart=/usr/local/slurm/sbin/slurmrestd -a rest_auth/local unix:/run/slurmrestd/slurmrestd.socket
Environment="LD_LIBRARY_PATH=/usr/local/slurm/lib/slurm:/usr/local/slurm/lib"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

---

### 4. Enable and Start
Run the following commands to bring the API online:

```bash
sudo systemctl daemon-reload
sudo systemctl enable slurmrestd
sudo systemctl start slurmrestd
```

### 5. Verifying the Setup
Since you are using a **Unix Socket** (`unix:/run/slurmrestd/slurmrestd.socket`), you can test the connection using `curl`. 

**Check the OpenAPI specification (the "handshake"):**
```bash
sudo curl --unix-socket /run/slurmrestd/slurmrestd.socket http://localhost/slurm/v0.0.40/ping
sudo curl --unix-socket /run/slurmrestd/slurmrestd.socket http://localhost/slurm/v0.0.44/nodes
```
*(Note: Replace `v0.0.40` with your specific Slurm version if different, though `v0.0.40` is standard for recent 23.xx+ versions).*

---

### Troubleshooting Tips for `slurmrestd`
* **Library Path:** Ensure `/usr/local/slurm/lib` actually contains the Slurm shared libraries. If `slurmrestd` complains about missing `.so` files, double-check that path.
* **Version Mismatch:** Ensure the `slurmrestd` binary version matches your `slurmctld` version. Since you compiled from source in `/usr/local/slurm`, they should match.
* **Socket Permissions:** By default, only the `slurmrestd` user can write to that socket. If you want other users to hit the API, you may need to add a `UMask=007` to the `[Service]` section or adjust group permissions.

**Would you like me to help you generate a JWT (JSON Web Token) so you can access the API over the network instead of just the local socket?**
