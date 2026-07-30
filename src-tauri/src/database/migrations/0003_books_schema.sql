CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    income_type TEXT NOT NULL UNIQUE CHECK (income_type IN ('business', 'miscellaneous')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS book_accounts (
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    PRIMARY KEY (book_id, account_id)
) STRICT;

ALTER TABLE journal_entries ADD COLUMN book_id TEXT REFERENCES books(id);

CREATE INDEX IF NOT EXISTS idx_book_accounts_active
    ON book_accounts(book_id, is_active, account_id);
CREATE INDEX IF NOT EXISTS idx_entries_book_date_status
    ON journal_entries(book_id, transaction_date, status);

PRAGMA user_version = 3;
