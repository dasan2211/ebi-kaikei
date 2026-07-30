use crate::{
    domain::book::{Book, BookState, IncomeType, ACTIVE_BOOK_SETTING_KEY, BUSINESS_BOOK_ID},
    error::{AppError, AppResult},
};
use rusqlite::{params, Connection, OptionalExtension};

pub fn state(connection: &Connection) -> AppResult<BookState> {
    let mut statement = connection.prepare(
        "SELECT id, income_type FROM books WHERE is_active = 1 ORDER BY
         CASE income_type WHEN 'business' THEN 0 ELSE 1 END",
    )?;
    let books = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .map(|row| {
            let (id, income_type) = row?;
            Ok(Book {
                id,
                income_type: IncomeType::parse(&income_type)
                    .ok_or_else(|| AppError::Validation("不明な所得区分です".into()))?,
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
