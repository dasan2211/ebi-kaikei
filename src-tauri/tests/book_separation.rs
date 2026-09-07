use ebi_kaikei_lib::{
    application::initial_setup,
    database::open_database,
    domain::{
        book::{ConsumptionTaxStatus, BUSINESS_BOOK_ID, MISCELLANEOUS_BOOK_ID},
        journal_entry::{DraftJournalEntry, JournalLine, Side},
    },
    repository::{account_repository, book_repository, journal_repository},
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
    }
}

#[test]
fn consumption_tax_status_is_saved_per_book() {
    let directory = tempfile::tempdir().expect("create temporary directory");
    let path = directory.path().join("test.sqlite");
    let connection = open_database(&path).expect("open database");

    let state = book_repository::set_consumption_tax_status(
        &connection,
        BUSINESS_BOOK_ID,
        ConsumptionTaxStatus::Exempt,
    )
    .expect("save consumption tax status");

    let business_book = state
        .books
        .iter()
        .find(|book| book.id == BUSINESS_BOOK_ID)
        .expect("find business book");
    let miscellaneous_book = state
        .books
        .iter()
        .find(|book| book.id == MISCELLANEOUS_BOOK_ID)
        .expect("find miscellaneous book");
    assert_eq!(
        business_book.consumption_tax_status,
        ConsumptionTaxStatus::Exempt
    );
    assert_eq!(
        miscellaneous_book.consumption_tax_status,
        ConsumptionTaxStatus::Taxable
    );
}

#[test]
fn users_can_create_any_number_of_named_books_with_available_accounts() {
    let directory = tempfile::tempdir().expect("create temporary directory");
    let path = directory.path().join("test.sqlite");
    let mut connection = open_database(&path).expect("open database");
    initial_setup::complete(&mut connection, "ja").expect("complete setup");

    let first_state = book_repository::create(&mut connection, "オンラインショップ")
        .expect("create first custom book");
    let second_state =
        book_repository::create(&mut connection, "賃貸物件").expect("create second custom book");

    assert_eq!(first_state.books.len(), 3);
    assert_eq!(second_state.books.len(), 4);
    let active_book = second_state
        .books
        .iter()
        .find(|book| book.id == second_state.active_book_id)
        .expect("find active custom book");
    assert_eq!(active_book.name, "賃貸物件");
    assert_eq!(
        account_repository::list_active(&connection, &active_book.id)
            .expect("list custom book accounts")
            .len(),
        36
    );
}

#[test]
fn an_empty_active_book_can_be_deleted_and_another_book_becomes_active() {
    let directory = tempfile::tempdir().expect("create temporary directory");
    let path = directory.path().join("test.sqlite");
    let mut connection = open_database(&path).expect("open database");
    initial_setup::complete(&mut connection, "ja").expect("complete setup");
    let created =
        book_repository::create(&mut connection, "削除対象").expect("create an empty book");
    let deleted_id = created.active_book_id;

    let state = book_repository::delete(&mut connection, &deleted_id)
        .expect("delete the empty active book");

    assert_eq!(state.books.len(), 2);
    assert!(!state.books.iter().any(|book| book.id == deleted_id));
    assert_ne!(state.active_book_id, deleted_id);
}

#[test]
fn a_book_with_accounting_data_and_the_last_book_cannot_be_deleted() {
    let directory = tempfile::tempdir().expect("create temporary directory");
    let path = directory.path().join("test.sqlite");
    let mut connection = open_database(&path).expect("open database");
    initial_setup::complete(&mut connection, "ja").expect("complete setup");
    let created = book_repository::create(&mut connection, "仕訳あり")
        .expect("create book for journal entry");
    journal_repository::save_draft(
        &mut connection,
        &created.active_book_id,
        &balanced_entry("削除してはいけない仕訳"),
    )
    .expect("save journal entry");

    let data_error = book_repository::delete(&mut connection, &created.active_book_id)
        .expect_err("reject deleting a book with accounting data");
    assert!(data_error.to_string().contains("会計データ"));

    connection
        .execute(
            "DELETE FROM journal_entries WHERE book_id = ?1",
            [&created.active_book_id],
        )
        .expect("remove test journal entry");
    book_repository::delete(&mut connection, &created.active_book_id)
        .expect("delete empty custom book");
    book_repository::delete(&mut connection, BUSINESS_BOOK_ID)
        .expect("delete one of the remaining empty books");
    let last_error = book_repository::delete(&mut connection, MISCELLANEOUS_BOOK_ID)
        .expect_err("reject deleting the last book");
    assert!(last_error.to_string().contains("最後の1冊"));
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
    assert_eq!(business_accounts.len(), 36);
    assert_eq!(miscellaneous_accounts.len(), 36);
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
