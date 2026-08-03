#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};

fn now_str() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("epoch:{secs}")
}

fn log(msg: &str) {
    let log_path = std::env::temp_dir().join("launchpad_panic.log");
    if let Ok(mut f) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let _ = writeln!(f, "[{}] {}", now_str(), msg);
    }
}

fn main() {
    // Install panic hook
    std::panic::set_hook(Box::new(move |info| {
        log(&format!("PANIC: {info}"));
    }));

    log(&format!("Starting Launchpad, PID={}", std::process::id()));

    launchpad_lib::run();

    log("Launchpad exited (returned from run).");
}
