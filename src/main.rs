pub mod network;
pub mod sync;
use include_dir::{include_dir, Dir};
use tower_http::services::ServeDir;
use std::path::Path;

use axum::{
    Json, Router, http::StatusCode, response::Html, routing::{get, post}
};
use serde::{Deserialize, Serialize};
use std::time::Duration;


use crate::{network::*, sync::ntp_handler};


#[tokio::main]
async fn main() {
let handle = std::thread::spawn(move || {
    let mut managed_to_connect = false;
        while !managed_to_connect {
            managed_to_connect = !connect_to_network().is_err();
            std::thread::sleep(Duration::from_secs(20));
        }
    });


tracing_subscriber::fmt::init();

let serve_dir_service = ServeDir::new("AUDIO_FILES");
let serve_static = ServeDir::new("STATIC");

// build our application with a route
let app = Router::new()
    .route("/sync", get(ntp_handler))
    .route("/", get(root))
    .nest_service("/static", serve_static)
    .nest_service("/file", serve_dir_service);
    // `POST /users` goes to `create_user`
    // .route("/users", post(create_user));

// run our app with hyper, listening globally on port 3000
println!("http://localhost:3000");
let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
axum::serve(listener, app).await.unwrap();



}


// basic handler that responds with a static string
async fn root() -> Html<&'static str> {
    return Html(include_str!("./net/index.html"));
}
