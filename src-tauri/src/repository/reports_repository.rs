use crate::{
    domain::reports::{
        DashboardSummary, GeneralLedgerPage, GeneralLedgerRequest, GeneralLedgerRow,
        JournalBookEntry, JournalBookLine, JournalBookPage, LedgerAccount, ReportPageRequest,
        TrialBalance, TrialBalanceRow, TrialBalanceTotals,
    },
    error::{AppError, AppResult},
};
use rusqlite::{params, Connection, OptionalExtension};

const REPORT_WHERE: &str = "
    je.book_id = ?1
    AND (?2 IS NULL OR je.transaction_date >= ?2)
    AND (?3 IS NULL OR je.transaction_date <= ?3)
    AND (?4 IS NULL OR je.status = ?4)";

const JOURNAL_SEARCH_WHERE: &str = "
    AND (?5 IS NULL OR je.description LIKE ?5 ESCAPE '\\'
        OR EXISTS (
            SELECT 1
            FROM journal_lines search_line
            INNER JOIN accounts search_account ON search_account.id = search_line.account_id
            WHERE search_line.entry_id = je.id
              AND (search_account.code LIKE ?5 ESCAPE '\\'
                OR search_account.name LIKE ?5 ESCAPE '\\'
                OR COALESCE(search_line.memo, '') LIKE ?5 ESCAPE '\\')
        ))";

const LEDGER_SEARCH_WHERE: &str = "
    AND (?6 IS NULL OR je.description LIKE ?6 ESCAPE '\\'
        OR COALESCE(jl.memo, '') LIKE ?6 ESCAPE '\\'
        OR EXISTS (
            SELECT 1
            FROM journal_lines search_line
            INNER JOIN accounts search_account ON search_account.id = search_line.account_id
            WHERE search_line.entry_id = je.id
              AND (search_account.code LIKE ?6 ESCAPE '\\'
                OR search_account.name LIKE ?6 ESCAPE '\\'
                OR COALESCE(search_line.memo, '') LIKE ?6 ESCAPE '\\')
        ))";

const TRIAL_BALANCE_CTE: &str = "
    WITH account_totals AS (
        SELECT a.id AS account_id, a.code AS account_code, a.name AS account_name,
               a.account_type,
               COALESCE(SUM(CASE
                   WHEN ?2 IS NOT NULL AND je.transaction_date < ?2
                   THEN CASE WHEN jl.side = 'debit' THEN jl.amount_minor ELSE -jl.amount_minor END
                   ELSE 0 END), 0) AS opening_signed,
               COALESCE(SUM(CASE
                   WHEN je.id IS NOT NULL
                    AND (?2 IS NULL OR je.transaction_date >= ?2)
                    AND (?3 IS NULL OR je.transaction_date <= ?3)
                    AND jl.side = 'debit' THEN jl.amount_minor ELSE 0 END), 0) AS period_debit,
               COALESCE(SUM(CASE
                   WHEN je.id IS NOT NULL
                    AND (?2 IS NULL OR je.transaction_date >= ?2)
                    AND (?3 IS NULL OR je.transaction_date <= ?3)
                    AND jl.side = 'credit' THEN jl.amount_minor ELSE 0 END), 0) AS period_credit
        FROM book_accounts ba
        INNER JOIN accounts a ON a.id = ba.account_id
        LEFT JOIN journal_lines jl ON jl.account_id = a.id
        LEFT JOIN journal_entries je ON je.id = jl.entry_id
            AND je.book_id = ?1
            AND (?4 IS NULL OR je.status = ?4)
        WHERE ba.book_id = ?1 AND ba.is_active = 1 AND a.is_active = 1
        GROUP BY a.id, a.code, a.name, a.account_type
    ), trial_rows AS (
        SELECT account_id, account_code, account_name, account_type,
               MAX(opening_signed, 0) AS opening_debit,
               MAX(-opening_signed, 0) AS opening_credit,
               period_debit,
               period_credit,
               MAX(opening_signed + period_debit - period_credit, 0) AS closing_debit,
               MAX(-(opening_signed + period_debit - period_credit), 0) AS closing_credit
        FROM account_totals
    ), visible_rows AS (
        SELECT * FROM trial_rows
        WHERE opening_debit != 0 OR opening_credit != 0
           OR period_debit != 0 OR period_credit != 0
           OR closing_debit != 0 OR closing_credit != 0
    )";

