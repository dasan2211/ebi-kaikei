use crate::{
    application::backup::{self, BackupFile},
    error::{AppError, AppResult},
};
use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

const ENABLED_KEY: &str = "automatic_backup_enabled";
const INTERVAL_KEY: &str = "automatic_backup_interval_minutes";
const RETENTION_KEY: &str = "automatic_backup_retention_count";
const DESTINATION_KEY: &str = "automatic_backup_destination_directory";
const LAST_BACKUP_AT_KEY: &str = "automatic_backup_last_backup_at";
const LAST_ERROR_KEY: &str = "automatic_backup_last_error";

pub const DEFAULT_INTERVAL_MINUTES: u32 = 60;
pub const DEFAULT_RETENTION_COUNT: u32 = 10;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomaticBackupSettings {
    pub enabled: bool,
    pub interval_minutes: u32,
    pub retention_count: u32,
    pub destination_directory: String,
    pub last_backup_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomaticBackupSettingsInput {
    pub enabled: bool,
    pub interval_minutes: u32,
    pub retention_count: u32,
    pub destination_directory: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomaticBackupRunResult {
    pub backup: Option<BackupFile>,
    pub error: Option<String>,
}

pub fn settings(
    connection: &Connection,
    database_path: &Path,
) -> AppResult<AutomaticBackupSettings> {
    let default_directory = backup::backup_directory(database_path)?;
    Ok(AutomaticBackupSettings {
        enabled: setting(connection, ENABLED_KEY)?.is_some_and(|value| value == "true"),
        interval_minutes: setting(connection, INTERVAL_KEY)?
            .and_then(|value| value.parse().ok())
            .unwrap_or(DEFAULT_INTERVAL_MINUTES),
        retention_count: setting(connection, RETENTION_KEY)?
            .and_then(|value| value.parse().ok())
            .unwrap_or(DEFAULT_RETENTION_COUNT),
        destination_directory: setting(connection, DESTINATION_KEY)?
            .unwrap_or_else(|| default_directory.to_string_lossy().into_owned()),
        last_backup_at: setting(connection, LAST_BACKUP_AT_KEY)?,
        last_error: setting(connection, LAST_ERROR_KEY)?,
    })
}

pub fn save_settings(
    connection: &Connection,
    database_path: &Path,
    input: &AutomaticBackupSettingsInput,
) -> AppResult<AutomaticBackupSettings> {
    if !matches!(
        input.interval_minutes,
        15 | 30 | 60 | 180 | 360 | 720 | 1440
    ) {
        return Err(AppError::Validation(
            "Automatic backup interval is invalid".into(),
        ));
    }
    if !(1..=1000).contains(&input.retention_count) {
        return Err(AppError::Validation(
            "Automatic backup retention count must be between 1 and 1000".into(),
        ));
    }
    let destination = input.destination_directory.trim();
    if destination.is_empty() || !Path::new(destination).is_absolute() {
        return Err(AppError::Validation(
            "The backup destination must be an absolute directory path".into(),
        ));
    }
    fs::create_dir_all(destination)?;
    if !Path::new(destination).is_dir() {
        return Err(AppError::Validation(
            "The backup destination is not a directory".into(),
        ));
    }

    let previous = settings(connection, database_path)?;
    let updated_at = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES
            (?1, ?2, ?9), (?3, ?4, ?9), (?5, ?6, ?9), (?7, ?8, ?9)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![
            ENABLED_KEY,
            input.enabled.to_string(),
            INTERVAL_KEY,
            input.interval_minutes.to_string(),
            RETENTION_KEY,
            input.retention_count.to_string(),
            DESTINATION_KEY,
            destination,
            updated_at,
        ],
    )?;
    if (!previous.enabled && input.enabled)
        || previous.destination_directory != destination
        || previous.interval_minutes != input.interval_minutes
    {
        connection.execute(
            "DELETE FROM app_settings WHERE key IN (?1, ?2)",
            params![LAST_BACKUP_AT_KEY, LAST_ERROR_KEY],
        )?;
    }
    settings(connection, database_path)
}

pub fn run_if_due_at(
    connection: &Connection,
    database_path: &Path,
    now: DateTime<Utc>,
) -> AppResult<AutomaticBackupRunResult> {
    let current = settings(connection, database_path)?;
    if !current.enabled || !is_due(&current, now) {
        return Ok(AutomaticBackupRunResult {
            backup: None,
            error: None,
        });
    }

    let destination_root = Path::new(&current.destination_directory);
    let destination = backup::automatic_directory(destination_root);
    match backup::create_automatic(connection, database_path, &destination) {
        Ok(created) => {
            let cleanup_error =
                backup::prune_automatic(&destination, current.retention_count as usize)
                    .err()
                    .map(|error| error.to_string());
            set_runtime_status(
                connection,
                Some(&now.to_rfc3339()),
                cleanup_error.as_deref(),
            )?;
            Ok(AutomaticBackupRunResult {
                backup: Some(created),
                error: cleanup_error,
            })
        }
        Err(error) => {
            let message = error.to_string();
            set_runtime_status(connection, None, Some(&message))?;
            Ok(AutomaticBackupRunResult {
                backup: None,
                error: Some(message),
            })
        }
    }
}

fn is_due(settings: &AutomaticBackupSettings, now: DateTime<Utc>) -> bool {
    let Some(last_backup_at) = settings
        .last_backup_at
        .as_deref()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Utc))
    else {
        return true;
    };
    now >= last_backup_at + Duration::minutes(i64::from(settings.interval_minutes))
}

fn setting(connection: &Connection, key: &str) -> AppResult<Option<String>> {
    Ok(connection
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()?)
}

fn set_runtime_status(
    connection: &Connection,
    last_backup_at: Option<&str>,
    last_error: Option<&str>,
) -> AppResult<()> {
    let updated_at = Utc::now().to_rfc3339();
    if let Some(value) = last_backup_at {
        set_setting(connection, LAST_BACKUP_AT_KEY, value, &updated_at)?;
    }
    match last_error {
        Some(value) => set_setting(connection, LAST_ERROR_KEY, value, &updated_at)?,
        None => {
            connection.execute("DELETE FROM app_settings WHERE key = ?1", [LAST_ERROR_KEY])?;
        }
    }
    Ok(())
}

fn set_setting(connection: &Connection, key: &str, value: &str, updated_at: &str) -> AppResult<()> {
    connection.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, updated_at],
    )?;
    Ok(())
}
