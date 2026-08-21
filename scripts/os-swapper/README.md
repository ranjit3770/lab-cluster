# OS Swapper Tools

Direct SSH/WinRM tools for flipping dual-boot worker nodes between Ubuntu and
Windows without going through Ansible. Use these for ad-hoc operations; use the
[os-switching playbooks](../../ansible/playbooks/os-switching/) for repeatable,
audited workflows.

| Script | Direction | Scale | Interface |
| --- | --- | --- | --- |
| `swapper.py` | Both ways | Fleet (IP ranges) | Interactive prompts |
| `single_node_switch.py` | Windows -> Ubuntu | One node | Edit the node list, run |

## Requirements

```bash
pip install paramiko pywinrm
```

`swapper.py` auto-installs missing dependencies on first run.

## swapper.py — Fleet Swapper

```bash
sudo python3 swapper.py
```

Workflow:

1. Enter target IPs or ranges (comma or newline separated). Range syntax:
   `172.17.181.140-170`.
2. Every node is probed in parallel across management ports
   (WinRM 5985/5986, RDP, SMB, RPC vs SSH) and classified as `WINDOWS`,
   `LINUX`, or `UNKNOWN`. Unreachable nodes can be manually forced to a side
   or skipped.
3. **Linux nodes** — pick one action per batch:
   - `1` boot Windows once (`grub-reboot`)
   - `2` make Windows permanent default (`GRUB_DEFAULT=` + `update-grub`)
   - `3` restore Ubuntu as permanent default
4. **Windows nodes** — the script repairs power-option policies, locates the
   Ubuntu EFI loader on the EFI System Partition, creates/reuses an
   "Ubuntu Managed" firmware entry via `bcdedit`, sets the one-shot boot
   sequence, issues a planned reboot, then polls ports until the node comes
   back as Linux (or reports exactly what went wrong).

A final summary prints per-node OK/FAIL with details.

## single_node_switch.py — Single Node Helper

Minimal variant for one Windows machine. Before running, edit the node list at
the bottom of the file:

```python
nodes = ["172.17.181.170"]
```

Then:

```bash
python3 single_node_switch.py    # prompts for the Administrator password
```

It applies the same BCD approach as the fleet tool (power-policy repair,
firmware Ubuntu GUID lookup, `bootsequence` + `displayorder`, reboot).

## Safety Notes

- Both tools change only the **next boot** on Windows nodes; the Windows
  Boot Manager order is restored by firmware after one boot into Ubuntu.
- Permanent GRUB changes are made only on Linux nodes you explicitly confirm.
- For full diagnostics capture (BCD dumps before reboot), prefer the Ansible
  playbook `boot_to_ubuntu.yml`.