pub fn get_dashboard_summary(
    connection: &Connection,
    book_id: &str,
    start_date: &str,
    end_date: &str,
) -> AppResult<DashboardSummary> {
    ReportPageRequest {
        start_date: Some(start_date.to_owned()),
        end_date: Some(end_date.to_owned()),
        status: None,
        query: None,
        limit: None,
        offset: None,
    }
    .validate()?;
    ensure_book_exists(connection, book_id)?;

    let (draft_count, last_posted_date, signed_difference): (i64, Option<String>, i64) = connection
        .query_row(
            "SELECT COUNT(DISTINCT CASE WHEN je.status = 'draft' THEN je.id END),
                    MAX(CASE WHEN je.status = 'posted' THEN je.transaction_date END),
                    COALESCE(SUM(CASE
                        WHEN je.status = 'posted' AND jl.side = 'debit' THEN jl.amount_minor
                        WHEN je.status = 'posted' AND jl.side = 'credit' THEN -jl.amount_minor
                        ELSE 0
                    END), 0)
             FROM journal_entries je
             LEFT JOIN journal_lines jl ON jl.entry_id = je.id
             WHERE je.book_id = ?1
               AND je.transaction_date >= ?2
               AND je.transaction_date <= ?3",
            params![book_id, start_date, end_date],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;

    Ok(DashboardSummary {
        draft_count,
        last_posted_date,
        difference_minor: signed_difference.checked_abs().unwrap_or(i64::MAX),
    })
}

pub fn list_journal_book(
    connection: &Connection,
    book_id: &str,
    request: &ReportPageRequest,
) -> AppResult<JournalBookPage> {
    let filter = request.validate()?;
    ensure_book_exists(connection, book_id)?;

    let total: i64 = connection.query_row(
        &format!(
            "SELECT COUNT(*) FROM journal_entries je WHERE {REPORT_WHERE} {JOURNAL_SEARCH_WHERE}"
        ),
        params![
            book_id,
            filter.start_date.as_deref(),
            filter.end_date.as_deref(),
            filter.status.as_deref(),
            filter.query_pattern.as_deref()
        ],
        |row| row.get(0),
    )?;

    let sql = format!(
        "WITH selected_entries AS (
            SELECT je.id, je.transaction_date, je.description, je.status, je.source_type, je.created_at
            FROM journal_entries je
            WHERE {REPORT_WHERE} {JOURNAL_SEARCH_WHERE}
            ORDER BY je.transaction_date DESC, je.created_at DESC, je.id DESC
            LIMIT ?6 OFFSET ?7
        )
        SELECT se.id, se.transaction_date, se.description, se.status, se.source_type,
               jl.id, jl.line_number, jl.account_id, a.code, a.name,
               jl.side, jl.amount_minor, jl.memo, jl.tax_code_id
        FROM selected_entries se
        INNER JOIN journal_lines jl ON jl.entry_id = se.id
        INNER JOIN accounts a ON a.id = jl.account_id
        ORDER BY se.transaction_date DESC, se.created_at DESC, se.id DESC, jl.line_number"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(
        params![
            book_id,
            filter.start_date.as_deref(),
            filter.end_date.as_deref(),
            filter.status.as_deref(),
            filter.query_pattern.as_deref(),
            filter.limit,
            filter.offset
        ],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                JournalBookLine {
                    id: row.get(5)?,
                    line_number: row.get(6)?,
                    account_id: row.get(7)?,
                    account_code: row.get(8)?,
                    account_name: row.get(9)?,
                    side: row.get(10)?,
                    amount_minor: row.get(11)?,
                    memo: row.get(12)?,
                    tax_code_id: row.get(13)?,
                },
            ))
        },
    )?;

    let mut items: Vec<JournalBookEntry> = Vec::new();
    for row in rows {
        let (id, transaction_date, description, status, source_type, line) = row?;
        if items.last().is_none_or(|entry| entry.id != id) {
            items.push(JournalBookEntry {
                id,
                transaction_date,
                description,
                status,
                source_type,
                lines: Vec::new(),
            });
        }
        items
            .last_mut()
            .expect("entry was just inserted")
            .lines
            .push(line);
    }

    Ok(JournalBookPage {
        items,
        total,
        limit: filter.limit,
        offset: filter.offset,
    })
}

