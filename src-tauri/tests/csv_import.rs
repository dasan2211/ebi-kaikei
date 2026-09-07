use ebi_kaikei_lib::{
    application::{csv_export, csv_import, initial_setup},
    database::open_database,
    domain::{
        book::{BUSINESS_BOOK_ID, MISCELLANEOUS_BOOK_ID},
        journal_entry::{DraftJournalEntry, JournalLine, Side},
        reports::ReportPageRequest,
    },
    repository::journal_repository,
};

const HEADER: &str = "transaction_date,entry_id,status,description,line_number,side,account_code,account_name,amount_minor,memo\r\n";

fn setup() -> (tempfile::TempDir, rusqlite::Connection) {
    let directory = tempfile::tempdir().expect("temporary directory");
    let mut connection =
        open_database(&directory.path().join("import.sqlite")).expect("open database");
    initial_setup::complete(&mut connection, "en").expect("complete setup");
    (directory, connection)
}

#[test]
fn preview_and_import_create_balanced_drafts_atomically() {
    let (_directory, mut connection) = setup();
    let csv = format!(
        "{HEADER}2026-08-13,source-1,posted,\"Sale, online\",1,debit,1000,Cash,1500,store\r\n\
         2026-08-13,source-1,posted,\"Sale, online\",2,credit,4000,Sales,1500,\r\n"
    );

    let preview = csv_import::preview(&connection, BUSINESS_BOOK_ID, &csv).expect("preview import");
    assert_eq!(preview.entry_count, 1);
    assert_eq!(preview.line_count, 2);
    assert_eq!(preview.total_debit_minor, 1_500);
    assert_eq!(preview.total_credit_minor, 1_500);

    let result =
        csv_import::import(&mut connection, BUSINESS_BOOK_ID, &csv).expect("import journal CSV");
    assert_eq!(result.imported_entry_count, 1);
    let imported: (String, String, String) = connection
        .query_row(
            "SELECT status, source_type, source_id FROM journal_entries WHERE source_id = 'source-1'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("read imported entry");
    assert_eq!(
        imported,
        ("draft".into(), "csv_import".into(), "source-1".into())
    );

    let duplicate = csv_import::import(&mut connection, BUSINESS_BOOK_ID, &csv)
        .expect_err("reject duplicate import");
    assert!(duplicate.to_string().contains("already been imported"));
    let count: i64 = connection
        .query_row("SELECT COUNT(*) FROM journal_entries", [], |row| row.get(0))
        .expect("count entries");
    assert_eq!(count, 1);
}

#[test]
fn invalid_later_entries_do_not_partially_import() {
    let (_directory, mut connection) = setup();
    let csv = format!(
        "{HEADER}2026-08-13,valid,draft,Valid,1,debit,1000,Cash,100,\r\n\
         2026-08-13,valid,draft,Valid,2,credit,4000,Sales,100,\r\n\
         2026-08-14,invalid,draft,Invalid,1,debit,1000,Cash,200,\r\n\
         2026-08-14,invalid,draft,Invalid,2,credit,4000,Sales,100,\r\n"
    );

    csv_import::import(&mut connection, BUSINESS_BOOK_ID, &csv).expect_err("reject unbalanced CSV");
    let count: i64 = connection
        .query_row("SELECT COUNT(*) FROM journal_entries", [], |row| row.get(0))
        .expect("count entries");
    assert_eq!(count, 0);
}

#[test]
fn exported_journal_csv_can_be_imported_into_another_book() {
    let (_directory, mut connection) = setup();
    journal_repository::save_draft(
        &mut connection,
        BUSINESS_BOOK_ID,
        &DraftJournalEntry {
            transaction_date: "2026-08-13".to_owned(),
            description: "Round-trip sale".to_owned(),
            lines: vec![
                JournalLine {
                    account_id: "account-cash".to_owned(),
                    side: Side::Debit,
                    amount_minor: 500,
                    memo: None,
                    tax_code_id: None,
                },
                JournalLine {
                    account_id: "account-sales".to_owned(),
                    side: Side::Credit,
                    amount_minor: 500,
                    memo: None,
                    tax_code_id: None,
                },
            ],
        },
    )
    .expect("save source entry");
    let export = csv_export::journal_book(
        &connection,
        BUSINESS_BOOK_ID,
        &ReportPageRequest {
            start_date: None,
            end_date: None,
            status: None,
            query: None,
            limit: None,
            offset: None,
        },
    )
    .expect("export journal");

    let result = csv_import::import(&mut connection, MISCELLANEOUS_BOOK_ID, &export.content)
        .expect("import exported CSV");
    assert_eq!(result.imported_entry_count, 1);
    assert_eq!(result.imported_line_count, 2);
}
