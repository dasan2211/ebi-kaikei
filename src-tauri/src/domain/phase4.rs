use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaxCode {
    pub id: String,
    pub code: String,
    pub name: String,
    pub rate_bps: i64,
    pub category: String,
    pub direction: String,
    pub is_reduced: bool,
    pub valid_from: String,
    pub valid_to: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaxSummaryRow {
    pub tax_code_id: String,
    pub code: String,
    pub name: String,
    pub direction: String,
    pub rate_bps: i64,
    pub gross_amount_minor: i64,
    pub net_amount_minor: i64,
    pub tax_amount_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaxSummary {
    pub rows: Vec<TaxSummaryRow>,
    pub output_tax_minor: i64,
    pub input_tax_minor: i64,
    pub difference_minor: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFixedAssetRequest {
    pub name: String,
    pub asset_account_id: String,
    pub acquisition_date: String,
    pub acquisition_cost_minor: i64,
    pub residual_value_minor: i64,
    pub useful_life_years: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixedAsset {
    pub id: String,
    pub name: String,
    pub asset_account_id: String,
    pub asset_account_code: String,
    pub asset_account_name: String,
    pub acquisition_date: String,
    pub acquisition_cost_minor: i64,
    pub residual_value_minor: i64,
    pub useful_life_years: i64,
    pub depreciation_method: String,
    pub status: String,
    pub accumulated_depreciation_minor: i64,
    pub book_value_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DepreciationResult {
    pub asset_id: String,
    pub fiscal_year: i64,
    pub amount_minor: i64,
    pub journal_entry_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryAdjustmentRequest {
    pub fiscal_year: i64,
    pub count_date: String,
    pub beginning_inventory_minor: i64,
    pub ending_inventory_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryCount {
    pub id: String,
    pub fiscal_year: i64,
    pub count_date: String,
    pub beginning_inventory_minor: i64,
    pub ending_inventory_minor: i64,
    pub cost_of_goods_sold_minor: i64,
    pub journal_entry_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub entry_id: String,
    pub transaction_date: String,
    pub entry_description: String,
    pub source_type: String,
    pub original_name: String,
    pub media_type: Option<String>,
    pub size_bytes: Option<i64>,
    pub external_url: Option<String>,
    pub created_at: String,
}
