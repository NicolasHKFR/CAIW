// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::api::process::{Command, CommandEvent};
use tauri::Manager;

mod commands;

struct PortState(Mutex<u16>);
struct BackendPid(Mutex<Option<tauri::api::process::CommandChild>>);
struct BackendRunning(AtomicBool);

fn main() {
    let port = portpicker::pick_unused_port().expect("No free ports available");

    tauri::Builder::default()
        .manage(PortState(Mutex::new(port)))
        .manage(commands::AppConfig::default())
        .manage(BackendPid(Mutex::new(None)))
        .manage(BackendRunning(AtomicBool::new(false)))
        .invoke_handler(tauri::generate_handler![
            commands::get_app_port,
            commands::get_config,
            commands::set_config,
            commands::restart_backend,
        ])
        .setup(move |app| {
            let port_str = port.to_string();
            let app_handle = app.handle();

            spawn_backend(&app_handle, &port_str);

            let health_handle = app_handle.clone();
            let port_clone = port;
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_secs(10)).await;
                    let running = health_handle
                        .state::<BackendRunning>();
                    if !running.0.load(Ordering::Relaxed) {
                        continue;
                    }
                    match reqwest::get(&format!("http://127.0.0.1:{}/api/health", port_clone)).await {
                        Ok(resp) if resp.status().is_success() => {}
                        _ => {
                            eprintln!("[TAURI] Backend health check failed, restarting...");
                            let handle = health_handle.clone();
                            let p = port_clone.to_string();
                            tauri::async_runtime::spawn(async move {
                                spawn_backend(&handle, &p);
                            });
                        }
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
                if let Some(pid) = event.window().state::<BackendPid>().0.lock().ok().and_then(|p| p.take()) {
                    let _ = pid.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn spawn_backend(app: &tauri::AppHandle, port: &str) {
    match Command::new_sidecar("caiw-backend")
        .expect("Failed to create sidecar command")
        .args(["--port", port, "--db-path", "./data/caiw.db", "--assets-path", "./assets"])
        .spawn()
    {
        Ok((mut rx, child)) => {
            if let Ok(mut pid) = app.state::<BackendPid>().0.lock() {
                if let Some(old) = pid.replace(child) {
                    let _ = old.kill();
                }
            }
            app.state::<BackendRunning>().0.store(true, Ordering::Relaxed);

            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => println!("Backend: {}", line),
                        CommandEvent::Stderr(line) => eprintln!("Backend err: {}", line),
                        CommandEvent::Terminated(status) => {
                            eprintln!("[TAURI] Backend terminated with {:?}", status);
                            handle.state::<BackendRunning>().0.store(false, Ordering::Relaxed);
                        }
                        CommandEvent::Error(err) => {
                            eprintln!("[TAURI] Backend error: {}", err);
                        }
                        _ => {}
                    }
                }
            });
        }
        Err(e) => {
            eprintln!("[TAURI] Failed to spawn sidecar: {}", e);
        }
    }
}
