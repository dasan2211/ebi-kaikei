use chrono::Utc;
use rusqlite::{params, Connection, Transaction};
use uuid::Uuid;

use crate::{
    domain::journal_template::{JournalTemplate, JournalTemplateLine, SaveJournalTemplateRequest},
    error::{AppError, AppResult},
};

pub fn list(connection: &Connection, book_id: &str) -> AppResult<Vec<JournalTemplate>> {
    ensure_active_book(connection, book_id)?;
    let mut template_statement = connection.prepare(
        "SELECT id, name, description_template
         FROM journal_templates WHERE book_id = ?1
         ORDER BY name COLLATE NOCASE, created_at",
    )?;
    let headers = template_statement
        .query_map([book_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut templates = Vec::with_capacity(headers.len());
    for (id, name, description_template) in headers {
        let mut line_statement = connection.prepare(
            "SELECT account_id, side, amount_minor, memo_template, tax_code_id
             FROM journal_template_lines WHERE template_id = ?1 ORDER BY line_number",
        )?;
        let lines = line_statement
            .query_map([&id], |row| {
                let side: String = row.get(1)?;
                Ok(JournalTemplateLine {
                    account_id: row.get(0)?,
                    side: if side == "debit" {
                        crate::domain::journal_entry::Side::Debit
                    } else {
                        crate::domain::journal_entry::Side::Credit
                    },
                    amount_minor: row.get(2)?,
                    memo_template: row.get(3)?,
                    tax_code_id: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        templates.push(JournalTemplate {
            id,
            name,
            description_template,
            lines,
        });
    }
    Ok(templates)
}

pub fn save(
    connection: &mut Connection,
    book_id: &str,
    request: &SaveJournalTemplateRequest,
) -> AppResult<String> {
    request.validate()?;
    let transaction = connection.transaction()?;
    ensure_active_book(&transaction, book_id)?;
    validate_accounts_and_tax_codes(&transaction, book_id, request)?;

    let now = Utc::now().to_rfc3339();
    let template_id = request
        .id
        .as_deref()
        .filter(|id| !id.trim().is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    if request.id.is_some() {
        let changed = transaction.execute(
            "UPDATE journal_templates
             SET name = ?1, description_template = ?2, updated_at = ?3
             WHERE id = ?4 AND book_id = ?5",
            params![
                request.name.trim(),
                request.description_template.trim(),
                now,
                template_id,
                book_id
            ],
        )?;
        if changed != 1 {
            return Err(AppError::Validation(
                "この帳簿に指定されたテンプレートはありません".into(),
            ));
        }
        transaction.execute(
            "DELETE FROM journal_template_lines WHERE template_id = ?1",
            [&template_id],
        )?;
    } else {
        transaction.execute(
            "INSERT INTO journal_templates
             (id, book_id, name, description_template, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![
                template_id,
                book_id,
                request.name.trim(),
                request.description_template.trim(),
                now
            ],
        )?;
    }

    for (index, line) in request.lines.iter().enumerate() {
        let memo_template = line
            .memo_template
            .as_deref()
            .map(str::trim)
            .filter(|memo| !memo.is_empty());
        transaction.execute(
            "INSERT INTO journal_template_lines
             (id, template_id, line_number, account_id, side, amount_minor, memo_template, tax_code_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                template_id,
                index as i64 + 1,
                line.account_id,
                line.side.as_str(),
                line.amount_minor,
                memo_template,
                line.tax_code_id
            ],
        )?;
    }
    transaction.commit()?;
    Ok(template_id)
}

pub fn delete(connection: &Connection, book_id: &str, template_id: &str) -> AppResult<()> {
    ensure_active_book(connection, book_id)?;
    let changed = connection.execute(
        "DELETE FROM journal_templates WHERE id = ?1 AND book_id = ?2",
        params![template_id, book_id],
    )?;
    if changed != 1 {
        return Err(AppError::Validation(
            "この帳簿に指定されたテンプレートはありません".into(),
        ));
    }
    Ok(())
}

fn ensure_active_book(connection: &Connection, book_id: &str) -> AppResult<()> {
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

fn validate_accounts_and_tax_codes(
    transaction: &Transaction<'_>,
    book_id: &str,
    request: &SaveJournalTemplateRequest,
) -> AppResult<()> {
    for line in &request.lines {
        let account_exists: i64 = transaction.query_row(
            "SELECT COUNT(*) FROM book_accounts ba
             INNER JOIN accounts a ON a.id = ba.account_id
             WHERE ba.book_id = ?1 AND ba.account_id = ?2
               AND ba.is_active = 1 AND a.is_active = 1",
            params![book_id, line.account_id],
            |row| row.get(0),
        )?;
        if account_exists != 1 {
            return Err(AppError::Validation(
                "この帳簿で使用できない勘定科目が含まれています".into(),
            ));
        }
        if let Some(tax_code_id) = line.tax_code_id.as_deref() {
            let tax_code_exists: i64 = transaction.query_row(
                "SELECT COUNT(*) FROM tax_codes WHERE id = ?1 AND is_active = 1",
                [tax_code_id],
                |row| row.get(0),
            )?;
            if tax_code_exists != 1 {
                return Err(AppError::Validation(
                    "使用できない税区分が含まれています".into(),
                ));
            }
        }
    }
    Ok(())
}
