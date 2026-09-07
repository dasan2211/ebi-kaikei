use crate::{
    domain::journal_entry::{
        DraftJournalEntry, JournalCorrectionResult, SimpleExpenseRequest, SimpleSaleRequest,
        SimpleSettlementRequest, SimpleSettlementType,
    },
    error::{AppError, AppResult},
};
use chrono::Utc;
use rusqlite::{params, Connection, Transaction};
use uuid::Uuid;

const CASH_ACCOUNT_IDS: [&str; 2] = ["account-cash", "account-bank"];
const EXPENSE_PAYMENT_ACCOUNT_IDS: [&str; 3] =
    ["account-cash", "account-bank", "account-other-payable"];
const SALE_RECEIPT_ACCOUNT_IDS: [&str; 3] = ["account-cash", "account-bank", "account-receivable"];

struct ReversalSourceLine {
    line_number: i64,
    account_id: String,
    side: String,
    amount_minor: i64,
    memo: Option<String>,
    tax_code_id: Option<String>,
}

pub fn save_draft(
    connection: &mut Connection,
    book_id: &str,
    entry: &DraftJournalEntry,
) -> AppResult<String> {
    entry.validate()?;
    let transaction = connection.transaction()?;
    let book_exists: i64 = transaction.query_row(
        "SELECT COUNT(*) FROM books WHERE id = ?1 AND is_active = 1",
        [book_id],
        |row| row.get(0),
    )?;
    if book_exists != 1 {
        return Err(AppError::Validation("選択した帳簿が見つかりません".into()));
    }
    for line in &entry.lines {
        let account_exists: i64 = transaction.query_row(
            "SELECT COUNT(*) FROM book_accounts
             WHERE book_id = ?1 AND account_id = ?2 AND is_active = 1",
            params![book_id, line.account_id],
            |row| row.get(0),
        )?;
        if account_exists != 1 {
            return Err(AppError::Validation(
                "選択した帳簿では使用できない勘定科目が含まれています".into(),
            ));
        }
        validate_tax_code(
            &transaction,
            &entry.transaction_date,
            line.tax_code_id.as_deref(),
        )?;
    }
    let entry_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    transaction.execute(
        "INSERT INTO journal_entries (id, transaction_date, description, status, source_type, created_at, updated_at, book_id)
         VALUES (?1, ?2, ?3, 'draft', 'manual', ?4, ?4, ?5)",
        params![
            entry_id,
            entry.transaction_date,
            entry.description.trim(),
            now,
            book_id
        ],
    )?;
    for (index, line) in entry.lines.iter().enumerate() {
        transaction.execute(
            "INSERT INTO journal_lines (id, entry_id, line_number, account_id, side, amount_minor, memo, tax_code_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![Uuid::new_v4().to_string(), entry_id, index as i64 + 1, line.account_id, line.side.as_str(), line.amount_minor, line.memo, line.tax_code_id, now],
        )?;
    }
    transaction.commit()?;
    Ok(entry_id)
}

pub fn save_simple_expense_draft(
    connection: &mut Connection,
    book_id: &str,
    request: &SimpleExpenseRequest,
) -> AppResult<String> {
    request.validate()?;
    let transaction = connection.transaction()?;
    let book_exists: i64 = transaction.query_row(
        "SELECT COUNT(*) FROM books WHERE id = ?1 AND is_active = 1",
        [book_id],
        |row| row.get(0),
    )?;
    if book_exists != 1 {
        return Err(AppError::Validation("選択した帳簿が見つかりません".into()));
    }

    let expense_type = account_type_in_book(&transaction, book_id, &request.expense_account_id)?;
    if expense_type.as_deref() != Some("expense") {
        return Err(AppError::Validation(
            "費用科目には費用区分の勘定科目を選択してください".into(),
        ));
    }
    let payment_type = account_type_in_book(&transaction, book_id, &request.payment_account_id)?;
    if !matches!(payment_type.as_deref(), Some("asset" | "liability")) {
        return Err(AppError::Validation(
            "支払元には資産または負債区分の勘定科目を選択してください".into(),
        ));
    }
    ensure_allowed_account(
        &request.payment_account_id,
        &EXPENSE_PAYMENT_ACCOUNT_IDS,
        "支払元には現金、預金、またはクレジットカード等の未払金を選択してください",
    )?;
    validate_purchase_tax_code(
        &transaction,
        &request.transaction_date,
        request.tax_code_id.as_deref(),
    )?;

    let entry_id = insert_simple_draft(
        &transaction,
        book_id,
        &request.transaction_date,
        &request.description,
        "simple_expense",
        &request.expense_account_id,
        &request.payment_account_id,
        request.amount_minor,
        request.memo.as_deref(),
        request.tax_code_id.as_deref(),
        None,
    )?;
    transaction.commit()?;
    Ok(entry_id)
}

