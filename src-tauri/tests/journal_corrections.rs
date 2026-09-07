use ebi_kaikei_lib::{
    application::initial_setup,
    database::open_database,
    domain::{
        book::BUSINESS_BOOK_ID,
        journal_entry::{DraftJournalEntry, JournalLine, Side},
    },
    repository::journal_repository,
};
use rusqlite::{params, Connection};

fn setup() -> (tempfile::TempDir, Connection) {
    let directory = tempfile::tempdir().expect("create temporary directory");
    let mut connection =
        open_database(&directory.path().join("test.sqlite")).expect("open test database");
    initial_setup::complete(&mut connection, "ja").expect("complete initial setup");
    (directory, connection)
}

fn entry(date: &str, description: &str, amount_minor: i64) -> DraftJournalEntry {
    DraftJournalEntry {
        transaction_date: date.to_owned(),
        description: description.to_owned(),
        lines: vec![
            JournalLine {
                account_id: "account-cash".to_owned(),
                side: Side::Debit,
                amount_minor,
                memo: Some("cash line".to_owned()),
                tax_code_id: None,
            },
            JournalLine {
                account_id: "account-sales".to_owned(),
                side: Side::Credit,
                amount_minor,
                memo: None,
                tax_code_id: None,
            },
        ],
    }
}

fn save_and_post(connection: &mut Connection) -> String {
    let id = journal_repository::save_draft(
        connection,
        BUSINESS_BOOK_ID,
        &entry("2026-08-01", "Original sale", 1_000),
    )
    .expect("save original");
    journal_repository::post_entry(connection, BUSINESS_BOOK_ID, &id).expect("post original");
    id
}

#[test]
fn reversing_a_posted_entry_inserts_a_balancing_correction() {
    let (_directory, mut connection) = setup();
    let original_id = save_and_post(&mut connection);

    let result =
        journal_repository::reverse_entry(&mut connection, BUSINESS_BOOK_ID, &original_id, "ja")
            .expect("reverse posted entry");

    let original_status: String = connection
        .query_row(
            "SELECT status FROM journal_entries WHERE id = ?1",
            [&original_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(original_status, "reversed");

    let reversal: (String, String, String, Option<String>, String) = connection
        .query_row(
            "SELECT status, source_type, source_id, reversal_of_entry_id, description
             FROM journal_entries WHERE id = ?1",
            [&result.reversal_entry_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .unwrap();
    assert_eq!(reversal.0, "posted");
    assert_eq!(reversal.1, "correction_reversal");
    assert_eq!(reversal.2, original_id);
    assert_eq!(reversal.3.as_deref(), Some(original_id.as_str()));
    assert_eq!(reversal.4, "取消：Original sale");
    assert!(result.replacement_entry_id.is_none());

    let sides: Vec<(String, i64)> = connection
        .prepare(
            "SELECT side, amount_minor FROM journal_lines
             WHERE entry_id = ?1 ORDER BY line_number",
        )
        .unwrap()
        .query_map([&result.reversal_entry_id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(
        sides,
        vec![("credit".to_owned(), 1_000), ("debit".to_owned(), 1_000)]
    );
}

#[test]
fn revising_a_posted_entry_inserts_reversal_and_replacement_atomically() {
    let (_directory, mut connection) = setup();
    let original_id = save_and_post(&mut connection);
    let replacement = entry("2026-08-02", "Corrected sale", 1_500);

    let result = journal_repository::revise_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        &original_id,
        "en",
        &replacement,
    )
    .expect("revise posted entry");
    let replacement_id = result.replacement_entry_id.expect("replacement id");

    let replacement_row: (String, String, String, Option<String>) = connection
        .query_row(
            "SELECT transaction_date, description, status, source_id
             FROM journal_entries WHERE id = ?1",
            [&replacement_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap();
    assert_eq!(replacement_row.0, "2026-08-02");
    assert_eq!(replacement_row.1, "Corrected sale");
    assert_eq!(replacement_row.2, "posted");
    assert_eq!(replacement_row.3.as_deref(), Some(original_id.as_str()));

    let reversal_description: String = connection
        .query_row(
            "SELECT description FROM journal_entries WHERE id = ?1",
            [&result.reversal_entry_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(reversal_description, "Reversal: Original sale");

    let total: i64 = connection
        .query_row(
            "SELECT SUM(CASE WHEN jl.side = 'debit' THEN jl.amount_minor ELSE -jl.amount_minor END)
             FROM journal_lines jl
             INNER JOIN journal_entries je ON je.id = jl.entry_id
             WHERE je.id IN (?1, ?2, ?3)",
            params![original_id, result.reversal_entry_id, replacement_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(total, 0);
}

#[test]
fn draft_or_already_reversed_entries_cannot_be_corrected() {
    let (_directory, mut connection) = setup();
    let draft_id = journal_repository::save_draft(
        &mut connection,
        BUSINESS_BOOK_ID,
        &entry("2026-08-01", "Draft", 1_000),
    )
    .unwrap();
    assert!(
        journal_repository::reverse_entry(&mut connection, BUSINESS_BOOK_ID, &draft_id, "ja",)
            .is_err()
    );

    let posted_id = save_and_post(&mut connection);
    let reversal =
        journal_repository::reverse_entry(&mut connection, BUSINESS_BOOK_ID, &posted_id, "ja")
            .unwrap();
    assert!(
        journal_repository::reverse_entry(&mut connection, BUSINESS_BOOK_ID, &posted_id, "ja",)
            .is_err()
    );

    let error = journal_repository::reverse_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        &reversal.reversal_entry_id,
        "ja",
    )
    .expect_err("取消仕訳の再取消を拒否する");
    assert!(error.to_string().contains("取消仕訳"));
}
