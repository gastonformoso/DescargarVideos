mod commands;
mod downloader;
mod models;
mod tools;

use downloader::AppState;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_defaults,
            commands::check_tools,
            commands::update_yt_dlp,
            commands::open_file,
            commands::open_folder,
            commands::reveal_path,
            downloader::analyze_video,
            downloader::start_download,
            downloader::cancel_download,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Video Downloader");
}
