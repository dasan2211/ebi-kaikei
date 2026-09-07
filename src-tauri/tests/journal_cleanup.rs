use chrono::NaiveDate;
use ebi_kaikei_lib::{
    application::{
        attachments, initial_setup,
        journal_cleanup::{self, JournalDeletionScope},
    },
    database::open_database,
    domain::{
        book::{BUSINESS_BOOK_ID, MISCELLANEOUS_BOOK_ID},
        journal_entry::{DraftJournalEntry, JournalLine, Side},
    },
    repository::journal_repository,
};
use rusqlite::{params, Connection};

fn setup() -> (tempfile::TempDir, std::path::PathBuf, Connection) {
    let directory = tempfile::tempdir().expect("create temporary directory");
    let path = directory.path().join("ebi-kaikei.sqlite");
    let mut connection = open_database(&path).expect("open database");
    initial_setup::complete(&mut connection, "ja").expect("complete setup");
    (directory, path, connection)
}

fn save_entry(connection: &mut Connection, book_id: &str, date: &str, description: &str) -> String {
    journal_repository::save_draft(
        connection,
        book_id,
        &DraftJournalEntry {
            transaction_date: date.to_owned(),
            description: description.to_owned(),
            lines: vec![
                JournalLine {
                    account_id: "account-cash".to_owned(),
                    side: Side::Debit,
                    amount_minor: 1_000,
                    memo: None,
                    tax_code_id: None,
                },
                JournalLine {
                    account_id: "account-sales".to_owned(),
                    side: Side::Credit,
                    amount_minor: 1_000,
                    memo: None,
                    tax_code_id: None,
                },
            ],
        },
    )
    .expect("save journal entry")
}

#[test]
fn journal_entries_can_be_deleted_by_month_fiscal_year_and_all_without_touching_other_books() {
    let (_directory, database_path, mut connection) = setup();
    let month_entry = save_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-08-03",
        "this month",
    );
    let year_entry = save_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-03-10",
        "this fiscal year",
    );
    save_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2025-12-31",
        "before this fiscal year",
    );
    save_entry(
        &mut connection,
        MISCELLANEOUS_BOOK_ID,
        "2026-08-03",
        "another book",
    );

    let attachment = attachments::add(
        &connection,
        &database_path,
        BUSINESS_BOOK_ID,
        &month_entry,
        "receipt.pdf",
        b"%PDF-1.7 journal cleanup",
    )
    .expect("add attachment");
    let storage_name: String = connection
        .query_row(
            "SELECT storage_name FROM attachments WHERE id = ?1",
            [&attachment.id],
            |row| row.get(0),
        )
        .expect("read attachment storage name");

    connection
        .execute(
            "INSERT INTO fixed_assets
             (id, book_id, name, asset_account_id, acquisition_date, acquisition_cost_minor,
              residual_value_minor, useful_life_years, depreciation_method, status, created_at, updated_at)
             VALUES ('asset-cleanup', ?1, 'Cleanup asset', 'account-equipment', '2025-01-01',
                     120000, 0, 5, 'straight_line', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [BUSINESS_BOOK_ID],
        )
        .expect("insert fixed asset");
    connection
        .execute(
            "INSERT INTO fixed_asset_depreciations
             (id, asset_id, fiscal_year, amount_minor, journal_entry_id, created_at)
             VALUES ('depreciation-cleanup', 'asset-cleanup', 2026, 1000, ?1, CURRENT_TIMESTAMP)",
            [&year_entry],
        )
        .expect("insert depreciation record");
    connection
        .execute(
            "INSERT INTO inventory_counts
             (id, book_id, fiscal_year, count_date, beginning_inventory_minor,
              ending_inventory_minor, journal_entry_id, created_at)
             VALUES ('inventory-cleanup', ?1, 2026, '2026-12-31', 0, 0, ?2, CURRENT_TIMESTAMP)",
            params![BUSINESS_BOOK_ID, year_entry],
        )
        .expect("insert inventory count");

    let month_result = journal_cleanup::delete(
        &mut connection,
        &database_path,
        BUSINESS_BOOK_ID,
        JournalDeletionScope::CurrentMonth,
        NaiveDate::from_ymd_opt(2026, 8, 26).unwrap(),
        2026,
    )
    .expect("delete current month entries");
    assert_eq!(month_result.deleted_entry_count, 1);
    assert_eq!(month_result.deleted_attachment_count, 1);
    assert!(!database_path
        .parent()
        .unwrap()
        .join("attachments")
        .join(storage_name)
        .exists());

    let year_result = journal_cleanup::delete(
        &mut connection,
        &database_path,
        BUSINESS_BOOK_ID,
        JournalDeletionScope::FiscalYear,
        NaiveDate::from_ymd_opt(2026, 8, 26).unwrap(),
        2026,
    )
    .expect("delete fiscal year entries");
    assert_eq!(year_result.deleted_entry_count, 1);
    let dependent_count: i64 = connection
        .query_row(
            "SELECT
                (SELECT COUNT(*) FROM fixed_asset_depreciations WHERE journal_entry_id = ?1) +
                (SELECT COUNT(*) FROM inventory_counts WHERE journal_entry_id = ?1)",
            [&year_entry],
            |row| row.get(0),
        )
        .expect("count dependent rows");
    assert_eq!(dependent_count, 0);

    let all_result = journal_cleanup::delete(
        &mut connection,
        &database_path,
        BUSINESS_BOOK_ID,
        JournalDeletionScope::All,
        NaiveDate::from_ymd_opt(2026, 8, 26).unwrap(),
        2026,
    )
    .expect("delete all remaining entries");
    assert_eq!(all_result.deleted_entry_count, 1);

    let business_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM journal_entries WHERE book_id = ?1",
            [BUSINESS_BOOK_ID],
            |row| row.get(0),
        )
        .unwrap();
    let other_book_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM journal_entries WHERE book_id = ?1",
            [MISCELLANEOUS_BOOK_ID],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(business_count, 0);
    assert_eq!(other_book_count, 1);
}

#[test]
fn a_partial_range_cannot_split_a_reversal_pair() {
    let (_directory, database_path, mut connection) = setup();
    let original = save_entry(&mut connection, BUSINESS_BOOK_ID, "2025-12-31", "original");
    let reversal = save_entry(&mut connection, BUSINESS_BOOK_ID, "2026-01-01", "reversal");
    connection
        .execute(
            "UPDATE journal_entries SET reversal_of_entry_id = ?1 WHERE id = ?2",
            params![original, reversal],
        )
        .expect("link reversal pair");

    let error = journal_cleanup::delete(
        &mut connection,
        &database_path,
        BUSINESS_BOOK_ID,
        JournalDeletionScope::FiscalYear,
        NaiveDate::from_ymd_opt(2026, 8, 26).unwrap(),
        2026,
    )
    .expect_err("reject splitting a reversal pair");

    assert!(error.to_string().contains("訂正仕訳"));
    let count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM journal_entries WHERE book_id = ?1",
            [BUSINESS_BOOK_ID],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 2);

    let result = journal_cleanup::delete(
        &mut connection,
        &database_path,
        BUSINESS_BOOK_ID,
        JournalDeletionScope::All,
        NaiveDate::from_ymd_opt(2026, 8, 26).unwrap(),
        2026,
    )
    .expect("delete the complete reversal pair with the all scope");
    assert_eq!(result.deleted_entry_count, 2);
}
