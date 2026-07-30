use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("入力エラー: {0}")]
    Validation(String),
    #[error("データベースエラー: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("ファイル操作エラー: {0}")]
    Io(#[from] std::io::Error),
    #[error("内部状態を取得できませんでした")]
    State,
}

pub type AppResult<T> = Result<T, AppError>;
