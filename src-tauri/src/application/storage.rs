use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::{path::Path, process::Command};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
}

pub fn database_info(path: &Path) -> AppResult<DatabaseInfo> {
    let metadata = std::fs::metadata(path)?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::Validation("データベースファイル名を取得できません".into()))?;

    Ok(DatabaseInfo {
        path: path.to_string_lossy().into_owned(),
        file_name: file_name.to_owned(),
        size_bytes: metadata.len(),
    })
}

pub fn reveal_database_file(path: &Path) -> AppResult<()> {
    std::fs::metadata(path)?;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(format!("/select,{}", path.display()))
            .spawn()?;
    }

    #[cfg(target_os = "linux")]
    {
        let directory = path
            .parent()
            .ok_or_else(|| AppError::Validation("データベースの保存先を取得できません".into()))?;
        Command::new("xdg-open").arg(directory).spawn()?;
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        return Err(AppError::Validation(
            "このOSではデータベースファイルを表示できません".into(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::database_info;

    #[test]
    fn database_info_returns_the_file_path_and_size() {
        let directory = tempfile::tempdir().expect("一時ディレクトリを作成");
        let path = directory.path().join("accounting.sqlite");
        std::fs::write(&path, b"ebi-kaikei").expect("テストファイルを作成");

        let info = database_info(&path).expect("データベース情報を取得");

        assert_eq!(info.file_name, "accounting.sqlite");
        assert_eq!(info.size_bytes, 10);
        assert!(info.path.ends_with("accounting.sqlite"));
    }
}
