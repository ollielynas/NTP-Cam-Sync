// use futures::StreamExt;

// async fn upload_file_streaming(mut multipart: Multipart) -> Result<String, StatusCode> {
//     while let Some(field) = multipart.next_field().await
//         .map_err(|_| StatusCode::BAD_REQUEST)?
//     {
//         let name = field.file_name()
//             .ok_or(StatusCode::BAD_REQUEST)?
//             .to_string();

//         if name.contains('/') || name.contains('\\') {
//             return Err(StatusCode::BAD_REQUEST);
//         }

//         tokio::fs::create_dir_all("uploads").await
//             .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

//         let path = std::path::Path::new("uploads").join(&name);
//         let mut file = tokio::fs::File::create(&path).await
//             .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

//         let mut stream = field;
//         while let Some(chunk) = stream.chunk().await
//             .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
//         {
//             file.write_all(&chunk).await
//                 .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
//         }

//         return Ok(format!("Uploaded: {}", name));
//     }

//     Err(StatusCode::BAD_REQUEST)
// }
