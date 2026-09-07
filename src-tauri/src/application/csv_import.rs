use crate::{
    domain::journal_entry::{DraftJournalEntry, JournalLine, Side},
    error::{AppError, AppResult},
    repository::journal_repository,
};
use rusqlite::Connection;
use serde::Serialize;
use std::collections::HashMap;

const MAX_CSV_BYTES: usize = 50 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvImportPreview {
    pub entry_count: usize,
    pub line_count: usize,
    pub total_debit_minor: i64,
    pub total_credit_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CsvImportResult {
    pub imported_entry_count: usize,
    pub imported_line_count: usize,
}

pub fn preview(
    connection: &Connection,
    book_id: &str,
    csv_content: &str,
) -> AppResult<CsvImportPreview> {
    let entries = parse_and_validate(connection, book_id, csv_content)?;
    Ok(preview_for(&entries))
}

pub fn import(
    connection: &mut Connection,
    book_id: &str,
    csv_content: &str,
) -> AppResult<CsvImportResult> {
    let entries = parse_and_validate(connection, book_id, csv_content)?;
    let result = preview_for(&entries);
    journal_repository::save_imported_drafts(connection, book_id, &entries)?;
    Ok(CsvImportResult {
        imported_entry_count: result.entry_count,
        imported_line_count: result.line_count,
    })
}

fn preview_for(entries: &[(String, DraftJournalEntry)]) -> CsvImportPreview {
    let mut total_debit_minor = 0_i64;
    let mut total_credit_minor = 0_i64;
    let mut line_count = 0;
    for (_, entry) in entries {
        for line in &entry.lines {
            line_count += 1;
            match line.side {
                Side::Debit => total_debit_minor += line.amount_minor,
                Side::Credit => total_credit_minor += line.amount_minor,
            }
        }
    }
    CsvImportPreview {
        entry_count: entries.len(),
        line_count,
        total_debit_minor,
        total_credit_minor,
    }
}

fn parse_and_validate(
    connection: &Connection,
    book_id: &str,
    csv_content: &str,
) -> AppResult<Vec<(String, DraftJournalEntry)>> {
    if csv_content.len() > MAX_CSV_BYTES {
        return Err(AppError::Validation(
            "CSV files must be 50 MB or smaller".into(),
        ));
    }
    let records = parse_records(csv_content)?;
    let Some(header) = records.first() else {
        return Err(AppError::Validation("The CSV file is empty".into()));
    };
    let columns = HeaderColumns::from_header(header)?;
    let accounts = account_ids_by_code(connection, book_id)?;
    let tax_codes = tax_code_periods(connection)?;
    let mut entries: Vec<RawEntry> = Vec::new();
    let mut entry_indexes: HashMap<String, usize> = HashMap::new();

    for (row_index, record) in records.iter().enumerate().skip(1) {
        if record.iter().all(|field| field.trim().is_empty()) {
            continue;
        }
        let row_number = row_index + 1;
        let source_id = columns.required(record, columns.entry_id, row_number, "entry_id")?;
        let transaction_date = columns.required(
            record,
            columns.transaction_date,
            row_number,
            "transaction_date",
        )?;
        let description =
            columns.required(record, columns.description, row_number, "description")?;
        let line_number = columns
            .required(record, columns.line_number, row_number, "line_number")?
            .parse::<usize>()
            .map_err(|_| row_error(row_number, "line_number must be a positive integer"))?;
        if line_number == 0 {
            return Err(row_error(
                row_number,
                "line_number must be a positive integer",
            ));
        }
        let side = match columns
            .required(record, columns.side, row_number, "side")?
            .as_str()
        {
            "debit" => Side::Debit,
            "credit" => Side::Credit,
            _ => return Err(row_error(row_number, "side must be debit or credit")),
        };
        let account_code =
            columns.required(record, columns.account_code, row_number, "account_code")?;
        let account_id = accounts.get(&account_code).cloned().ok_or_else(|| {
            row_error(
                row_number,
                &format!("account code {account_code} is unavailable in this book"),
            )
        })?;
        let amount_minor = columns
            .required(record, columns.amount_minor, row_number, "amount_minor")?
            .parse::<i64>()
            .map_err(|_| row_error(row_number, "amount_minor must be a positive integer"))?;
        if amount_minor <= 0 {
            return Err(row_error(
                row_number,
                "amount_minor must be a positive integer",
            ));
        }
        let memo = columns
            .memo
            .and_then(|index| record.get(index))
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());
        let tax_code_id = columns
            .tax_code_id
            .and_then(|index| record.get(index))
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());
        if let Some(tax_code_id) = tax_code_id.as_deref() {
            let effective = tax_codes.get(tax_code_id).is_some_and(|(from, to)| {
                from.as_str() <= transaction_date.as_str()
                    && to
                        .as_deref()
                        .is_none_or(|to| to >= transaction_date.as_str())
            });
            if !effective {
                return Err(row_error(
                    row_number,
                    "tax_code_id is not effective on the transaction date",
                ));
            }
        }

        let entry_index = if let Some(index) = entry_indexes.get(&source_id) {
            *index
        } else {
            let index = entries.len();
            entry_indexes.insert(source_id.clone(), index);
            entries.push(RawEntry {
                source_id: source_id.clone(),
                transaction_date: transaction_date.clone(),
                description: description.clone(),
                lines: Vec::new(),
            });
            index
        };
        let entry = &mut entries[entry_index];
        if entry.transaction_date != transaction_date || entry.description != description {
            return Err(row_error(
                row_number,
                "rows with the same entry_id must have the same date and description",
            ));
        }
        if entry
            .lines
            .iter()
            .any(|line| line.line_number == line_number)
        {
            return Err(row_error(
                row_number,
                "line_number is duplicated within the entry",
            ));
        }
        entry.lines.push(RawLine {
            line_number,
            account_id,
            side,
            amount_minor,
            memo,
            tax_code_id,
        });
    }

    if entries.is_empty() {
        return Err(AppError::Validation(
            "The CSV file contains no journal entries".into(),
        ));
    }

    entries
        .into_iter()
        .map(|mut raw| {
            raw.lines.sort_by_key(|line| line.line_number);
            let entry = DraftJournalEntry {
                transaction_date: raw.transaction_date,
                description: raw.description,
                lines: raw
                    .lines
                    .into_iter()
                    .map(|line| JournalLine {
                        account_id: line.account_id,
                        side: line.side,
                        amount_minor: line.amount_minor,
                        memo: line.memo,
                        tax_code_id: line.tax_code_id,
                    })
                    .collect(),
            };
            entry.validate()?;
            Ok((raw.source_id, entry))
        })
        .collect()
}

