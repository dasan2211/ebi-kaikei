use crate::{
    domain::phase4::Attachment,
    error::{AppError, AppResult},
};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use uuid::Uuid;

const MAX_ATTACHMENT_BYTES: usize = 20 * 1024 * 1024;

pub fn list(connection: &Connection, book_id: &str) -> AppResult<Vec<Attachment>> {
    let mut statement = connection.prepare(
        "SELECT evidence.id, evidence.entry_id, evidence.transaction_date,
                evidence.entry_description, evidence.source_type, evidence.original_name,
                evidence.media_type, evidence.size_bytes, evidence.external_url,
                evidence.created_at
         FROM (
             SELECT att.id, att.entry_id, je.transaction_date,
                    je.description AS entry_description, 'file' AS source_type,
                    att.original_name, att.media_type, att.size_bytes,
                    NULL AS external_url, att.created_at
             FROM attachments att
             INNER JOIN journal_entries je ON je.id = att.entry_id
             WHERE att.book_id = ?1
             UNION ALL
             SELECT link.id, link.entry_id, je.transaction_date,
                    je.description AS entry_description, 'url' AS source_type,
                    link.title AS original_name, NULL AS media_type, NULL AS size_bytes,
                    link.external_url, link.created_at
             FROM evidence_links link
             INNER JOIN journal_entries je ON je.id = link.entry_id
             WHERE link.book_id = ?1
         ) evidence
         ORDER BY evidence.created_at DESC, evidence.id DESC",
    )?;
    let rows = statement.query_map([book_id], |row| {
        Ok(Attachment {
            id: row.get(0)?,
            entry_id: row.get(1)?,
            transaction_date: row.get(2)?,
            entry_description: row.get(3)?,
            source_type: row.get(4)?,
            original_name: row.get(5)?,
            media_type: row.get(6)?,
            size_bytes: row.get(7)?,
            external_url: row.get(8)?,
            created_at: row.get(9)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn add_link(
    connection: &Connection,
    book_id: &str,
    entry_id: &str,
    title: &str,
    external_url: &str,
) -> AppResult<Attachment> {
    let title = validate_link_title(title)?;
    let external_url = validate_external_url(external_url)?;
    let entry_exists: i64 = connection.query_row(
        "SELECT COUNT(*) FROM journal_entries WHERE id = ?1 AND book_id = ?2",
        params![entry_id, book_id],
        |row| row.get(0),
    )?;
    if entry_exists != 1 {
        return Err(AppError::Validation(
            "The selected journal entry does not exist in this book".into(),
        ));
    }
    let id = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO evidence_links (id, book_id, entry_id, title, external_url, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, book_id, entry_id, title, external_url, created_at],
    )?;
    find_link(connection, book_id, &id)
}

pub fn open_link(connection: &Connection, book_id: &str, attachment_id: &str) -> AppResult<()> {
    let external_url = connection
        .query_row(
            "SELECT external_url FROM evidence_links WHERE id = ?1 AND book_id = ?2",
            params![attachment_id, book_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| AppError::Validation("The evidence URL does not exist".into()))?;
    let validated_url = validate_external_url(&external_url)?;
    open_external_url(&validated_url)
}

pub fn add(
    connection: &Connection,
    database_path: &Path,
    book_id: &str,
    entry_id: &str,
    original_name: &str,
    data: &[u8],
) -> AppResult<Attachment> {
    if data.is_empty() || data.len() > MAX_ATTACHMENT_BYTES {
        return Err(AppError::Validation(
            "Attachments must be between 1 byte and 20 MB".into(),
        ));
    }
    let safe_name = validate_original_name(original_name)?;
    let (media_type, extension) = detect_file_type(data)?;
    let entry_exists: i64 = connection.query_row(
        "SELECT COUNT(*) FROM journal_entries WHERE id = ?1 AND book_id = ?2",
        params![entry_id, book_id],
        |row| row.get(0),
    )?;
    if entry_exists != 1 {
        return Err(AppError::Validation(
            "The selected journal entry does not exist in this book".into(),
        ));
    }

    let directory = attachment_directory(database_path)?;
    fs::create_dir_all(&directory)?;
    let id = Uuid::new_v4().to_string();
    let storage_name = format!("{id}.{extension}");
    let final_path = directory.join(&storage_name);
    let temporary_path = directory.join(format!(".{storage_name}.tmp"));
    fs::write(&temporary_path, data)?;
    fs::rename(&temporary_path, &final_path)?;
    let created_at = Utc::now().to_rfc3339();
    if let Err(error) = connection.execute(
        "INSERT INTO attachments
         (id, book_id, entry_id, original_name, storage_name, media_type, size_bytes, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            book_id,
            entry_id,
            safe_name,
            storage_name,
            media_type,
            data.len() as i64,
            created_at
        ],
    ) {
        let _ = fs::remove_file(&final_path);
        return Err(error.into());
    }
    find(connection, book_id, &id)
}

pub fn reveal(
    connection: &Connection,
    database_path: &Path,
    book_id: &str,
    attachment_id: &str,
) -> AppResult<()> {
    let storage_name = find_storage_name(connection, book_id, attachment_id)?
        .ok_or_else(|| AppError::Validation("The attachment file does not exist".into()))?;
    let path = attachment_directory(database_path)?.join(storage_name);
    if !path.is_file() {
        return Err(AppError::Validation(
            "The attachment file is missing".into(),
        ));
    }
    reveal_file(&path)
}

pub fn delete(
    connection: &mut Connection,
    database_path: &Path,
    book_id: &str,
    attachment_id: &str,
) -> AppResult<()> {
    let Some(storage_name) = find_storage_name(connection, book_id, attachment_id)? else {
        let deleted = connection.execute(
            "DELETE FROM evidence_links WHERE id = ?1 AND book_id = ?2",
            params![attachment_id, book_id],
        )?;
        if deleted != 1 {
            return Err(AppError::Validation(
                "The evidence record does not exist".into(),
            ));
        }
        return Ok(());
    };
    let path = attachment_directory(database_path)?.join(storage_name);
    let staged_path = path.with_extension("deleting");
    if path.is_file() {
        fs::rename(&path, &staged_path)?;
    }
    let transaction = connection.transaction()?;
    let deleted = transaction.execute(
        "DELETE FROM attachments WHERE id = ?1 AND book_id = ?2",
        params![attachment_id, book_id],
    )?;
    if deleted != 1 {
        if staged_path.is_file() {
            let _ = fs::rename(&staged_path, &path);
        }
        return Err(AppError::Validation("The attachment does not exist".into()));
    }
    if let Err(error) = transaction.commit() {
        if staged_path.is_file() {
            let _ = fs::rename(&staged_path, &path);
        }
        return Err(error.into());
    }
    if staged_path.is_file() {
        fs::remove_file(staged_path)?;
    }
    Ok(())
}

fn find(connection: &Connection, book_id: &str, attachment_id: &str) -> AppResult<Attachment> {
    connection
        .query_row(
            "SELECT att.id, att.entry_id, je.transaction_date, je.description,
                    att.original_name, att.media_type, att.size_bytes, att.created_at
             FROM attachments att
             INNER JOIN journal_entries je ON je.id = att.entry_id
             WHERE att.book_id = ?1 AND att.id = ?2",
            params![book_id, attachment_id],
            |row| {
                Ok(Attachment {
                    id: row.get(0)?,
                    entry_id: row.get(1)?,
                    transaction_date: row.get(2)?,
                    entry_description: row.get(3)?,
                    source_type: "file".to_owned(),
                    original_name: row.get(4)?,
                    media_type: Some(row.get(5)?),
                    size_bytes: Some(row.get(6)?),
                    external_url: None,
                    created_at: row.get(7)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| AppError::Validation("The attachment does not exist".into()))
}

fn find_link(connection: &Connection, book_id: &str, attachment_id: &str) -> AppResult<Attachment> {
    connection
        .query_row(
            "SELECT link.id, link.entry_id, je.transaction_date, je.description,
                    link.title, link.external_url, link.created_at
             FROM evidence_links link
             INNER JOIN journal_entries je ON je.id = link.entry_id
             WHERE link.book_id = ?1 AND link.id = ?2",
            params![book_id, attachment_id],
            |row| {
                Ok(Attachment {
                    id: row.get(0)?,
                    entry_id: row.get(1)?,
                    transaction_date: row.get(2)?,
                    entry_description: row.get(3)?,
                    source_type: "url".to_owned(),
                    original_name: row.get(4)?,
                    media_type: None,
                    size_bytes: None,
                    external_url: Some(row.get(5)?),
                    created_at: row.get(6)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| AppError::Validation("The evidence URL does not exist".into()))
}

fn find_storage_name(
    connection: &Connection,
    book_id: &str,
    attachment_id: &str,
) -> AppResult<Option<String>> {
    Ok(connection
        .query_row(
            "SELECT storage_name FROM attachments WHERE id = ?1 AND book_id = ?2",
            params![attachment_id, book_id],
            |row| row.get(0),
        )
        .optional()?)
}

pub(crate) fn attachment_directory(database_path: &Path) -> AppResult<PathBuf> {
    database_path
        .parent()
        .map(|parent| parent.join("attachments"))
        .ok_or_else(|| AppError::Validation("The database directory is unavailable".into()))
}

fn validate_original_name(original_name: &str) -> AppResult<String> {
    let trimmed = original_name.trim();
    let path = Path::new(trimmed);
    if trimmed.is_empty()
        || trimmed.chars().count() > 255
        || path.file_name().and_then(|value| value.to_str()) != Some(trimmed)
        || trimmed.contains(['/', '\\', '\0'])
    {
        return Err(AppError::Validation("Invalid attachment file name".into()));
    }
    Ok(trimmed.to_owned())
}

fn validate_link_title(title: &str) -> AppResult<String> {
    let trimmed = title.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 255 || trimmed.chars().any(char::is_control)
    {
        return Err(AppError::Validation("Invalid evidence URL title".into()));
    }
    Ok(trimmed.to_owned())
}

fn validate_external_url(external_url: &str) -> AppResult<String> {
    let trimmed = external_url.trim();
    let authority_and_path = trimmed
        .strip_prefix("https://")
        .ok_or_else(|| AppError::Validation("Evidence URLs must use HTTPS".into()))?;
    let authority = authority_and_path
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default();
    if trimmed.len() > 2048
        || authority.is_empty()
        || authority.contains('@')
        || trimmed.contains(['\\', '\0'])
        || trimmed.chars().any(char::is_whitespace)
    {
        return Err(AppError::Validation("Invalid evidence URL".into()));
    }
    Ok(trimmed.to_owned())
}

fn detect_file_type(data: &[u8]) -> AppResult<(&'static str, &'static str)> {
    if data.starts_with(b"%PDF-") {
        return Ok(("application/pdf", "pdf"));
    }
    if data.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Ok(("image/png", "png"));
    }
    if data.starts_with(&[0xff, 0xd8, 0xff]) {
        return Ok(("image/jpeg", "jpg"));
    }
    if data.len() >= 12 && &data[..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        return Ok(("image/webp", "webp"));
    }
    Err(AppError::Validation(
        "Only PDF, PNG, JPEG, and WebP attachments are supported".into(),
    ))
}

#[cfg(target_os = "windows")]
fn reveal_file(path: &Path) -> AppResult<()> {
    Command::new("explorer")
        .arg(format!("/select,{}", path.display()))
        .spawn()?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn reveal_file(path: &Path) -> AppResult<()> {
    let directory = path
        .parent()
        .ok_or_else(|| AppError::Validation("Attachment directory is unavailable".into()))?;
    Command::new("xdg-open").arg(directory).spawn()?;
    Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn reveal_file(_path: &Path) -> AppResult<()> {
    Err(AppError::Validation(
        "Showing attachments is unsupported on this platform".into(),
    ))
}

#[cfg(target_os = "windows")]
fn open_external_url(external_url: &str) -> AppResult<()> {
    Command::new("rundll32.exe")
        .arg("url.dll,FileProtocolHandler")
        .arg(external_url)
        .spawn()?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn open_external_url(external_url: &str) -> AppResult<()> {
    Command::new("xdg-open").arg(external_url).spawn()?;
    Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn open_external_url(_external_url: &str) -> AppResult<()> {
    Err(AppError::Validation(
        "Opening evidence URLs is unsupported on this platform".into(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_type_detection_uses_content_not_the_extension() {
        assert_eq!(detect_file_type(b"%PDF-1.7 data").unwrap().1, "pdf");
        assert!(detect_file_type(b"not an image").is_err());
    }

    #[test]
    fn original_names_cannot_escape_the_attachment_directory() {
        assert!(validate_original_name("../receipt.pdf").is_err());
        assert!(validate_original_name("receipt.pdf").is_ok());
    }

    #[test]
    fn evidence_urls_require_https_without_embedded_credentials() {
        assert!(validate_external_url("https://example.com/receipt/1").is_ok());
        assert!(validate_external_url("http://example.com/receipt/1").is_err());
        assert!(validate_external_url("https://user:pass@example.com/receipt").is_err());
        assert!(validate_external_url("javascript:alert(1)").is_err());
    }
}
