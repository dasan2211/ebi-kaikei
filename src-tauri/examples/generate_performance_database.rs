use ebi_kaikei_lib::{
    application::{initial_setup, performance_data},
    database::open_database,
    domain::{
        book::BUSINESS_BOOK_ID,
        reports::{GeneralLedgerRequest, ReportPageRequest},
    },
    repository::reports_repository,
};
use serde_json::json;
use std::{env, fs, io, path::PathBuf, time::Instant};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = env::args().nth(1).map(PathBuf::from).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "usage: generate_performance_database <new-database-path> [entry-count]",
        )
    })?;
    let entry_count = env::args()
        .nth(2)
        .map(|value| value.parse::<usize>())
        .transpose()?
        .unwrap_or(100_000);
    if path.exists() {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            format!("refusing to overwrite existing file: {}", path.display()),
        )
        .into());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut connection = open_database(&path)?;
    initial_setup::complete(&mut connection, "ja")?;
    let generation = performance_data::generate(&mut connection, BUSINESS_BOOK_ID, entry_count)?;

    let journal_started = Instant::now();
    let journal = reports_repository::list_journal_book(
        &connection,
        BUSINESS_BOOK_ID,
        &ReportPageRequest {
            start_date: None,
            end_date: None,
            status: None,
            query: None,
            limit: Some(100),
            offset: Some(0),
        },
    )?;
    let journal_ms = journal_started.elapsed().as_millis();

    let ledger_started = Instant::now();
    let ledger = reports_repository::list_general_ledger(
        &connection,
        BUSINESS_BOOK_ID,
        &GeneralLedgerRequest {
            account_id: "account-cash".to_owned(),
            start_date: None,
            end_date: None,
            status: None,
            query: None,
            limit: Some(100),
            offset: Some(0),
        },
    )?;
    let ledger_ms = ledger_started.elapsed().as_millis();

    let trial_started = Instant::now();
    let trial = reports_repository::get_trial_balance(
        &connection,
        BUSINESS_BOOK_ID,
        &ReportPageRequest {
            start_date: None,
            end_date: None,
            status: None,
            query: None,
            limit: Some(100),
            offset: Some(0),
        },
    )?;
    let trial_ms = trial_started.elapsed().as_millis();
    connection.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "databasePath": path,
            "databaseSizeBytes": fs::metadata(&path)?.len(),
            "generation": generation,
            "queries": {
                "journalBookFirstPageMilliseconds": journal_ms,
                "journalBookTotal": journal.total,
                "generalLedgerFirstPageMilliseconds": ledger_ms,
                "generalLedgerTotal": ledger.total,
                "trialBalanceMilliseconds": trial_ms,
                "trialBalanceRows": trial.total
            }
        }))?
    );
    Ok(())
}
