use ebi_kaikei_lib::{
    application::{attachments, backup, initial_setup},
    database::open_database,
    domain::{
        book::BUSINESS_BOOK_ID,
        journal_entry::{DraftJournalEntry, JournalLine, Side},
        phase4::{CreateFixedAssetRequest, InventoryAdjustmentRequest},
    },
    repository::{journal_repository, phase4_repository},
};
use rusqlite::{params, Connection};

fn setup() -> (tempfile::TempDir, std::path::PathBuf, Connection) {
    let directory = tempfile::tempdir().expect("create temporary directory");
    let path = directory.path().join("ebi-kaikei.sqlite");
    let mut connection = open_database(&path).expect("open database");
    initial_setup::complete(&mut connection, "en").expect("complete setup");
    (directory, path, connection)
}

fn save_entry(
    connection: &mut Connection,
    date: &str,
    debit_account: &str,
    credit_account: &str,
    amount: i64,
    credit_tax_code: Option<&str>,
) -> String {
    journal_repository::save_draft(
        connection,
        BUSINESS_BOOK_ID,
        &DraftJournalEntry {
            transaction_date: date.to_owned(),
            description: "Phase 4 test entry".to_owned(),
            lines: vec![
                JournalLine {
                    account_id: debit_account.to_owned(),
                    side: Side::Debit,
                    amount_minor: amount,
                    memo: None,
                    tax_code_id: None,
                },
                JournalLine {
                    account_id: credit_account.to_owned(),
                    side: Side::Credit,
                    amount_minor: amount,
                    memo: None,
                    tax_code_id: credit_tax_code.map(str::to_owned),
                },
            ],
        },
    )
    .expect("save journal entry")
}

#[test]
fn tax_codes_are_effective_dated_and_posted_tax_is_summarized() {
    let (_directory, _path, mut connection) = setup();
    let codes =
        phase4_repository::list_tax_codes(&connection, "2026-08-13", "en").expect("list tax codes");
    assert!(codes.iter().any(|code| code.id == "jp-sales-10"));

    let entry_id = save_entry(
        &mut connection,
        "2026-08-13",
        "account-cash",
        "account-sales",
        11_000,
        Some("jp-sales-10"),
    );
    journal_repository::post_entry(&mut connection, BUSINESS_BOOK_ID, &entry_id)
        .expect("post test entry");

    let summary = phase4_repository::tax_summary(
        &connection,
        BUSINESS_BOOK_ID,
        "2026-01-01",
        "2026-12-31",
        "en",
    )
    .expect("summarize tax");
    assert_eq!(summary.rows.len(), 1);
    assert_eq!(summary.rows[0].gross_amount_minor, 11_000);
    assert_eq!(summary.rows[0].net_amount_minor, 10_000);
    assert_eq!(summary.output_tax_minor, 1_000);
    assert_eq!(summary.difference_minor, 1_000);
}

