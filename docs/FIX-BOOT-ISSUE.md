# Dual-Boot Fix Reference

Troubleshooting runbook for a dual-boot worker node that boots into Windows
(or a blue-screen error) instead of Ubuntu, caused by an incorrect UEFI boot
order and a corrupted Windows boot entry.

## Symptoms

- Node reboots into Windows even though GRUB/Ubuntu is installed.
- Blue error screen at boot.
- `sudo efibootmgr` shows Ubuntu not first in `BootOrder`.

## Diagnosis

Inspect the firmware boot entries:

```bash
sudo efibootmgr
```

Example of a broken state, with two problems visible:

```text
BootOrder: 0009,0000,000C,...
Boot0000* Windows Boot Manager  HD(...)\EFI\ubuntu/shmix64.efi
Boot000C* ubuntu
```

1. **Wrong boot order.** `0009` (USB) is first and `0000` (Windows Boot
   Manager) is second, so the motherboard stops at Windows before ever trying
   Ubuntu (`000C`).
2. **Corrupted Windows entry.** `Boot0000` claims to be "Windows Boot Manager"
   but points to `\EFI\ubuntu/shmix64.efi` — a "ghost" entry where Windows
   hijacked the Ubuntu boot path. This is what produces the blue error screen.

## Fix

### 1. Put Ubuntu first in the boot order

```bash
sudo efibootmgr -o 000C,0000,0009,0008,0007
```

This sets `000C` (Ubuntu/GRUB) as primary, keeps `0000` (Windows) as backup,
and leaves network/USB options afterward.

Verify:

```bash
sudo efibootmgr   # BootOrder must now start with 000C
```

### 2. Permanent fix on this node

Windows can move itself back to the front of the boot order on the next
reboot. To prevent that (example node: `worker-node28`):

1. **Delete the corrupted Windows entry** (optional but recommended, since it
   points to the wrong file). A fresh scan recreates the correct path:

   ```bash
   sudo efibootmgr -b 0000 -B
   ```

2. **Update GRUB from Ubuntu:**

   ```bash
   sudo update-grub
   ```

3. **Check BIOS settings if the fix does not stick.** These machines
   (Intel I219-LM based workstations) often expose BIOS options such as
   "Attempt Legacy Boot" or "Windows Boot Manager Priority" that override
   `efibootmgr`. If the order resets after a reboot, enter the BIOS, disable
   "Fast Boot", and move the Ubuntu UEFI entry to the top of the UEFI Boot
   Order manually.

## Related Automation

For fleet-wide, repeatable control of dual-boot nodes, prefer the Ansible
os-switching playbooks instead of manual `efibootmgr` work — see
[Ansible Cluster Automation](../ansible/README.md#os-switching--automatic-recommended).
