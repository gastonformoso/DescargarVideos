use std::collections::{BTreeMap, HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, SystemTime};

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex as AsyncMutex;
use url::Url;

use crate::models::{
    AudioOption, DownloadEvent, DownloadRequest, QualityOption, VideoInfo,
};
use crate::tools::{ffmpeg_directory, find_tool};

const SUPPORTED_HOSTS: &[&str] = &["youtube.com", "youtu.be", "tiktok.com", "twitter.com", "x.com"];
const HIDE_WINDOW: u32 = 0x0800_0000;
const MEDIA_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "webm", "mov", "avi", "flv", "mp3", "m4a", "aac", "opus", "ogg", "wav",
    "flac",
];

#[derive(Clone)]
pub struct TaskHandle {
    pub child: Arc<AsyncMutex<Option<Child>>>,
    pub cancelled: Arc<AtomicBool>,
}

impl TaskHandle {
    fn new() -> Self {
        Self {
            child: Arc::new(AsyncMutex::new(None)),
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }
}

pub struct AppState {
    pub tasks: Arc<AsyncMutex<HashMap<String, TaskHandle>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            tasks: Arc::new(AsyncMutex::new(HashMap::new())),
        }
    }
}

fn hide_window(command: &mut Command) {
    #[cfg(windows)]
    command.creation_flags(HIDE_WINDOW);
}

fn emit(app: &AppHandle, event: DownloadEvent) {
    let _ = app.emit("download:event", event);
}

pub fn validate_url(raw: &str) -> Result<Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Introduce un enlace para continuar.".into());
    }

    let parsed = Url::parse(trimmed).map_err(|_| {
        "El enlace no es válido. Debe empezar por http:// o https://.".to_string()
    })?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Solo se permiten enlaces http o https.".into());
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "El enlace no contiene un dominio válido.".to_string())?
        .to_ascii_lowercase();

    let supported = SUPPORTED_HOSTS
        .iter()
        .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")));

    if !supported {
        return Err("Por ahora solo se admiten enlaces de YouTube, TikTok y X (Twitter).".into());
    }

    Ok(parsed)
}

fn platform_name(extractor: &str) -> String {
    let lower = extractor.to_ascii_lowercase();
    if lower.contains("youtube") {
        "YouTube".into()
    } else if lower.contains("tiktok") {
        "TikTok".into()
    } else if lower.contains("twitter") || lower.contains("x.com") {
        "X (Twitter)".into()
    } else if extractor.trim().is_empty() {
        "Desconocida".into()
    } else {
        extractor.to_string()
    }
}

fn value_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_f64().filter(|n| n.is_finite() && *n >= 0.0).map(|n| n as u64))
}

fn value_f64(value: &Value) -> Option<f64> {
    value.as_f64().filter(|n| n.is_finite())
}

fn format_size(format: &Value) -> Option<u64> {
    format
        .get("filesize")
        .and_then(value_u64)
        .or_else(|| format.get("filesize_approx").and_then(value_u64))
}

fn quality_label(height: u32) -> String {
    match height {
        4320 => "4320p (8K)".into(),
        2160 => "2160p (4K)".into(),
        1440 => "1440p (2K)".into(),
        1080 => "1080p (Full HD)".into(),
        720 => "720p (HD)".into(),
        480 => "480p".into(),
        360 => "360p".into(),
        240 => "240p".into(),
        144 => "144p".into(),
        other => format!("{other}p"),
    }
}

