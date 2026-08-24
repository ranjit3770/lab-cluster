import os
import re

script_dir = os.path.dirname(os.path.abspath(__file__))
os.environ["OPENSSL_CONF"] = os.path.join(script_dir, "openssl-legacy.cnf")

import winrm


def reboot_windows_to_ubuntu():
  target_ip = "172.17.181.170"
  username = "administrator"
  password = input("Enter password: ")

  session = winrm.Session(
      f"http://{target_ip}:5985/wsman",
      auth=(username, password),
      transport="ntlm",
  )

  print("Enumerating UEFI Firmware Boot Entries...")

  # Query firmware boot entries
  enum_res = session.run_cmd("cmd.exe", ["/c", "bcdedit /enum firmware"])
  output = enum_res.std_out.decode("cp437", errors="ignore")

  ubuntu_guid = None

  # Parse the BCD output block by block to locate the Ubuntu entry
  current_guid = None
  for line in output.splitlines():
    line = line.strip()

    # Capture identifier GUIDs
    if line.startswith("identifier"):
      parts = line.split()
      if len(parts) >= 2:
        current_guid = parts[1]

    # Check if the description or path corresponds to Ubuntu/GRUB
    if current_guid and (
        "ubuntu" in line.lower()
        or "grub" in line.lower()
        or r"\efi\ubuntu" in line.lower()
    ):
      ubuntu_guid = current_guid
      break

  if not ubuntu_guid:
    print(
        "[-] Could not dynamically identify Ubuntu entry. Checking"
        " bootmanager displayorder..."
    )
    # Fallback search inside bootmgr displayorder
    bm_res = session.run_cmd("cmd.exe", ["/c", "bcdedit /enum {bootmgr}"])
    bm_out = bm_res.std_out.decode("cp437", errors="ignore")

    # Extract all GUIDs in {12345678-1234-1234-1234-123456789abc} format
    guids = re.findall(
        r"\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}",
        bm_out,
    )
    for g in guids:
      if g != "{bootmgr}" and g != "{globalsettings}":
        ubuntu_guid = g
        break

  if not ubuntu_guid:
    print("[-] Failed to locate Ubuntu GUID in BCD. Aborting.")
    return

  print(f"[+] Found Ubuntu UEFI GUID: {ubuntu_guid}")

  # Configure one-time boot to Ubuntu GUID via firmware boot manager
  print("Setting target GUID as BootNext in NVRAM...")
  set_cmd = f"bcdedit /set {{fwbootmgr}} bootnext {ubuntu_guid}"
  res = session.run_cmd("cmd.exe", ["/c", set_cmd])

  out_str = res.std_out.decode("cp437", errors="ignore").strip()
  err_str = res.std_err.decode("cp437", errors="ignore").strip()

  if res.status_code != 0:
    print(f"[-] Failed to set bootnext: {err_str or out_str}")
    # Fallback to setting default order
    print("Attempting fallback: setting default object...")
    session.run_cmd("cmd.exe", ["/c", f"bcdedit /default {ubuntu_guid}"])
  else:
    print(f"[+] {out_str}")

  print("[+] Initiating clean restart...")
  reboot_res = session.run_cmd("shutdown", ["/r", "/t", "0", "/f"])

  if reboot_res.status_code == 0:
    print(
        "[+] Reboot command sent successfully! Machine is rebooting into"
        " Ubuntu."
    )
  else:
    print(
        "[-] Failed to send reboot command:"
        f" {reboot_res.std_err.decode('cp437', errors='ignore')}"
    )


if __name__ == "__main__":
  reboot_windows_to_ubuntu()