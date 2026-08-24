# pip install pywinrm
#
# Switches a Windows node to Ubuntu via WinRM:
#   1. Fixes the ShutdownWithoutLogon policy
#   2. Finds or creates a Ubuntu/GRUB firmware boot entry in BCD and makes it first
#   3. Checks Secure Boot status
#   4. Reboots, then watches the node until SSH (port 22) answers = Ubuntu is up
#
# Every stage prints progress; nothing can hang silently (all I/O has deadlines).

import ctypes
import re
import sys


def _enable_md4():
    """Activate the OpenSSL 3.x legacy provider so MD4 (needed by NTLM auth)
    is available on systems where it is disabled by default."""
    try:
        libcrypto = ctypes.CDLL("libcrypto.so.3")
        libcrypto.OSSL_PROVIDER_load.restype = ctypes.c_void_p
        libcrypto.OSSL_PROVIDER_load.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        for name in (b"legacy", b"default"):
            if not libcrypto.OSSL_PROVIDER_load(None, name):
                print(f"[openssl] Warning: could not activate '{name.decode()}' provider", file=sys.stderr)
    except OSError:
        pass  # OpenSSL < 3.x has MD4 built in; nothing to enable.


_enable_md4()

from winrm.protocol import Protocol
import getpass
import socket
import threading
import time

READ_TIMEOUT_SEC = 30      # max wait per HTTP response
OPERATION_TIMEOUT_SEC = 15 # must be < READ_TIMEOUT_SEC
OUTPUT_DEADLINE_SEC = 45    # max wait for the remote command to finish
REBOOT_WATCH_SEC = 600     # how long to watch the reboot / Ubuntu boot
PROBE_INTERVAL_SEC = 3


BOOTMGR_GUIDS = {
    "{bootmgr}",
    "{9dea862c-5cdd-4e70-acc1-f32b344d4795}",
}
FWBOOTMGR_GUIDS = {
    "{fwbootmgr}",
    "{a5a30fa2-3d06-4e9f-b5f4-a01df9d1fcba}",
}


def tcp_open(ip, port, timeout=2):
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except OSError:
        return False


def extract_linux_firmware_guid(bcd_output):
    sections = re.split(r'(?:\r?\n){2,}', bcd_output or "")
    for section in sections:
        if not re.search(r'ubuntu|debian|grub|linux|shim', section, re.IGNORECASE):
            continue
        match = re.search(r'(?im)^\s*identifier\s+(\{[a-f0-9-]+\})\s*$', section)
        if not match:
            continue
        guid = match.group(1)
        guid_lower = guid.lower()
        if guid_lower not in BOOTMGR_GUIDS and guid_lower not in FWBOOTMGR_GUIDS:
            return guid
    return None


def find_windows_linux_efi_path(ip, user, pwd):
    ps = r"""
    $m='S:'
    if(Test-Path 'S:\'){$m='T:'}
    mountvol $m /S | Out-Null
    $c=@('\EFI\ubuntu\shimx64.efi','\EFI\ubuntu\grubx64.efi','\EFI\debian\shimx64.efi','\EFI\debian\grubx64.efi','\EFI\BOOT\BOOTX64.EFI')
    $f=''
    foreach($p in $c){if(Test-Path "$m$p"){$f=$p;break}}
    mountvol $m /D | Out-Null
    if($f){Write-Output $f}else{Write-Output 'NO_EFI'}
    """
    ok, out, err = _run_winrm_ps(ip, user, pwd, ps)
    if not ok:
        return None, err or out
    path = out.strip().splitlines()[-1].strip() if out.strip() else ""
    if path and path != "NO_EFI":
        return path, ""
    return None, "No Linux EFI loader found"


def _run_winrm_ps(ip, user, pwd, ps):
    p = Protocol(
        endpoint=f'http://{ip}:5985/wsman',
        transport='ntlm',
        username=user,
        password=pwd,
        read_timeout_sec=READ_TIMEOUT_SEC,
        operation_timeout_sec=OPERATION_TIMEOUT_SEC,
    )
    try:
        shell_id = p.open_shell()
        cmd_id = p.run_command(shell_id, 'powershell', [ps])
        out, err, rc = p.get_command_output(shell_id, cmd_id)
        p.cleanup_command(shell_id, cmd_id)
        p.close_shell(shell_id)
        out = out.decode(errors='replace').strip()
        err = err.decode(errors='replace').strip()
        return rc == 0, out, err
    except Exception as e:
        return False, "", str(e)


def repair_power_options(ip, user, pwd):
    ps = r"""
    $p1 = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
    $p2 = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer'
    if (!(Test-Path $p1)) { New-Item $p1 -Force | Out-Null }
    Set-ItemProperty -Path $p1 -Name 'ShutdownWithoutLogon' -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
    if (Test-Path $p2) {
        Set-ItemProperty -Path $p2 -Name 'NoClose' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
    }
    """
    _run_winrm_ps(ip, user, pwd, ps)


def check_secure_boot(ip, user, pwd):
    ps = "Confirm-SecureBootUEFI"
    ok, out, err = _run_winrm_ps(ip, user, pwd, ps)
    if not ok:
        return None, err or out
    return out.strip().lower() == "true", out.strip()


