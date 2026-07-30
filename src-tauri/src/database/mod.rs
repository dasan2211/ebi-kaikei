use crate::error::AppResult;
use rusqlite::Connection;
use std::{path::Path, sync::Mutex};

const INITIAL_MIGRATION: &str = include_str!("migrations/0001_init.sql");
const INITIAL_SETUP_MIGRATION: &str = include_str!("migrations/0002_initial_setup.sql");
const BOOKS_SCHEMA_MIGRATION: &str = include_str!("migrations/0003_books_schema.sql");
const BOOKS_BACKFILL_MIGRATION: &str = include_str!("migrations/0004_books_backfill.sql");

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
    if version < 1 {
        apply_migration(&mut connection, INITIAL_MIGRATION)?;
    }
    if version < 2 {
        apply_migration(&mut connection, INITIAL_SETUP_MIGRATION)?;
    }
    if version < 3 {
        apply_migration(&mut connection, BOOKS_SCHEMA_MIGRATION)?;
    }
    if version < 4 {
        apply_migration(&mut connection, BOOKS_BACKFILL_MIGRATION)?;
    }
    Ok(connection)
}

fn apply_migration(connection: &mut Connection, sql: &str) -> AppResult<()> {
    let transaction = connection.transaction()?;
    transaction.execute_batch(sql)?;
    transaction.commit()?;
    Ok(())
}
