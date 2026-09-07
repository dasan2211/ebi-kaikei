use crate::{
    database::LATEST_SCHEMA_VERSION,
    error::{AppError, AppResult},
};
use chrono::{DateTime, Utc};
use rusqlite::{backup::Progress, Connection, OpenFlags, MAIN_DB};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};
use uuid::Uuid;

const BACKUP_PREFIX: &str = "ebi-kaikei-backup-";
const AUTOMATIC_BACKUP_PREFIX: &str = "ebi-kaikei-auto-backup-";
const PRE_RESTORE_PREFIX: &str = "ebi-kaikei-pre-restore-";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub file_name: String,
    pub created_at: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub restored_file_name: String,
    pub safety_backup_file_name: String,
}

pub fn list(database_path: &Path) -> AppResult<Vec<BackupFile>> {
    list_snapshots_in_directory(&backup_directory(database_path)?)
}

pub fn list_in_directory(directory: &Path) -> AppResult<Vec<BackupFile>> {
    if !directory.exists() {
        return Ok(Vec::new());
    }

    let mut backups = fs::read_dir(directory)?
        .filter_map(Result::ok)
        .filter_map(|entry| backup_metadata(&entry.path()).transpose())
        .collect::<AppResult<Vec<_>>>()?;
    backups.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(backups)
}

pub fn list_snapshots_in_directory(directory: &Path) -> AppResult<Vec<BackupFile>> {
    Ok(list_in_directory(directory)?
        .into_iter()
        .filter(|backup| {
            backup.file_name.starts_with(BACKUP_PREFIX)
                || backup.file_name.starts_with(PRE_RESTORE_PREFIX)
        })
        .collect())
}

pub fn list_automatic_in_directory(directory: &Path) -> AppResult<Vec<BackupFile>> {
    Ok(list_in_directory(directory)?
        .into_iter()
        .filter(|backup| backup.file_name.starts_with(AUTOMATIC_BACKUP_PREFIX))
        .collect())
}

pub fn snapshot_directory(root: &Path) -> PathBuf {
    root.join("snapshots")
}

pub fn automatic_directory(root: &Path) -> PathBuf {
    root.join("automatic")
}

pub fn is_automatic_file_name(file_name: &str) -> bool {
    file_name.starts_with(AUTOMATIC_BACKUP_PREFIX) && file_name.ends_with(".sqlite")
}

pub fn create(connection: &Connection, database_path: &Path) -> AppResult<BackupFile> {
    create_in_directory(connection, database_path, &backup_directory(database_path)?)
}

pub fn create_in_directory(
    connection: &Connection,
    database_path: &Path,
    directory: &Path,
) -> AppResult<BackupFile> {
    create_with_prefix(connection, database_path, directory, BACKUP_PREFIX)
}

pub fn create_automatic(
    connection: &Connection,
    database_path: &Path,
    directory: &Path,
) -> AppResult<BackupFile> {
    create_with_prefix(
        connection,
        database_path,
        directory,
        AUTOMATIC_BACKUP_PREFIX,
    )
}

pub fn restore(
    connection: &mut Connection,
    database_path: &Path,
    file_name: &str,
) -> AppResult<RestoreResult> {
    restore_from_directory(
        connection,
        database_path,
        &backup_directory(database_path)?,
        file_name,
    )
}

pub fn restore_from_directory(
    connection: &mut Connection,
    database_path: &Path,
    directory: &Path,
    file_name: &str,
) -> AppResult<RestoreResult> {
    restore_from_directories(connection, database_path, directory, directory, file_name)
}

pub fn restore_from_directories(
    connection: &mut Connection,
    database_path: &Path,
    source_directory: &Path,
    safety_snapshot_directory: &Path,
    file_name: &str,
) -> AppResult<RestoreResult> {
    let source_path = checked_backup_path(source_directory, file_name)?;
    validate_backup_bundle(&source_path)?;
    let safety_backup = create_with_prefix(
        connection,
        database_path,
        safety_snapshot_directory,
        PRE_RESTORE_PREFIX,
    )?;

    let live_attachments = attachment_directory(database_path)?;
    let restore_stage = live_attachments
        .with_file_name(format!(".attachments-restore-{}", Uuid::new_v4().simple()));
    let previous_stage = live_attachments
        .with_file_name(format!(".attachments-previous-{}", Uuid::new_v4().simple()));
    copy_directory(&backup_attachment_directory(&source_path), &restore_stage)?;
    if live_attachments.exists() {
        fs::rename(&live_attachments, &previous_stage)?;
    }
    if let Err(error) = fs::rename(&restore_stage, &live_attachments) {
        if previous_stage.exists() {
            let _ = fs::rename(&previous_stage, &live_attachments);
        }
        return Err(error.into());
    }

    if let Err(error) = connection.restore(MAIN_DB, &source_path, None::<fn(Progress)>) {
        let _ = fs::remove_dir_all(&live_attachments);
        if previous_stage.exists() {
            let _ = fs::rename(&previous_stage, &live_attachments);
        }
        return Err(error.into());
    }
    connection.execute_batch(
        "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
    )?;
    validate_connection(connection)?;
    if previous_stage.exists() {
        fs::remove_dir_all(previous_stage)?;
    }

    Ok(RestoreResult {
        restored_file_name: file_name.to_owned(),
        safety_backup_file_name: safety_backup.file_name,
    })
}

