-- Squashed baseline for schema version 14.
-- Future schema changes must use new forward-only migrations starting at 0015.
PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
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

CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE books (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    consumption_tax_status TEXT NOT NULL DEFAULT 'taxable'
        CHECK (consumption_tax_status IN ('taxable', 'exempt')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE book_accounts (
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    PRIMARY KEY (book_id, account_id)
) STRICT;

CREATE TABLE tax_codes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    ja_name TEXT NOT NULL,
    en_name TEXT NOT NULL,
    rate_bps INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
    category TEXT NOT NULL CHECK (category IN ('taxable', 'exempt', 'non_taxable', 'out_of_scope')),
    direction TEXT NOT NULL CHECK (direction IN ('sales', 'purchase', 'both')),
    is_reduced INTEGER NOT NULL DEFAULT 0 CHECK (is_reduced IN (0, 1)),
    valid_from TEXT NOT NULL CHECK (length(valid_from) = 10),
    valid_to TEXT CHECK (valid_to IS NULL OR length(valid_to) = 10),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    CHECK (valid_to IS NULL OR valid_from <= valid_to)
) STRICT;

CREATE TABLE journal_entries (
    id TEXT PRIMARY KEY,
    transaction_date TEXT NOT NULL CHECK (length(transaction_date) = 10),
    description TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'posted', 'reversed')),
    source_type TEXT NOT NULL,
    source_id TEXT,
    reversal_of_entry_id TEXT REFERENCES journal_entries(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    posted_at TEXT,
    book_id TEXT NOT NULL REFERENCES books(id)
) STRICT;

CREATE TABLE journal_lines (
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

CREATE TABLE fixed_assets (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    asset_account_id TEXT NOT NULL REFERENCES accounts(id),
    acquisition_date TEXT NOT NULL CHECK (length(acquisition_date) = 10),
    acquisition_cost_minor INTEGER NOT NULL CHECK (acquisition_cost_minor > 0),
    residual_value_minor INTEGER NOT NULL DEFAULT 0 CHECK (residual_value_minor >= 0),
    useful_life_years INTEGER NOT NULL CHECK (useful_life_years BETWEEN 1 AND 100),
    depreciation_method TEXT NOT NULL DEFAULT 'straight_line' CHECK (depreciation_method = 'straight_line'),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disposed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (residual_value_minor < acquisition_cost_minor)
) STRICT;

CREATE TABLE fixed_asset_depreciations (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
    fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 9999),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    journal_entry_id TEXT NOT NULL UNIQUE REFERENCES journal_entries(id),
    created_at TEXT NOT NULL,
    UNIQUE (asset_id, fiscal_year)
) STRICT;

CREATE TABLE inventory_counts (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 9999),
    count_date TEXT NOT NULL CHECK (length(count_date) = 10),
    beginning_inventory_minor INTEGER NOT NULL CHECK (beginning_inventory_minor >= 0),
    ending_inventory_minor INTEGER NOT NULL CHECK (ending_inventory_minor >= 0),
    journal_entry_id TEXT NOT NULL UNIQUE REFERENCES journal_entries(id),
    created_at TEXT NOT NULL,
    UNIQUE (book_id, fiscal_year)
) STRICT;

CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    storage_name TEXT NOT NULL UNIQUE,
    media_type TEXT NOT NULL CHECK (media_type IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
    created_at TEXT NOT NULL
) STRICT;

CREATE TABLE evidence_links (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 255),
    external_url TEXT NOT NULL CHECK (length(external_url) BETWEEN 9 AND 2048),
    created_at TEXT NOT NULL
) STRICT;

CREATE TABLE journal_templates (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description_template TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (book_id, name)
) STRICT;

