pub mod network;
pub mod sync;

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
            std::thread::sleep(Duration::from_mins(5));
        }
    });


tracing_subscriber::fmt::init();

// build our application with a route
let app = Router::new()
    .route("/sync", get(ntp_handler))
    .route("/", get(root));
    // `POST /users` goes to `create_user`
    // .route("/users", post(create_user));

// run our app with hyper, listening globally on port 3000
println!("http://localhost:3000");
let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
axum::serve(listener, app).await.unwrap();



}


// basic handler that responds with a static string
async fn root() -> Html<&'static str> {
    return Html(&include_str!("./net/index.html"));
}
