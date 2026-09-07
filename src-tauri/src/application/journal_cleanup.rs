use crate::{
    application::attachments,
    error::{AppError, AppResult},
};
use chrono::{Datelike, NaiveDate};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JournalDeletionScope {
    CurrentMonth,
    FiscalYear,
    All,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalDeletionResult {
    pub deleted_entry_count: i64,
    pub deleted_attachment_count: i64,
    pub failed_attachment_file_count: i64,
}

pub fn delete(
    connection: &mut Connection,
    database_path: &Path,
    book_id: &str,
    scope: JournalDeletionScope,
    reference_date: NaiveDate,
    fiscal_year: i32,
) -> AppResult<JournalDeletionResult> {
    if !(1900..=9999).contains(&fiscal_year) {
        return Err(AppError::Validation(
            "会計年度は1900年から9999年の範囲で指定してください".into(),
        ));
    }

    let transaction = connection.transaction()?;
    let book_exists: i64 = transaction.query_row(
        "SELECT COUNT(*) FROM books WHERE id = ?1 AND is_active = 1",
        [book_id],
        |row| row.get(0),
    )?;
    if book_exists != 1 {
        return Err(AppError::Validation("選択した帳簿が見つかりません".into()));
    }

    transaction.execute_batch(
        "CREATE TEMP TABLE IF NOT EXISTS bulk_journal_deletion_ids (
             id TEXT PRIMARY KEY
         ) WITHOUT ROWID;
         DELETE FROM bulk_journal_deletion_ids;",
    )?;
    match scope {
        JournalDeletionScope::CurrentMonth => {
            let month = format!("{:04}-{:02}", reference_date.year(), reference_date.month());
            transaction.execute(
                "INSERT INTO bulk_journal_deletion_ids (id)
                 SELECT id FROM journal_entries
                 WHERE book_id = ?1 AND substr(transaction_date, 1, 7) = ?2",
                params![book_id, month],
            )?;
        }
        JournalDeletionScope::FiscalYear => {
            let year = format!("{fiscal_year:04}");
            transaction.execute(
                "INSERT INTO bulk_journal_deletion_ids (id)
                 SELECT id FROM journal_entries
                 WHERE book_id = ?1 AND substr(transaction_date, 1, 4) = ?2",
                params![book_id, year],
            )?;
        }
        JournalDeletionScope::All => {
            transaction.execute(
                "INSERT INTO bulk_journal_deletion_ids (id)
                 SELECT id FROM journal_entries WHERE book_id = ?1",
                [book_id],
            )?;
        }
    }

    let deleted_entry_count: i64 = transaction.query_row(
        "SELECT COUNT(*) FROM bulk_journal_deletion_ids",
        [],
        |row| row.get(0),
    )?;
    if deleted_entry_count == 0 {
        transaction.commit()?;
        return Ok(JournalDeletionResult {
            deleted_entry_count: 0,
            deleted_attachment_count: 0,
            failed_attachment_file_count: 0,
        });
    }

    let splits_reversal_pair: i64 = transaction.query_row(
        "SELECT
            EXISTS(
                SELECT 1 FROM journal_entries selected
                WHERE selected.id IN (SELECT id FROM bulk_journal_deletion_ids)
                  AND selected.reversal_of_entry_id IS NOT NULL
                  AND selected.reversal_of_entry_id NOT IN (SELECT id FROM bulk_journal_deletion_ids)
            ) OR EXISTS(
                SELECT 1 FROM journal_entries remaining
                WHERE remaining.id NOT IN (SELECT id FROM bulk_journal_deletion_ids)
                  AND remaining.reversal_of_entry_id IN (SELECT id FROM bulk_journal_deletion_ids)
            )",
        [],
        |row| row.get(0),
    )?;
    if splits_reversal_pair != 0 {
        return Err(AppError::Validation(
            "削除範囲の外に関連する訂正仕訳があります。関連する仕訳を含む広い範囲を選択してください"
                .into(),
        ));
    }

    let storage_names = {
        let mut statement = transaction.prepare(
            "SELECT storage_name FROM attachments
             WHERE entry_id IN (SELECT id FROM bulk_journal_deletion_ids)",
        )?;
        let names = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        names
    };
    let deleted_attachment_count = storage_names.len() as i64;
    let staged_files = stage_attachment_files(database_path, &storage_names)?;

    let deletion_result: Result<(), rusqlite::Error> = (|| {
        transaction.execute(
            "DELETE FROM fixed_asset_depreciations
             WHERE journal_entry_id IN (SELECT id FROM bulk_journal_deletion_ids)",
            [],
        )?;
        transaction.execute(
            "DELETE FROM inventory_counts
             WHERE journal_entry_id IN (SELECT id FROM bulk_journal_deletion_ids)",
            [],
        )?;
        transaction.execute(
            "DELETE FROM journal_entries
             WHERE id IN (SELECT id FROM bulk_journal_deletion_ids)",
            [],
        )?;
        Ok(())
    })();
    if let Err(error) = deletion_result {
        restore_staged_files(&staged_files);
        return Err(error.into());
    }
    if let Err(error) = transaction.commit() {
        restore_staged_files(&staged_files);
        return Err(error.into());
    }

    let failed_attachment_file_count = staged_files
        .iter()
        .filter(|(_, staged)| fs::remove_file(staged).is_err())
        .count() as i64;
    Ok(JournalDeletionResult {
        deleted_entry_count,
        deleted_attachment_count,
        failed_attachment_file_count,
    })
}

fn stage_attachment_files(
    database_path: &Path,
    storage_names: &[String],
) -> AppResult<Vec<(std::path::PathBuf, std::path::PathBuf)>> {
    if storage_names.is_empty() {
        return Ok(Vec::new());
    }
    let directory = attachments::attachment_directory(database_path)?;
    let mut staged_files = Vec::new();
    for storage_name in storage_names {
        let storage_path = Path::new(storage_name);
        if storage_path.file_name().and_then(|value| value.to_str()) != Some(storage_name.as_str())
            || storage_name.contains(['/', '\\', '\0'])
        {
            restore_staged_files(&staged_files);
            return Err(AppError::Validation(
                "証憑ファイルの保存名が不正です".into(),
            ));
        }
        let original = directory.join(storage_name);
        if !original.is_file() {
            continue;
        }
        let staged = directory.join(format!(".{storage_name}.bulk-delete-{}", Uuid::new_v4()));
        if let Err(error) = fs::rename(&original, &staged) {
            restore_staged_files(&staged_files);
            return Err(error.into());
        }
        staged_files.push((original, staged));
    }
    Ok(staged_files)
}

fn restore_staged_files(staged_files: &[(std::path::PathBuf, std::path::PathBuf)]) {
    for (original, staged) in staged_files.iter().rev() {
        if staged.is_file() {
            let _ = fs::rename(staged, original);
        }
    }
}
