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
    #[serde(default)]
    pub tax_code_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftJournalEntry {
    pub transaction_date: String,
    pub description: String,
    pub lines: Vec<JournalLine>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalCorrectionResult {
    pub reversal_entry_id: String,
    pub replacement_entry_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleExpenseRequest {
    pub transaction_date: String,
    pub description: String,
    pub expense_account_id: String,
    pub payment_account_id: String,
    pub amount_minor: i64,
    pub memo: Option<String>,
    #[serde(default)]
    pub tax_code_id: Option<String>,
}

impl SimpleExpenseRequest {
    pub fn validate(&self) -> AppResult<()> {
        NaiveDate::parse_from_str(&self.transaction_date, "%Y-%m-%d").map_err(|_| {
            AppError::Validation("取引日は実在するYYYY-MM-DD形式で入力してください".into())
        })?;
        if self.description.trim().is_empty() {
            return Err(AppError::Validation("摘要を入力してください".into()));
        }
        if self.expense_account_id.trim().is_empty() || self.payment_account_id.trim().is_empty() {
            return Err(AppError::Validation(
                "費用科目と支払元を選択してください".into(),
            ));
        }
        if self.expense_account_id == self.payment_account_id {
            return Err(AppError::Validation(
                "費用科目と支払元には異なる科目を選択してください".into(),
            ));
        }
        if self.amount_minor <= 0 {
            return Err(AppError::Validation(
                "金額は1円以上で入力してください".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleSaleRequest {
    pub transaction_date: String,
    pub description: String,
    pub revenue_account_id: String,
    pub receipt_account_id: String,
    pub amount_minor: i64,
    pub memo: Option<String>,
    #[serde(default)]
    pub tax_code_id: Option<String>,
}

impl SimpleSaleRequest {
    pub fn validate(&self) -> AppResult<()> {
        validate_simple_transaction(&self.transaction_date, &self.description, self.amount_minor)?;
        if self.revenue_account_id.trim().is_empty() || self.receipt_account_id.trim().is_empty() {
            return Err(AppError::Validation(
                "売上科目と受取方法を選択してください".into(),
            ));
        }
        if self.revenue_account_id == self.receipt_account_id {
            return Err(AppError::Validation(
                "売上科目と受取方法には異なる科目を選択してください".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SimpleSettlementType {
    ReceivableCollection,
    PayablePayment,
    LoanDisbursement,
    BorrowingReceipt,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleSettlementRequest {
    pub transaction_date: String,
    pub description: String,
    pub settlement_type: SimpleSettlementType,
    pub cash_account_id: String,
    pub settlement_account_id: String,
    pub amount_minor: i64,
    pub memo: Option<String>,
}

impl SimpleSettlementRequest {
    pub fn validate(&self) -> AppResult<()> {
        validate_simple_transaction(&self.transaction_date, &self.description, self.amount_minor)?;
        if self.cash_account_id.trim().is_empty() || self.settlement_account_id.trim().is_empty() {
            return Err(AppError::Validation(
                "現金・預金科目と貸し借りの勘定科目を選択してください".into(),
            ));
        }
        if self.cash_account_id == self.settlement_account_id {
            return Err(AppError::Validation(
                "現金・預金科目と貸し借りの勘定科目には異なる科目を選択してください".into(),
            ));
        }
        Ok(())
    }
}

fn validate_simple_transaction(
    transaction_date: &str,
    description: &str,
    amount_minor: i64,
) -> AppResult<()> {
    NaiveDate::parse_from_str(transaction_date, "%Y-%m-%d").map_err(|_| {
        AppError::Validation("取引日は実在するYYYY-MM-DD形式で入力してください".into())
    })?;
    if description.trim().is_empty() {
        return Err(AppError::Validation("摘要を入力してください".into()));
    }
    if amount_minor <= 0 {
        return Err(AppError::Validation(
            "金額は1円以上で入力してください".into(),
        ));
    }
    Ok(())
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
