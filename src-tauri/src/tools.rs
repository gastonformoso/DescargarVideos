use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::{AppHandle, Manager};

use crate::models::{ToolStatus, ToolStatuses};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn exe_name(base: &str) -> String {
    if cfg!(windows) {
        format!("{base}.exe")
    } else {
        base.to_string()
    }
}

fn is_file(path: &Path) -> bool {
    path.is_file()
}

fn env_tool(name: &str, base: &str) -> Option<PathBuf> {
    let value = std::env::var_os(name)?;
    let path = PathBuf::from(value);
    if is_file(&path) {
        return Some(path);
    }
    let candidate = path.join(exe_name(base));
    if is_file(&candidate) {
        return Some(candidate);
    }
    None
}

fn lookup_in_path(base: &str) -> Option<PathBuf> {
    let exe = exe_name(base);
    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths)
        .map(|dir| dir.join(&exe))
        .find(|candidate| candidate.is_file())
}

/// Resolves a bundled or installed tool without ever invoking a shell.
pub fn find_tool(app: &AppHandle, base: &str) -> Option<PathBuf> {
    let env_name = match base {
        "yt-dlp" => "YTDLP_PATH",
        "ffmpeg" => "FFMPEG_PATH",
        "ffprobe" => "FFPROBE_PATH",
        _ => "",
    };

    if !env_name.is_empty() {
        if let Some(path) = env_tool(env_name, base) {
            return Some(path);
        }
    }

    let exe = exe_name(base);
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(current) = std::env::current_exe() {
        if let Some(dir) = current.parent() {
            candidates.push(dir.join(&exe));
            candidates.push(dir.join("bin").join(&exe));
            candidates.push(dir.join("resources").join("bin").join(&exe));
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(&exe));
        candidates.push(resource_dir.join("bin").join(&exe));
        candidates.push(resource_dir.join("resources").join("bin").join(&exe));
    }

    if let Ok(data_dir) = app.path().app_data_dir() {
        candidates.push(data_dir.join("bin").join(&exe));
    }

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("src-tauri").join("resources").join("bin").join(&exe));
        candidates.push(cwd.join("resources").join("bin").join(&exe));
    }

    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("bin")
            .join(&exe),
    );

    if let Some(path) = candidates.into_iter().find(|candidate| candidate.is_file()) {
        return Some(path);
    }

    lookup_in_path(base)
}

pub fn ffmpeg_directory(app: &AppHandle) -> Option<PathBuf> {
    find_tool(app, "ffmpeg").and_then(|path| path.parent().map(Path::to_path_buf))
}

fn read_version(path: &Path, args: &[&str]) -> Option<String> {
    let mut command = Command::new(path);
    command.args(args);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command.output().ok()?;
    let bytes = if output.stdout.is_empty() {
        &output.stderr
    } else {
        &output.stdout
    };
    let text = String::from_utf8_lossy(bytes);
    let first_line = text.lines().find(|line| !line.trim().is_empty())?.trim();
    Some(first_line.chars().take(160).collect())
}

fn status_for(app: &AppHandle, base: &str, version_args: &[&str]) -> ToolStatus {
    match find_tool(app, base) {
        Some(path) => ToolStatus {
            found: true,
            version: read_version(&path, version_args),
            path: Some(path.to_string_lossy().to_string()),
        },
        None => ToolStatus {
            found: false,
            path: None,
            version: None,
        },
    }
}

pub fn tool_statuses(app: &AppHandle) -> ToolStatuses {
    ToolStatuses {
        yt_dlp: status_for(app, "yt-dlp", &["--version"]),
        ffmpeg: status_for(app, "ffmpeg", &["-version"]),
        ffprobe: status_for(app, "ffprobe", &["-version"]),
    }
}