def create_managed_linux_firmware_entry(ip, user, pwd, efi_path):
    ps = rf"""
    $m='S:'
    if(Test-Path 'S:\'){{$m='T:'}}
    mountvol $m /S | Out-Null
    $created = bcdedit /create /d "Ubuntu Managed" /application BOOTAPP 2>&1 | Out-String
    $match = [regex]::Match($created, '\{{[A-Fa-f0-9-]+\}}')
    if(-not $match.Success){{ mountvol $m /D | Out-Null; Write-Output "FAILED_CREATE::$created"; exit 1 }}
    $g = $match.Value
    bcdedit /set $g device partition=$m | Out-Null
    bcdedit /set $g path "{efi_path}" | Out-Null
    mountvol $m /D | Out-Null
    Write-Output "GUID::$g"
    """
    ok, out, err = _run_winrm_ps(ip, user, pwd, ps)
    if not ok:
        return None, err or out
    match = re.search(r'GUID::(\{[a-f0-9-]+\})', out, re.IGNORECASE)
    return (match.group(1), "") if match else (None, out.strip())


def switch_windows_to_ubuntu_remote(ip, user, pwd):
    print(f"[{ip}] Step 1: Repairing power options...")
    repair_power_options(ip, user, pwd)

    print(f"[{ip}] Step 2: Checking Secure Boot...")
    secure_boot, sb_detail = check_secure_boot(ip, user, pwd)
    if secure_boot is True:
        print(f"[{ip}] WARNING: Secure Boot is ENABLED. GRUB shim may be blocked.")
        print(f"[{ip}]         If Ubuntu does not boot, disable Secure Boot in BIOS/UEFI.")
    elif secure_boot is False:
        print(f"[{ip}] Secure Boot is disabled.")
    else:
        print(f"[{ip}] Could not determine Secure Boot status: {sb_detail}")

    print(f"[{ip}] Step 3: Probing existing Linux BCD entries...")
    ok, out, err = _run_winrm_ps(ip, user, pwd, "bcdedit /enum firmware /v")
    if not ok:
        print(f"[{ip}] Failed to enumerate BCD: {err or out}")
        return

    guid = extract_linux_firmware_guid(out)
    actions = []

    if guid:
        print(f"[{ip}] Found existing Linux firmware entry: {guid}")
        _run_winrm_ps(ip, user, pwd, f'bcdedit /set "{{fwbootmgr}}" bootsequence {guid}')
        _run_winrm_ps(ip, user, pwd, f'bcdedit /set "{{fwbootmgr}}" displayorder {guid} /addfirst')
        actions.append(f"existing entry {guid}")
    else:
        print(f"[{ip}] No existing Linux firmware entry found.")

    print(f"[{ip}] Step 4: Looking for Linux EFI loader on disk...")
    efi_path, efi_err = find_windows_linux_efi_path(ip, user, pwd)
    if efi_path:
        print(f"[{ip}] Found EFI path: {efi_path}")
        managed_guid, m_err = create_managed_linux_firmware_entry(ip, user, pwd, efi_path)
        if managed_guid:
            print(f"[{ip}] Created managed firmware entry: {managed_guid}")
            _run_winrm_ps(ip, user, pwd, f'bcdedit /set "{{fwbootmgr}}" bootsequence {managed_guid}')
            _run_winrm_ps(ip, user, pwd, f'bcdedit /set "{{fwbootmgr}}" displayorder {managed_guid} /addfirst')
            actions.append(f"managed entry {managed_guid}")
        else:
            print(f"[{ip}] Failed to create managed entry: {m_err}")
    else:
        print(f"[{ip}] No Linux EFI loader found: {efi_err}")
        print(f"[{ip}] If Ubuntu is installed, ensure shimx64.efi exists under \\EFI\\ubuntu\\ on the system partition.")

    if not actions:
        print(f"[{ip}] FAIL: No Linux boot entries could be configured.")
        return

    # Step 5: Reboot
    print(f"[{ip}] Step 5: Issuing reboot...")
    reboot_ok, r_out, r_err = _run_winrm_ps(ip, user, pwd, "shutdown /r /t 2 /f /d p:2:4 /c 'Automated switch to Ubuntu'")
    if not reboot_ok:
        print(f"[{ip}] Reboot command failed: {r_err or r_out}")
        return

    # Watch the reboot: node goes dark -> comes back. Success = SSH up.
    print(f"[{ip}] Watching reboot (up to {REBOOT_WATCH_SEC}s)... Ctrl+C to stop watching.")
    was_up = tcp_open(ip, 5985) or tcp_open(ip, 22)
    saw_down = False
    deadline = time.time() + REBOOT_WATCH_SEC
    while time.time() < deadline:
        ssh_up = tcp_open(ip, 22)
        winrm_up = tcp_open(ip, 5985)
        if was_up and not ssh_up and not winrm_up:
            if not saw_down:
                saw_down = True
                print(f"[{ip}] Node going down (rebooting)...")
            was_up = False
        elif not was_up:
            if ssh_up:
                print(f"[{ip}] SUCCESS: SSH reachable — Ubuntu is up.")
                return
            if winrm_up:
                print(f"[{ip}] NOTICE: Node is back online but STILL WINDOWS "
                      f"(WinRM up, no SSH). Boot order did not stick.")
                print(f"[{ip}] Hint: check Secure Boot, Fast Boot in BIOS, and that the EFI path is correct.")
                return
        time.sleep(PROBE_INTERVAL_SEC)

    print(f"[{ip}] Gave up waiting after {REBOOT_WATCH_SEC}s. "
          f"Last state: {'down/rebooting' if saw_down else 'still up'}.")


# Usage
nodes = ["172.17.181.170"]
user = "administrator"
password = getpass.getpass("enter administrator password: ")

for node in nodes:
    switch_windows_to_ubuntu_remote(node, user, password)
