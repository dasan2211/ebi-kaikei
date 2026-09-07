use ebi_kaikei_lib::{
    application::{csv_export, initial_setup},
    database::open_database,
    domain::{
        book::{BUSINESS_BOOK_ID, MISCELLANEOUS_BOOK_ID},
        journal_entry::{DraftJournalEntry, JournalLine, Side},
        reports::{GeneralLedgerRequest, ReportPageRequest},
    },
    repository::{journal_repository, reports_repository},
};
use rusqlite::Connection;

fn setup() -> (tempfile::TempDir, Connection) {
    let directory = tempfile::tempdir().expect("一時ディレクトリを作成");
    let mut connection = open_database(&directory.path().join("test.sqlite")).expect("DBを初期化");
    initial_setup::complete(&mut connection, "ja").expect("セットアップ");
    (directory, connection)
}

fn save_cash_entry(
    connection: &mut Connection,
    book_id: &str,
    date: &str,
    description: &str,
    cash_side: Side,
    amount_minor: i64,
) {
    let other_side = if cash_side == Side::Debit {
        Side::Credit
    } else {
        Side::Debit
    };
    let other_account = if cash_side == Side::Debit {
        "account-sales"
    } else {
        "account-equipment"
    };
    journal_repository::save_draft(
        connection,
        book_id,
        &DraftJournalEntry {
            transaction_date: date.to_owned(),
            description: description.to_owned(),
            lines: vec![
                JournalLine {
                    account_id: "account-cash".to_owned(),
                    side: cash_side,
                    amount_minor,
                    memo: Some("現金明細".to_owned()),
                    tax_code_id: None,
                },
                JournalLine {
                    account_id: other_account.to_owned(),
                    side: other_side,
                    amount_minor,
                    memo: None,
                    tax_code_id: None,
                },
            ],
        },
    )
    .expect("仕訳を保存");
}

fn page_request(limit: u32, offset: u32) -> ReportPageRequest {
    ReportPageRequest {
        start_date: None,
        end_date: None,
        status: None,
        query: None,
        limit: Some(limit),
        offset: Some(offset),
    }
}

#[test]
fn dashboard_summary_uses_the_selected_book_and_period() {
    let (_directory, mut connection) = setup();
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-01-10",
        "期間内の下書き",
        Side::Debit,
        1_000,
    );
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-03-15",
        "期間内の確定済み",
        Side::Debit,
        2_000,
    );
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2025-12-31",
        "期間外の下書き",
        Side::Debit,
        3_000,
    );
    save_cash_entry(
        &mut connection,
        MISCELLANEOUS_BOOK_ID,
        "2026-04-01",
        "別帳簿の下書き",
        Side::Debit,
        4_000,
    );
    connection
        .execute(
            "UPDATE journal_entries
             SET status = 'posted', posted_at = CURRENT_TIMESTAMP
             WHERE description = '期間内の確定済み'",
            [],
        )
        .expect("仕訳を確定状態にする");

    let summary = reports_repository::get_dashboard_summary(
        &connection,
        BUSINESS_BOOK_ID,
        "2026-01-01",
        "2026-12-31",
    )
    .expect("ホーム集計を取得");

    assert_eq!(summary.draft_count, 1);
    assert_eq!(summary.last_posted_date.as_deref(), Some("2026-03-15"));
    assert_eq!(summary.difference_minor, 0);
}

#[test]
fn dashboard_summary_reports_a_posted_balance_difference() {
    let (_directory, mut connection) = setup();
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-03-15",
        "不整合を検出する仕訳",
        Side::Debit,
        2_000,
    );
    connection
        .execute_batch(
            "UPDATE journal_entries
             SET status = 'posted', posted_at = CURRENT_TIMESTAMP
             WHERE description = '不整合を検出する仕訳';
             DELETE FROM journal_lines
             WHERE side = 'credit'
               AND entry_id = (SELECT id FROM journal_entries WHERE description = '不整合を検出する仕訳');",
        )
        .expect("不整合な確定仕訳をテスト用に作成する");

    let summary = reports_repository::get_dashboard_summary(
        &connection,
        BUSINESS_BOOK_ID,
        "2026-01-01",
        "2026-12-31",
    )
    .expect("ホーム集計を取得");

    assert_eq!(summary.difference_minor, 2_000);
}

#[test]
fn journal_book_is_separated_by_book_and_paginated_by_entry() {
    let (_directory, mut connection) = setup();
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-01-10",
        "事業売上1",
        Side::Debit,
        1_000,
    );
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-02-10",
        "事業売上2",
        Side::Debit,
        2_000,
    );
    save_cash_entry(
        &mut connection,
        MISCELLANEOUS_BOOK_ID,
        "2026-03-10",
        "雑所得売上",
        Side::Debit,
        3_000,
    );

    let first_page =
        reports_repository::list_journal_book(&connection, BUSINESS_BOOK_ID, &page_request(1, 0))
            .expect("仕訳帳を取得");
    let second_page =
        reports_repository::list_journal_book(&connection, BUSINESS_BOOK_ID, &page_request(1, 1))
            .expect("仕訳帳の次ページを取得");

    assert_eq!(first_page.total, 2);
    assert_eq!(first_page.items.len(), 1);
    assert_eq!(first_page.items[0].description, "事業売上2");
    assert_eq!(first_page.items[0].lines.len(), 2);
    assert_eq!(first_page.items[0].lines[0].account_name, "現金");
    assert_eq!(second_page.items[0].description, "事業売上1");
}

