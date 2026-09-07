use crate::{
    domain::reports::{GeneralLedgerRequest, ReportPageRequest},
    error::AppResult,
    repository::reports_repository,
};
use chrono::Local;
use rusqlite::Connection;
use serde::Serialize;
use std::{fs, path::Path};
use uuid::Uuid;

const EXPORT_PAGE_SIZE: u32 = 500;

pub struct CsvDocument {
    pub content: String,
    pub row_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedFile {
    pub path: String,
    pub file_name: String,
    pub row_count: usize,
}

pub fn journal_book(
    connection: &Connection,
    book_id: &str,
    request: &ReportPageRequest,
) -> AppResult<CsvDocument> {
    let mut content = String::from("\u{feff}");
    push_row(
        &mut content,
        &[
            "transaction_date",
            "entry_id",
            "status",
            "description",
            "line_number",
            "side",
            "account_code",
            "account_name",
            "amount_minor",
            "memo",
            "tax_code_id",
        ],
    );

    let mut offset = 0;
    let mut row_count = 0;
    loop {
        let page_request = paged_report_request(request, offset);
        let page = reports_repository::list_journal_book(connection, book_id, &page_request)?;
        let item_count = page.items.len();
        for entry in page.items {
            for line in entry.lines {
                push_owned_row(
                    &mut content,
                    &[
                        entry.transaction_date.clone(),
                        entry.id.clone(),
                        entry.status.clone(),
                        entry.description.clone(),
                        line.line_number.to_string(),
                        line.side,
                        line.account_code,
                        line.account_name,
                        line.amount_minor.to_string(),
                        line.memo.unwrap_or_default(),
                        line.tax_code_id.unwrap_or_default(),
                    ],
                );
                row_count += 1;
            }
        }
        if item_count == 0 || offset as i64 + item_count as i64 >= page.total {
            break;
        }
        offset = offset.saturating_add(item_count as u32);
    }

    Ok(CsvDocument { content, row_count })
}

pub fn general_ledger(
    connection: &Connection,
    book_id: &str,
    request: &GeneralLedgerRequest,
) -> AppResult<CsvDocument> {
    let mut content = String::from("\u{feff}");
    push_row(
        &mut content,
        &[
            "transaction_date",
            "entry_id",
            "status",
            "description",
            "line_number",
            "debit_amount_minor",
            "credit_amount_minor",
            "balance_minor",
            "memo",
        ],
    );

    let mut offset = 0;
    let mut row_count = 0;
    loop {
        let page_request = GeneralLedgerRequest {
            account_id: request.account_id.clone(),
            start_date: request.start_date.clone(),
            end_date: request.end_date.clone(),
            status: request.status.clone(),
            query: request.query.clone(),
            limit: Some(EXPORT_PAGE_SIZE),
            offset: Some(offset),
        };
        let page = reports_repository::list_general_ledger(connection, book_id, &page_request)?;
        let item_count = page.items.len();
        for row in page.items {
            push_owned_row(
                &mut content,
                &[
                    row.transaction_date,
                    row.entry_id,
                    row.status,
                    row.description,
                    row.line_number.to_string(),
                    row.debit_amount_minor.to_string(),
                    row.credit_amount_minor.to_string(),
                    row.balance_minor.to_string(),
                    row.memo.unwrap_or_default(),
                ],
            );
            row_count += 1;
        }
        if item_count == 0 || offset as i64 + item_count as i64 >= page.total {
            break;
        }
        offset = offset.saturating_add(item_count as u32);
    }

    Ok(CsvDocument { content, row_count })
}

pub fn trial_balance(
    connection: &Connection,
    book_id: &str,
    request: &ReportPageRequest,
) -> AppResult<CsvDocument> {
    let mut content = String::from("\u{feff}");
    push_row(
        &mut content,
        &[
            "account_code",
            "account_name",
            "account_type",
            "opening_debit_minor",
            "opening_credit_minor",
            "period_debit_minor",
            "period_credit_minor",
            "closing_debit_minor",
            "closing_credit_minor",
        ],
    );

    let mut offset = 0;
    let mut row_count = 0;
    loop {
        let page_request = paged_report_request(request, offset);
        let page = reports_repository::get_trial_balance(connection, book_id, &page_request)?;
        let item_count = page.items.len();
        for row in page.items {
            push_owned_row(
                &mut content,
                &[
                    row.account_code,
                    row.account_name,
                    row.account_type,
                    row.opening_debit_minor.to_string(),
                    row.opening_credit_minor.to_string(),
                    row.period_debit_minor.to_string(),
                    row.period_credit_minor.to_string(),
                    row.closing_debit_minor.to_string(),
                    row.closing_credit_minor.to_string(),
                ],
            );
            row_count += 1;
        }
        if item_count == 0 || offset as i64 + item_count as i64 >= page.total {
            break;
        }
        offset = offset.saturating_add(item_count as u32);
    }

    Ok(CsvDocument { content, row_count })
}

pub fn write_to_directory(
    directory: &Path,
    report_name: &str,
    document: CsvDocument,
) -> AppResult<ExportedFile> {
    fs::create_dir_all(directory)?;
    let timestamp = Local::now().format("%Y%m%d-%H%M%S");
    let unique_id = Uuid::new_v4().simple().to_string();
    let file_name = format!(
        "ebi-kaikei-{report_name}-{timestamp}-{}.csv",
        &unique_id[..8]
    );
    let path = directory.join(&file_name);
    let temporary_path = directory.join(format!(".{file_name}.tmp"));
    fs::write(&temporary_path, document.content.as_bytes())?;
    fs::rename(&temporary_path, &path)?;

    Ok(ExportedFile {
        path: path.to_string_lossy().into_owned(),
        file_name,
        row_count: document.row_count,
    })
}

fn paged_report_request(request: &ReportPageRequest, offset: u32) -> ReportPageRequest {
    ReportPageRequest {
        start_date: request.start_date.clone(),
        end_date: request.end_date.clone(),
        status: request.status.clone(),
        query: request.query.clone(),
        limit: Some(EXPORT_PAGE_SIZE),
        offset: Some(offset),
    }
}

fn push_owned_row(output: &mut String, fields: &[String]) {
    let borrowed = fields.iter().map(String::as_str).collect::<Vec<_>>();
    push_row(output, &borrowed);
}

fn push_row(output: &mut String, fields: &[&str]) {
    for (index, field) in fields.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        push_field(output, field);
    }
    output.push_str("\r\n");
}

fn push_field(output: &mut String, field: &str) {
    if field.contains([',', '"', '\r', '\n']) {
        output.push('"');
        output.push_str(&field.replace('"', "\"\""));
        output.push('"');
    } else {
        output.push_str(field);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_fields_quote_delimiters_quotes_and_newlines() {
        let mut output = String::new();
        push_row(
            &mut output,
            &["plain", "comma,value", "say \"hello\"", "two\nlines"],
        );
        assert_eq!(
            output,
            "plain,\"comma,value\",\"say \"\"hello\"\"\",\"two\nlines\"\r\n"
        );
    }

    #[test]
    fn writing_a_document_uses_a_unique_csv_name() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let result = write_to_directory(
            directory.path(),
            "journal",
            CsvDocument {
                content: "\u{feff}header\r\n".to_owned(),
                row_count: 3,
            },
        )
        .expect("write CSV");

        assert!(directory.path().join(&result.file_name).is_file());
        assert!(result.file_name.starts_with("ebi-kaikei-journal-"));
        assert_eq!(result.row_count, 3);
    }
}
