use ebi_kaikei_lib::{
    application::initial_setup,
    database::open_database,
    domain::{
        journal_entry::{DraftJournalEntry, JournalLine, Side},
        reconciliation::{BalanceAdjustmentRequest, BalanceReconciliationRequest},
    },
    repository::{journal_repository, reconciliation_repository},
};
use tempfile::tempdir;

fn setup() -> (tempfile::TempDir, rusqlite::Connection) {
    let directory = tempdir().expect("一時ディレクトリを作成");
    let mut connection =
        open_database(&directory.path().join("accounting.sqlite")).expect("データベースを開く");
    initial_setup::complete(&mut connection, "ja").expect("初期設定を完了");
    (directory, connection)
}

fn cash_entry(date: &str, amount_minor: i64) -> DraftJournalEntry {
    DraftJournalEntry {
        transaction_date: date.to_owned(),
        description: "現金売上".to_owned(),
        lines: vec![
            JournalLine {
                account_id: "account-cash".to_owned(),
                side: Side::Debit,
                amount_minor,
                memo: None,
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

#[test]
fn reconciles_one_account_using_only_posted_entries_through_the_selected_date() {
    let (_directory, mut connection) = setup();
    let posted_id = journal_repository::save_draft(
        &mut connection,
        "book-business-income",
        &cash_entry("2026-08-25", 10_000),
    )
    .expect("確定対象の仕訳を保存");
    journal_repository::post_entry(&mut connection, "book-business-income", &posted_id)
        .expect("仕訳を確定");
    journal_repository::save_draft(
        &mut connection,
        "book-business-income",
        &cash_entry("2026-08-25", 5_000),
    )
    .expect("下書きを保存");
    let future_id = journal_repository::save_draft(
        &mut connection,
        "book-business-income",
        &cash_entry("2026-08-27", 3_000),
    )
    .expect("翌日の仕訳を保存");
    journal_repository::post_entry(&mut connection, "book-business-income", &future_id)
        .expect("翌日の仕訳を確定");

    let result = reconciliation_repository::get_account_reconciliation(
        &connection,
        "book-business-income",
        &BalanceReconciliationRequest {
            account_id: "account-cash".to_owned(),
            reconciliation_date: "2026-08-26".to_owned(),
            actual_balance_minor: 9_500,
        },
    )
    .expect("現金残高を照合");

    assert_eq!(result.ledger_balance_minor, 10_000);
    assert_eq!(result.actual_balance_minor, 9_500);
    assert_eq!(result.difference_minor, -500);
    assert_eq!(result.account_name, "現金");
}

#[test]
fn posts_a_balanced_adjustment_to_cash_over_and_short_and_returns_a_match() {
    let (_directory, mut connection) = setup();
    let posted_id = journal_repository::save_draft(
        &mut connection,
        "book-business-income",
        &cash_entry("2026-08-25", 10_000),
    )
    .expect("確定対象の仕訳を保存");
    journal_repository::post_entry(&mut connection, "book-business-income", &posted_id)
        .expect("仕訳を確定");

    let result = reconciliation_repository::post_balance_adjustment(
        &mut connection,
        "book-business-income",
        &BalanceAdjustmentRequest {
            account_id: "account-cash".to_owned(),
            adjustment_account_id: "account-cash-over-short".to_owned(),
            reconciliation_date: "2026-08-26".to_owned(),
            actual_balance_minor: 9_500,
            memo: Some("原因不明の現金不足".to_owned()),
        },
    )
    .expect("現金過不足を計上");

    assert_eq!(result.reconciliation.ledger_balance_minor, 9_500);
    assert_eq!(result.reconciliation.difference_minor, 0);

    let (status, source_type): (String, String) = connection
        .query_row(
            "SELECT status, source_type FROM journal_entries WHERE id = ?1",
            [&result.journal_entry_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("調整仕訳を取得");
    assert_eq!(status, "posted");
    assert_eq!(source_type, "balance_adjustment");

    let lines: Vec<(String, String, i64)> = connection
        .prepare(
            "SELECT account_id, side, amount_minor FROM journal_lines
             WHERE entry_id = ?1 ORDER BY line_number",
        )
        .expect("明細SQLを準備")
        .query_map([&result.journal_entry_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .expect("明細を取得")
        .collect::<Result<Vec<_>, _>>()
        .expect("明細を読み込む");
    assert_eq!(
        lines,
        vec![
            (
                "account-cash-over-short".to_owned(),
                "debit".to_owned(),
                500
            ),
            ("account-cash".to_owned(), "credit".to_owned(), 500),
        ]
    );
}

#[test]
fn refuses_an_adjustment_when_the_balance_already_matches() {
    let (_directory, mut connection) = setup();

    let error = reconciliation_repository::post_balance_adjustment(
        &mut connection,
        "book-business-income",
        &BalanceAdjustmentRequest {
            account_id: "account-cash".to_owned(),
            adjustment_account_id: "account-cash-over-short".to_owned(),
            reconciliation_date: "2026-08-26".to_owned(),
            actual_balance_minor: 0,
            memo: None,
        },
    )
    .expect_err("差額ゼロの調整は拒否する");

    assert!(error.to_string().contains("差額はありません"));
}

#[test]
fn posts_cash_excess_on_the_debit_side_and_cash_over_short_on_the_credit_side() {
    let (_directory, mut connection) = setup();

    let result = reconciliation_repository::post_balance_adjustment(
        &mut connection,
        "book-business-income",
        &BalanceAdjustmentRequest {
            account_id: "account-cash".to_owned(),
            adjustment_account_id: "account-cash-over-short".to_owned(),
            reconciliation_date: "2026-08-26".to_owned(),
            actual_balance_minor: 500,
            memo: Some("原因不明の現金超過".to_owned()),
        },
    )
    .expect("現金超過を計上");

    let lines: Vec<(String, String, i64)> = connection
        .prepare(
            "SELECT account_id, side, amount_minor FROM journal_lines
             WHERE entry_id = ?1 ORDER BY line_number",
        )
        .expect("明細SQLを準備")
        .query_map([&result.journal_entry_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .expect("明細を取得")
        .collect::<Result<Vec<_>, _>>()
        .expect("明細を読み込む");

    assert_eq!(
        lines,
        vec![
            ("account-cash".to_owned(), "debit".to_owned(), 500),
            (
                "account-cash-over-short".to_owned(),
                "credit".to_owned(),
                500
            ),
        ]
    );
}

#[test]
fn includes_both_the_original_and_reversal_entries_in_the_ledger_balance() {
    let (_directory, mut connection) = setup();
    let posted_id = journal_repository::save_draft(
        &mut connection,
        "book-business-income",
        &cash_entry("2026-08-25", 10_000),
    )
    .expect("取消対象の仕訳を保存");
    journal_repository::post_entry(&mut connection, "book-business-income", &posted_id)
        .expect("仕訳を確定");
    journal_repository::reverse_entry(&mut connection, "book-business-income", &posted_id, "ja")
        .expect("逆仕訳を作成");

    let result = reconciliation_repository::get_account_reconciliation(
        &connection,
        "book-business-income",
        &BalanceReconciliationRequest {
            account_id: "account-cash".to_owned(),
            reconciliation_date: "2026-08-26".to_owned(),
            actual_balance_minor: 0,
        },
    )
    .expect("取消後の残高を照合");

    assert_eq!(result.ledger_balance_minor, 0);
    assert_eq!(result.difference_minor, 0);
}
