pub mod application;
pub mod commands;
pub mod database;
pub mod domain;
pub mod error;
pub mod repository;

use database::{open_database, Database};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let connection = open_database(&app_data_dir.join("accounting.sqlite"))
                .map_err(|error| Box::<dyn std::error::Error>::from(error.to_string()))?;
            app.manage(Database::new(connection));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_setup_status,
            commands::complete_initial_setup,
            commands::list_books,
            commands::set_active_book,
            commands::list_accounts,
            commands::save_draft_entry
        ])
        .run(tauri::generate_context!())
        .expect("EBI Kaikeiの起動に失敗しました");
}
