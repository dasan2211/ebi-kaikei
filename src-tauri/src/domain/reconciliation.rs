use crate::error::{AppError, AppResult};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

const MAX_MEMO_LENGTH: usize = 500;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceReconciliationRequest {
    pub account_id: String,
    pub reconciliation_date: String,
    pub actual_balance_minor: i64,
}

impl BalanceReconciliationRequest {
    pub fn validate(&self) -> AppResult<()> {
        if self.account_id.trim().is_empty() {
            return Err(AppError::Validation(
                "照合する勘定科目を選択してください".into(),
            ));
        }
        NaiveDate::parse_from_str(&self.reconciliation_date, "%Y-%m-%d").map_err(|_| {
            AppError::Validation("照合日は実在するYYYY-MM-DD形式で入力してください".into())
        })?;
        if self.actual_balance_minor < 0 {
            return Err(AppError::Validation(
                "実残高は0円以上で入力してください".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceAdjustmentRequest {
    pub account_id: String,
    pub adjustment_account_id: String,
    pub reconciliation_date: String,
    pub actual_balance_minor: i64,
    pub memo: Option<String>,
}

impl BalanceAdjustmentRequest {
    pub fn validate(&self) -> AppResult<()> {
        BalanceReconciliationRequest {
            account_id: self.account_id.clone(),
            reconciliation_date: self.reconciliation_date.clone(),
            actual_balance_minor: self.actual_balance_minor,
        }
        .validate()?;
        if self.adjustment_account_id.trim().is_empty() {
            return Err(AppError::Validation(
                "差額の相手科目を選択してください".into(),
            ));
        }
        if self.account_id == self.adjustment_account_id {
            return Err(AppError::Validation(
                "照合科目と差額の相手科目には異なる科目を選択してください".into(),
            ));
        }
        if self
            .memo
            .as_deref()
            .is_some_and(|memo| memo.chars().count() > MAX_MEMO_LENGTH)
        {
            return Err(AppError::Validation(
                "差額のメモは500文字以内で入力してください".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceReconciliation {
    pub account_id: String,
    pub account_code: String,
    pub account_name: String,
    pub normal_side: String,
    pub reconciliation_date: String,
    pub ledger_balance_minor: i64,
    pub actual_balance_minor: i64,
    pub difference_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceAdjustmentResult {
    pub journal_entry_id: String,
    pub reconciliation: BalanceReconciliation,
}
