use ebi_kaikei_lib::{
    application::initial_setup,
    database::open_database,
    domain::{
        book::{BUSINESS_BOOK_ID, MISCELLANEOUS_BOOK_ID},
        journal_entry::{DraftJournalEntry, JournalLine, Side},
    },
    repository::{account_repository, journal_repository},
};

fn balanced_entry(description: &str) -> DraftJournalEntry {
    DraftJournalEntry {
        transaction_date: "2026-07-30".to_owned(),
        description: description.to_owned(),
        lines: vec![
            JournalLine {
                account_id: "account-cash".to_owned(),
                side: Side::Debit,
                amount_minor: 1_000,
                memo: None,
            },
            JournalLine {
                account_id: "account-sales".to_owned(),
                side: Side::Credit,
                amount_minor: 1_000,
                memo: None,
            },
        ],
    }
}

#[test]
fn journal_entries_and_account_availability_are_separated_by_book() {
    let directory = tempfile::tempdir().expect("一時ディレクトリを作成");
    let path = directory.path().join("test.sqlite");
    let mut connection = open_database(&path).expect("DBを初期化");
    initial_setup::complete(&mut connection, "ja").expect("セットアップ");

    journal_repository::save_draft(
        &mut connection,
        BUSINESS_BOOK_ID,
        &balanced_entry("事業の売上"),
    )
    .expect("事業所得帳簿へ保存");
    journal_repository::save_draft(
        &mut connection,
        MISCELLANEOUS_BOOK_ID,
        &balanced_entry("副業の売上"),
    )
    .expect("雑所得帳簿へ保存");

    let business_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM journal_entries WHERE book_id = ?1",
            [BUSINESS_BOOK_ID],
            |row| row.get(0),
        )
        .expect("事業所得の仕訳数");
    let miscellaneous_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM journal_entries WHERE book_id = ?1",
            [MISCELLANEOUS_BOOK_ID],
            |row| row.get(0),
        )
        .expect("雑所得の仕訳数");
    let business_accounts =
        account_repository::list_active(&connection, BUSINESS_BOOK_ID).expect("事業所得の科目");
    let miscellaneous_accounts =
        account_repository::list_active(&connection, MISCELLANEOUS_BOOK_ID).expect("雑所得の科目");

    assert_eq!(business_count, 1);
    assert_eq!(miscellaneous_count, 1);
    assert_eq!(business_accounts.len(), 34);
    assert_eq!(miscellaneous_accounts.len(), 34);
}

#[test]
fn an_account_not_enabled_for_the_selected_book_is_rejected() {
    let directory = tempfile::tempdir().expect("一時ディレクトリを作成");
    let path = directory.path().join("test.sqlite");
    let mut connection = open_database(&path).expect("DBを初期化");
    initial_setup::complete(&mut connection, "ja").expect("セットアップ");
    connection
        .execute(
            "DELETE FROM book_accounts WHERE book_id = ?1 AND account_id = 'account-cash'",
            [MISCELLANEOUS_BOOK_ID],
        )
        .expect("雑所得帳簿から現金を外す");

    let error = journal_repository::save_draft(
        &mut connection,
        MISCELLANEOUS_BOOK_ID,
        &balanced_entry("不正な科目"),
    )
    .expect_err("帳簿にない科目を拒否する");

    assert!(error.to_string().contains("勘定科目"));
}
