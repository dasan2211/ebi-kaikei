use crate::error::{AppError, AppResult};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Debit,
    Credit,
}

impl Side {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Debit => "debit",
            Self::Credit => "credit",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalLine {
    pub account_id: String,
    pub side: Side,
    pub amount_minor: i64,
    pub memo: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftJournalEntry {
    pub transaction_date: String,
    pub description: String,
    pub lines: Vec<JournalLine>,
}

impl DraftJournalEntry {
    pub fn validate(&self) -> AppResult<()> {
        NaiveDate::parse_from_str(&self.transaction_date, "%Y-%m-%d").map_err(|_| {
            AppError::Validation("取引日は実在するYYYY-MM-DD形式で入力してください".into())
        })?;
        if self.description.trim().is_empty() {
            return Err(AppError::Validation("摘要を入力してください".into()));
        }
        if self.lines.len() < 2 {
            return Err(AppError::Validation("仕訳明細は2行以上必要です".into()));
        }

        let mut debit = 0_i64;
        let mut credit = 0_i64;
        for line in &self.lines {
            if line.account_id.trim().is_empty() {
                return Err(AppError::Validation("勘定科目を選択してください".into()));
            }
            if line.amount_minor <= 0 {
                return Err(AppError::Validation(
                    "金額は1円以上で入力してください".into(),
                ));
            }
            match line.side {
                Side::Debit => {
                    debit = debit.checked_add(line.amount_minor).ok_or_else(|| {
                        AppError::Validation("金額合計が上限を超えています".into())
                    })?;
                }
                Side::Credit => {
                    credit = credit.checked_add(line.amount_minor).ok_or_else(|| {
                        AppError::Validation("金額合計が上限を超えています".into())
                    })?;
                }
            }
        }
        if debit != credit {
            return Err(AppError::Validation(format!(
                "貸借が一致しません（借方{debit}円 / 貸方{credit}円）"
            )));
        }
        Ok(())
    }
}