pub fn save_simple_sale_draft(
    connection: &mut Connection,
    book_id: &str,
    request: &SimpleSaleRequest,
) -> AppResult<String> {
    request.validate()?;
    let transaction = connection.transaction()?;
    ensure_active_book(&transaction, book_id)?;
    ensure_account_type(
        &transaction,
        book_id,
        &request.revenue_account_id,
        "revenue",
        "売上科目には収益区分の勘定科目を選択してください",
    )?;
    ensure_account_type(
        &transaction,
        book_id,
        &request.receipt_account_id,
        "asset",
        "受取方法には資産区分の勘定科目を選択してください",
    )?;
    ensure_allowed_account(
        &request.receipt_account_id,
        &SALE_RECEIPT_ACCOUNT_IDS,
        "受取方法には現金、預金、または売掛金を選択してください",
    )?;
    validate_sales_tax_code(
        &transaction,
        &request.transaction_date,
        request.tax_code_id.as_deref(),
    )?;
    let entry_id = insert_simple_draft(
        &transaction,
        book_id,
        &request.transaction_date,
        &request.description,
        "simple_sale",
        &request.receipt_account_id,
        &request.revenue_account_id,
        request.amount_minor,
        request.memo.as_deref(),
        None,
        request.tax_code_id.as_deref(),
    )?;
    transaction.commit()?;
    Ok(entry_id)
}

pub fn save_simple_settlement_draft(
    connection: &mut Connection,
    book_id: &str,
    request: &SimpleSettlementRequest,
) -> AppResult<String> {
    request.validate()?;
    let transaction = connection.transaction()?;
    ensure_active_book(&transaction, book_id)?;
    ensure_account_type(
        &transaction,
        book_id,
        &request.cash_account_id,
        "asset",
        "入金先または支払元には資産区分の勘定科目を選択してください",
    )?;
    ensure_allowed_account(
        &request.cash_account_id,
        &CASH_ACCOUNT_IDS,
        "入金先または支払元には現金または預金を選択してください",
    )?;

    let settlement_account_type = match request.settlement_type {
        SimpleSettlementType::ReceivableCollection | SimpleSettlementType::LoanDisbursement => {
            "asset"
        }
        SimpleSettlementType::PayablePayment | SimpleSettlementType::BorrowingReceipt => {
            "liability"
        }
    };
    ensure_account_type(
        &transaction,
        book_id,
        &request.settlement_account_id,
        settlement_account_type,
        "貸し借りの種類に合う資産または負債の勘定科目を選択してください",
    )?;
    if CASH_ACCOUNT_IDS.contains(&request.settlement_account_id.as_str()) {
        return Err(AppError::Validation(
            "貸し借りの勘定科目に現金または預金は選択できません".into(),
        ));
    }

    let (source_type, debit_account_id, credit_account_id) = match request.settlement_type {
        SimpleSettlementType::ReceivableCollection => (
            "simple_receivable_collection",
            request.cash_account_id.as_str(),
            request.settlement_account_id.as_str(),
        ),
        SimpleSettlementType::PayablePayment => (
            "simple_payable_payment",
            request.settlement_account_id.as_str(),
            request.cash_account_id.as_str(),
        ),
        SimpleSettlementType::LoanDisbursement => (
            "simple_loan_disbursement",
            request.settlement_account_id.as_str(),
            request.cash_account_id.as_str(),
        ),
        SimpleSettlementType::BorrowingReceipt => (
            "simple_borrowing_receipt",
            request.cash_account_id.as_str(),
            request.settlement_account_id.as_str(),
        ),
    };
    let entry_id = insert_simple_draft(
        &transaction,
        book_id,
        &request.transaction_date,
        &request.description,
        source_type,
        debit_account_id,
        credit_account_id,
        request.amount_minor,
        request.memo.as_deref(),
        None,
        None,
    )?;
    transaction.commit()?;
    Ok(entry_id)
}

