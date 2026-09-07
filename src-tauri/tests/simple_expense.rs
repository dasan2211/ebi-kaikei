use ebi_kaikei_lib::{
    application::initial_setup,
    database::open_database,
    domain::{
        book::BUSINESS_BOOK_ID,
        journal_entry::{
            SimpleExpenseRequest, SimpleSaleRequest, SimpleSettlementRequest, SimpleSettlementType,
        },
    },
    repository::journal_repository,
};
use rusqlite::Connection;

fn setup() -> (tempfile::TempDir, Connection) {
    let directory = tempfile::tempdir().expect("create temporary directory");
    let mut connection =
        open_database(&directory.path().join("test.sqlite")).expect("open database");
    initial_setup::complete(&mut connection, "ja").expect("complete setup");
    (directory, connection)
}

fn request() -> SimpleExpenseRequest {
    SimpleExpenseRequest {
        transaction_date: "2026-08-13".to_owned(),
        description: "文房具の購入".to_owned(),
        expense_account_id: "account-supplies".to_owned(),
        payment_account_id: "account-cash".to_owned(),
        amount_minor: 1_100,
        memo: Some("ノートとペン".to_owned()),
        tax_code_id: Some("jp-purchase-10".to_owned()),
    }
}

#[test]
fn simple_expense_creates_a_balanced_two_line_draft() {
    let (_directory, mut connection) = setup();
    let entry_id = journal_repository::save_simple_expense_draft(
        &mut connection,
        BUSINESS_BOOK_ID,
        &request(),
    )
    .expect("save simple expense");

    let (status, source_type): (String, String) = connection
        .query_row(
            "SELECT status, source_type FROM journal_entries WHERE id = ?1",
            [&entry_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("read entry");
    let lines: Vec<(String, String, i64, Option<String>)> = connection
        .prepare(
            "SELECT account_id, side, amount_minor, tax_code_id
             FROM journal_lines WHERE entry_id = ?1 ORDER BY line_number",
        )
        .unwrap()
        .query_map([&entry_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();

    assert_eq!(
        (status.as_str(), source_type.as_str()),
        ("draft", "simple_expense")
    );
    assert_eq!(
        lines,
        vec![
            (
                "account-supplies".to_owned(),
                "debit".to_owned(),
                1_100,
                Some("jp-purchase-10".to_owned())
            ),
            ("account-cash".to_owned(), "credit".to_owned(), 1_100, None)
        ]
    );
}

#[test]
fn simple_expense_rejects_wrong_account_types_and_sales_tax_codes() {
    let (_directory, mut connection) = setup();
    let mut invalid_expense = request();
    invalid_expense.expense_account_id = "account-equipment".to_owned();
    assert!(journal_repository::save_simple_expense_draft(
        &mut connection,
        BUSINESS_BOOK_ID,
        &invalid_expense,
    )
    .is_err());

    let mut invalid_payment = request();
    invalid_payment.payment_account_id = "account-sales".to_owned();
    assert!(journal_repository::save_simple_expense_draft(
        &mut connection,
        BUSINESS_BOOK_ID,
        &invalid_payment,
    )
    .is_err());

    let mut sales_tax = request();
    sales_tax.tax_code_id = Some("jp-sales-10".to_owned());
    assert!(journal_repository::save_simple_expense_draft(
        &mut connection,
        BUSINESS_BOOK_ID,
        &sales_tax,
    )
    .is_err());
}

#[test]
fn simple_expense_can_be_posted_with_the_normal_posting_command() {
    let (_directory, mut connection) = setup();
    let entry_id = journal_repository::save_simple_expense_draft(
        &mut connection,
        BUSINESS_BOOK_ID,
        &request(),
    )
    .unwrap();
    journal_repository::post_entry(&mut connection, BUSINESS_BOOK_ID, &entry_id).unwrap();
    let status: String = connection
        .query_row(
            "SELECT status FROM journal_entries WHERE id = ?1",
            [&entry_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(status, "posted");
}

#[test]
fn simple_sale_debits_receivable_and_credits_revenue_with_sales_tax() {
    let (_directory, mut connection) = setup();
    let entry_id = journal_repository::save_simple_sale_draft(
        &mut connection,
        BUSINESS_BOOK_ID,
        &SimpleSaleRequest {
            transaction_date: "2026-08-13".to_owned(),
            description: "制作業務の売上".to_owned(),
            revenue_account_id: "account-sales".to_owned(),
            receipt_account_id: "account-receivable".to_owned(),
            amount_minor: 55_000,
            memo: Some("8月分".to_owned()),
            tax_code_id: Some("jp-sales-10".to_owned()),
        },
    )
    .expect("save simple sale");
    let lines: Vec<(String, String, Option<String>)> = connection
        .prepare(
            "SELECT account_id, side, tax_code_id FROM journal_lines
             WHERE entry_id = ?1 ORDER BY line_number",
        )
        .unwrap()
        .query_map([entry_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(
        lines,
        vec![
            ("account-receivable".into(), "debit".into(), None),
            (
                "account-sales".into(),
                "credit".into(),
                Some("jp-sales-10".into())
            )
        ]
    );
}

#[test]
fn simple_settlements_generate_receivable_collection_and_payable_payment() {
    let (_directory, mut connection) = setup();
    let receivable_id = journal_repository::save_simple_settlement_draft(
        &mut connection,
        BUSINESS_BOOK_ID,
        &SimpleSettlementRequest {
            transaction_date: "2026-08-20".to_owned(),
            description: "売掛金の入金".to_owned(),
            settlement_type: SimpleSettlementType::ReceivableCollection,
            cash_account_id: "account-bank".to_owned(),
            settlement_account_id: "account-receivable".to_owned(),
            amount_minor: 55_000,
            memo: None,
        },
    )
    .expect("collect receivable");
    let payable_id = journal_repository::save_simple_settlement_draft(
        &mut connection,
        BUSINESS_BOOK_ID,
        &SimpleSettlementRequest {
            transaction_date: "2026-08-21".to_owned(),
            description: "買掛金の支払い".to_owned(),
            settlement_type: SimpleSettlementType::PayablePayment,
            cash_account_id: "account-bank".to_owned(),
            settlement_account_id: "account-payable".to_owned(),
            amount_minor: 22_000,
            memo: None,
        },
    )
    .expect("pay payable");
    let line_accounts = |entry_id: &str| -> Vec<(String, String)> {
        connection
            .prepare(
                "SELECT account_id, side FROM journal_lines
                 WHERE entry_id = ?1 ORDER BY line_number",
            )
            .unwrap()
            .query_map([entry_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    };
    assert_eq!(
        line_accounts(&receivable_id),
        vec![
            ("account-bank".into(), "debit".into()),
            ("account-receivable".into(), "credit".into())
        ]
    );
    assert_eq!(
        line_accounts(&payable_id),
        vec![
            ("account-payable".into(), "debit".into()),
            ("account-bank".into(), "credit".into())
        ]
    );
}

#[test]
fn simple_settlements_support_lending_borrowing_and_credit_card_withdrawals() {
    let (_directory, mut connection) = setup();
    let requests = [
        (
            SimpleSettlementType::LoanDisbursement,
            "account-loans-receivable",
            vec![
                ("account-loans-receivable".to_owned(), "debit".to_owned()),
                ("account-bank".to_owned(), "credit".to_owned()),
            ],
        ),
        (
            SimpleSettlementType::BorrowingReceipt,
            "account-loans-payable",
            vec![
                ("account-bank".to_owned(), "debit".to_owned()),
                ("account-loans-payable".to_owned(), "credit".to_owned()),
            ],
        ),
        (
            SimpleSettlementType::PayablePayment,
            "account-other-payable",
            vec![
                ("account-other-payable".to_owned(), "debit".to_owned()),
                ("account-bank".to_owned(), "credit".to_owned()),
            ],
        ),
    ];

    for (settlement_type, settlement_account_id, expected_lines) in requests {
        let entry_id = journal_repository::save_simple_settlement_draft(
            &mut connection,
            BUSINESS_BOOK_ID,
            &SimpleSettlementRequest {
                transaction_date: "2026-08-22".to_owned(),
                description: "loan or card settlement".to_owned(),
                settlement_type,
                cash_account_id: "account-bank".to_owned(),
                settlement_account_id: settlement_account_id.to_owned(),
                amount_minor: 10_000,
                memo: None,
            },
        )
        .expect("save loan or card settlement");
        let lines = connection
            .prepare(
                "SELECT account_id, side FROM journal_lines
                 WHERE entry_id = ?1 ORDER BY line_number",
            )
            .unwrap()
            .query_map([entry_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<Vec<(String, String)>, _>>()
            .unwrap();
        assert_eq!(lines, expected_lines);
    }
}

#[test]
fn simple_sale_and_settlement_reject_inappropriate_accounts() {
    let (_directory, mut connection) = setup();
    let invalid_sale = SimpleSaleRequest {
        transaction_date: "2026-08-13".to_owned(),
        description: "invalid".to_owned(),
        revenue_account_id: "account-sales".to_owned(),
        receipt_account_id: "account-equipment".to_owned(),
        amount_minor: 1_000,
        memo: None,
        tax_code_id: None,
    };
    assert!(journal_repository::save_simple_sale_draft(
        &mut connection,
        BUSINESS_BOOK_ID,
        &invalid_sale,
    )
    .is_err());

    let invalid_settlement = SimpleSettlementRequest {
        transaction_date: "2026-08-13".to_owned(),
        description: "invalid".to_owned(),
        settlement_type: SimpleSettlementType::ReceivableCollection,
        cash_account_id: "account-inventory".to_owned(),
        settlement_account_id: "account-receivable".to_owned(),
        amount_minor: 1_000,
        memo: None,
    };
    assert!(journal_repository::save_simple_settlement_draft(
        &mut connection,
        BUSINESS_BOOK_ID,
        &invalid_settlement,
    )
    .is_err());
}
