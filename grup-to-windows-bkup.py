import sys
import subprocess
import re
import time
import socket
from getpass import getpass
from concurrent.futures import ThreadPoolExecutor, as_completed

def install_dependencies():
    required = ["paramiko", "pywinrm"]
    for lib in required:
        try:
            if lib == "pywinrm": import winrm
            else: __import__(lib)
        except ImportError:
            try: subprocess.check_call([sys.executable, "-m", "pip", "install", lib], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except: pass

install_dependencies()
import paramiko
import winrm

TIMEOUT = 8
MAX_WORKERS = 30
PROBE_ATTEMPTS = 6
PROBE_TIMEOUT = 1.0
POST_REBOOT_WAIT_SECONDS = 20
POST_REBOOT_CHECKS = 18
BOOTMGR_GUIDS = {
    "{bootmgr}",
    "{9dea862c-5cdd-4e70-acc1-f32b344d4795}",
}
FWBOOTMGR_GUIDS = {
    "{fwbootmgr}",
    "{a5a30fa2-3d06-4e9f-b5f4-a01df9d1fcba}",
}
PROBE_PORTS = [
    (5985, "WINDOWS", "WinRM"),
    (5986, "WINDOWS", "WinRM-HTTPS"),
    (3389, "WINDOWS", "RDP"),
    (445, "WINDOWS", "SMB"),
    (135, "WINDOWS", "RPC"),
    (22, "LINUX", "SSH"),
]

def parse_ips(raw_input):
    ips = []
    parts = re.split(r'[,\n]', raw_input)
    for part in parts:
        part = part.strip()
        if not part: continue
        range_match = re.search(r'(.*?)\[?(\d+)-(\d+)\]?$', part)
        if range_match:
            base_ip = range_match.group(1)
            start, end = int(range_match.group(2)), int(range_match.group(3))
            if not base_ip.endswith('.'): base_ip += '.'
            for i in range(start, end + 1): ips.append(f"{base_ip}{i}")
        else: ips.append(part)
    return list(dict.fromkeys(ips))

def ping_host(ip):
    try:
        result = subprocess.run(
            ["ping", "-c", "1", "-W", "1", ip],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return result.returncode == 0
    except Exception:
        return False

def is_port_open(ip, port, timeout=PROBE_TIMEOUT):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        return s.connect_ex((ip, port)) == 0
    except Exception:
        return False
    finally:
        s.close()

def probe_os(ip):
    # Prefer Windows remote-management signals first. Some Windows images may
    # also run OpenSSH, and checking port 22 first can misclassify them.
    last_scan = []
    for attempt in range(PROBE_ATTEMPTS):
        last_scan = []
        for port, label, name in PROBE_PORTS:
            if is_port_open(ip, port):
                return label, f"{name}:{port} open"
            last_scan.append(f"{name}:{port}=closed")
        if attempt < PROBE_ATTEMPTS - 1:
            time.sleep(2)

    ping_state = "ping=up" if ping_host(ip) else "ping=down"
    return "UNKNOWN", f"{ping_state}; " + ", ".join(last_scan)

def wait_for_state(ip, expected_state, checks=POST_REBOOT_CHECKS):
    for _ in range(checks):
        state, detail = probe_os(ip)
        if state == expected_state:
            return True, state, detail
        if state != "UNKNOWN" and state != expected_state:
            return False, state, detail
        time.sleep(5)
    state, detail = probe_os(ip)
    return state == expected_state, state, detail

def run_ssh_command(ip, username, password, command, use_sudo=True):
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(ip, username=username, password=password, timeout=TIMEOUT)
        stdin, stdout, stderr = client.exec_command(command, get_pty=use_sudo)
        if use_sudo:
            stdin.write(password + '\n')
            stdin.flush()
        output = stdout.read().decode()
        return True, output.strip(), ""
    except Exception as e: return False, "", str(e)

def run_winrm_command(ip, username, password, command, transport='ntlm'):
    try:
        session = winrm.Session(f'http://{ip}:5985/wsman', auth=(username, password), transport=transport, server_cert_validation='ignore')
        r = session.run_ps(command)
        if r.status_code == 0: return True, r.std_out.decode(), ""
        stdout = r.std_out.decode(errors="replace").strip()
        stderr = r.std_err.decode(errors="replace").strip()
        detail = "\n".join(part for part in [stdout, stderr, f"Code: {r.status_code}"] if part)
        return False, stdout, detail
    except Exception as e:
        if transport == 'ntlm' and ("401" in str(e) or "rejected" in str(e).lower()):
            return run_winrm_command(ip, username, password, command, transport='basic')
        return False, "", str(e)

def switch_linux_to_os(ip, username, password, target_os, permanent=True):
    entry = "0"
    if target_os == "windows":
        suc, out, _ = run_ssh_command(ip, username, password, "grep \"menuentry '\" /boot/grub/grub.cfg | grep -i \"windows\" | head -n1 | cut -d\"'\" -f2", False)
        if suc and out.strip(): entry = out.splitlines()[-1].strip()
        else: return ip, False, "Windows entry not found"
    
    cmd = f"sudo sed -i 's|^GRUB_DEFAULT=.*|GRUB_DEFAULT=\"{entry}\"|' /etc/default/grub && sudo update-grub" if permanent else f"sudo grub-reboot \"{entry}\""
    success, out, err = run_ssh_command(ip, username, password, cmd)
    return ip, success, f"Set to {entry}" if success else f"Error: {err or out[:50]}"

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

def summarize_linux_firmware_entry(bcd_output, guid):
    if not guid:
        return ""
    sections = re.split(r'(?:\r?\n){2,}', bcd_output or "")
    for section in sections:
        if guid.lower() not in section.lower():
            continue
        desc = re.search(r'(?im)^\s*description\s+(.+)$', section)
        path = re.search(r'(?im)^\s*path\s+(.+)$', section)
        bits = []
        if desc:
            bits.append(desc.group(1).strip())
        if path:
            bits.append(path.group(1).strip())
        return " | ".join(bits)
    return ""

def find_windows_linux_efi_path(ip, username, password):
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
    success, out, err = run_winrm_command(ip, username, password, ps)
    if not success:
        return None, err
    path = out.strip().splitlines()[-1].strip() if out.strip() else ""
    if path and path != "NO_EFI":
        return path, ""
    return None, "No Linux EFI loader found"

def create_managed_linux_firmware_entry(ip, username, password, efi_path):
    ps = rf"""
$m='S:'
if(Test-Path 'S:\'){{$m='T:'}}
mountvol $m /S | Out-Null
$created = bcdedit /create /d "Ubuntu Managed" /application BOOTAPP 2>&1 | Out-String
$match = [regex]::Match($created, '\{{[A-Fa-f0-9-]+\}}')
if(-not $match.Success){{ mountvol $m /D | Out-Null; Write-Output "FAILED_CREATE::$created"; exit 1 }}
$g = $match.Value
$dev = bcdedit /set $g device partition=$m 2>&1 | Out-String
$path = bcdedit /set $g path "{efi_path}" 2>&1 | Out-String
mountvol $m /D | Out-Null
Write-Output "GUID::$g"
Write-Output "DEVICE::$dev"
Write-Output "PATH::$path"
"""
    success, out, err = run_winrm_command(ip, username, password, ps)
    if not success:
        return None, err or out
    match = re.search(r'GUID::(\{[a-f0-9-]+\})', out, re.IGNORECASE)
    if not match:
        return None, out.strip() or "Managed firmware entry creation did not return a GUID"
    return match.group(1), ""

def switch_windows_to_linux(ip, username, password):
    actions = []
    errors = []
    guid = None

    success, out, err = run_winrm_command(ip, username, password, "bcdedit /enum firmware /v")
    if success:
        guid = extract_linux_firmware_guid(out)
        if guid:
            summary = summarize_linux_firmware_entry(out, guid)
            seq_ok, seq_out, seq_err = run_winrm_command(ip, username, password, f'bcdedit /set "{{fwbootmgr}}" bootsequence {guid}')
            order_ok, order_out, order_err = run_winrm_command(ip, username, password, f'bcdedit /set "{{fwbootmgr}}" displayorder {guid} /addfirst')
            bootseq_ok, bootseq_out, bootseq_err = run_winrm_command(ip, username, password, f"bcdedit /bootsequence {guid} /addfirst")
            if seq_ok or order_ok or bootseq_ok:
                actions.append(f"firmware entry {guid}" + (f" ({summary})" if summary else ""))
            else:
                errors.append(f"Linux GUID {guid} found but bcdedit refused update: {seq_err or seq_out} {order_err or order_out} {bootseq_err or bootseq_out}")
        else:
            errors.append("No Linux firmware GUID found")
    else:
        errors.append(f"Could not read firmware entries: {err}")

    efi_path, efi_err = find_windows_linux_efi_path(ip, username, password)
    if efi_path:
        managed_guid, managed_err = create_managed_linux_firmware_entry(ip, username, password, efi_path)
        if managed_guid:
            seq_ok, seq_out, seq_err = run_winrm_command(ip, username, password, f'bcdedit /set "{{fwbootmgr}}" bootsequence {managed_guid}')
            order_ok, order_out, order_err = run_winrm_command(ip, username, password, f'bcdedit /set "{{fwbootmgr}}" displayorder {managed_guid} /addfirst')
            bootseq_ok, bootseq_out, bootseq_err = run_winrm_command(ip, username, password, f"bcdedit /bootsequence {managed_guid} /addfirst")
            if seq_ok or order_ok or bootseq_ok:
                guid = guid or managed_guid
                actions.append(f"managed firmware entry {managed_guid} -> {efi_path}")
            else:
                errors.append(f"Created managed entry {managed_guid} but could not set firmware order: {seq_err or seq_out} {order_err or order_out} {bootseq_err or bootseq_out}")
        else:
            errors.append(f"Found {efi_path} but could not create managed firmware entry: {managed_err}")
    else:
        errors.append(efi_err)

    if not actions:
        return ip, False, "Failed: " + " | ".join(errors) + " No reboot performed."

    verify_ok, verify_out, verify_err = run_winrm_command(ip, username, password, 'bcdedit /enum "{fwbootmgr}"')
    if guid and actions and verify_ok and any(action.startswith("firmware entry") for action in actions) and guid.lower() not in verify_out.lower():
        return ip, False, f"Failed: bcdedit accepted commands but fwbootmgr does not list Linux GUID {guid}. No reboot performed."

    reboot_ok, reboot_out, reboot_err = run_winrm_command(ip, username, password, "shutdown /r /t 0 /f")
    if reboot_ok:
        time.sleep(POST_REBOOT_WAIT_SECONDS)
        booted, state, detail = wait_for_state(ip, "LINUX")
        if booted:
            return ip, True, "Success: Booted Linux after setting " + " + ".join(actions) + f". Probe: {detail}"
        return ip, False, "Boot target changed, but node came back as " + state + f" ({detail}). Firmware may be overriding the Linux entry."
    return ip, False, "Boot target changed but reboot failed: " + (reboot_err or reboot_out)

def main():
    print("\n\033[95m" + "="*60)
    print("      🚀 PRODUCTION CLUSTER OS SWAPPER (Version 3.0)      ")
    print("="*60 + "\033[0m")
    print(f"Script path: {__file__}")
    
    raw_ips = input("\nEnter IPs/Ranges: ")
    ip_list = parse_ips(raw_ips)
    if not ip_list: return

    print("\n\033[94m[*] Probing node states...\033[0m")
    nodes = {"LINUX": [], "WINDOWS": [], "UNKNOWN": []}
    probe_details = {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(probe_os, ip): ip for ip in ip_list}
        for f in as_completed(futures):
            ip = futures[f]
            state, detail = f.result()
            nodes[state].append(ip)
            probe_details[ip] = detail

    print(f"Status: {len(nodes['LINUX'])} Linux, {len(nodes['WINDOWS'])} Windows, {len(nodes['UNKNOWN'])} Unknown")
    for state in ["WINDOWS", "LINUX"]:
        for ip in nodes[state]:
            print(f"  [{state}] {ip}: {probe_details.get(ip, 'detected')}")

    if nodes['UNKNOWN']:
        print(f"\n\033[93m[!] {len(nodes['UNKNOWN'])} nodes did not respond to port probes.\033[0m")
        for ip in nodes['UNKNOWN']:
            print(f"    {ip}: {probe_details.get(ip, 'no probe detail')}")
        choice = input("    Should I manually treat them as [L]inux, [W]indows, or [S]kip? (l/w/s): ").lower()
        if choice == 'l': nodes['LINUX'].extend(nodes['UNKNOWN'])
        elif choice == 'w': nodes['WINDOWS'].extend(nodes['UNKNOWN'])

    results = []

    if nodes['LINUX']:
        print(f"\n\033[96m[LINUX] Processing {len(nodes['LINUX'])} nodes\033[0m")
        user = input("  SSH User (root): ") or "root"
        pw = getpass(f"  Password for {user}: ")
        print("  Action: [1] Win (Once) [2] Win (Perm) [3] Ubuntu [4] Skip")
        act = input("  Choice: ")
        if act in ['1', '2', '3']:
            target, perm = ("windows" if act in ['1','2'] else "ubuntu"), (act != '1')
            if input(f"  Confirm GRUB update? (y/n): ").lower() == 'y':
                with ThreadPoolExecutor(max_workers=10) as ex:
                    fs = {ex.submit(switch_linux_to_os, ip, user, pw, target, perm): ip for ip in nodes['LINUX']}
                    for f in as_completed(fs): r = f.result(); print(f"  [{'OK' if r[1] else 'FAIL'}] {r[0]}: {r[2]}"); results.append(r)
                if input("  Reboot now? (y/n): ").lower() == 'y':
                    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex: [ex.submit(lambda ip: run_ssh_command(ip, user, pw, "sudo reboot"), r[0]) for r in results if r[1] and r[0] in nodes['LINUX']]

    if nodes['WINDOWS']:
        print(f"\n\033[93m[WINDOWS] Processing {len(nodes['WINDOWS'])} nodes\033[0m")
        user = input("  Win Admin (Administrator): ") or "Administrator"
        pw = getpass(f"  Password for {user}: ")
        if input(f"  Confirm reboot to Linux? (y/n): ").lower() == 'y':
            with ThreadPoolExecutor(max_workers=10) as ex:
                fs = {ex.submit(switch_windows_to_linux, ip, user, pw): ip for ip in nodes['WINDOWS']}
                for f in as_completed(fs): r = f.result(); print(f"  [{'OK' if r[1] else 'FAIL'}] {r[0]}: {r[2]}"); results.append(r)

    print("\n" + "="*60)
    print(f"FINISHED: \033[92m{len([r for r in results if r[1]])} Success\033[0m | \033[91m{len([r for r in results if not r[1]])} Failed\033[0m")
    print("="*60 + "\n")

if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: print("\n\nExiting.")
