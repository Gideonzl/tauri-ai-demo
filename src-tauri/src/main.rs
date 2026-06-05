//! Tauri application entry point

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri_ai_demo_lib::run()
}