fn parse_video_info(json: &Value, original_url: &str) -> Result<VideoInfo, String> {
    let title = json
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Video sin título")
        .to_string();

    let id = json
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let extractor = json
        .get("extractor_key")
        .and_then(Value::as_str)
        .or_else(|| json.get("extractor").and_then(Value::as_str))
        .unwrap_or("Desconocida");

    let thumbnail = json
        .get("thumbnail")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| {
            json.get("thumbnails")
                .and_then(Value::as_array)
                .and_then(|items| {
                    items
                        .iter()
                        .rev()
                        .find_map(|item| item.get("url").and_then(Value::as_str))
                        .map(ToOwned::to_owned)
                })
        });

    let webpage_url = json
        .get("webpage_url")
        .and_then(Value::as_str)
        .unwrap_or(original_url)
        .to_string();

    let mut heights: BTreeMap<u32, (Option<u64>, Option<u64>, Option<f64>)> = BTreeMap::new();
    let mut best_audio_size: Option<u64> = None;
    let mut audio_by_ext: BTreeMap<String, (u32, Option<u64>)> = BTreeMap::new();

    let formats = json
        .get("formats")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for format in &formats {
        let vcodec = format
            .get("vcodec")
            .and_then(Value::as_str)
            .unwrap_or("none");
        let acodec = format
            .get("acodec")
            .and_then(Value::as_str)
            .unwrap_or("none");
        let height = format.get("height").and_then(value_u64).unwrap_or(0) as u32;
        let size = format_size(format);
        let fps = format.get("fps").and_then(value_f64);

        if vcodec != "none" && height > 0 {
            let entry = heights.entry(height).or_insert((None, None, None));
            if acodec != "none" {
                entry.0 = entry.0.max(size);
            } else {
                entry.1 = entry.1.max(size);
            }
            if let Some(fps) = fps {
                entry.2 = Some(entry.2.map_or(fps, |current| current.max(fps)));
            }
        }

        if vcodec == "none" && acodec != "none" {
            best_audio_size = best_audio_size.max(size);
            let abr = format.get("abr").and_then(value_f64).unwrap_or(0.0) as u32;
            let ext = format
                .get("ext")
                .and_then(Value::as_str)
                .unwrap_or("audio")
                .to_string();
            let entry = audio_by_ext.entry(ext).or_insert((abr, size));
            if abr >= entry.0 {
                *entry = (abr, size.or(entry.1));
            }
        }
    }

    let qualities = heights
        .iter()
        .rev()
        .map(|(height, (muxed, video_only, fps))| {
            let separate = match (*video_only, best_audio_size) {
                (Some(video), Some(audio)) => Some(video.saturating_add(audio)),
                (Some(video), None) => Some(video),
                _ => None,
            };
            let approx = match (*muxed, separate) {
                (Some(a), Some(b)) => Some(a.max(b)),
                (Some(a), None) => Some(a),
                (None, Some(b)) => Some(b),
                (None, None) => None,
            };
            QualityOption {
                height: *height,
                label: quality_label(*height),
                approx_size: approx,
                fps: *fps,
            }
        })
        .collect();

    let mut audio_options: Vec<AudioOption> = audio_by_ext
        .into_iter()
        .map(|(ext, (abr, approx_size))| AudioOption {
            abr,
            ext,
            approx_size,
        })
        .collect();
    audio_options.sort_by(|a, b| b.abr.cmp(&a.abr));

    Ok(VideoInfo {
        id,
        title,
        thumbnail,
        duration: json.get("duration").and_then(value_f64),
        uploader: json
            .get("uploader")
            .or_else(|| json.get("channel"))
            .or_else(|| json.get("uploader_id"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        platform: platform_name(extractor),
        webpage_url,
        qualities,
        audio_options,
    })
}

fn tail_text(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let start = lines.len().saturating_sub(4);
    let joined = lines[start..].join(" ");
    joined.chars().take(700).collect()
}

fn missing_ytdlp() -> String {
    "No se encontró yt-dlp. Ejecuta scripts/download-tools.ps1, coloca el ejecutable en src-tauri/resources/bin o instálalo y añádelo al PATH.".into()
}

#[tauri::command]
pub async fn analyze_video(app: AppHandle, url: String) -> Result<VideoInfo, String> {
    let parsed = validate_url(&url)?;
    let binary = find_tool(&app, "yt-dlp").ok_or_else(missing_ytdlp)?;

    let mut command = Command::new(binary);
    command
        .args([
            "--dump-single-json",
            "--no-playlist",
            "--no-warnings",
            "--no-color",
            "--skip-download",
            "--socket-timeout",
            "20",
            "--retries",
            "3",
            "--encoding",
            "utf-8",
            "--",
        ])
        .arg(parsed.as_str());
    hide_window(&mut command);

    let output = tokio::time::timeout(Duration::from_secs(90), command.output())
        .await
        .map_err(|_| "El análisis tardó demasiado. Comprueba tu conexión e inténtalo de nuevo.".to_string())?
        .map_err(|error| format!("No se pudo ejecutar yt-dlp: {error}"))?;

    if !output.status.success() {
        let detail = tail_text(&output.stderr);
        if detail.is_empty() {
            return Err("No se pudo analizar el enlace. Puede que el video no esté disponible.".into());
        }
        return Err(format!("No se pudo analizar el video. {detail}"));
    }

    let json: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("El motor de descargas devolvió una respuesta inesperada: {error}"))?;

    if json.get("entries").is_some() && json.get("formats").is_none() {
        return Err("El enlace apunta a una lista de reproducción. Pega el enlace de un video individual.".into());
    }

    parse_video_info(&json, parsed.as_str())
}

