use crate::{
    domain::book::{
        Book, BookState, ConsumptionTaxStatus, ACTIVE_BOOK_SETTING_KEY, BUSINESS_BOOK_ID,
    },
    error::{AppError, AppResult},
};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

pub fn state(connection: &Connection) -> AppResult<BookState> {
    let mut statement = connection.prepare(
        "SELECT id, name, consumption_tax_status FROM books
         WHERE is_active = 1 ORDER BY created_at, id",
    )?;
    let books = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .map(|row| {
            let (id, name, consumption_tax_status) = row?;
            Ok(Book {
                id,
                name,
                consumption_tax_status: ConsumptionTaxStatus::parse(&consumption_tax_status)
                    .ok_or_else(|| AppError::Validation("Invalid consumption tax status".into()))?,
            })
        })
        .collect::<AppResult<Vec<_>>>()?;

    let stored_active_book_id = connection
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [ACTIVE_BOOK_SETTING_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .unwrap_or_else(|| BUSINESS_BOOK_ID.to_owned());
    let active_book_id = books
        .iter()
        .find(|book| book.id == stored_active_book_id)
        .map(|book| book.id.clone())
        .or_else(|| books.first().map(|book| book.id.clone()))
        .unwrap_or_else(|| BUSINESS_BOOK_ID.to_owned());

    Ok(BookState {
        books,
        active_book_id,
    })
}

pub fn create(connection: &mut Connection, name: &str) -> AppResult<BookState> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Validation("帳簿名を入力してください".into()));
    }
    if name.chars().count() > 100 {
        return Err(AppError::Validation(
            "帳簿名は100文字以内で入力してください".into(),
        ));
    }

    let transaction = connection.transaction()?;
    let book_id = format!("book-{}", Uuid::new_v4());
    transaction.execute(
        "INSERT INTO books
         (id, name, is_active, consumption_tax_status, created_at, updated_at)
         VALUES (?1, ?2, 1, 'taxable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        params![book_id, name],
    )?;
    transaction.execute(
        "INSERT INTO book_accounts (book_id, account_id, is_active, created_at)
         SELECT ?1, id, 1, CURRENT_TIMESTAMP FROM accounts WHERE is_active = 1",
        [&book_id],
    )?;
    transaction.execute(
        "INSERT INTO app_settings (key, value, updated_at)
         VALUES (?1, ?2, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
        params![ACTIVE_BOOK_SETTING_KEY, book_id],
    )?;
    transaction.commit()?;
    state(connection)
}

pub fn delete(connection: &mut Connection, book_id: &str) -> AppResult<BookState> {
    let transaction = connection.transaction()?;
    let exists: i64 = transaction.query_row(
        "SELECT COUNT(*) FROM books WHERE id = ?1 AND is_active = 1",
        [book_id],
        |row| row.get(0),
    )?;
    if exists != 1 {
        return Err(AppError::Validation("選択した帳簿が見つかりません".into()));
    }

    let book_count: i64 = transaction.query_row(
        "SELECT COUNT(*) FROM books WHERE is_active = 1",
        [],
        |row| row.get(0),
    )?;
    if book_count <= 1 {
        return Err(AppError::Validation("最後の1冊は削除できません".into()));
    }

    let has_accounting_data: i64 = transaction.query_row(
        "SELECT
            EXISTS(SELECT 1 FROM journal_entries WHERE book_id = ?1) OR
            EXISTS(SELECT 1 FROM fixed_assets WHERE book_id = ?1) OR
            EXISTS(SELECT 1 FROM inventory_counts WHERE book_id = ?1) OR
            EXISTS(SELECT 1 FROM attachments WHERE book_id = ?1) OR
            EXISTS(SELECT 1 FROM journal_templates WHERE book_id = ?1)",
        [book_id],
        |row| row.get(0),
    )?;
    if has_accounting_data != 0 {
        return Err(AppError::Validation(
            "仕訳などの会計データがある帳簿は削除できません".into(),
        ));
    }

    let stored_active_book_id = transaction
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [ACTIVE_BOOK_SETTING_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    if stored_active_book_id.as_deref() == Some(book_id) {
        let next_book_id: String = transaction.query_row(
            "SELECT id FROM books
             WHERE is_active = 1 AND id <> ?1
             ORDER BY created_at, id LIMIT 1",
            [book_id],
            |row| row.get(0),
        )?;
        transaction.execute(
            "INSERT INTO app_settings (key, value, updated_at)
             VALUES (?1, ?2, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
            params![ACTIVE_BOOK_SETTING_KEY, next_book_id],
        )?;
    }
    transaction.execute("DELETE FROM books WHERE id = ?1", [book_id])?;
    transaction.commit()?;
    state(connection)
}

pub fn set_active(connection: &Connection, book_id: &str) -> AppResult<BookState> {
    let exists: i64 = connection.query_row(
        "SELECT COUNT(*) FROM books WHERE id = ?1 AND is_active = 1",
        [book_id],
        |row| row.get(0),
    )?;
    if exists != 1 {
        return Err(AppError::Validation("選択した帳簿が見つかりません".into()));
    }

    connection.execute(
        "INSERT INTO app_settings (key, value, updated_at)
         VALUES (?1, ?2, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
        params![ACTIVE_BOOK_SETTING_KEY, book_id],
    )?;
    state(connection)
}

pub fn set_consumption_tax_status(
    connection: &Connection,
    book_id: &str,
    consumption_tax_status: ConsumptionTaxStatus,
) -> AppResult<BookState> {
    let updated = connection.execute(
        "UPDATE books
         SET consumption_tax_status = ?1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND is_active = 1",
        params![consumption_tax_status.as_str(), book_id],
    )?;
    if updated != 1 {
        return Err(AppError::Validation(
            "The selected book was not found".into(),
        ));
    }
    state(connection)
}
