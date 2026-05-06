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

    # PowerShell command to find Ubuntu and set it as the next boot target
    # This looks for the identifier associated with 'ubuntu' in the firmware
    ps_script = """
    $id = bcdedit /enum firmware | Select-String -Pattern "{.*}" -Context 0,1 | 
          Where-Object { $_.Context.PostContext -match "ubuntu" } | 
          ForEach-Object { $_.Matches.Value }
    
    if ($id) {
        bcdedit /bootsequence $id /addfirst
        Restart-Computer -Force
        echo "Success: Rebooting to Ubuntu..."
    } else {
        echo "Error: Ubuntu entry not found in BCD."
    }
    """

    try:
        shell_id = p.open_shell()
        command_id = p.run_command(shell_id, 'powershell', [ps_script])
        std_out, std_err, status_code = p.get_command_output(shell_id, command_id)
        p.cleanup_command(shell_id, command_id)
        p.close_shell(shell_id)
        
        print(f"[{ip}] Output: {std_out.decode()}")
    except Exception as e:
        print(f"[{ip}] Connection failed: {e}")

# Usage
nodes = ["172.17.181.170"]
user = "administrator"
password = getpass.getpass()

for node in nodes:
    switch_windows_to_ubuntu_remote(node, user, password)