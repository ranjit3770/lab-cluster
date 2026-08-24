# Vault Setup

How to encrypt sensitive Ansible variables (for example the Windows
administrator password) with `ansible-vault`, instead of encrypting the whole
`hosts.ini`.

The pattern: store secrets in an encrypted `group_vars` file and reference the
variable name from the inventory.

## Step 1 — Create The Encrypted Variable File

```bash
ansible-vault create group_vars/windows_node.yml
```

## Step 2 — Define The Secret Inside It

```yaml
win_admin_pass: "MySuperSecretPassword123"
```

Save and exit; the file is now encrypted on disk.

## Step 3 — Reference The Variable From The Inventory

In `inventory/hosts.ini`, use the variable name instead of a plaintext
password:

```ini
[windows_nodes]
worker_node1 ansible_host=172.17.181.170

[windows_nodes:vars]
ansible_user=Administrator
ansible_password="{{ win_admin_pass }}"
ansible_connection=winrm
ansible_winrm_server_cert_validation=ignore
ansible_winrm_transport=ntlm
ansible_port=5985
ansible_winrm_scheme=http
```

## Step 4 — Test

Ansible pauses for the vault password before running tasks:

```bash
ansible windows_nodes -i inventory/hosts.ini -m win_ping --ask-vault-pass
```

A successful pong confirms both WinRM connectivity and vault decryption.

## Notes

- All playbook commands in this repository that touch Windows variables use
  `--ask-vault-pass`; see [Ansible Cluster Automation](../ansible/README.md).
- Keep the vault password out of the repository. Share it with operators
  through your approved secret-distribution process.