pub fn list_general_ledger(
    connection: &Connection,
    book_id: &str,
    request: &GeneralLedgerRequest,
) -> AppResult<GeneralLedgerPage> {
    let filter = request.validate()?;
    ensure_book_exists(connection, book_id)?;
    let account = find_ledger_account(connection, book_id, &request.account_id)?;

    let opening_balance_minor = if let Some(start_date) = filter.start_date.as_deref() {
        connection.query_row(
            "SELECT COALESCE(SUM(CASE
                       WHEN ?5 = 'debit' AND jl.side = 'debit' THEN jl.amount_minor
                       WHEN ?5 = 'credit' AND jl.side = 'credit' THEN jl.amount_minor
                       ELSE -jl.amount_minor
                     END), 0)
             FROM journal_lines jl
             INNER JOIN journal_entries je ON je.id = jl.entry_id
             WHERE je.book_id = ?1 AND je.transaction_date < ?2
               AND (?3 IS NULL OR je.status = ?3) AND jl.account_id = ?4",
            params![
                book_id,
                start_date,
                filter.status.as_deref(),
                request.account_id,
                account.normal_side
            ],
            |row| row.get(0),
        )?
    } else {
        0
    };

    let summary_sql = format!(
        "SELECT COALESCE(SUM(CASE WHEN jl.side = 'debit' THEN jl.amount_minor ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN jl.side = 'credit' THEN jl.amount_minor ELSE 0 END), 0)
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.entry_id
         WHERE {REPORT_WHERE} AND jl.account_id = ?5"
    );
    let (total_debit_minor, total_credit_minor): (i64, i64) = connection.query_row(
        &summary_sql,
        params![
            book_id,
            filter.start_date.as_deref(),
            filter.end_date.as_deref(),
            filter.status.as_deref(),
            request.account_id
        ],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let count_sql = format!(
        "SELECT COUNT(*)
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.entry_id
         WHERE {REPORT_WHERE} AND jl.account_id = ?5 {LEDGER_SEARCH_WHERE}"
    );
    let total: i64 = connection.query_row(
        &count_sql,
        params![
            book_id,
            filter.start_date.as_deref(),
            filter.end_date.as_deref(),
            filter.status.as_deref(),
            request.account_id,
            filter.query_pattern.as_deref()
        ],
        |row| row.get(0),
    )?;
    let period_change = if account.normal_side == "debit" {
        total_debit_minor - total_credit_minor
    } else {
        total_credit_minor - total_debit_minor
    };
    let closing_balance_minor = opening_balance_minor + period_change;

    let rows_sql = format!(
        "WITH filtered_lines AS (
            SELECT jl.id AS line_id, je.id AS entry_id, je.transaction_date,
                   je.description, je.status, je.created_at, jl.line_number,
                   CASE WHEN jl.side = 'debit' THEN jl.amount_minor ELSE 0 END AS debit_amount_minor,
                   CASE WHEN jl.side = 'credit' THEN jl.amount_minor ELSE 0 END AS credit_amount_minor,
                   jl.memo,
                   CASE
                     WHEN ?7 = 'debit' AND jl.side = 'debit' THEN jl.amount_minor
                     WHEN ?7 = 'credit' AND jl.side = 'credit' THEN jl.amount_minor
                     ELSE -jl.amount_minor
                   END AS balance_change
            FROM journal_lines jl
            INNER JOIN journal_entries je ON je.id = jl.entry_id
            WHERE {REPORT_WHERE} AND jl.account_id = ?5
        ), balanced_lines AS (
            SELECT *, ?10 + SUM(balance_change) OVER (
                ORDER BY transaction_date, created_at, entry_id, line_number, line_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS balance_minor
            FROM filtered_lines
        )
        SELECT line_id, entry_id, transaction_date, description, status, line_number,
               debit_amount_minor, credit_amount_minor, balance_minor, memo
        FROM balanced_lines
        WHERE (?6 IS NULL OR description LIKE ?6 ESCAPE '\\'
          OR COALESCE(memo, '') LIKE ?6 ESCAPE '\\'
          OR EXISTS (
              SELECT 1 FROM journal_lines search_line
              INNER JOIN accounts search_account ON search_account.id = search_line.account_id
              WHERE search_line.entry_id = balanced_lines.entry_id
                AND (search_account.code LIKE ?6 ESCAPE '\\'
                  OR search_account.name LIKE ?6 ESCAPE '\\'
                  OR COALESCE(search_line.memo, '') LIKE ?6 ESCAPE '\\')
          ))
        ORDER BY transaction_date, created_at, entry_id, line_number, line_id
        LIMIT ?8 OFFSET ?9"
    );
    let mut statement = connection.prepare(&rows_sql)?;
    let rows = statement.query_map(
        params![
            book_id,
            filter.start_date.as_deref(),
            filter.end_date.as_deref(),
            filter.status.as_deref(),
            request.account_id,
            filter.query_pattern.as_deref(),
            account.normal_side,
            filter.limit,
            filter.offset,
            opening_balance_minor
        ],
        |row| {
            Ok(GeneralLedgerRow {
                line_id: row.get(0)?,
                entry_id: row.get(1)?,
                transaction_date: row.get(2)?,
                description: row.get(3)?,
                status: row.get(4)?,
                line_number: row.get(5)?,
                debit_amount_minor: row.get(6)?,
                credit_amount_minor: row.get(7)?,
                balance_minor: row.get(8)?,
                memo: row.get(9)?,
            })
        },
    )?;

    Ok(GeneralLedgerPage {
        account,
        items: rows.collect::<Result<Vec<_>, _>>()?,
        total,
        limit: filter.limit,
        offset: filter.offset,
        total_debit_minor,
        total_credit_minor,
        opening_balance_minor,
        closing_balance_minor,
    })
}

