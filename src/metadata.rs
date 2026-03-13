use axum::{
    extract::Path,
    routing::get,
    Router,
};

use sled::IVec;
use std::fs::OpenOptions;
use std::io::{self, Write};

use crate::sync::get_current_time;

pub async fn set_metadata_no_anyhow(
    Path((key, value, timecode)): Path<(String, String, String)>,
)   {
    match set_metadata(key, value, timecode) {
        Ok(_) => {},
        a => {println!("error {a:?}")}
    }
}
pub fn set_metadata(
    key: String, value: String, timecode: String
) -> anyhow::Result<()>  {
    let db = sled::open("NptCamSync")?;

    let project = match db.get("project")? {
        Some(a) => String::from_utf8(a.to_vec())?,
        None => format!("")
    };
    let day = match db.get("day")? {
        Some(a) => String::from_utf8(a.to_vec())?,
        None => format!("")
    };
    let csv_line = format!("{project},{day},{timecode},{key},{value}");

    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open("WORKING/METADATA/HISTORY.csv")?; //

    writeln!(file, "{}", csv_line)?;
    let val_i: IVec = value.as_bytes().into();
    db.insert(key, val_i)?;
    db.insert("last_change", get_current_time().to_string().into_bytes())?;

    return Ok(());
}

pub async fn get_metadata_no_anyhow(
    Path(key): Path<String>,
) -> String  {
    match get_metadata(key) {
        Ok(s) => {return s},
        a => {return format!("error {a:?}")}
    }
}
pub fn get_metadata(
    key: String
) -> anyhow::Result<String>  {
    let db = sled::open("NptCamSync")?;

    let value = match db.get(key)? {
        Some(a) => String::from_utf8(a.to_vec())?,
        None => format!("")
    };

    return Ok(value);
}
