use crate::{
    application::initial_setup::{self, SetupStatus},
    database::Database,
    domain::{account::Account, book::BookState, journal_entry::DraftJournalEntry},
    repository::{account_repository, book_repository, journal_repository},
};
use tauri::State;

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