fn sanitize_filename(input: &str) -> String {
    let invalid = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let mut name: String = input
        .trim()
        .chars()
        .filter(|character| !character.is_control() && !invalid.contains(character))
        .collect();

    name = name.split_whitespace().collect::<Vec<_>>().join(" ");

    if let Some(extension) = Path::new(&name).extension().and_then(|ext| ext.to_str()) {
        if MEDIA_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str()) {
            name = Path::new(&name)
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or(&name)
                .to_string();
        }
    }

    let mut name: String = name
        .trim()
        .trim_matches(|character: char| character == '.' || character == ' ')
        .chars()
        .take(140)
        .collect();

    if name.is_empty() {
        name = "video".into();
    }

    let stem = name
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(&name)
        .to_ascii_uppercase();

    if matches!(
        stem.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "COM1" | "COM2" | "COM3" | "COM4" | "COM5" | "COM6"
            | "COM7" | "COM8" | "COM9" | "LPT1" | "LPT2" | "LPT3" | "LPT4" | "LPT5" | "LPT6"
            | "LPT7" | "LPT8" | "LPT9"
    ) {
        name = format!("_{name}");
    }

    name
}

fn existing_stems(directory: &Path) -> Result<Vec<String>, String> {
    let entries = std::fs::read_dir(directory)
        .map_err(|error| format!("No se pudo leer la carpeta de destino: {error}"))?;
    let mut stems = Vec::new();
    for entry in entries.flatten() {
        if !entry.path().is_file() {
            continue;
        }
        if let Some(stem) = entry.path().file_stem().and_then(|stem| stem.to_str()) {
            stems.push(stem.to_ascii_lowercase());
        }
    }
    Ok(stems)
}

fn resolve_filename(
    directory: &Path,
    requested: &str,
    policy: &str,
) -> Result<(String, Option<PathBuf>), String> {
    let base = sanitize_filename(requested);
    let stems = existing_stems(directory)?;
    let exists = stems.iter().any(|stem| stem == &base.to_ascii_lowercase());

    if !exists {
        return Ok((base, None));
    }

    match policy {
        "overwrite" => Ok((base, None)),
        "skip" => {
            let existing = std::fs::read_dir(directory)
                .ok()
                .into_iter()
                .flatten()
                .flatten()
                .map(|entry| entry.path())
                .find(|path| {
                    path.file_stem()
                        .and_then(|stem| stem.to_str())
                        .map(|stem| stem.eq_ignore_ascii_case(&base))
                        .unwrap_or(false)
                });
            Ok((base, existing))
        }
        _ => {
            for index in 1..=9999u32 {
                let candidate = format!("{base} ({index})");
                if !stems
                    .iter()
                    .any(|stem| stem == &candidate.to_ascii_lowercase())
                {
                    return Ok((candidate, None));
                }
            }
            Err("No se pudo generar un nombre de archivo único en la carpeta de destino.".into())
        }
    }
}

fn validate_height(quality: &str) -> Result<Option<u32>, String> {
    if quality == "best" {
        return Ok(None);
    }
    let height = quality
        .parse::<u32>()
        .map_err(|_| "La calidad seleccionada no es válida.".to_string())?;
    if !(144..=4320).contains(&height) {
        return Err("La calidad seleccionada no es válida.".into());
    }
    Ok(Some(height))
}

fn validate_audio_quality(quality: &str) -> Result<String, String> {
    if quality == "best" {
        return Ok("0".into());
    }
    let bitrate = quality
        .parse::<u32>()
        .map_err(|_| "La calidad de audio no es válida.".to_string())?;
    if !(64..=320).contains(&bitrate) {
        return Err("La calidad de audio no es válida.".into());
    }
    Ok(format!("{bitrate}K"))
}

