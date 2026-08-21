#### 1. Encrypting Specific Variables

Instead of encrypting your whole `hosts.ini`, it is better to encrypt only the password inside a `group_vars` file.

**Step 1: Create the variable file**

Bash

```
ansible-vault create group_vars/windows_node.yml

```

**Step 2: Inside the file, define your password**

YAML

```
win_admin_pass: "MySuperSecretPassword123"

```

**Step 3: Reference it in your Inventory or Playbook**

In your `hosts.ini`, you simply use the variable name:

Ini, TOML

```
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

----------

**Step 4: Testing**

Ansible will pause and ask you to type the vault password before starting the tasks.

Bash

```
ansible windows_nodes -i inventory/hosts.ini -m win_ping --ask-vault-pass

```
---