fn create_with_prefix(
    connection: &Connection,
    database_path: &Path,
    directory: &Path,
    prefix: &str,
) -> AppResult<BackupFile> {
    fs::create_dir_all(directory)?;
    // Nanoseconds keep lexical filename order deterministic even when several
    // backups are created within the same second (for example during tests).
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S-%9f");
    let unique_id = Uuid::new_v4().simple().to_string();
    let file_name = format!("{prefix}{timestamp}-{}.sqlite", &unique_id[..8]);
    let final_path = directory.join(&file_name);
    let temporary_path = directory.join(format!(".{file_name}.tmp"));

    connection.backup(MAIN_DB, &temporary_path, None)?;
    if let Err(error) = validate_database(&temporary_path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }
    let temporary_attachments = directory.join(format!(".{file_name}.attachments.tmp"));
    let final_attachments = backup_attachment_directory(&final_path);
    if let Err(error) = copy_directory(
        &attachment_directory(database_path)?,
        &temporary_attachments,
    ) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }
    fs::rename(&temporary_path, &final_path)?;
    if let Err(error) = fs::rename(&temporary_attachments, &final_attachments) {
        let _ = fs::remove_file(&final_path);
        let _ = fs::remove_dir_all(&temporary_attachments);
        return Err(error.into());
    }
    if let Err(error) = validate_backup_bundle(&final_path) {
        let _ = fs::remove_file(&final_path);
        let _ = fs::remove_dir_all(&final_attachments);
        return Err(error);
    }
    backup_metadata(&final_path)?.ok_or_else(|| {
        AppError::Validation("The backup file could not be read after creation".into())
    })
}

pub fn backup_directory(database_path: &Path) -> AppResult<PathBuf> {
    database_path
        .parent()
        .map(|parent| parent.join("backups"))
        .ok_or_else(|| AppError::Validation("The database directory is unavailable".into()))
}

fn attachment_directory(database_path: &Path) -> AppResult<PathBuf> {
    database_path
        .parent()
        .map(|parent| parent.join("attachments"))
        .ok_or_else(|| AppError::Validation("The database directory is unavailable".into()))
}

fn backup_attachment_directory(backup_path: &Path) -> PathBuf {
    backup_path.with_file_name(format!(
        "{}.attachments",
        backup_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("backup.sqlite")
    ))
}

fn copy_directory(source: &Path, destination: &Path) -> AppResult<()> {
    if destination.exists() {
        fs::remove_dir_all(destination)?;
    }
    fs::create_dir_all(destination)?;
    if !source.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        if entry.file_type()?.is_file() {
            fs::copy(entry.path(), destination.join(entry.file_name()))?;
        }
    }
    Ok(())
}

fn checked_backup_path(directory: &Path, file_name: &str) -> AppResult<PathBuf> {
    let candidate = Path::new(file_name);
    if candidate.file_name().and_then(|value| value.to_str()) != Some(file_name)
        || !file_name.ends_with(".sqlite")
        || !(file_name.starts_with(BACKUP_PREFIX)
            || file_name.starts_with(AUTOMATIC_BACKUP_PREFIX)
            || file_name.starts_with(PRE_RESTORE_PREFIX))
    {
        return Err(AppError::Validation("Invalid backup file name".into()));
    }
    let path = directory.join(file_name);
    if !path.is_file() {
        return Err(AppError::Validation(
            "The selected backup does not exist".into(),
        ));
    }
    Ok(path)
}

