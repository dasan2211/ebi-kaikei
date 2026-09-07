use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

use super::journal_entry::Side;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalTemplateLine {
    pub account_id: String,
    pub side: Side,
    pub amount_minor: i64,
    pub memo_template: Option<String>,
    #[serde(default)]
    pub tax_code_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalTemplate {
    pub id: String,
    pub name: String,
    pub description_template: String,
    pub lines: Vec<JournalTemplateLine>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveJournalTemplateRequest {
    pub id: Option<String>,
    pub name: String,
    pub description_template: String,
    pub lines: Vec<JournalTemplateLine>,
}

impl SaveJournalTemplateRequest {
    pub fn validate(&self) -> AppResult<()> {
        if self.name.trim().is_empty() {
            return Err(AppError::Validation(
                "テンプレート名を入力してください".into(),
            ));
        }
        if self.description_template.trim().is_empty() {
            return Err(AppError::Validation(
                "摘要テンプレートを入力してください".into(),
            ));
        }
        if self.lines.len() < 2 {
            return Err(AppError::Validation(
                "定型仕訳には2行以上の明細が必要です".into(),
            ));
        }

        let mut debit = 0_i64;
        let mut credit = 0_i64;
        for line in &self.lines {
            if line.account_id.trim().is_empty() {
                return Err(AppError::Validation(
                    "すべての明細で勘定科目を選択してください".into(),
                ));
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
            return Err(AppError::Validation(
                "定型仕訳の借方と貸方が一致していません".into(),
            ));
        }
        Ok(())
    }
}
