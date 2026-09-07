use crate::error::{AppError, AppResult};
use chrono::{Duration, NaiveDate, Utc};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::time::Instant;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceDataResult {
    pub entry_count: usize,
    pub line_count: usize,
    pub elapsed_milliseconds: u128,
}

pub fn generate(
    connection: &mut Connection,
    book_id: &str,
    entry_count: usize,
) -> AppResult<PerformanceDataResult> {
    if !(1..=1_000_000).contains(&entry_count) {
        return Err(AppError::Validation(
            "Performance entry count must be between 1 and 1,000,000".into(),
        ));
    }
    let book_exists: i64 = connection.query_row(
        "SELECT COUNT(*) FROM books WHERE id = ?1 AND is_active = 1",
        [book_id],
        |row| row.get(0),
    )?;
    if book_exists != 1 {
        return Err(AppError::Validation(
            "The selected book does not exist".into(),
        ));
    }

    let started = Instant::now();
    let run_id = Uuid::new_v4().simple().to_string();
    let base_date = NaiveDate::from_ymd_opt(2025, 1, 1).expect("valid base date");
    let now = Utc::now().to_rfc3339();
    let transaction = connection.transaction()?;
    {
        let mut entry_statement = transaction.prepare(
            "INSERT INTO journal_entries
             (id, transaction_date, description, status, source_type, source_id, created_at, updated_at, book_id)
             VALUES (?1, ?2, ?3, 'posted', 'performance', ?4, ?5, ?5, ?6)",
        )?;
        let mut line_statement = transaction.prepare(
            "INSERT INTO journal_lines
             (id, entry_id, line_number, account_id, side, amount_minor, memo, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )?;
        for index in 0..entry_count {
            let entry_id = format!("perf-{run_id}-{index:07}");
            let date = base_date + Duration::days((index % 730) as i64);
            let amount = (index % 100_000 + 1) as i64;
            entry_statement.execute(params![
                entry_id,
                date.format("%Y-%m-%d").to_string(),
                format!("Performance sample entry {}", index + 1),
                format!("{run_id}-{index}"),
                now,
                book_id
            ])?;
            line_statement.execute(params![
                format!("perf-line-{run_id}-{index:07}-1"),
                entry_id,
                1,
                "account-cash",
                "debit",
                amount,
                "generated debit",
                now
            ])?;
            line_statement.execute(params![
                format!("perf-line-{run_id}-{index:07}-2"),
                entry_id,
                2,
                "account-sales",
                "credit",
                amount,
                "generated credit",
                now
            ])?;
        }
    }
    transaction.commit()?;

    Ok(PerformanceDataResult {
        entry_count,
        line_count: entry_count * 2,
        elapsed_milliseconds: started.elapsed().as_millis(),
    })
}