pub fn post_entry(connection: &mut Connection, book_id: &str, entry_id: &str) -> AppResult<()> {
    let transaction = connection.transaction()?;
    let status = transaction
        .query_row(
            "SELECT status FROM journal_entries WHERE id = ?1 AND book_id = ?2",
            params![entry_id, book_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::Validation("The journal entry does not exist in this book".into())
            }
            other => other.into(),
        })?;
    if status != "draft" {
        return Err(AppError::Validation(
            "Only draft journal entries can be posted".into(),
        ));
    }
    let (debit, credit): (i64, i64) = transaction.query_row(
        "SELECT COALESCE(SUM(CASE WHEN side = 'debit' THEN amount_minor ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN side = 'credit' THEN amount_minor ELSE 0 END), 0)
         FROM journal_lines WHERE entry_id = ?1",
        [entry_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    if debit <= 0 || debit != credit {
        return Err(AppError::Validation(
            "The journal entry is not balanced".into(),
        ));
    }
    let now = Utc::now().to_rfc3339();
    transaction.execute(
        "UPDATE journal_entries SET status = 'posted', posted_at = ?1, updated_at = ?1
         WHERE id = ?2 AND book_id = ?3 AND status = 'draft'",
        params![now, entry_id, book_id],
    )?;
    transaction.commit()?;
    Ok(())
}

pub fn reverse_entry(
    connection: &mut Connection,
    book_id: &str,
    entry_id: &str,
    locale: &str,
) -> AppResult<JournalCorrectionResult> {
    let transaction = connection.transaction()?;
    let result = insert_correction(&transaction, book_id, entry_id, locale, None)?;
    transaction.commit()?;
    Ok(result)
}

pub fn revise_entry(
    connection: &mut Connection,
    book_id: &str,
    entry_id: &str,
    locale: &str,
    replacement: &DraftJournalEntry,
) -> AppResult<JournalCorrectionResult> {
    replacement.validate()?;
    let transaction = connection.transaction()?;
    validate_entry_accounts(&transaction, book_id, replacement)?;
    let result = insert_correction(&transaction, book_id, entry_id, locale, Some(replacement))?;
    transaction.commit()?;
    Ok(result)
}

fn insert_correction(
    transaction: &Transaction<'_>,
    book_id: &str,
    original_entry_id: &str,
    locale: &str,
    replacement: Option<&DraftJournalEntry>,
) -> AppResult<JournalCorrectionResult> {
    if !matches!(locale, "ja" | "en") {
        return Err(AppError::Validation("Unsupported locale".into()));
    }
    let (transaction_date, description, status, source_type): (String, String, String, String) =
        transaction
            .query_row(
                "SELECT transaction_date, description, status, source_type
             FROM journal_entries WHERE id = ?1 AND book_id = ?2",
                params![original_entry_id, book_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .map_err(|error| match error {
                rusqlite::Error::QueryReturnedNoRows => {
                    AppError::Validation("The journal entry does not exist in this book".into())
                }
                other => other.into(),
            })?;
    if status != "posted" {
        return Err(AppError::Validation(
            "Only posted journal entries can be corrected".into(),
        ));
    }
    if source_type == "correction_reversal" {
        let message = if locale == "ja" {
            "取消仕訳を再度取り消すことはできません"
        } else {
            "A reversal entry cannot be reversed again"
        };
        return Err(AppError::Validation(message.into()));
    }

    let original_lines: Vec<ReversalSourceLine> = {
        let mut statement = transaction.prepare(
            "SELECT line_number, account_id, side, amount_minor, memo, tax_code_id
             FROM journal_lines WHERE entry_id = ?1 ORDER BY line_number",
        )?;
        let lines = statement
            .query_map([original_entry_id], |row| {
                Ok(ReversalSourceLine {
                    line_number: row.get(0)?,
                    account_id: row.get(1)?,
                    side: row.get(2)?,
                    amount_minor: row.get(3)?,
                    memo: row.get(4)?,
                    tax_code_id: row.get(5)?,
                })
            })?
            .collect::<Result<_, _>>()?;
        lines
    };
    if original_lines.len() < 2 {
        return Err(AppError::Validation(
            "The journal entry has insufficient lines to reverse".into(),
        ));
    }

    let now = Utc::now().to_rfc3339();
    let reversal_entry_id = Uuid::new_v4().to_string();
    let reversal_description = if locale == "ja" {
        format!("取消：{description}")
    } else {
        format!("Reversal: {description}")
    };
    transaction.execute(
        "INSERT INTO journal_entries
         (id, transaction_date, description, status, source_type, source_id,
          reversal_of_entry_id, created_at, updated_at, posted_at, book_id)
         VALUES (?1, ?2, ?3, 'posted', 'correction_reversal', ?4, ?4, ?5, ?5, ?5, ?6)",
        params![
            reversal_entry_id,
            transaction_date,
            reversal_description,
            original_entry_id,
            now,
            book_id
        ],
    )?;
    for line in original_lines {
        let reversed_side = if line.side == "debit" {
            "credit"
        } else {
            "debit"
        };
        transaction.execute(
            "INSERT INTO journal_lines
             (id, entry_id, line_number, account_id, side, amount_minor, memo, tax_code_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                Uuid::new_v4().to_string(),
                reversal_entry_id,
                line.line_number,
                line.account_id,
                reversed_side,
                line.amount_minor,
                line.memo,
                line.tax_code_id,
                now
            ],
        )?;
    }

    let changed = transaction.execute(
        "UPDATE journal_entries SET status = 'reversed', updated_at = ?1
         WHERE id = ?2 AND book_id = ?3 AND status = 'posted'",
        params![now, original_entry_id, book_id],
    )?;
    if changed != 1 {
        return Err(AppError::Validation(
            "The journal entry has already been corrected".into(),
        ));
    }

    let replacement_entry_id = if let Some(entry) = replacement {
        let replacement_entry_id = Uuid::new_v4().to_string();
        transaction.execute(
            "INSERT INTO journal_entries
             (id, transaction_date, description, status, source_type, source_id,
              created_at, updated_at, posted_at, book_id)
             VALUES (?1, ?2, ?3, 'posted', 'correction', ?4, ?5, ?5, ?5, ?6)",
            params![
                replacement_entry_id,
                entry.transaction_date,
                entry.description.trim(),
                original_entry_id,
                now,
                book_id
            ],
        )?;
        for (index, line) in entry.lines.iter().enumerate() {
            transaction.execute(
                "INSERT INTO journal_lines
                 (id, entry_id, line_number, account_id, side, amount_minor, memo, tax_code_id, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    Uuid::new_v4().to_string(),
                    replacement_entry_id,
                    index as i64 + 1,
                    line.account_id,
                    line.side.as_str(),
                    line.amount_minor,
                    line.memo,
                    line.tax_code_id,
                    now
                ],
            )?;
        }
        Some(replacement_entry_id)
    } else {
        None
    };

    Ok(JournalCorrectionResult {
        reversal_entry_id,
        replacement_entry_id,
    })
}

fn validate_entry_accounts(
    connection: &Connection,
    book_id: &str,
    entry: &DraftJournalEntry,
) -> AppResult<()> {
    ensure_active_book_for_connection(connection, book_id)?;
    for line in &entry.lines {
        let account_exists: i64 = connection.query_row(
            "SELECT COUNT(*) FROM book_accounts ba
             INNER JOIN accounts a ON a.id = ba.account_id
             WHERE ba.book_id = ?1 AND ba.account_id = ?2
               AND ba.is_active = 1 AND a.is_active = 1",
            params![book_id, line.account_id],
            |row| row.get(0),
        )?;
        if account_exists != 1 {
            return Err(AppError::Validation(
                "The corrected entry contains an account unavailable in this book".into(),
            ));
        }
        validate_tax_code(
            connection,
            &entry.transaction_date,
            line.tax_code_id.as_deref(),
        )?;
    }
    Ok(())
}

fn ensure_active_book_for_connection(connection: &Connection, book_id: &str) -> AppResult<()> {
    let exists: i64 = connection.query_row(
        "SELECT COUNT(*) FROM books WHERE id = ?1 AND is_active = 1",
        [book_id],
        |row| row.get(0),
    )?;
    if exists != 1 {
        return Err(AppError::Validation(
            "The selected book does not exist".into(),
        ));
    }
    Ok(())
}

pub fn save_imported_drafts(
    connection: &mut Connection,
    book_id: &str,
    entries: &[(String, DraftJournalEntry)],
) -> AppResult<Vec<String>> {
    for (_, entry) in entries {
        entry.validate()?;
    }
    let transaction = connection.transaction()?;
    let book_exists: i64 = transaction.query_row(
        "SELECT COUNT(*) FROM books WHERE id = ?1 AND is_active = 1",
        [book_id],
        |row| row.get(0),
    )?;
    if book_exists != 1 {
        return Err(AppError::Validation(
            "The selected book does not exist".into(),
        ));
    }

    let mut ids = Vec::with_capacity(entries.len());
    let now = Utc::now().to_rfc3339();
    for (source_id, entry) in entries {
        let duplicate: i64 = transaction.query_row(
            "SELECT COUNT(*) FROM journal_entries
             WHERE book_id = ?1 AND source_type = 'csv_import' AND source_id = ?2",
            params![book_id, source_id],
            |row| row.get(0),
        )?;
        if duplicate != 0 {
            return Err(AppError::Validation(format!(
                "CSV entry {source_id} has already been imported"
            )));
        }
        for line in &entry.lines {
            let account_exists: i64 = transaction.query_row(
                "SELECT COUNT(*) FROM book_accounts
                 WHERE book_id = ?1 AND account_id = ?2 AND is_active = 1",
                params![book_id, line.account_id],
                |row| row.get(0),
            )?;
            if account_exists != 1 {
                return Err(AppError::Validation(
                    "The CSV contains an account unavailable in this book".into(),
                ));
            }
            validate_tax_code(
                &transaction,
                &entry.transaction_date,
                line.tax_code_id.as_deref(),
            )?;
        }

        let entry_id = Uuid::new_v4().to_string();
        transaction.execute(
            "INSERT INTO journal_entries
             (id, transaction_date, description, status, source_type, source_id, created_at, updated_at, book_id)
             VALUES (?1, ?2, ?3, 'draft', 'csv_import', ?4, ?5, ?5, ?6)",
            params![
                entry_id,
                entry.transaction_date,
                entry.description.trim(),
                source_id,
                now,
                book_id
            ],
        )?;
        for (index, line) in entry.lines.iter().enumerate() {
            transaction.execute(
                "INSERT INTO journal_lines
                 (id, entry_id, line_number, account_id, side, amount_minor, memo, tax_code_id, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    Uuid::new_v4().to_string(),
                    entry_id,
                    index as i64 + 1,
                    line.account_id,
                    line.side.as_str(),
                    line.amount_minor,
                    line.memo,
                    line.tax_code_id,
                    now
                ],
            )?;
        }
        ids.push(entry_id);
    }
    transaction.commit()?;
    Ok(ids)
}

fn validate_tax_code(
    connection: &Connection,
    transaction_date: &str,
    tax_code_id: Option<&str>,
) -> AppResult<()> {
    let Some(tax_code_id) = tax_code_id else {
        return Ok(());
    };
    let exists: i64 = connection.query_row(
        "SELECT COUNT(*) FROM tax_codes
         WHERE id = ?1 AND is_active = 1 AND valid_from <= ?2
           AND (valid_to IS NULL OR valid_to >= ?2)",
        params![tax_code_id, transaction_date],
        |row| row.get(0),
    )?;
    if exists != 1 {
        return Err(AppError::Validation(
            "The selected tax code is not effective on the transaction date".into(),
        ));
    }
    Ok(())
}

fn account_type_in_book(
    connection: &Connection,
    book_id: &str,
    account_id: &str,
) -> AppResult<Option<String>> {
    let mut statement = connection.prepare(
        "SELECT a.account_type
         FROM book_accounts ba
         INNER JOIN accounts a ON a.id = ba.account_id
         WHERE ba.book_id = ?1 AND ba.account_id = ?2
           AND ba.is_active = 1 AND a.is_active = 1",
    )?;
    let mut rows = statement.query(params![book_id, account_id])?;
    Ok(rows.next()?.map(|row| row.get(0)).transpose()?)
}

fn validate_purchase_tax_code(
    connection: &Connection,
    transaction_date: &str,
    tax_code_id: Option<&str>,
) -> AppResult<()> {
    let Some(tax_code_id) = tax_code_id else {
        return Ok(());
    };
    let exists: i64 = connection.query_row(
        "SELECT COUNT(*) FROM tax_codes
         WHERE id = ?1 AND is_active = 1 AND direction IN ('purchase', 'both')
           AND valid_from <= ?2 AND (valid_to IS NULL OR valid_to >= ?2)",
        params![tax_code_id, transaction_date],
        |row| row.get(0),
    )?;
    if exists != 1 {
        return Err(AppError::Validation(
            "支出に使用できない税区分、または取引日に適用されない税区分です".into(),
        ));
    }
    Ok(())
}

fn validate_sales_tax_code(
    connection: &Connection,
    transaction_date: &str,
    tax_code_id: Option<&str>,
) -> AppResult<()> {
    let Some(tax_code_id) = tax_code_id else {
        return Ok(());
    };
    let exists: i64 = connection.query_row(
        "SELECT COUNT(*) FROM tax_codes
         WHERE id = ?1 AND is_active = 1 AND direction IN ('sales', 'both')
           AND valid_from <= ?2 AND (valid_to IS NULL OR valid_to >= ?2)",
        params![tax_code_id, transaction_date],
        |row| row.get(0),
    )?;
    if exists != 1 {
        return Err(AppError::Validation(
            "売上に使用できない税区分、または取引日に適用されない税区分です".into(),
        ));
    }
    Ok(())
}

fn ensure_active_book(transaction: &Transaction<'_>, book_id: &str) -> AppResult<()> {
    let exists: i64 = transaction.query_row(
        "SELECT COUNT(*) FROM books WHERE id = ?1 AND is_active = 1",
        [book_id],
        |row| row.get(0),
    )?;
    if exists != 1 {
        return Err(AppError::Validation("選択した帳簿が見つかりません".into()));
    }
    Ok(())
}

fn ensure_account_type(
    connection: &Connection,
    book_id: &str,
    account_id: &str,
    expected_type: &str,
    message: &str,
) -> AppResult<()> {
    if account_type_in_book(connection, book_id, account_id)?.as_deref() != Some(expected_type) {
        return Err(AppError::Validation(message.into()));
    }
    Ok(())
}

fn ensure_allowed_account(account_id: &str, allowed: &[&str], message: &str) -> AppResult<()> {
    if !allowed.contains(&account_id) {
        return Err(AppError::Validation(message.into()));
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn insert_simple_draft(
    transaction: &Transaction<'_>,
    book_id: &str,
    transaction_date: &str,
    description: &str,
    source_type: &str,
    debit_account_id: &str,
    credit_account_id: &str,
    amount_minor: i64,
    memo: Option<&str>,
    debit_tax_code_id: Option<&str>,
    credit_tax_code_id: Option<&str>,
) -> AppResult<String> {
    let entry_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let memo = memo.map(str::trim).filter(|value| !value.is_empty());
    transaction.execute(
        "INSERT INTO journal_entries
         (id, transaction_date, description, status, source_type, created_at, updated_at, book_id)
         VALUES (?1, ?2, ?3, 'draft', ?4, ?5, ?5, ?6)",
        params![
            entry_id,
            transaction_date,
            description.trim(),
            source_type,
            now,
            book_id
        ],
    )?;
    transaction.execute(
        "INSERT INTO journal_lines
         (id, entry_id, line_number, account_id, side, amount_minor, memo, tax_code_id, created_at)
         VALUES (?1, ?2, 1, ?3, 'debit', ?4, ?5, ?6, ?7)",
        params![
            Uuid::new_v4().to_string(),
            entry_id,
            debit_account_id,
            amount_minor,
            memo,
            debit_tax_code_id,
            now
        ],
    )?;
    transaction.execute(
        "INSERT INTO journal_lines
         (id, entry_id, line_number, account_id, side, amount_minor, tax_code_id, created_at)
         VALUES (?1, ?2, 2, ?3, 'credit', ?4, ?5, ?6)",
        params![
            Uuid::new_v4().to_string(),
            entry_id,
            credit_account_id,
            amount_minor,
            credit_tax_code_id,
            now
        ],
    )?;
    Ok(entry_id)
}