#[test]
fn journal_book_filters_by_date_and_status() {
    let (_directory, mut connection) = setup();
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-01-10",
        "下書き",
        Side::Debit,
        1_000,
    );
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-02-10",
        "確定済み",
        Side::Debit,
        2_000,
    );
    connection
        .execute(
            "UPDATE journal_entries SET status = 'posted', posted_at = CURRENT_TIMESTAMP WHERE description = '確定済み'",
            [],
        )
        .expect("仕訳を確定状態にする");

    let result = reports_repository::list_journal_book(
        &connection,
        BUSINESS_BOOK_ID,
        &ReportPageRequest {
            start_date: Some("2026-02-01".to_owned()),
            end_date: Some("2026-02-28".to_owned()),
            status: Some("posted".to_owned()),
            query: None,
            limit: None,
            offset: None,
        },
    )
    .expect("絞り込んだ仕訳帳を取得");

    assert_eq!(result.total, 1);
    assert_eq!(result.items[0].description, "確定済み");
}

#[test]
fn report_search_matches_entry_accounts_and_literal_wildcards() {
    let (_directory, mut connection) = setup();
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-01-10",
        "Client 100% sale",
        Side::Debit,
        1_000,
    );
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-02-10",
        "Client 1000 purchase",
        Side::Credit,
        300,
    );

    let literal_percent = reports_repository::list_journal_book(
        &connection,
        BUSINESS_BOOK_ID,
        &ReportPageRequest {
            query: Some("100%".to_owned()),
            ..page_request(100, 0)
        },
    )
    .expect("search journal book");
    assert_eq!(literal_percent.total, 1);
    assert_eq!(literal_percent.items[0].description, "Client 100% sale");

    let by_counterpart = reports_repository::list_general_ledger(
        &connection,
        BUSINESS_BOOK_ID,
        &GeneralLedgerRequest {
            account_id: "account-cash".to_owned(),
            start_date: None,
            end_date: None,
            status: None,
            query: Some("1500".to_owned()),
            limit: None,
            offset: None,
        },
    )
    .expect("search ledger by counterpart account");
    assert_eq!(by_counterpart.total, 1);
    assert_eq!(by_counterpart.items[0].description, "Client 1000 purchase");
    assert_eq!(by_counterpart.items[0].balance_minor, 700);
    assert_eq!(by_counterpart.total_debit_minor, 1_000);
    assert_eq!(by_counterpart.total_credit_minor, 300);

    let assets = reports_repository::get_trial_balance(
        &connection,
        BUSINESS_BOOK_ID,
        &ReportPageRequest {
            query: Some("asset".to_owned()),
            ..page_request(100, 0)
        },
    )
    .expect("search trial balance by account type");
    assert_eq!(assets.total, 2);
    assert_eq!(assets.items.len(), 2);
    assert_eq!(assets.difference_minor, 0);
}

#[test]
fn general_ledger_calculates_running_balance_before_pagination() {
    let (_directory, mut connection) = setup();
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-01-10",
        "現金売上",
        Side::Debit,
        1_000,
    );
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-02-10",
        "備品購入",
        Side::Credit,
        300,
    );

    let result = reports_repository::list_general_ledger(
        &connection,
        BUSINESS_BOOK_ID,
        &GeneralLedgerRequest {
            account_id: "account-cash".to_owned(),
            start_date: None,
            end_date: None,
            status: None,
            query: None,
            limit: Some(1),
            offset: Some(1),
        },
    )
    .expect("総勘定元帳を取得");

    assert_eq!(result.account.name, "現金");
    assert_eq!(result.total, 2);
    assert_eq!(result.total_debit_minor, 1_000);
    assert_eq!(result.total_credit_minor, 300);
    assert_eq!(result.opening_balance_minor, 0);
    assert_eq!(result.closing_balance_minor, 700);
    assert_eq!(result.items.len(), 1);
    assert_eq!(result.items[0].description, "備品購入");
    assert_eq!(result.items[0].balance_minor, 700);
}

#[test]
fn general_ledger_carries_the_balance_before_the_start_date() {
    let (_directory, mut connection) = setup();
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-01-10",
        "前月の現金売上",
        Side::Debit,
        1_000,
    );
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-02-10",
        "当月の備品購入",
        Side::Credit,
        300,
    );

    let result = reports_repository::list_general_ledger(
        &connection,
        BUSINESS_BOOK_ID,
        &GeneralLedgerRequest {
            account_id: "account-cash".to_owned(),
            start_date: Some("2026-02-01".to_owned()),
            end_date: Some("2026-02-28".to_owned()),
            status: None,
            query: None,
            limit: None,
            offset: None,
        },
    )
    .expect("期間指定した総勘定元帳を取得");

    assert_eq!(result.total, 1);
    assert_eq!(result.opening_balance_minor, 1_000);
    assert_eq!(result.total_debit_minor, 0);
    assert_eq!(result.total_credit_minor, 300);
    assert_eq!(result.items[0].balance_minor, 700);
    assert_eq!(result.closing_balance_minor, 700);
}