#[test]
fn fixed_asset_depreciation_posts_one_balanced_entry_per_year() {
    let (_directory, _path, mut connection) = setup();
    let asset = phase4_repository::create_fixed_asset(
        &connection,
        BUSINESS_BOOK_ID,
        &CreateFixedAssetRequest {
            name: "Workstation".to_owned(),
            asset_account_id: "account-equipment".to_owned(),
            acquisition_date: "2026-07-01".to_owned(),
            acquisition_cost_minor: 120_000,
            residual_value_minor: 0,
            useful_life_years: 5,
        },
    )
    .expect("create fixed asset");

    let result =
        phase4_repository::post_depreciation(&mut connection, BUSINESS_BOOK_ID, &asset.id, 2026)
            .expect("post depreciation");
    assert_eq!(result.amount_minor, 12_000);
    let (debit, credit, status): (i64, i64, String) = connection
        .query_row(
            "SELECT SUM(CASE WHEN jl.side = 'debit' THEN jl.amount_minor ELSE 0 END),
                    SUM(CASE WHEN jl.side = 'credit' THEN jl.amount_minor ELSE 0 END), je.status
             FROM journal_entries je INNER JOIN journal_lines jl ON jl.entry_id = je.id
             WHERE je.id = ?1 GROUP BY je.id",
            [&result.journal_entry_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("read generated entry");
    assert_eq!((debit, credit, status.as_str()), (12_000, 12_000, "posted"));
    assert!(phase4_repository::post_depreciation(
        &mut connection,
        BUSINESS_BOOK_ID,
        &asset.id,
        2026,
    )
    .is_err());
}

#[test]
fn inventory_adjustment_posts_periodic_inventory_and_calculates_cogs() {
    let (_directory, _path, mut connection) = setup();
    let purchase_entry = save_entry(
        &mut connection,
        "2026-06-01",
        "account-purchases",
        "account-cash",
        100_000,
        None,
    );
    connection
        .execute(
            "UPDATE journal_entries SET status = 'posted', posted_at = CURRENT_TIMESTAMP WHERE id = ?1",
            [&purchase_entry],
        )
        .expect("post purchase entry");

    let count = phase4_repository::post_inventory_adjustment(
        &mut connection,
        BUSINESS_BOOK_ID,
        &InventoryAdjustmentRequest {
            fiscal_year: 2026,
            count_date: "2026-12-31".to_owned(),
            beginning_inventory_minor: 20_000,
            ending_inventory_minor: 30_000,
        },
    )
    .expect("post inventory adjustment");
    assert_eq!(count.cost_of_goods_sold_minor, 90_000);
    let line_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM journal_lines WHERE entry_id = ?1",
            [&count.journal_entry_id],
            |row| row.get(0),
        )
        .expect("count generated lines");
    assert_eq!(line_count, 4);
    assert!(phase4_repository::post_inventory_adjustment(
        &mut connection,
        BUSINESS_BOOK_ID,
        &InventoryAdjustmentRequest {
            fiscal_year: 2026,
            count_date: "2026-12-31".to_owned(),
            beginning_inventory_minor: 20_000,
            ending_inventory_minor: 30_000,
        },
    )
    .is_err());
}

#[test]
fn attachment_content_is_stored_outside_sqlite_and_removed_with_metadata() {
    let (_directory, database_path, mut connection) = setup();
    let entry_id = save_entry(
        &mut connection,
        "2026-08-13",
        "account-equipment",
        "account-cash",
        10_000,
        None,
    );
    let attachment = attachments::add(
        &connection,
        &database_path,
        BUSINESS_BOOK_ID,
        &entry_id,
        "receipt.pdf",
        b"%PDF-1.7 test receipt",
    )
    .expect("add attachment");
    assert_eq!(attachment.media_type.as_deref(), Some("application/pdf"));
    assert_eq!(
        attachments::list(&connection, BUSINESS_BOOK_ID)
            .unwrap()
            .len(),
        1
    );
    let storage_name: String = connection
        .query_row(
            "SELECT storage_name FROM attachments WHERE id = ?1",
            [&attachment.id],
            |row| row.get(0),
        )
        .expect("read storage name");
    assert!(database_path
        .parent()
        .unwrap()
        .join("attachments")
        .join(&storage_name)
        .is_file());

    attachments::delete(
        &mut connection,
        &database_path,
        BUSINESS_BOOK_ID,
        &attachment.id,
    )
    .expect("delete attachment");
    let metadata_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM attachments WHERE id = ?1",
            params![attachment.id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(metadata_count, 0);
    assert!(!database_path
        .parent()
        .unwrap()
        .join("attachments")
        .join(storage_name)
        .exists());
}

#[test]
fn external_evidence_url_can_replace_a_local_attachment_record() {
    let (_directory, database_path, mut connection) = setup();
    let entry_id = save_entry(
        &mut connection,
        "2026-08-13",
        "account-equipment",
        "account-cash",
        10_000,
        None,
    );
    let evidence = attachments::add_link(
        &connection,
        BUSINESS_BOOK_ID,
        &entry_id,
        "Cloud receipt",
        "https://documents.example.com/receipts/2026-08",
    )
    .expect("add evidence URL");
    assert_eq!(evidence.source_type, "url");
    assert_eq!(evidence.size_bytes, None);
    assert_eq!(
        evidence.external_url.as_deref(),
        Some("https://documents.example.com/receipts/2026-08")
    );
    assert!(attachments::add_link(
        &connection,
        BUSINESS_BOOK_ID,
        &entry_id,
        "Unsafe receipt",
        "javascript:alert(1)",
    )
    .is_err());

    attachments::delete(
        &mut connection,
        &database_path,
        BUSINESS_BOOK_ID,
        &evidence.id,
    )
    .expect("delete evidence URL");
    let count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM evidence_links WHERE id = ?1",
            [evidence.id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 0);
}

#[test]
fn backup_and_restore_include_attachment_files() {
    let (_directory, database_path, mut connection) = setup();
    let entry_id = save_entry(
        &mut connection,
        "2026-08-13",
        "account-equipment",
        "account-cash",
        10_000,
        None,
    );
    let attachment = attachments::add(
        &connection,
        &database_path,
        BUSINESS_BOOK_ID,
        &entry_id,
        "invoice.pdf",
        b"%PDF-1.7 invoice",
    )
    .expect("add attachment");
    let backup_file = backup::create(&connection, &database_path).expect("create backup");
    attachments::delete(
        &mut connection,
        &database_path,
        BUSINESS_BOOK_ID,
        &attachment.id,
    )
    .expect("delete live attachment");

    backup::restore(&mut connection, &database_path, &backup_file.file_name)
        .expect("restore backup with attachments");
    let restored = attachments::list(&connection, BUSINESS_BOOK_ID).expect("list restored files");
    assert_eq!(restored.len(), 1);
    assert_eq!(restored[0].original_name, "invoice.pdf");
    let storage_name: String = connection
        .query_row(
            "SELECT storage_name FROM attachments WHERE id = ?1",
            [&attachment.id],
            |row| row.get(0),
        )
        .unwrap();
    assert!(database_path
        .parent()
        .unwrap()
        .join("attachments")
        .join(storage_name)
        .is_file());
}
