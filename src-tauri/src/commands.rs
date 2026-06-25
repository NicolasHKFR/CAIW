use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

use crate::{BackendPid, BackendRunning, PortState, spawn_backend};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub llm_provider: String,
    pub llm_endpoint: String,
    pub llm_model: String,
    pub nvidia_api_key: String,
    pub nvidia_endpoint: String,
    pub nvidia_model: String,
    pub image_provider: String,
    pub image_endpoint: String,
    pub mock_mode: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            llm_provider: "openrouter".into(),
            llm_endpoint: "https://openrouter.ai/api/v1".into(),
            llm_model: "openrouter/free".into(),
            nvidia_api_key: "".into(),
            nvidia_endpoint: "https://integrate.api.nvidia.com/v1".into(),
            nvidia_model: "moonshotai/kimi-k2.6".into(),
            image_provider: "local_sd".into(),
            image_endpoint: "http://localhost:7860".into(),
            mock_mode: true,
        }
    }
}

#[tauri::command]
pub fn get_app_port(port: State<PortState>) -> Result<u16, String> {
    let p = port.0.lock().map_err(|e| e.to_string())?;
    Ok(*p)
}

#[tauri::command]
pub fn get_config(config: State<Mutex<AppConfig>>) -> Result<AppConfig, String> {
    let c = config.lock().map_err(|e| e.to_string())?;
    Ok(c.clone())
}

#[tauri::command]
pub fn set_config(
    config: State<Mutex<AppConfig>>,
    new_config: AppConfig,
) -> Result<AppConfig, String> {
    let mut c = config.lock().map_err(|e| e.to_string())?;
    *c = new_config;
    Ok(c.clone())
}

#[tauri::command]
pub fn restart_backend(app: tauri::AppHandle, port: State<PortState>) -> Result<(), String> {
    let p = port.0.lock().map_err(|e| e.to_string())?.to_string();
    if let Ok(mut pid) = app.state::<BackendPid>().0.lock() {
        if let Some(child) = pid.take() {
            let _ = child.kill();
        }
    }
    spawn_backend(&app, &p);
    Ok(())
}
