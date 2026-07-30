PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    normal_side TEXT NOT NULL CHECK (normal_side IN ('debit', 'credit')),
    parent_id TEXT REFERENCES accounts(id),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    transaction_date TEXT NOT NULL CHECK (length(transaction_date) = 10),
    description TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'posted', 'reversed')),
    source_type TEXT NOT NULL,
    source_id TEXT,
    reversal_of_entry_id TEXT REFERENCES journal_entries(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    posted_at TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS journal_lines (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL CHECK (line_number > 0),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    side TEXT NOT NULL CHECK (side IN ('debit', 'credit')),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    memo TEXT,
    tax_code_id TEXT,
    partner_id TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (entry_id, line_number)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_accounts_active_code ON accounts(is_active, code);
CREATE INDEX IF NOT EXISTS idx_entries_date_status ON journal_entries(transaction_date, status);
CREATE INDEX IF NOT EXISTS idx_lines_entry ON journal_lines(entry_id, line_number);
CREATE INDEX IF NOT EXISTS idx_lines_account ON journal_lines(account_id, entry_id);

PRAGMA user_version = 1;
