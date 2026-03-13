pub mod network;
pub mod sync;
pub mod metadata;
pub mod upload_file;
use axum_server::tls_rustls::RustlsConfig;
use local_ip_address::list_afinet_netifas;
use rcgen::{CertificateParams, KeyPair};
use time::{Duration, OffsetDateTime};
use tower_http::services::ServeDir;
use std::path::Path;
use axum::{
    Router, response::Html, routing::get
};
use std::time::Duration as StdDuration;
use tokio::fs;

use crate::{
    metadata::{get_metadata_no_anyhow, set_metadata_no_anyhow},
    network::*,
    sync::ntp_handler,
};

fn get_local_ips() -> Vec<String> {
    let mut ips = vec!["localhost".to_string(), "127.0.0.1".to_string()];
    if let Ok(interfaces) = list_afinet_netifas() {
        for (_name, ip) in interfaces {
            if !ip.is_loopback() {
                ips.push(ip.to_string());
            }
        }
    }
    ips
}

async fn get_or_create_cert() -> (Vec<u8>, Vec<u8>) {
    if Path::new("cert.pem").exists() && Path::new("key.pem").exists() {
        let cert = fs::read("cert.pem").await.unwrap();
        let key = fs::read("key.pem").await.unwrap();
        return (cert, key);
    }

    let ips = get_local_ips();
    println!("Generating cert for: {:?}", ips);

    let key_pair = KeyPair::generate().unwrap();
    let mut params = CertificateParams::new(ips).unwrap();
    params.not_after = OffsetDateTime::now_utc() + Duration::days(398);
    let cert = params.self_signed(&key_pair).unwrap();

    let cert_pem = cert.pem().into_bytes();
    let key_pem = key_pair.serialize_pem().into_bytes();

    fs::write("cert.pem", &cert_pem).await.unwrap();
    fs::write("key.pem", &key_pem).await.unwrap();

    (cert_pem, key_pem)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    // try to connect to network in background
    std::thread::spawn(move || {
        let mut managed_to_connect = false;
        while !managed_to_connect {
            managed_to_connect = !connect_to_network().is_err();
            std::thread::sleep(StdDuration::from_secs(20));
        }
    });

    let (cert_pem, key_pem) = get_or_create_cert().await;

    let config = RustlsConfig::from_pem(cert_pem, key_pem)
        .await
        .unwrap();

    let serve_dir_service = ServeDir::new("AUDIO_FILES");
    let serve_static = ServeDir::new("STATIC");

    let app = Router::new()
        .route("/sync", get(ntp_handler))
        .route("/", get(root))
        .route("/set/{key}/{value}/{timecode}", get(set_metadata_no_anyhow))
        .route("/get/{key}", get(get_metadata_no_anyhow))
        .nest_service("/static", serve_static)
        .nest_service("/file", serve_dir_service)
        .route("/upload", post(upload_file_streaming))
        .layer(DefaultBodyLimit::max(5000 * 1024 * 1024)); // 5000MB

    ;

    let ips = get_local_ips();
    println!("\nServer running at:");
    for ip in &ips {
        println!("  https://{}:3000", ip);
    }

    axum_server::bind_rustls("0.0.0.0:3000".parse().unwrap(), config)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

async fn root() -> Html<&'static str> {
    Html(include_str!("./net/index.html"))
}
