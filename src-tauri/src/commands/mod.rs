use crate::{
    application::{
        attachments,
        automatic_backup::{
            self, AutomaticBackupRunResult, AutomaticBackupSettings, AutomaticBackupSettingsInput,
        },
        backup::{self, BackupFile, RestoreResult},
        csv_export::{self, ExportedFile},
        csv_import::{self, CsvImportPreview, CsvImportResult},
        initial_setup::{self, SetupStatus},
        journal_cleanup::{self, JournalDeletionResult, JournalDeletionScope},
        storage::{self, DatabaseInfo},
    },
    database::Database,
    domain::{
        account::Account,
        book::{BookState, ConsumptionTaxStatus},
        journal_entry::{
            DraftJournalEntry, JournalCorrectionResult, SimpleExpenseRequest, SimpleSaleRequest,
            SimpleSettlementRequest,
        },
        journal_template::{JournalTemplate, SaveJournalTemplateRequest},
        phase4::{
            Attachment, CreateFixedAssetRequest, DepreciationResult, FixedAsset,
            InventoryAdjustmentRequest, InventoryCount, TaxCode, TaxSummary,
        },
        reconciliation::{
            BalanceAdjustmentRequest, BalanceAdjustmentResult, BalanceReconciliation,
            BalanceReconciliationRequest,
        },
        reports::{
            DashboardSummary, GeneralLedgerPage, GeneralLedgerRequest, JournalBookPage,
            ReportPageRequest, TrialBalance,
        },
    },
    repository::{
        account_repository, book_repository, journal_repository, journal_template_repository,
        phase4_repository, reconciliation_repository, reports_repository,
    },
};
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn get_setup_status(database: State<'_, Database>) -> Result<SetupStatus, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "内部状態を取得できませんでした".to_owned())?;
    initial_setup::status(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn complete_initial_setup(
    database: State<'_, Database>,
    locale: String,
) -> Result<SetupStatus, String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "内部状態を取得できませんでした".to_owned())?;
    initial_setup::complete(&mut connection, &locale).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_books(database: State<'_, Database>) -> Result<BookState, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "内部状態を取得できませんでした".to_owned())?;
    book_repository::state(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_active_book(
    database: State<'_, Database>,
    book_id: String,
) -> Result<BookState, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "内部状態を取得できませんでした".to_owned())?;
    book_repository::set_active(&connection, &book_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_book(database: State<'_, Database>, name: String) -> Result<BookState, String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    book_repository::create(&mut connection, &name).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_book(database: State<'_, Database>, book_id: String) -> Result<BookState, String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    book_repository::delete(&mut connection, &book_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_journal_entries(
    database: State<'_, Database>,
    book_id: String,
    scope: JournalDeletionScope,
    reference_date: String,
    fiscal_year: i32,
) -> Result<JournalDeletionResult, String> {
    let reference_date = chrono::NaiveDate::parse_from_str(&reference_date, "%Y-%m-%d")
        .map_err(|_| "基準日が正しくありません".to_owned())?;
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    journal_cleanup::delete(
        &mut connection,
        &database.path,
        &book_id,
        scope,
        reference_date,
        fiscal_year,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_book_consumption_tax_status(
    database: State<'_, Database>,
    book_id: String,
    consumption_tax_status: ConsumptionTaxStatus,
) -> Result<BookState, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    book_repository::set_consumption_tax_status(&connection, &book_id, consumption_tax_status)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_accounts(
    database: State<'_, Database>,
    book_id: String,
) -> Result<Vec<Account>, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "内部状態を取得できませんでした".to_owned())?;
    account_repository::list_active(&connection, &book_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_draft_entry(
    database: State<'_, Database>,
    book_id: String,
    request: DraftJournalEntry,
) -> Result<String, String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "内部状態を取得できませんでした".to_owned())?;
    journal_repository::save_draft(&mut connection, &book_id, &request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_simple_expense_draft(
    database: State<'_, Database>,
    book_id: String,
    request: SimpleExpenseRequest,
) -> Result<String, String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "内部状態を取得できませんでした".to_owned())?;
    journal_repository::save_simple_expense_draft(&mut connection, &book_id, &request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_simple_sale_draft(
    database: State<'_, Database>,
    book_id: String,
    request: SimpleSaleRequest,
) -> Result<String, String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "内部状態を取得できませんでした".to_owned())?;
    journal_repository::save_simple_sale_draft(&mut connection, &book_id, &request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_simple_settlement_draft(
    database: State<'_, Database>,
    book_id: String,
    request: SimpleSettlementRequest,
) -> Result<String, String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "内部状態を取得できませんでした".to_owned())?;
    journal_repository::save_simple_settlement_draft(&mut connection, &book_id, &request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_journal_templates(
    database: State<'_, Database>,
    book_id: String,
) -> Result<Vec<JournalTemplate>, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    journal_template_repository::list(&connection, &book_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_journal_template(
    database: State<'_, Database>,
    book_id: String,
    request: SaveJournalTemplateRequest,
) -> Result<String, String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    journal_template_repository::save(&mut connection, &book_id, &request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_journal_template(
    database: State<'_, Database>,
    book_id: String,
    template_id: String,
) -> Result<(), String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    journal_template_repository::delete(&connection, &book_id, &template_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn post_journal_entry(
    database: State<'_, Database>,
    book_id: String,
    entry_id: String,
) -> Result<(), String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    journal_repository::post_entry(&mut connection, &book_id, &entry_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reverse_journal_entry(
    database: State<'_, Database>,
    book_id: String,
    entry_id: String,
    locale: String,
) -> Result<JournalCorrectionResult, String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    journal_repository::reverse_entry(&mut connection, &book_id, &entry_id, &locale)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn revise_journal_entry(
    database: State<'_, Database>,
    book_id: String,
    entry_id: String,
    locale: String,
    request: DraftJournalEntry,
) -> Result<JournalCorrectionResult, String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    journal_repository::revise_entry(&mut connection, &book_id, &entry_id, &locale, &request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_dashboard_summary(
    database: State<'_, Database>,
    book_id: String,
    start_date: String,
    end_date: String,
) -> Result<DashboardSummary, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "内部状態を取得できませんでした".to_owned())?;
    reports_repository::get_dashboard_summary(&connection, &book_id, &start_date, &end_date)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_journal_book(
    database: State<'_, Database>,
    book_id: String,
    request: ReportPageRequest,
) -> Result<JournalBookPage, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "内部状態を取得できませんでした".to_owned())?;
    reports_repository::list_journal_book(&connection, &book_id, &request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_general_ledger(
    database: State<'_, Database>,
    book_id: String,
    request: GeneralLedgerRequest,
) -> Result<GeneralLedgerPage, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "内部状態を取得できませんでした".to_owned())?;
    reports_repository::list_general_ledger(&connection, &book_id, &request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_trial_balance(
    database: State<'_, Database>,
    book_id: String,
    request: ReportPageRequest,
) -> Result<TrialBalance, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "内部状態を取得できませんでした".to_owned())?;
    reports_repository::get_trial_balance(&connection, &book_id, &request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_account_reconciliation(
    database: State<'_, Database>,
    book_id: String,
    request: BalanceReconciliationRequest,
) -> Result<BalanceReconciliation, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "内部状態を取得できませんでした".to_owned())?;
    reconciliation_repository::get_account_reconciliation(&connection, &book_id, &request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn post_balance_adjustment(
    database: State<'_, Database>,
    book_id: String,
    request: BalanceAdjustmentRequest,
) -> Result<BalanceAdjustmentResult, String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "内部状態を取得できませんでした".to_owned())?;
    reconciliation_repository::post_balance_adjustment(&mut connection, &book_id, &request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_journal_book_csv(
    app: AppHandle,
    database: State<'_, Database>,
    book_id: String,
    request: ReportPageRequest,
) -> Result<ExportedFile, String> {
    let document = {
        let connection = database
            .connection
            .lock()
            .map_err(|_| "Unable to access internal state".to_owned())?;
        csv_export::journal_book(&connection, &book_id, &request)
            .map_err(|error| error.to_string())?
    };
    let directory = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    csv_export::write_to_directory(&directory, "journal", document)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_general_ledger_csv(
    app: AppHandle,
    database: State<'_, Database>,
    book_id: String,
    request: GeneralLedgerRequest,
) -> Result<ExportedFile, String> {
    let document = {
        let connection = database
            .connection
            .lock()
            .map_err(|_| "Unable to access internal state".to_owned())?;
        csv_export::general_ledger(&connection, &book_id, &request)
            .map_err(|error| error.to_string())?
    };
    let directory = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    csv_export::write_to_directory(&directory, "general-ledger", document)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_trial_balance_csv(
    app: AppHandle,
    database: State<'_, Database>,
    book_id: String,
    request: ReportPageRequest,
) -> Result<ExportedFile, String> {
    let document = {
        let connection = database
            .connection
            .lock()
            .map_err(|_| "Unable to access internal state".to_owned())?;
        csv_export::trial_balance(&connection, &book_id, &request)
            .map_err(|error| error.to_string())?
    };
    let directory = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    csv_export::write_to_directory(&directory, "trial-balance", document)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_database_info(database: State<'_, Database>) -> Result<DatabaseInfo, String> {
    storage::database_info(&database.path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reveal_database_file(database: State<'_, Database>) -> Result<(), String> {
    storage::reveal_database_file(&database.path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_backups(database: State<'_, Database>) -> Result<Vec<BackupFile>, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    let settings = automatic_backup::settings(&connection, &database.path)
        .map_err(|error| error.to_string())?;
    let root = std::path::Path::new(&settings.destination_directory);
    let mut snapshots = backup::list_snapshots_in_directory(&backup::snapshot_directory(root))
        .map_err(|error| error.to_string())?;
    // Keep snapshots created before the automatic/manual split visible.
    snapshots.extend(backup::list_snapshots_in_directory(root).map_err(|error| error.to_string())?);
    snapshots.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(snapshots)
}

#[tauri::command]
pub fn list_automatic_backups(database: State<'_, Database>) -> Result<Vec<BackupFile>, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    let settings = automatic_backup::settings(&connection, &database.path)
        .map_err(|error| error.to_string())?;
    let directory =
        backup::automatic_directory(std::path::Path::new(&settings.destination_directory));
    backup::list_automatic_in_directory(&directory).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_backup(database: State<'_, Database>) -> Result<BackupFile, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    let settings = automatic_backup::settings(&connection, &database.path)
        .map_err(|error| error.to_string())?;
    let directory =
        backup::snapshot_directory(std::path::Path::new(&settings.destination_directory));
    backup::create_in_directory(&connection, &database.path, &directory)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn restore_backup(
    database: State<'_, Database>,
    file_name: String,
) -> Result<RestoreResult, String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    let settings = automatic_backup::settings(&connection, &database.path)
        .map_err(|error| error.to_string())?;
    let root = std::path::Path::new(&settings.destination_directory);
    let snapshots = backup::snapshot_directory(root);
    let automatic = backup::automatic_directory(root);
    let source_directory = if backup::is_automatic_file_name(&file_name) {
        &automatic
    } else if snapshots.join(&file_name).is_file() {
        &snapshots
    } else {
        root
    };
    backup::restore_from_directories(
        &mut connection,
        &database.path,
        source_directory,
        &snapshots,
        &file_name,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_automatic_backup_settings(
    database: State<'_, Database>,
) -> Result<AutomaticBackupSettings, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    automatic_backup::settings(&connection, &database.path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_automatic_backup_settings(
    database: State<'_, Database>,
    settings: AutomaticBackupSettingsInput,
) -> Result<AutomaticBackupSettings, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    automatic_backup::save_settings(&connection, &database.path, &settings)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn run_automatic_backup(
    database: State<'_, Database>,
) -> Result<AutomaticBackupRunResult, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    automatic_backup::run_if_due_at(&connection, &database.path, chrono::Utc::now())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn select_backup_directory(initial_directory: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new();
    if let Some(path) = initial_directory.filter(|path| std::path::Path::new(path).is_dir()) {
        dialog = dialog.set_directory(path);
    }
    dialog
        .pick_folder()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn preview_journal_csv(
    database: State<'_, Database>,
    book_id: String,
    csv_content: String,
) -> Result<CsvImportPreview, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    csv_import::preview(&connection, &book_id, &csv_content).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn import_journal_csv(
    database: State<'_, Database>,
    book_id: String,
    csv_content: String,
) -> Result<CsvImportResult, String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    csv_import::import(&mut connection, &book_id, &csv_content).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_tax_codes(
    database: State<'_, Database>,
    date: String,
    locale: String,
) -> Result<Vec<TaxCode>, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    phase4_repository::list_tax_codes(&connection, &date, &locale)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_tax_summary(
    database: State<'_, Database>,
    book_id: String,
    start_date: String,
    end_date: String,
    locale: String,
) -> Result<TaxSummary, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    phase4_repository::tax_summary(&connection, &book_id, &start_date, &end_date, &locale)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_fixed_assets(
    database: State<'_, Database>,
    book_id: String,
) -> Result<Vec<FixedAsset>, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    phase4_repository::list_fixed_assets(&connection, &book_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_fixed_asset(
    database: State<'_, Database>,
    book_id: String,
    request: CreateFixedAssetRequest,
) -> Result<FixedAsset, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    phase4_repository::create_fixed_asset(&connection, &book_id, &request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn post_fixed_asset_depreciation(
    database: State<'_, Database>,
    book_id: String,
    asset_id: String,
    fiscal_year: i64,
) -> Result<DepreciationResult, String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    phase4_repository::post_depreciation(&mut connection, &book_id, &asset_id, fiscal_year)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_inventory_counts(
    database: State<'_, Database>,
    book_id: String,
) -> Result<Vec<InventoryCount>, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    phase4_repository::list_inventory_counts(&connection, &book_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn post_inventory_adjustment(
    database: State<'_, Database>,
    book_id: String,
    request: InventoryAdjustmentRequest,
) -> Result<InventoryCount, String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    phase4_repository::post_inventory_adjustment(&mut connection, &book_id, &request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_attachments(
    database: State<'_, Database>,
    book_id: String,
) -> Result<Vec<Attachment>, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    attachments::list(&connection, &book_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn add_attachment(
    database: State<'_, Database>,
    book_id: String,
    entry_id: String,
    original_name: String,
    data: Vec<u8>,
) -> Result<Attachment, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    attachments::add(
        &connection,
        &database.path,
        &book_id,
        &entry_id,
        &original_name,
        &data,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn add_evidence_link(
    database: State<'_, Database>,
    book_id: String,
    entry_id: String,
    title: String,
    external_url: String,
) -> Result<Attachment, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    attachments::add_link(&connection, &book_id, &entry_id, &title, &external_url)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_evidence_link(
    database: State<'_, Database>,
    book_id: String,
    attachment_id: String,
) -> Result<(), String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    attachments::open_link(&connection, &book_id, &attachment_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reveal_attachment(
    database: State<'_, Database>,
    book_id: String,
    attachment_id: String,
) -> Result<(), String> {
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    attachments::reveal(&connection, &database.path, &book_id, &attachment_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_attachment(
    database: State<'_, Database>,
    book_id: String,
    attachment_id: String,
) -> Result<(), String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|_| "Unable to access internal state".to_owned())?;
    attachments::delete(&mut connection, &database.path, &book_id, &attachment_id)
        .map_err(|error| error.to_string())
}