#[test]
fn report_rejects_an_invalid_date_range() {
    let (_directory, connection) = setup();
    let error = reports_repository::list_journal_book(
        &connection,
        BUSINESS_BOOK_ID,
        &ReportPageRequest {
            start_date: Some("2026-12-31".to_owned()),
            end_date: Some("2026-01-01".to_owned()),
            status: None,
            query: None,
            limit: None,
            offset: None,
        },
    )
    .expect_err("逆転した期間を拒否する");

    assert!(error.to_string().contains("開始日"));
}

#[test]
fn trial_balance_calculates_opening_movements_and_closing_balances() {
    let (_directory, mut connection) = setup();
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2025-12-31",
        "前年の現金売上",
        Side::Debit,
        1_000,
    );
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-02-10",
        "当年の備品購入",
        Side::Credit,
        300,
    );
    save_cash_entry(
        &mut connection,
        MISCELLANEOUS_BOOK_ID,
        "2026-03-10",
        "別帳簿の売上",
        Side::Debit,
        5_000,
    );

    let result = reports_repository::get_trial_balance(
        &connection,
        BUSINESS_BOOK_ID,
        &ReportPageRequest {
            start_date: Some("2026-01-01".to_owned()),
            end_date: Some("2026-12-31".to_owned()),
            status: None,
            query: None,
            limit: Some(2),
            offset: Some(0),
        },
    )
    .expect("試算表を取得");

    assert_eq!(result.total, 3);
    assert_eq!(result.items.len(), 2);
    let cash = result
        .items
        .iter()
        .find(|row| row.account_id == "account-cash")
        .expect("現金行");
    assert_eq!(cash.opening_debit_minor, 1_000);
    assert_eq!(cash.period_credit_minor, 300);
    assert_eq!(cash.closing_debit_minor, 700);
    assert_eq!(result.totals.opening_debit_minor, 1_000);
    assert_eq!(result.totals.opening_credit_minor, 1_000);
    assert_eq!(result.totals.period_debit_minor, 300);
    assert_eq!(result.totals.period_credit_minor, 300);
    assert_eq!(result.totals.closing_debit_minor, 1_000);
    assert_eq!(result.totals.closing_credit_minor, 1_000);
    assert_eq!(result.difference_minor, 0);
}

#[test]
fn trial_balance_filters_journal_entry_status() {
    let (_directory, mut connection) = setup();
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-01-10",
        "確定対象",
        Side::Debit,
        1_000,
    );
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-02-10",
        "下書き対象",
        Side::Debit,
        2_000,
    );
    connection
        .execute(
            "UPDATE journal_entries SET status = 'posted', posted_at = CURRENT_TIMESTAMP WHERE description = '確定対象'",
            [],
        )
        .expect("仕訳を確定状態にする");

    let result = reports_repository::get_trial_balance(
        &connection,
        BUSINESS_BOOK_ID,
        &ReportPageRequest {
            start_date: Some("2026-01-01".to_owned()),
            end_date: Some("2026-12-31".to_owned()),
            status: Some("posted".to_owned()),
            query: None,
            limit: None,
            offset: None,
        },
    )
    .expect("確定済み試算表を取得");

    assert_eq!(result.total, 2);
    assert_eq!(result.totals.period_debit_minor, 1_000);
    assert_eq!(result.totals.period_credit_minor, 1_000);
}

#[test]
fn csv_exports_use_the_same_filtered_report_data() {
    let (_directory, mut connection) = setup();
    save_cash_entry(
        &mut connection,
        BUSINESS_BOOK_ID,
        "2026-08-13",
        "Online, \"summer\" sale",
        Side::Debit,
        1_500,
    );

    let journal = csv_export::journal_book(&connection, BUSINESS_BOOK_ID, &page_request(1, 999))
        .expect("export journal CSV");
    assert!(journal.content.starts_with('\u{feff}'));
    assert!(journal.content.contains("\"Online, \"\"summer\"\" sale\""));
    assert_eq!(journal.row_count, 2);

    let ledger = csv_export::general_ledger(
        &connection,
        BUSINESS_BOOK_ID,
        &GeneralLedgerRequest {
            account_id: "account-cash".to_owned(),
            start_date: None,
            end_date: None,
            status: None,
            query: None,
            limit: Some(1),
            offset: Some(999),
        },
    )
    .expect("export ledger CSV");
    assert_eq!(ledger.row_count, 1);
    assert!(ledger.content.contains(",1500,0,1500,"));

    let trial = csv_export::trial_balance(&connection, BUSINESS_BOOK_ID, &page_request(1, 999))
        .expect("export trial balance CSV");
    assert_eq!(trial.row_count, 2);
}