fn account_ids_by_code(
    connection: &Connection,
    book_id: &str,
) -> AppResult<HashMap<String, String>> {
    let mut statement = connection.prepare(
        "SELECT a.code, a.id
         FROM accounts a
         INNER JOIN book_accounts ba ON ba.account_id = a.id
         WHERE ba.book_id = ?1 AND ba.is_active = 1 AND a.is_active = 1",
    )?;
    let rows = statement.query_map([book_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    Ok(rows.collect::<Result<HashMap<_, _>, _>>()?)
}

fn tax_code_periods(
    connection: &Connection,
) -> AppResult<HashMap<String, (String, Option<String>)>> {
    let mut statement =
        connection.prepare("SELECT id, valid_from, valid_to FROM tax_codes WHERE is_active = 1")?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            (row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?),
        ))
    })?;
    Ok(rows.collect::<Result<HashMap<_, _>, _>>()?)
}

fn parse_records(input: &str) -> AppResult<Vec<Vec<String>>> {
    let input = input.strip_prefix('\u{feff}').unwrap_or(input);
    let mut records = Vec::new();
    let mut record = Vec::new();
    let mut field = String::new();
    let mut characters = input.chars().peekable();
    let mut quoted = false;

    while let Some(character) = characters.next() {
        if quoted {
            if character == '"' {
                if characters.peek() == Some(&'"') {
                    characters.next();
                    field.push('"');
                } else {
                    quoted = false;
                }
            } else {
                field.push(character);
            }
            continue;
        }

        match character {
            '"' if field.is_empty() => quoted = true,
            '"' => return Err(AppError::Validation("Unexpected quote in CSV field".into())),
            ',' => record.push(std::mem::take(&mut field)),
            '\n' => finish_record(&mut records, &mut record, &mut field),
            '\r' => {
                if characters.peek() == Some(&'\n') {
                    characters.next();
                }
                finish_record(&mut records, &mut record, &mut field);
            }
            _ => field.push(character),
        }
    }
    if quoted {
        return Err(AppError::Validation(
            "The CSV file has an unclosed quote".into(),
        ));
    }
    if !field.is_empty() || !record.is_empty() {
        finish_record(&mut records, &mut record, &mut field);
    }
    Ok(records)
}

fn finish_record(records: &mut Vec<Vec<String>>, record: &mut Vec<String>, field: &mut String) {
    record.push(std::mem::take(field));
    records.push(std::mem::take(record));
}

fn row_error(row_number: usize, message: &str) -> AppError {
    AppError::Validation(format!("CSV row {row_number}: {message}"))
}

struct HeaderColumns {
    transaction_date: usize,
    entry_id: usize,
    description: usize,
    line_number: usize,
    side: usize,
    account_code: usize,
    amount_minor: usize,
    memo: Option<usize>,
    tax_code_id: Option<usize>,
}

impl HeaderColumns {
    fn from_header(header: &[String]) -> AppResult<Self> {
        let indexes = header
            .iter()
            .enumerate()
            .map(|(index, name)| (name.trim().to_owned(), index))
            .collect::<HashMap<_, _>>();
        let required = |name: &str| {
            indexes.get(name).copied().ok_or_else(|| {
                AppError::Validation(format!("Required CSV column is missing: {name}"))
            })
        };
        Ok(Self {
            transaction_date: required("transaction_date")?,
            entry_id: required("entry_id")?,
            description: required("description")?,
            line_number: required("line_number")?,
            side: required("side")?,
            account_code: required("account_code")?,
            amount_minor: required("amount_minor")?,
            memo: indexes.get("memo").copied(),
            tax_code_id: indexes.get("tax_code_id").copied(),
        })
    }

    fn required(
        &self,
        record: &[String],
        index: usize,
        row_number: usize,
        name: &str,
    ) -> AppResult<String> {
        record
            .get(index)
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| row_error(row_number, &format!("{name} is required")))
    }
}

struct RawEntry {
    source_id: String,
    transaction_date: String,
    description: String,
    lines: Vec<RawLine>,
}

struct RawLine {
    line_number: usize,
    account_id: String,
    side: Side,
    amount_minor: i64,
    memo: Option<String>,
    tax_code_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parser_handles_bom_quotes_commas_and_embedded_newlines() {
        let records = parse_records("\u{feff}a,b,c\r\n1,\"two, fields\",\"three\nlines\"\r\n")
            .expect("parse CSV");
        assert_eq!(records[0], ["a", "b", "c"]);
        assert_eq!(records[1], ["1", "two, fields", "three\nlines"]);
    }

    #[test]
    fn parser_rejects_unclosed_quotes() {
        let error = parse_records("a,b\n1,\"open").expect_err("reject invalid CSV");
        assert!(error.to_string().contains("unclosed quote"));
    }
}
