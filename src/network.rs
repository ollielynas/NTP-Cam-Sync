
use wifi_rs::{prelude::*, WiFi};
use wifi_scan::scan;
use anyhow::*;
use local_ip_address::list_afinet_netifas;


fn get_self_hotspot_ip_address() -> String {

    let interfaces = list_afinet_netifas().expect("Failed to list interfaces");

        println!("Scanning for hotspot IP...");
        for (name, ip) in interfaces {
            // Look for common hotspot interface names:
            // Android: "ap0", "wlan1" | Windows: "Local Area Connection* X"
            if name.contains("ap") || name.contains("wlan1") || name.contains("Connection*") {
                return name;
            } else {
                println!("Other Interface -> Interface: {}, IP: {}", name, ip);
            }
        }



    return String::new();
}



pub fn scan_networks() -> Vec<String> {
    return scan().unwrap_or(vec![]).into_iter().map(|x| {
        x.ssid.to_string()
    }).collect();
}



fn add_network(ssid: String, password: String) -> anyhow::Result<()> {
    let db = sled::open("NptCamSync")?;
    db.insert(format!("ssid - {}",ssid), password.as_str());
    return Ok(());
}

fn seld_get_password(ssid: String) -> anyhow::Result<String> {
    let db = sled::open("NptCamSync")?;

    let s = String::from_utf8(db.get(format!("ssid - {}",ssid))?.ok_or(anyhow!("no key exists"))?.to_vec())?;
    Ok(s)
}

pub fn connect_to_network() -> anyhow::Result<()> {
    let networks = scan_networks();

    let db = sled::open("NptCamSync")?;

    let config = Some(Config {
            interface: Some("wlo1"),
        });

    let mut wifi = WiFi::new(config);

    for ssid in networks {
        println!("detected {}", ssid);
        if let std::result::Result::Ok(password) = seld_get_password(ssid.clone()) {
            println!("password saved for {}...", ssid);
            if wifi.connect(&ssid, &password).is_ok() {
                println!("password was correct");
                return Ok(())
            }else {
                println!("password was incorrect");
            }
        }
    }

    println!("falling back to hotspot");

    println!("hotpot address: {}", get_self_hotspot_ip_address());

    if wifi.create_hotspot("MTP Cam Sync", "ntp cam sync", None).unwrap_or(false) {
        println!("created hotspot");
    }else {
        bail!("failed to create hotspot");
    }

    let interfaces = list_afinet_netifas().expect("Failed to list interfaces");

        println!("Scanning for hotspot IP...");
        for (name, ip) in interfaces {
            // Look for common hotspot interface names:
            // Android: "ap0", "wlan1" | Windows: "Local Area Connection* X"
            if name.contains("ap") || name.contains("wlan1") || name.contains("Connection*") {
                println!("Potential Hotspot -> Interface: {}, IP: {}", name, ip);
            } else {
                println!("Other Interface -> Interface: {}, IP: {}", name, ip);
            }
        }


    Ok(())
}
