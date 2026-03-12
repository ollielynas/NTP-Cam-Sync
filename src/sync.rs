use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::Json;
use serde::Serialize;

use std::sync::OnceLock;

static START_TIME: OnceLock<Duration> = OnceLock::new();

#[derive(Serialize)]
pub struct NtpResponse {
    t1: u128, // Server Receive Time
    t2: u128, // Server Transmit Time
}



pub async fn ntp_handler() -> Json<NtpResponse> {
    let mut now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    if START_TIME.get().is_none() {
        START_TIME.set(SystemTime::now().duration_since(UNIX_EPOCH).unwrap());
    }
    now -= START_TIME.get().unwrap_or(&Duration::ZERO).as_millis();
    now += 570000;
    // In a local network, t1 and t2 are essentially the same
    Json(NtpResponse { t1: now, t2: now })
}
