use std::time::{SystemTime, UNIX_EPOCH};

use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
pub struct NtpResponse {
    t1: u128, // Server Receive Time
    t2: u128, // Server Transmit Time
}



pub async fn ntp_handler() -> Json<NtpResponse> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    // In a local network, t1 and t2 are essentially the same
    Json(NtpResponse { t1: now, t2: now })
}