fn backup_metadata(path: &Path) -> AppResult<Option<BackupFile>> {
    let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
        return Ok(None);
    };
    if !path.is_file()
        || !file_name.ends_with(".sqlite")
        || !(file_name.starts_with(BACKUP_PREFIX)
            || file_name.starts_with(AUTOMATIC_BACKUP_PREFIX)
            || file_name.starts_with(PRE_RESTORE_PREFIX))
    {
        return Ok(None);
    }
    let metadata = fs::metadata(path)?;
    let created_at = metadata
        .modified()
        .map(DateTime::<Utc>::from)
        .unwrap_or_else(|_| Utc::now())
        .to_rfc3339();
    Ok(Some(BackupFile {
        file_name: file_name.to_owned(),
        created_at,
        size_bytes: metadata.len(),
    }))
}

pub fn prune_automatic(directory: &Path, retention_count: usize) -> AppResult<()> {
    let mut paths = if directory.is_dir() {
        fs::read_dir(directory)?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.is_file()
                    && path
                        .file_name()
                        .and_then(|value| value.to_str())
                        .is_some_and(|name| {
                            name.starts_with(AUTOMATIC_BACKUP_PREFIX) && name.ends_with(".sqlite")
                        })
            })
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    paths.sort_by(|left, right| right.file_name().cmp(&left.file_name()));
    for path in paths.into_iter().skip(retention_count) {
        fs::remove_file(&path)?;
        let attachments = backup_attachment_directory(&path);
        if attachments.exists() {
            fs::remove_dir_all(attachments)?;
        }
    }
    Ok(())
}

fn validate_database(path: &Path) -> AppResult<()> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    validate_connection(&connection)
}

fn validate_backup_bundle(path: &Path) -> AppResult<()> {
    validate_database(path)?;
    let attachments = backup_attachment_directory(path);
    if !attachments.is_dir() {
        return Err(AppError::Validation(
            "The backup attachment directory is missing".into(),
        ));
    }
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut statement = connection.prepare("SELECT storage_name, size_bytes FROM attachments")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, u64>(1)?))
    })?;
    for row in rows {
        let (storage_name, expected_size) = row?;
        if Path::new(&storage_name)
            .file_name()
            .and_then(|value| value.to_str())
            != Some(storage_name.as_str())
        {
            return Err(AppError::Validation(
                "The backup contains an invalid attachment path".into(),
            ));
        }
        let file = attachments.join(storage_name);
        if !file.is_file() || fs::metadata(file)?.len() != expected_size {
            return Err(AppError::Validation(
                "A backup attachment is missing or incomplete".into(),
            ));
        }
    }
    Ok(())
}

fn validate_connection(connection: &Connection) -> AppResult<()> {
    let quick_check: String = connection.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
    if quick_check != "ok" {
        return Err(AppError::Validation(format!(
            "SQLite integrity check failed: {quick_check}"
        )));
    }
    let version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version != LATEST_SCHEMA_VERSION {
        return Err(AppError::Validation(format!(
            "Unsupported backup schema version: {version}"
        )));
    }
    let required_tables: i64 = connection.query_row(
        "SELECT COUNT(*) FROM sqlite_master
         WHERE type = 'table' AND name IN ('accounts', 'books', 'book_accounts', 'journal_entries', 'journal_lines')",
        [],
        |row| row.get(0),
    )?;
    if required_tables != 5 {
        return Err(AppError::Validation(
            "The selected file is not an EBI Kaikei database".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{application::initial_setup, database::open_database};

    #[test]
    fn backup_and_restore_replace_the_live_database_safely() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let database_path = directory.path().join("accounting.sqlite");
        let mut connection = open_database(&database_path).expect("open database");
        initial_setup::complete(&mut connection, "en").expect("complete setup");

        connection
            .execute(
                "UPDATE accounts SET name = 'Before backup' WHERE id = 'account-cash'",
                [],
            )
            .expect("change account");
        let backup = create(&connection, &database_path).expect("create backup");
        connection
            .execute(
                "UPDATE accounts SET name = 'After backup' WHERE id = 'account-cash'",
                [],
            )
            .expect("change account again");

        let result =
            restore(&mut connection, &database_path, &backup.file_name).expect("restore backup");
        let name: String = connection
            .query_row(
                "SELECT name FROM accounts WHERE id = 'account-cash'",
                [],
                |row| row.get(0),
            )
            .expect("read restored account");

        assert_eq!(name, "Before backup");
        assert!(result
            .safety_backup_file_name
            .starts_with(PRE_RESTORE_PREFIX));
        assert_eq!(list(&database_path).expect("list backups").len(), 2);
    }

    #[test]
    fn restore_rejects_paths_outside_the_backup_directory() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let database_path = directory.path().join("accounting.sqlite");
        let mut connection = open_database(&database_path).expect("open database");
        let error = restore(&mut connection, &database_path, "../outside.sqlite")
            .expect_err("reject traversal");
        assert!(error.to_string().contains("Invalid backup file name"));
    }
}
