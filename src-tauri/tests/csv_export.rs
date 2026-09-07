use ebi_kaikei_lib::{
    application::{csv_export, initial_setup},
    database::open_database,
    domain::{
        book::{BUSINESS_BOOK_ID, MISCELLANEOUS_BOOK_ID},
        journal_entry::{DraftJournalEntry, JournalLine, Side},
        reports::ReportPageRequest,
    },
    repository::journal_repository,
};

fn setup() -> (tempfile::TempDir, rusqlite::Connection) {
    let directory = tempfile::tempdir().expect("temporary directory");
    let mut connection =
        open_database(&directory.path().join("export.sqlite")).expect("open database");
    initial_setup::complete(&mut connection, "en").expect("complete setup");
    (directory, connection)
}

fn save_entry(
    connection: &mut rusqlite::Connection,
    book_id: &str,
    transaction_date: &str,
    description: &str,
) {
    journal_repository::save_draft(
        connection,
        book_id,
        &DraftJournalEntry {
            transaction_date: transaction_date.to_owned(),
            description: description.to_owned(),
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
    .expect("save journal entry");
}

#[test]
fn journal_export_includes_all_filtered_entries_from_the_selected_book() {
    let (_directory, mut connection) = setup();
    save_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-04-01",
        "Export target one",
    );
    save_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-05-01",
        "Export target two",
    );
    save_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2025-12-31",
        "Export target outside period",
    );
    save_entry(
        &mut connection,
        MISCELLANEOUS_BOOK_ID,
        "2026-06-01",
        "Export target from another book",
    );

    let export = csv_export::journal_book(
        &connection,
        BUSINESS_BOOK_ID,
        &ReportPageRequest {
            start_date: Some("2026-01-01".to_owned()),
            end_date: Some("2026-12-31".to_owned()),
            status: Some("draft".to_owned()),
            query: Some("Export target".to_owned()),
            // CSV export must include every match, regardless of the current UI page.
            limit: Some(1),
            offset: Some(1),
        },
    )
    .expect("export journal CSV");

    assert!(export.content.starts_with('\u{feff}'));
    assert_eq!(export.row_count, 4);
    assert_eq!(export.content.lines().count(), 5);
    assert!(export.content.contains("Export target one"));
    assert!(export.content.contains("Export target two"));
    assert!(!export.content.contains("Export target outside period"));
    assert!(!export.content.contains("Export target from another book"));
}
