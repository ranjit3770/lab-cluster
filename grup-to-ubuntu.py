# pip install pywinrm

from winrm.protocol import Protocol
import getpass

def switch_windows_to_ubuntu_remote(ip, user, pwd):
    # Setup WinRM connection
    p = Protocol(
        endpoint=f'http://{ip}:5985/wsman',
        transport='ntlm',
        username=user,
        password=pwd
    )

    # PowerShell command with Power Options repair and robust BCD detection
    ps_script = """
    # 1. Repair Power Options
    $p1 = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System'
    if (!(Test-Path $p1)) { New-Item $p1 -Force | Out-Null }
    Set-ItemProperty -Path $p1 -Name 'ShutdownWithoutLogon' -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
    
    # 2. Find Ubuntu GUID
    $bcd = bcdedit /enum firmware /v
    $id = $bcd | Select-String -Pattern "{[a-fA-F0-9\\-]+}" -Context 0,5 | 
          Where-Object { $_.Context.PostContext -match "ubuntu|shim|grub" } | 
          ForEach-Object { [regex]::Match($_.Line, "{[a-fA-F0-9\\-]+}").Value } | Select-Object -First 1
    
    if ($id) {
        bcdedit /set "{fwbootmgr}" bootsequence $id | Out-Null
        bcdedit /set "{fwbootmgr}" displayorder $id /addfirst | Out-Null
        shutdown /r /t 5 /f /d p:2:4 /c "Automated switch to Ubuntu"
        Write-Output "SUCCESS: Rebooting to Ubuntu (GUID: $id)..."
    } else {
        Write-Error "ERROR: Ubuntu entry not found in BCD."
    }
    """

    try:
        shell_id = p.open_shell()
        command_id = p.run_command(shell_id, 'powershell', [ps_script])
        std_out, std_err, status_code = p.get_command_output(shell_id, command_id)
        p.cleanup_command(shell_id, command_id)
        p.close_shell(shell_id)
        
        if std_out: print(f"[{ip}] Out: {std_out.decode().strip()}")
        if std_err: print(f"[{ip}] Err: {std_err.decode().strip()}")
    except Exception as e:
        print(f"[{ip}] Failed: {e}")


# Usage
nodes = ["172.17.181.170"]
user = "administrator"
password = getpass.getpass()

for node in nodes:
    switch_windows_to_ubuntu_remote(node, user, password)