fn build_download_args(
    request: &DownloadRequest,
    output_template: &str,
    ffmpeg_dir: Option<&Path>,
) -> Result<Vec<String>, String> {
    if request.content_type != "video" && request.content_type != "audio" {
        return Err("El tipo de contenido no es válido.".into());
    }

    let mut args: Vec<String> = vec![
        "--newline".into(),
        "--no-playlist".into(),
        "--no-warnings".into(),
        "--no-color".into(),
        "--no-mtime".into(),
        "--no-simulate".into(),
        "--windows-filenames".into(),
        "--encoding".into(),
        "utf-8".into(),
        "--progress".into(),
        "--progress-template".into(),
        "download:PROG|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s".into(),
        "--print".into(),
        "after_move:FILE|%(filepath)s".into(),
        "--socket-timeout".into(),
        "20".into(),
        "--retries".into(),
        "5".into(),
        "--fragment-retries".into(),
        "5".into(),
        "--concurrent-fragments".into(),
        "4".into(),
        "-o".into(),
        output_template.to_string(),
    ];

    if request.duplicate_policy == "overwrite" {
        args.push("--force-overwrites".into());
    } else {
        args.push("--no-overwrites".into());
    }

    if let Some(directory) = ffmpeg_dir {
        args.push("--ffmpeg-location".into());
        args.push(directory.to_string_lossy().to_string());
    }

    if request.content_type == "audio" {
        let format = match request.format.as_str() {
            "mp3" | "m4a" | "opus" | "wav" | "best" => request.format.as_str(),
            _ => return Err("El formato de audio seleccionado no es válido.".into()),
        };
        let audio_quality = validate_audio_quality(&request.quality)?;

        args.extend([
            "-f".into(),
            "bestaudio/best".into(),
            "-x".into(),
            "--audio-format".into(),
            format.into(),
            "--audio-quality".into(),
            audio_quality,
        ]);
    } else {
        let container = match request.format.as_str() {
            "mp4" | "mkv" => request.format.as_str(),
            _ => return Err("El formato de video seleccionado no es válido.".into()),
        };
        let height = validate_height(&request.quality)?;

        let selector = match height {
            Some(height) => format!(
                "bestvideo[height<={height}]+bestaudio/best[height<={height}]/best"
            ),
            None => "bestvideo+bestaudio/best".into(),
        };

        args.extend([
            "-f".into(),
            selector,
            "--merge-output-format".into(),
            container.into(),
            "--remux-video".into(),
            container.into(),
        ]);
    }

    args.push("--".into());
    args.push(request.url.trim().to_string());

    Ok(args)
}

fn parse_metric(raw: &str) -> Option<u64> {
    let cleaned = raw.trim().trim_start_matches('~');
    if cleaned.is_empty() || cleaned == "NA" || cleaned == "None" || cleaned == "N/A" {
        return None;
    }
    cleaned.parse::<u64>().ok().or_else(|| {
        cleaned
            .parse::<f64>()
            .ok()
            .filter(|value| value.is_finite() && *value >= 0.0)
            .map(|value| value as u64)
    })
}

fn push_tail(tail: &Arc<StdMutex<VecDeque<String>>>, line: &str) {
    if let Ok(mut guard) = tail.lock() {
        if guard.len() >= 12 {
            guard.pop_front();
        }
        guard.push_back(line.to_string());
    }
}

async fn read_stream<R>(
    reader: R,
    app: AppHandle,
    task_id: String,
    is_stderr: bool,
    file_path: Arc<StdMutex<Option<String>>>,
    stderr_tail: Arc<StdMutex<VecDeque<String>>>,
) where
    R: AsyncRead + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(raw_line)) = lines.next_line().await {
        let line = raw_line.trim_end();
        if line.is_empty() {
            continue;
        }

        if is_stderr {
            push_tail(&stderr_tail, line);
            continue;
        }

        if let Some(rest) = line.strip_prefix("PROG|") {
            let parts: Vec<&str> = rest.split('|').collect();
            if parts.len() >= 5 {
                let downloaded = parse_metric(parts[0]).unwrap_or(0);
                let total = parse_metric(parts[1]).or_else(|| parse_metric(parts[2]));
                let speed = parse_metric(parts[3]).map(|value| value as f64);
                let eta = parse_metric(parts[4]);

                let mut event = DownloadEvent::status(&task_id, "downloading");
                event.downloaded = Some(downloaded);
                event.total = total;
                event.speed = speed;
                event.eta = eta;
                event.percent = total
                    .filter(|total| *total > 0)
                    .map(|total| ((downloaded as f64 / total as f64) * 100.0).clamp(0.0, 100.0));
                emit(&app, event);
            }
            continue;
        }

        if let Some(rest) = line.strip_prefix("FILE|") {
            if let Ok(mut guard) = file_path.lock() {
                *guard = Some(rest.trim().to_string());
            }
            continue;
        }

        let lower = line.to_ascii_lowercase();
        if lower.contains("[merger]")
            || lower.contains("[extractaudio]")
            || lower.contains("[videoconvertor]")
            || lower.contains("[fixupm3u8]")
            || lower.starts_with("[ffmpeg]")
        {
            let mut event = DownloadEvent::status(&task_id, "processing");
            event.percent = Some(100.0);
            event.message = Some("Procesando el archivo con FFmpeg...".into());
            emit(&app, event);
        }
    }
}

