// Tauri AI Demo - Rust backend core entry
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
            // SSH
            commands::ssh_test_connect,
            commands::ssh_connect,
            commands::ssh_disconnect,
            commands::ssh_exec,
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
            println!("[Tauri AI Demo] started, data dir: {:?}", app_dir);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri app failed to start");
}
