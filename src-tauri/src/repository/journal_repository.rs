use crate::{
    domain::journal_entry::DraftJournalEntry,
    error::{AppError, AppResult},
};
use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

pub fn save_draft(
    connection: &mut Connection,
    book_id: &str,
    entry: &DraftJournalEntry,
) -> AppResult<String> {
    entry.validate()?;
    let transaction = connection.transaction()?;
    let book_exists: i64 = transaction.query_row(
        "SELECT COUNT(*) FROM books WHERE id = ?1 AND is_active = 1",
        [book_id],
        |row| row.get(0),
    )?;
    if book_exists != 1 {
        return Err(AppError::Validation("選択した帳簿が見つかりません".into()));
    }
    for line in &entry.lines {
        let account_exists: i64 = transaction.query_row(
            "SELECT COUNT(*) FROM book_accounts
             WHERE book_id = ?1 AND account_id = ?2 AND is_active = 1",
            params![book_id, line.account_id],
            |row| row.get(0),
        )?;
        if account_exists != 1 {
            return Err(AppError::Validation(
                "選択した帳簿では使用できない勘定科目が含まれています".into(),
            ));
        }
    }
    let entry_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    transaction.execute(
        "INSERT INTO journal_entries (id, transaction_date, description, status, source_type, created_at, updated_at, book_id)
         VALUES (?1, ?2, ?3, 'draft', 'manual', ?4, ?4, ?5)",
        params![
            entry_id,
            entry.transaction_date,
            entry.description.trim(),
            now,
            book_id
        ],
    )?;
    for (index, line) in entry.lines.iter().enumerate() {
        transaction.execute(
            "INSERT INTO journal_lines (id, entry_id, line_number, account_id, side, amount_minor, memo, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![Uuid::new_v4().to_string(), entry_id, index as i64 + 1, line.account_id, line.side.as_str(), line.amount_minor, line.memo, now],
        )?;
    }
    transaction.commit()?;
    Ok(entry_id)
}