fn newest_matching_file(
    directory: &Path,
    base: &str,
    started: SystemTime,
) -> Option<PathBuf> {
    let mut best: Option<(SystemTime, PathBuf)> = None;
    for entry in std::fs::read_dir(directory).ok()?.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let matches = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .map(|stem| stem.eq_ignore_ascii_case(base))
            .unwrap_or(false);
        if !matches {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        if modified < started {
            continue;
        }
        if best.as_ref().map_or(true, |(current, _)| modified >= *current) {
            best = Some((modified, path));
        }
    }
    best.map(|(_, path)| path)
}

async fn run_download(
    app: AppHandle,
    tasks: Arc<AsyncMutex<HashMap<String, TaskHandle>>>,
    handle: TaskHandle,
    request: DownloadRequest,
    binary: PathBuf,
    args: Vec<String>,
    directory: PathBuf,
    base_name: String,
    started: SystemTime,
) {
    let task_id = request.task_id.clone();

    if handle.cancelled.load(Ordering::SeqCst) {
        tasks.lock().await.remove(&task_id);
        let mut event = DownloadEvent::status(&task_id, "cancelled");
        event.message = Some("Descarga cancelada por el usuario.".into());
        emit(&app, event);
        return;
    }

    let mut command = Command::new(&binary);
    command
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    hide_window(&mut command);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            tasks.lock().await.remove(&task_id);
            let mut event = DownloadEvent::status(&task_id, "failed");
            event.error = Some(format!("No se pudo iniciar yt-dlp: {error}"));
            emit(&app, event);
            return;
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    {
        let mut slot = handle.child.lock().await;
        *slot = Some(child);
    }

    if handle.cancelled.load(Ordering::SeqCst) {
        let mut slot = handle.child.lock().await;
        if let Some(child) = slot.as_mut() {
            let _ = child.start_kill();
        }
    }

    emit(&app, DownloadEvent::status(&task_id, "downloading"));

    let captured_path = Arc::new(StdMutex::new(None::<String>));
    let stderr_tail = Arc::new(StdMutex::new(VecDeque::<String>::new()));

    let stdout_task = stdout.map(|stream| {
        tokio::spawn(read_stream(
            stream,
            app.clone(),
            task_id.clone(),
            false,
            Arc::clone(&captured_path),
            Arc::clone(&stderr_tail),
        ))
    });
    let stderr_task = stderr.map(|stream| {
        tokio::spawn(read_stream(
            stream,
            app.clone(),
            task_id.clone(),
            true,
            Arc::clone(&captured_path),
            Arc::clone(&stderr_tail),
        ))
    });

    let status = loop {
        let poll = {
            let mut slot = handle.child.lock().await;
            match slot.as_mut() {
                Some(child) => Some(child.try_wait()),
                None => None,
            }
        };

        match poll {
            Some(Ok(Some(status))) => break Ok(status),
            Some(Ok(None)) => {}
            Some(Err(error)) => break Err(error),
            None => {
                break Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "El proceso de descarga no está disponible.",
                ))
            }
        }

        tokio::time::sleep(Duration::from_millis(200)).await;
    };

    if let Some(task) = stdout_task {
        let _ = task.await;
    }
    if let Some(task) = stderr_task {
        let _ = task.await;
    }

    let cancelled = handle.cancelled.load(Ordering::SeqCst);
    let captured = captured_path.lock().ok().and_then(|guard| guard.clone());
    let tail = stderr_tail
        .lock()
        .map(|guard| guard.iter().cloned().collect::<Vec<_>>())
        .unwrap_or_default();

    tasks.lock().await.remove(&task_id);

    if cancelled {
        let mut event = DownloadEvent::status(&task_id, "cancelled");
        event.message = Some("Descarga cancelada por el usuario.".into());
        emit(&app, event);
        return;
    }

    match status {
        Ok(status) if status.success() => {
            let path = captured
                .map(PathBuf::from)
                .filter(|path| path.exists())
                .or_else(|| newest_matching_file(&directory, &base_name, started));
            let mut event = DownloadEvent::status(&task_id, "completed");
            event.percent = Some(100.0);
            event.file_path = path.map(|path| path.to_string_lossy().to_string());
            if event.file_path.is_none() {
                event.message =
                    Some("La descarga terminó, pero no se pudo determinar la ruta del archivo.".into());
            }
            emit(&app, event);
        }
        Ok(status) => {
            let detail = tail
                .iter()
                .rev()
                .take(4)
                .cloned()
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join(" ");
            let detail = if detail.is_empty() {
                format!("el proceso terminó con el código {:?}", status.code())
            } else {
                detail
            };
            let mut event = DownloadEvent::status(&task_id, "failed");
            event.error = Some(detail);
            emit(&app, event);
        }
        Err(error) => {
            let detail = tail
                .iter()
                .rev()
                .take(4)
                .cloned()
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join(" ");
            let mut event = DownloadEvent::status(&task_id, "failed");
            event.error = Some(if detail.is_empty() {
                format!("La descarga se interrumpió: {error}")
            } else {
                detail
            });
            emit(&app, event);
        }
    }
}

