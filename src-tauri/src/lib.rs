// AITerminal - Rust backend core entry
// Register all Tauri commands, plugins, start app
// Command naming aligned with DEMO_SPEC.md: save_token / load_token / ai_chat / ai_chat_stream

pub mod ai;
pub mod commands;
pub mod config;
pub mod crypto;
pub mod error;
pub mod network;
pub mod protocol;
pub mod storage;

use tauri::Manager;
use tauri::image::Image;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // Token
            commands::save_token,
            commands::load_token,
            commands::delete_token,
            commands::has_token,
            // Config
            commands::save_config,
            commands::load_config,
            // AI
            commands::ai_chat,
            commands::ai_chat_stream,
            commands::test_ai_connection,
            // SSH
            commands::ssh_test_connect,
            commands::ssh_connect,
            commands::ssh_disconnect,
            commands::ssh_exec,
            commands::ssh_exec_full,
            commands::ssh_open_shell,
            commands::ssh_write,
            commands::ssh_resize,
            // SFTP
            commands::sftp_read_dir,
            commands::sftp_mkdir,
            commands::sftp_remove,
            commands::sftp_rename,
            commands::sftp_upload,
            commands::sftp_download,
            commands::sftp_stat,
            // SFTP Extended
            commands::sftp_chmod,
            commands::sftp_touch,
            commands::sftp_compress,
            // System
            commands::get_system_info,
        ])
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("Cannot get app data dir");
            std::fs::create_dir_all(&app_dir).expect("Cannot create app data dir");
            println!("[AITerminal] started, data dir: {:?}", app_dir);

            // Set window icon (taskbar + title bar)
            if let Some(window) = app.get_webview_window("main") {
                let icon_bytes = include_bytes!("../icons/app-icon.png");
                match image::load_from_memory(icon_bytes) {
                    Ok(img) => {
                        let rgba = img.into_rgba8();
                        let (w, h) = rgba.dimensions();
                        let icon_image = Image::new_owned(rgba.into_raw(), w, h);
                        if let Err(e) = window.set_icon(icon_image) {
                            eprintln!("[AITerminal] Failed to set window icon: {}", e);
                        } else {
                            println!("[AITerminal] Window icon set successfully");
                        }
                    }
                    Err(e) => {
                        eprintln!("[AITerminal] Failed to decode icon: {}", e);
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri app failed to start");
}
