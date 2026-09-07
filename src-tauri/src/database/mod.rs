use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use std::{path::Path, sync::Mutex};

const BASELINE_MIGRATION: &str = include_str!("migrations/0001_init.sql");
pub const LATEST_SCHEMA_VERSION: i64 = 14;

pub struct Database {
    pub connection: Mutex<Connection>,
}

impl Database {
    pub fn new(connection: Connection) -> Self {
        Self {
            connection: Mutex::new(connection),
        }
    }
}

pub fn open_database(path: &Path) -> AppResult<Connection> {
    let mut connection = Connection::open(path)?;
    connection.execute_batch(
        "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
    )?;
    let version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    match version {
        0 => apply_migration(&mut connection, BASELINE_MIGRATION)?,
        LATEST_SCHEMA_VERSION => {}
        version => {
            return Err(AppError::Validation(format!(
                "未対応のデータベーススキーマです（version {version}）。開発用DBを削除して再作成してください"
            )));
        }
    }
    Ok(connection)
}

fn apply_migration(connection: &mut Connection, sql: &str) -> AppResult<()> {
    let transaction = connection.transaction()?;
    transaction.execute_batch(sql)?;
    transaction.commit()?;
    Ok(())
}
