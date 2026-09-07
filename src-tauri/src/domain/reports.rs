use crate::error::{AppError, AppResult};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

const DEFAULT_PAGE_SIZE: u32 = 100;
const MAX_PAGE_SIZE: u32 = 500;
const MAX_SEARCH_LENGTH: usize = 100;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportPageRequest {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub status: Option<String>,
    pub query: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralLedgerRequest {
    pub account_id: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub status: Option<String>,
    pub query: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct ValidatedReportFilter {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub status: Option<String>,
    pub query_pattern: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

impl ReportPageRequest {
    pub fn validate(&self) -> AppResult<ValidatedReportFilter> {
        validate_filter(
            &self.start_date,
            &self.end_date,
            &self.status,
            &self.query,
            self.limit,
            self.offset,
        )
    }
}

impl GeneralLedgerRequest {
    pub fn validate(&self) -> AppResult<ValidatedReportFilter> {
        if self.account_id.trim().is_empty() {
            return Err(AppError::Validation("勘定科目を選択してください".into()));
        }
        validate_filter(
            &self.start_date,
            &self.end_date,
            &self.status,
            &self.query,
            self.limit,
            self.offset,
        )
    }
}

fn validate_filter(
    start_date: &Option<String>,
    end_date: &Option<String>,
    status: &Option<String>,
    query: &Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> AppResult<ValidatedReportFilter> {
    for date in [start_date, end_date].into_iter().flatten() {
        NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map_err(|_| AppError::Validation("期間は正しい日付で指定してください".into()))?;
    }
    if let (Some(start), Some(end)) = (start_date, end_date) {
        if start > end {
            return Err(AppError::Validation(
                "開始日は終了日以前にしてください".into(),
            ));
        }
    }
    if let Some(value) = status {
        if !matches!(value.as_str(), "draft" | "posted" | "reversed") {
            return Err(AppError::Validation("仕訳状態の指定が不正です".into()));
        }
    }

    let query_pattern = query
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            if value.chars().count() > MAX_SEARCH_LENGTH {
                return Err(AppError::Validation(
                    "Search terms must be 100 characters or fewer".into(),
                ));
            }
            let escaped = value.chars().fold(String::new(), |mut output, character| {
                if matches!(character, '\\' | '%' | '_') {
                    output.push('\\');
                }
                output.push(character);
                output
            });
            Ok(format!("%{escaped}%"))
        })
        .transpose()?;

    Ok(ValidatedReportFilter {
        start_date: start_date.clone(),
        end_date: end_date.clone(),
        status: status.clone(),
        query_pattern,
        limit: limit.unwrap_or(DEFAULT_PAGE_SIZE).clamp(1, MAX_PAGE_SIZE) as i64,
        offset: offset.unwrap_or(0) as i64,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalBookLine {
    pub id: String,
    pub line_number: i64,
    pub account_id: String,
    pub account_code: String,
    pub account_name: String,
    pub side: String,
    pub amount_minor: i64,
    pub memo: Option<String>,
    pub tax_code_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalBookEntry {
    pub id: String,
    pub transaction_date: String,
    pub description: String,
    pub status: String,
    pub source_type: String,
    pub lines: Vec<JournalBookLine>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalBookPage {
    pub items: Vec<JournalBookEntry>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub draft_count: i64,
    pub last_posted_date: Option<String>,
    pub difference_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerAccount {
    pub id: String,
    pub code: String,
    pub name: String,
    pub normal_side: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralLedgerRow {
    pub line_id: String,
    pub entry_id: String,
    pub transaction_date: String,
    pub description: String,
    pub status: String,
    pub line_number: i64,
    pub debit_amount_minor: i64,
    pub credit_amount_minor: i64,
    pub balance_minor: i64,
    pub memo: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralLedgerPage {
    pub account: LedgerAccount,
    pub items: Vec<GeneralLedgerRow>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
    pub total_debit_minor: i64,
    pub total_credit_minor: i64,
    pub opening_balance_minor: i64,
    pub closing_balance_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrialBalanceRow {
    pub account_id: String,
    pub account_code: String,
    pub account_name: String,
    pub account_type: String,
    pub opening_debit_minor: i64,
    pub opening_credit_minor: i64,
    pub period_debit_minor: i64,
    pub period_credit_minor: i64,
    pub closing_debit_minor: i64,
    pub closing_credit_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrialBalanceTotals {
    pub opening_debit_minor: i64,
    pub opening_credit_minor: i64,
    pub period_debit_minor: i64,
    pub period_credit_minor: i64,
    pub closing_debit_minor: i64,
    pub closing_credit_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrialBalance {
    pub items: Vec<TrialBalanceRow>,
    pub totals: TrialBalanceTotals,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
    pub difference_minor: i64,
}