CREATE TABLE journal_template_lines (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES journal_templates(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL CHECK (line_number > 0),
    account_id TEXT NOT NULL REFERENCES accounts(id),
    side TEXT NOT NULL CHECK (side IN ('debit', 'credit')),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    memo_template TEXT,
    tax_code_id TEXT REFERENCES tax_codes(id),
    UNIQUE (template_id, line_number)
) STRICT;

CREATE INDEX idx_accounts_active_code
    ON accounts(is_active, code);
CREATE INDEX idx_book_accounts_active
    ON book_accounts(book_id, is_active, account_id);
CREATE INDEX idx_entries_date_status
    ON journal_entries(transaction_date, status);
CREATE INDEX idx_entries_book_date_status
    ON journal_entries(book_id, transaction_date, status);
CREATE INDEX idx_entries_book_status_date_id
    ON journal_entries(book_id, status, transaction_date, id);
CREATE INDEX idx_lines_entry
    ON journal_lines(entry_id, line_number);
CREATE INDEX idx_lines_account
    ON journal_lines(account_id, entry_id);
CREATE INDEX idx_lines_account_entry_line
    ON journal_lines(account_id, entry_id, line_number);
CREATE INDEX idx_tax_codes_effective
    ON tax_codes(is_active, valid_from, valid_to, code);
CREATE INDEX idx_fixed_assets_book_status
    ON fixed_assets(book_id, status, acquisition_date);
CREATE INDEX idx_fixed_asset_depreciations_asset_year
    ON fixed_asset_depreciations(asset_id, fiscal_year);
CREATE INDEX idx_inventory_counts_book_year
    ON inventory_counts(book_id, fiscal_year DESC);
CREATE INDEX idx_attachments_book_entry
    ON attachments(book_id, entry_id, created_at DESC);
CREATE INDEX idx_evidence_links_book_entry
    ON evidence_links(book_id, entry_id, created_at DESC);
CREATE INDEX idx_journal_templates_book_name
    ON journal_templates(book_id, name);
CREATE INDEX idx_journal_template_lines_template
    ON journal_template_lines(template_id, line_number);

CREATE TRIGGER journal_lines_require_book_account
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

CREATE TRIGGER journal_lines_validate_tax_code
BEFORE INSERT ON journal_lines
WHEN NEW.tax_code_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM tax_codes tc
    INNER JOIN journal_entries je ON je.id = NEW.entry_id
    WHERE tc.id = NEW.tax_code_id
      AND tc.is_active = 1
      AND tc.valid_from <= je.transaction_date
      AND (tc.valid_to IS NULL OR tc.valid_to >= je.transaction_date)
)
BEGIN
    SELECT RAISE(ABORT, 'tax code is not effective on the transaction date');
END;

INSERT INTO books
    (id, name, is_active, consumption_tax_status, created_at, updated_at)
VALUES
    ('book-business-income', '事業所得', 1, 'taxable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('book-miscellaneous-income', '雑所得', 1, 'taxable', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO app_settings (key, value, updated_at)
VALUES ('active_book_id', 'book-business-income', CURRENT_TIMESTAMP);

INSERT INTO tax_codes
    (id, code, ja_name, en_name, rate_bps, category, direction, is_reduced, valid_from)
VALUES
    ('jp-sales-10', 'SALES10', '課税売上 10%', 'Taxable sales 10%', 1000, 'taxable', 'sales', 0, '2019-10-01'),
    ('jp-sales-8-reduced', 'SALES8R', '課税売上 8%（軽減）', 'Taxable sales 8% (reduced)', 800, 'taxable', 'sales', 1, '2019-10-01'),
    ('jp-purchase-10', 'PURCHASE10', '課税仕入 10%', 'Taxable purchase 10%', 1000, 'taxable', 'purchase', 0, '2019-10-01'),
    ('jp-purchase-8-reduced', 'PURCHASE8R', '課税仕入 8%（軽減）', 'Taxable purchase 8% (reduced)', 800, 'taxable', 'purchase', 1, '2019-10-01'),
    ('jp-exempt-sales', 'EXEMPT', '非課税', 'Exempt', 0, 'exempt', 'both', 0, '1900-01-01'),
    ('jp-non-taxable', 'NONTAX', '不課税', 'Non-taxable', 0, 'non_taxable', 'both', 0, '1900-01-01'),
    ('jp-out-of-scope', 'OUTSCOPE', '対象外', 'Out of scope', 0, 'out_of_scope', 'both', 0, '1900-01-01');

PRAGMA user_version = 14;
