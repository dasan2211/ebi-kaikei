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
            let database_path = app_data_dir.join("accounting.sqlite");
            let connection = open_database(&database_path)
                .map_err(|error| Box::<dyn std::error::Error>::from(error.to_string()))?;
            app.manage(Database::new(connection, database_path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_setup_status,
            commands::complete_initial_setup,
            commands::list_books,
            commands::create_book,
            commands::delete_book,
            commands::delete_journal_entries,
            commands::set_active_book,
            commands::set_book_consumption_tax_status,
            commands::list_accounts,
            commands::save_draft_entry,
            commands::save_simple_expense_draft,
            commands::save_simple_sale_draft,
            commands::save_simple_settlement_draft,
            commands::list_journal_templates,
            commands::save_journal_template,
            commands::delete_journal_template,
            commands::post_journal_entry,
            commands::reverse_journal_entry,
            commands::revise_journal_entry,
            commands::get_dashboard_summary,
            commands::list_journal_book,
            commands::list_general_ledger,
            commands::get_trial_balance,
            commands::get_account_reconciliation,
            commands::post_balance_adjustment,
            commands::export_journal_book_csv,
            commands::export_general_ledger_csv,
            commands::export_trial_balance_csv,
            commands::get_database_info,
            commands::reveal_database_file,
            commands::list_backups,
            commands::list_automatic_backups,
            commands::create_backup,
            commands::restore_backup,
            commands::get_automatic_backup_settings,
            commands::save_automatic_backup_settings,
            commands::run_automatic_backup,
            commands::select_backup_directory,
            commands::preview_journal_csv,
            commands::import_journal_csv,
            commands::list_tax_codes,
            commands::get_tax_summary,
            commands::list_fixed_assets,
            commands::create_fixed_asset,
            commands::post_fixed_asset_depreciation,
            commands::list_inventory_counts,
            commands::post_inventory_adjustment,
            commands::list_attachments,
            commands::add_attachment,
            commands::add_evidence_link,
            commands::reveal_attachment,
            commands::open_evidence_link,
            commands::delete_attachment
        ])
        .run(tauri::generate_context!())
        .expect("EBI Kaikeiの起動に失敗しました");
}