pub fn get_trial_balance(
    connection: &Connection,
    book_id: &str,
    request: &ReportPageRequest,
) -> AppResult<TrialBalance> {
    let filter = request.validate()?;
    ensure_book_exists(connection, book_id)?;

    let summary_sql = format!(
        "{TRIAL_BALANCE_CTE}
         SELECT COALESCE(SUM(opening_debit), 0), COALESCE(SUM(opening_credit), 0),
                COALESCE(SUM(period_debit), 0), COALESCE(SUM(period_credit), 0),
                COALESCE(SUM(closing_debit), 0), COALESCE(SUM(closing_credit), 0)
         FROM visible_rows"
    );
    let (
        opening_debit_minor,
        opening_credit_minor,
        period_debit_minor,
        period_credit_minor,
        closing_debit_minor,
        closing_credit_minor,
    ): (i64, i64, i64, i64, i64, i64) = connection.query_row(
        &summary_sql,
        params![
            book_id,
            filter.start_date.as_deref(),
            filter.end_date.as_deref(),
            filter.status.as_deref()
        ],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        },
    )?;
    let count_sql = format!(
        "{TRIAL_BALANCE_CTE}
         SELECT COUNT(*) FROM visible_rows
         WHERE (?5 IS NULL OR account_code LIKE ?5 ESCAPE '\\'
            OR account_name LIKE ?5 ESCAPE '\\'
            OR account_type LIKE ?5 ESCAPE '\\')"
    );
    let total: i64 = connection.query_row(
        &count_sql,
        params![
            book_id,
            filter.start_date.as_deref(),
            filter.end_date.as_deref(),
            filter.status.as_deref(),
            filter.query_pattern.as_deref()
        ],
        |row| row.get(0),
    )?;
    let totals = TrialBalanceTotals {
        opening_debit_minor,
        opening_credit_minor,
        period_debit_minor,
        period_credit_minor,
        closing_debit_minor,
        closing_credit_minor,
    };
    let difference_minor = [
        opening_debit_minor - opening_credit_minor,
        period_debit_minor - period_credit_minor,
        closing_debit_minor - closing_credit_minor,
    ]
    .into_iter()
    .map(|difference| difference.checked_abs().unwrap_or(i64::MAX))
    .max()
    .unwrap_or(0);

    let page_sql = format!(
        "{TRIAL_BALANCE_CTE}
         SELECT account_id, account_code, account_name, account_type,
                opening_debit, opening_credit, period_debit, period_credit,
                closing_debit, closing_credit
         FROM visible_rows
         WHERE (?5 IS NULL OR account_code LIKE ?5 ESCAPE '\\'
            OR account_name LIKE ?5 ESCAPE '\\'
            OR account_type LIKE ?5 ESCAPE '\\')
         ORDER BY account_code, account_id
         LIMIT ?6 OFFSET ?7"
    );
    let mut statement = connection.prepare(&page_sql)?;
    let rows = statement.query_map(
        params![
            book_id,
            filter.start_date.as_deref(),
            filter.end_date.as_deref(),
            filter.status.as_deref(),
            filter.query_pattern.as_deref(),
            filter.limit,
            filter.offset
        ],
        |row| {
            Ok(TrialBalanceRow {
                account_id: row.get(0)?,
                account_code: row.get(1)?,
                account_name: row.get(2)?,
                account_type: row.get(3)?,
                opening_debit_minor: row.get(4)?,
                opening_credit_minor: row.get(5)?,
                period_debit_minor: row.get(6)?,
                period_credit_minor: row.get(7)?,
                closing_debit_minor: row.get(8)?,
                closing_credit_minor: row.get(9)?,
            })
        },
    )?;

    Ok(TrialBalance {
        items: rows.collect::<Result<Vec<_>, _>>()?,
        totals,
        total,
        limit: filter.limit,
        offset: filter.offset,
        difference_minor,
    })
}

fn ensure_book_exists(connection: &Connection, book_id: &str) -> AppResult<()> {
    let exists: i64 = connection.query_row(
        "SELECT COUNT(*) FROM books WHERE id = ?1 AND is_active = 1",
        [book_id],
        |row| row.get(0),
    )?;
    if exists != 1 {
        return Err(AppError::Validation("選択した帳簿が見つかりません".into()));
    }
    Ok(())
}

fn find_ledger_account(
    connection: &Connection,
    book_id: &str,
    account_id: &str,
) -> AppResult<LedgerAccount> {
    connection
        .query_row(
            "SELECT a.id, a.code, a.name, a.normal_side
             FROM accounts a
             INNER JOIN book_accounts ba ON ba.account_id = a.id
             WHERE ba.book_id = ?1 AND a.id = ?2
               AND a.is_active = 1 AND ba.is_active = 1",
            [book_id, account_id],
            |row| {
                Ok(LedgerAccount {
                    id: row.get(0)?,
                    code: row.get(1)?,
                    name: row.get(2)?,
                    normal_side: row.get(3)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| AppError::Validation("選択した帳簿で使用できない勘定科目です".into()))
}
