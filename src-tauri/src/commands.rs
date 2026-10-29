use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::process::Command;

use crate::models::{AppDefaults, ToolStatuses};
use crate::tools::{find_tool, tool_statuses};

const HIDE_WINDOW: u32 = 0x0800_0000;

fn default_directory(app: &AppHandle) -> PathBuf {
    app.path()
        .download_dir()
        .ok()
        .filter(|path| !path.as_os_str().is_empty())
        .or_else(|| app.path().home_dir().ok().map(|home| home.join("Downloads")))
        .unwrap_or_else(std::env::temp_dir)
}

#[tauri::command]
pub async fn get_defaults(app: AppHandle) -> AppDefaults {
    let directory = default_directory(&app);
    let _ = std::fs::create_dir_all(&directory);

    AppDefaults {
        download_dir: directory.to_string_lossy().to_string(),
        tools: tool_statuses(&app),
        app_version: app.package_info().version.to_string(),
        platform: std::env::consts::OS.to_string(),
    }
}

#[tauri::command]
pub async fn check_tools(app: AppHandle) -> ToolStatuses {
    tool_statuses(&app)
}

#[tauri::command]
pub fn open_file(app: AppHandle, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err("El archivo ya no existe en esa ubicación.".into());
    }
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|error| format!("No se pudo abrir el archivo: {error}"))
}

#[tauri::command]
pub fn open_folder(app: AppHandle, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.is_dir() {
        return Err("La carpeta ya no existe en esa ubicación.".into());
    }
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|error| format!("No se pudo abrir la carpeta: {error}"))
}

#[tauri::command]
pub fn reveal_path(app: AppHandle, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err("El archivo ya no existe en esa ubicación.".into());
    }
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|error| format!("No se pudo abrir el explorador: {error}"))
}

#[tauri::command]
pub async fn update_yt_dlp(app: AppHandle) -> Result<ToolStatuses, String> {
    let binary = find_tool(&app, "yt-dlp").ok_or_else(|| {
        "No se encontró yt-dlp. Instala el ejecutable antes de intentar actualizarlo.".to_string()
    })?;

    let mut command = Command::new(binary);
    command
        .arg("-U")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    command.creation_flags(HIDE_WINDOW);

    let output = tokio::time::timeout(Duration::from_secs(180), command.output())
        .await
        .map_err(|_| "La actualización de yt-dlp tardó demasiado.".to_string())?
        .map_err(|error| format!("No se pudo ejecutar yt-dlp: {error}"))?;

    if !output.status.success() {
        let text = String::from_utf8_lossy(&output.stderr);
        let detail = text
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .rev()
            .take(3)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join(" ");
        return Err(if detail.is_empty() {
            "No se pudo actualizar yt-dlp. Comprueba la conexión o actualiza el ejecutable manualmente.".into()
        } else {
            detail
        });
    }

    Ok(tool_statuses(&app))
}
