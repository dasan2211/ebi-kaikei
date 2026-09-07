use crate::{
    domain::reconciliation::{
        BalanceAdjustmentRequest, BalanceAdjustmentResult, BalanceReconciliation,
        BalanceReconciliationRequest,
    },
    error::{AppError, AppResult},
};
use chrono::Utc;
use rusqlite::{params, Connection, Transaction};
use uuid::Uuid;

struct ReconciliationAccount {
    id: String,
    code: String,
    name: String,
    account_type: String,
    normal_side: String,
}

pub fn get_account_reconciliation(
    connection: &Connection,
    book_id: &str,
    request: &BalanceReconciliationRequest,
) -> AppResult<BalanceReconciliation> {
    request.validate()?;
    calculate_reconciliation(connection, book_id, request)
}

pub fn post_balance_adjustment(
    connection: &mut Connection,
    book_id: &str,
    request: &BalanceAdjustmentRequest,
) -> AppResult<BalanceAdjustmentResult> {
    request.validate()?;
    let transaction = connection.transaction()?;
    let reconciliation_request = BalanceReconciliationRequest {
        account_id: request.account_id.clone(),
        reconciliation_date: request.reconciliation_date.clone(),
        actual_balance_minor: request.actual_balance_minor,
    };
    let before = calculate_reconciliation(&transaction, book_id, &reconciliation_request)?;
    if before.difference_minor == 0 {
        return Err(AppError::Validation(
            "帳簿残高と実残高に差額はありません".into(),
        ));
    }

    let adjustment_account = find_account(&transaction, book_id, &request.adjustment_account_id)?;
    if !matches!(
        adjustment_account.account_type.as_str(),
        "expense" | "revenue"
    ) {
        return Err(AppError::Validation(
            "差額の相手科目には収益または費用科目を選択してください".into(),
        ));
    }

    let target_side = if before.difference_minor > 0 {
        before.normal_side.as_str()
    } else {
        opposite_side(&before.normal_side)?
    };
    let adjustment_side = opposite_side(target_side)?;
    let amount_minor = before
        .difference_minor
        .checked_abs()
        .ok_or_else(|| AppError::Validation("差額が大きすぎます".into()))?;
    let entry_id = insert_adjustment_entry(
        &transaction,
        book_id,
        &before,
        &adjustment_account,
        target_side,
        adjustment_side,
        amount_minor,
        request.memo.as_deref(),
    )?;
    let after = calculate_reconciliation(&transaction, book_id, &reconciliation_request)?;
    transaction.commit()?;

    Ok(BalanceAdjustmentResult {
        journal_entry_id: entry_id,
        reconciliation: after,
    })
}

fn calculate_reconciliation(
    connection: &Connection,
    book_id: &str,
    request: &BalanceReconciliationRequest,
) -> AppResult<BalanceReconciliation> {
    let account = find_account(connection, book_id, &request.account_id)?;
    if !matches!(
        account.account_type.as_str(),
        "asset" | "liability" | "equity"
    ) {
        return Err(AppError::Validation(
            "実残高を照合できるのは資産・負債・純資産科目です".into(),
        ));
    }
    let (debit_total, credit_total): (i64, i64) = connection.query_row(
        "SELECT
            COALESCE(SUM(CASE WHEN jl.side = 'debit' THEN jl.amount_minor ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN jl.side = 'credit' THEN jl.amount_minor ELSE 0 END), 0)
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.entry_id
         WHERE je.book_id = ?1
           AND je.status IN ('posted', 'reversed')
           AND je.transaction_date <= ?2
           AND jl.account_id = ?3",
        params![book_id, request.reconciliation_date, request.account_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let ledger_balance_minor = if account.normal_side == "debit" {
        debit_total.checked_sub(credit_total)
    } else {
        credit_total.checked_sub(debit_total)
    }
    .ok_or_else(|| AppError::Validation("帳簿残高が大きすぎます".into()))?;
    let difference_minor = request
        .actual_balance_minor
        .checked_sub(ledger_balance_minor)
        .ok_or_else(|| AppError::Validation("差額が大きすぎます".into()))?;

    Ok(BalanceReconciliation {
        account_id: account.id,
        account_code: account.code,
        account_name: account.name,
        normal_side: account.normal_side,
        reconciliation_date: request.reconciliation_date.clone(),
        ledger_balance_minor,
        actual_balance_minor: request.actual_balance_minor,
        difference_minor,
    })
}

fn find_account(
    connection: &Connection,
    book_id: &str,
    account_id: &str,
) -> AppResult<ReconciliationAccount> {
    connection
        .query_row(
            "SELECT a.id, a.code, a.name, a.account_type, a.normal_side
             FROM accounts a
             INNER JOIN book_accounts ba ON ba.account_id = a.id
             INNER JOIN books b ON b.id = ba.book_id
             WHERE ba.book_id = ?1 AND a.id = ?2
               AND b.is_active = 1 AND ba.is_active = 1 AND a.is_active = 1",
            params![book_id, account_id],
            |row| {
                Ok(ReconciliationAccount {
                    id: row.get(0)?,
                    code: row.get(1)?,
                    name: row.get(2)?,
                    account_type: row.get(3)?,
                    normal_side: row.get(4)?,
                })
            },
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::Validation("選択した帳簿で使用できない勘定科目です".into())
            }
            other => other.into(),
        })
}

#[allow(clippy::too_many_arguments)]
fn insert_adjustment_entry(
    transaction: &Transaction<'_>,
    book_id: &str,
    target_account: &BalanceReconciliation,
    adjustment_account: &ReconciliationAccount,
    target_side: &str,
    adjustment_side: &str,
    amount_minor: i64,
    memo: Option<&str>,
) -> AppResult<String> {
    let entry_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    transaction.execute(
        "INSERT INTO journal_entries
         (id, transaction_date, description, status, source_type, created_at, updated_at, posted_at, book_id)
         VALUES (?1, ?2, ?3, 'posted', 'balance_adjustment', ?4, ?4, ?4, ?5)",
        params![
            entry_id,
            target_account.reconciliation_date,
            format!("実残高調整：{}", target_account.account_name),
            now,
            book_id
        ],
    )?;

    let mut lines = [
        (
            target_account.account_id.as_str(),
            target_side,
            target_account.account_code.as_str(),
        ),
        (
            adjustment_account.id.as_str(),
            adjustment_side,
            adjustment_account.code.as_str(),
        ),
    ];
    lines.sort_by_key(|(_, side, code)| (if *side == "debit" { 0 } else { 1 }, *code));
    for (index, (account_id, side, _)) in lines.iter().enumerate() {
        transaction.execute(
            "INSERT INTO journal_lines
             (id, entry_id, line_number, account_id, side, amount_minor, memo, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                entry_id,
                index as i64 + 1,
                account_id,
                side,
                amount_minor,
                memo.map(str::trim).filter(|value| !value.is_empty()),
                now
            ],
        )?;
    }
    Ok(entry_id)
}

fn opposite_side(side: &str) -> AppResult<&'static str> {
    match side {
        "debit" => Ok("credit"),
        "credit" => Ok("debit"),
        _ => Err(AppError::Validation("勘定科目の通常残高が不正です".into())),
    }
}
