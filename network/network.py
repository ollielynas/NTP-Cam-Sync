import platform
import subprocess
import ctypes
import time
from py_wifi_helper import WiFiScanner, WiFiConnector

def network_init():
    os_type = platform.system()
    saved_ssids = get_saved_ssids(os_type)

    if not saved_ssids:
        print("No saved networks found.")
    else:
        print(f"Found {len(saved_ssids)} saved profiles. Scanning for availability...")
        # Get visible networks to avoid wasting time on out-of-range SSIDs
        try:
            interfaces = WiFiScanner.list_interfaces()
            visible_ssids = [cell.ssid for cell in WiFiScanner.scan(interfaces[0])]

            # Find the intersection of saved and visible networks
            to_try = [s for s in saved_ssids if s in visible_ssids]

            for ssid in to_try:
                print(f"Trying to reconnect to {ssid}...")
                if WiFiConnector.connect(interfaces, ssid, ""): # Pass empty pass for saved profiles
                    print(f"Success! Connected to {ssid}.")
                    return True
        except Exception as e:
            print(f"Scan failed: {e}")

    # Fallback if no saved networks connect
    print("Could not connect to any known network.")
    handle_hotspot_fallback(os_type)

def get_saved_ssids(os_type):
    """Extracts a list of saved Wi-Fi SSIDs from the OS."""
    ssids = []
    try:
        if os_type == "Windows":
            # Extract names from 'netsh wlan show profiles'
            output = subprocess.check_output(["netsh", "wlan", "show", "profiles"]).decode('utf-8', errors="ignore")
            for line in output.split('\n'):
                if "All User Profile" in line:
                    ssids.append(line.split(":")[1].strip())

        elif os_type == "Linux":
            # Extract names from NetworkManager connections
            output = subprocess.check_output(["nmcli", "-t", "-f", "NAME", "connection", "show"]).decode('utf-8')
            ssids = [line.strip() for line in output.split('\n') if line.strip()]

    except Exception:
        pass
    return ssids

def handle_hotspot_fallback(os_type):
    if os_type == "Windows":
        message = "No saved networks found. Please enable 'Mobile Hotspot' manually."
        ctypes.windll.user32.MessageBoxW(0, message, "Startup Connection Failed", 0x40 | 0x1)
        subprocess.run(["start", "ms-settings:network-mobilehotspot"], shell=True)
    elif os_type == "Linux":
        print("Starting local hotspot...")
        subprocess.run(["nmcli", "dev", "wifi", "hotspot"], check=False)
