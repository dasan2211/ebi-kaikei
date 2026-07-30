use ebi_kaikei_lib::{application::initial_setup, database::open_database};
use rusqlite::Connection;

#[test]
fn migration_creates_strict_accounting_tables_without_choosing_a_language() {
    let directory = tempfile::tempdir().expect("一時ディレクトリを作成");
    let path = directory.path().join("test.sqlite");
    let connection = open_database(&path).expect("DBを初期化");

    let foreign_keys: i64 = connection
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .expect("外部キー設定を取得");
    let account_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM accounts", [], |row| row.get(0))
        .expect("勘定科目数を取得");
    let setup_status = initial_setup::status(&connection).expect("セットアップ状態を取得");
    let book_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM books", [], |row| row.get(0))
        .expect("帳簿数を取得");

    assert_eq!(foreign_keys, 1);
    assert_eq!(account_count, 0);
    assert_eq!(book_count, 2);
    assert!(!setup_status.completed);
    assert_eq!(setup_status.default_account_count, 34);
}

#[test]
fn japanese_setup_creates_year_end_accounts_in_one_transaction() {
    let directory = tempfile::tempdir().expect("一時ディレクトリを作成");
    let path = directory.path().join("test.sqlite");
    let mut connection = open_database(&path).expect("DBを初期化");

    let status = initial_setup::complete(&mut connection, "ja").expect("日本語でセットアップ");
    let names: Vec<String> = ["1300", "1500", "1590", "6130"]
        .into_iter()
        .map(|code| {
            connection
                .query_row("SELECT name FROM accounts WHERE code = ?1", [code], |row| {
                    row.get(0)
                })
                .expect("勘定科目名を取得")
        })
        .collect();
    let book_account_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM book_accounts", [], |row| row.get(0))
        .expect("帳簿別勘定科目数を取得");

    assert!(status.completed);
    assert_eq!(status.locale.as_deref(), Some("ja"));
    assert_eq!(
        names,
        ["棚卸資産", "備品", "減価償却累計額（備品）", "減価償却費"]
    );
    assert_eq!(book_account_count, 68);
}

#[test]
fn english_setup_creates_english_account_names() {
    let directory = tempfile::tempdir().expect("一時ディレクトリを作成");
    let path = directory.path().join("test.sqlite");
    let mut connection = open_database(&path).expect("DBを初期化");

    initial_setup::complete(&mut connection, "en").expect("英語でセットアップ");
    let inventory: String = connection
        .query_row("SELECT name FROM accounts WHERE code = '1300'", [], |row| {
            row.get(0)
        })
        .expect("棚卸資産名を取得");
    let depreciation: String = connection
        .query_row("SELECT name FROM accounts WHERE code = '6130'", [], |row| {
            row.get(0)
        })
        .expect("減価償却費名を取得");

    assert_eq!(inventory, "Inventory");
    assert_eq!(depreciation, "Depreciation expense");
}

#[test]
fn completed_setup_cannot_be_replaced_by_another_locale() {
    let directory = tempfile::tempdir().expect("一時ディレクトリを作成");
    let path = directory.path().join("test.sqlite");
    let mut connection = open_database(&path).expect("DBを初期化");

    initial_setup::complete(&mut connection, "ja").expect("日本語でセットアップ");
    let status = initial_setup::complete(&mut connection, "en").expect("再実行");
    let cash: String = connection
        .query_row("SELECT name FROM accounts WHERE code = '1000'", [], |row| {
            row.get(0)
        })
        .expect("現金科目を取得");

    assert_eq!(status.locale.as_deref(), Some("ja"));
    assert_eq!(cash, "現金");
}

#[test]
fn database_rejects_invalid_journal_line_amount() {
    let directory = tempfile::tempdir().expect("一時ディレクトリを作成");
    let path = directory.path().join("test.sqlite");
    let mut connection = open_database(&path).expect("DBを初期化");
    initial_setup::complete(&mut connection, "ja").expect("セットアップ");

    connection
        .execute(
            "INSERT INTO journal_entries (id, transaction_date, description, status, source_type, created_at, updated_at, book_id) VALUES ('entry-1', '2026-07-16', 'test', 'draft', 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'book-business-income')",
            [],
        )
        .expect("仕訳ヘッダーを作成");

    let result = connection.execute(
        "INSERT INTO journal_lines (id, entry_id, line_number, account_id, side, amount_minor, created_at) VALUES ('line-1', 'entry-1', 1, 'account-cash', 'debit', 0, CURRENT_TIMESTAMP)",
        [],
    );

    assert!(result.is_err());
}

#[test]
fn version_two_data_is_backfilled_into_the_business_income_book() {
    let directory = tempfile::tempdir().expect("一時ディレクトリを作成");
    let path = directory.path().join("legacy.sqlite");
    {
        let connection = Connection::open(&path).expect("旧DBを作成");
        connection
            .execute_batch(include_str!("../src/database/migrations/0001_init.sql"))
            .expect("初期スキーマを作成");
        connection
            .execute_batch(include_str!(
                "../src/database/migrations/0002_initial_setup.sql"
            ))
            .expect("セットアップスキーマを作成");
        connection
            .execute(
                "INSERT INTO accounts (id, code, name, account_type, normal_side, created_at, updated_at)
                 VALUES ('legacy-cash', '1000', '現金', 'asset', 'debit', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                [],
            )
            .expect("旧勘定科目を作成");
        connection
            .execute(
                "INSERT INTO journal_entries (id, transaction_date, description, status, source_type, created_at, updated_at)
                 VALUES ('legacy-entry', '2026-07-01', '移行前仕訳', 'draft', 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                [],
            )
            .expect("旧仕訳を作成");
    }

    let connection = open_database(&path).expect("最新スキーマへ移行");
    let migrated_book_id: String = connection
        .query_row(
            "SELECT book_id FROM journal_entries WHERE id = 'legacy-entry'",
            [],
            |row| row.get(0),
        )
        .expect("移行後の帳簿IDを取得");
    let association_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM book_accounts WHERE account_id = 'legacy-cash'",
            [],
            |row| row.get(0),
        )
        .expect("帳簿別科目関連を取得");

    assert_eq!(migrated_book_id, "book-business-income");
    assert_eq!(association_count, 2);
}