#[tauri::command]
pub async fn start_download(app: AppHandle, request: DownloadRequest) -> Result<(), String> {
    validate_url(&request.url)?;

    let task_id = request.task_id.trim().to_string();
    if task_id.len() < 8
        || task_id.len() > 64
        || !task_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("El identificador de la tarea no es válido.".into());
    }

    if request.destination.trim().is_empty() {
        return Err("Selecciona una carpeta de destino.".into());
    }

    let directory = PathBuf::from(request.destination.trim());
    if !directory.is_absolute() {
        return Err("La carpeta de destino debe ser una ruta absoluta.".into());
    }
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("No se pudo crear la carpeta de destino: {error}"))?;

    let binary = find_tool(&app, "yt-dlp").ok_or_else(missing_ytdlp)?;
    let ffmpeg_dir = ffmpeg_directory(&app);
    let policy = match request.duplicate_policy.as_str() {
        "overwrite" | "skip" | "rename" => request.duplicate_policy.as_str(),
        _ => "rename",
    };

    let requested_name = if request.filename.trim().is_empty() {
        request.title.as_str()
    } else {
        request.filename.as_str()
    };

    let (base_name, existing) = resolve_filename(&directory, requested_name, policy)?;

    if policy == "skip" {
        if let Some(existing) = existing {
            let mut event = DownloadEvent::status(&task_id, "completed");
            event.percent = Some(100.0);
            event.file_path = Some(existing.to_string_lossy().to_string());
            event.message = Some("El archivo ya existía, así que se omitió la descarga.".into());
            emit(&app, event);
            return Ok(());
        }
    }

    let started = SystemTime::now();

    let output_template = directory
        .join(format!("{base_name}.%(ext)s"))
        .to_string_lossy()
        .to_string();

    let args = build_download_args(&request, &output_template, ffmpeg_dir.as_deref())?;

    let tasks = app.state::<AppState>().tasks.clone();
    {
        let mut registry = tasks.lock().await;
        if registry.contains_key(&task_id) {
            return Err("Ya existe una descarga con ese identificador.".into());
        }
        registry.insert(task_id.clone(), TaskHandle::new());
    }

    let handle = {
        let registry = tasks.lock().await;
        registry
            .get(&task_id)
            .cloned()
            .ok_or_else(|| "No se pudo registrar la descarga.".to_string())?
    };

    let mut starting = DownloadEvent::status(&task_id, "starting");
    starting.message = Some("Preparando la descarga...".into());
    emit(&app, starting);

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        run_download(
            app_handle,
            tasks,
            handle,
            request,
            binary,
            args,
            directory,
            base_name,
            started,
        )
        .await;
    });

    Ok(())
}

#[tauri::command]
pub async fn cancel_download(app: AppHandle, task_id: String) -> Result<(), String> {
    let tasks = app.state::<AppState>().tasks.clone();
    let handle = {
        let registry = tasks.lock().await;
        registry.get(&task_id).cloned()
    };

    let handle = handle.ok_or_else(|| "La descarga ya no está activa.".to_string())?;
    handle.cancelled.store(true, Ordering::SeqCst);

    let mut slot = handle.child.lock().await;
    if let Some(child) = slot.as_mut() {
        child
            .start_kill()
            .map_err(|error| format!("No se pudo cancelar la descarga: {error}"))?;
    }

    Ok(())
}
