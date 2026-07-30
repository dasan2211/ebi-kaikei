INSERT OR IGNORE INTO books (id, income_type, created_at, updated_at) VALUES
    ('book-business-income', 'business', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('book-miscellaneous-income', 'miscellaneous', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO book_accounts (book_id, account_id, created_at)
SELECT books.id, accounts.id, CURRENT_TIMESTAMP
FROM books
CROSS JOIN accounts
WHERE books.is_active = 1;

UPDATE journal_entries
SET book_id = 'book-business-income'
WHERE book_id IS NULL;

INSERT OR IGNORE INTO app_settings (key, value, updated_at)
VALUES ('active_book_id', 'book-business-income', CURRENT_TIMESTAMP);

CREATE TRIGGER IF NOT EXISTS journal_entries_require_book
BEFORE INSERT ON journal_entries
WHEN NEW.book_id IS NULL
BEGIN
    SELECT RAISE(ABORT, 'journal entry requires a book');
END;

CREATE TRIGGER IF NOT EXISTS journal_entries_keep_book
BEFORE UPDATE OF book_id ON journal_entries
WHEN NEW.book_id IS NULL
BEGIN
    SELECT RAISE(ABORT, 'journal entry requires a book');
END;

CREATE TRIGGER IF NOT EXISTS journal_lines_require_book_account
BEFORE INSERT ON journal_lines
WHEN NOT EXISTS (
    SELECT 1
    FROM journal_entries je
    INNER JOIN book_accounts ba
        ON ba.book_id = je.book_id
       AND ba.account_id = NEW.account_id
       AND ba.is_active = 1
    WHERE je.id = NEW.entry_id
)
BEGIN
    SELECT RAISE(ABORT, 'account is not enabled for this book');
END;

PRAGMA user_version = 4;
