use crate::{
    domain::phase4::{
        CreateFixedAssetRequest, DepreciationResult, FixedAsset, InventoryAdjustmentRequest,
        InventoryCount, TaxCode, TaxSummary, TaxSummaryRow,
    },
    error::{AppError, AppResult},
};
use chrono::{Datelike, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use uuid::Uuid;

const DEPRECIATION_ACCOUNT_ID: &str = "account-depreciation";
const EQUIPMENT_ACCOUNT_ID: &str = "account-equipment";
const ACCUMULATED_DEPRECIATION_ACCOUNT_ID: &str = "account-equipment-accumulated-depreciation";
const INVENTORY_ACCOUNT_ID: &str = "account-inventory";
const PURCHASES_ACCOUNT_ID: &str = "account-purchases";

pub fn list_tax_codes(
    connection: &Connection,
    date: &str,
    locale: &str,
) -> AppResult<Vec<TaxCode>> {
    validate_date(date)?;
    if !matches!(locale, "ja" | "en") {
        return Err(AppError::Validation("Unsupported locale".into()));
    }
    let name_column = if locale == "en" { "en_name" } else { "ja_name" };
    let sql = format!(
        "SELECT id, code, {name_column}, rate_bps, category, direction, is_reduced, valid_from, valid_to
         FROM tax_codes
         WHERE is_active = 1 AND valid_from <= ?1 AND (valid_to IS NULL OR valid_to >= ?1)
         ORDER BY CASE direction WHEN 'sales' THEN 1 WHEN 'purchase' THEN 2 ELSE 3 END, code"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([date], |row| {
        Ok(TaxCode {
            id: row.get(0)?,
            code: row.get(1)?,
            name: row.get(2)?,
            rate_bps: row.get(3)?,
            category: row.get(4)?,
            direction: row.get(5)?,
            is_reduced: row.get::<_, i64>(6)? == 1,
            valid_from: row.get(7)?,
            valid_to: row.get(8)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn tax_summary(
    connection: &Connection,
    book_id: &str,
    start_date: &str,
    end_date: &str,
    locale: &str,
) -> AppResult<TaxSummary> {
    validate_date_range(start_date, end_date)?;
    let name_column = if locale == "en" {
        "tc.en_name"
    } else {
        "tc.ja_name"
    };
    let sql = format!(
        "SELECT tc.id, tc.code, {name_column}, tc.direction, tc.rate_bps,
                COALESCE(SUM(jl.amount_minor), 0)
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.entry_id
         INNER JOIN tax_codes tc ON tc.id = jl.tax_code_id
         WHERE je.book_id = ?1 AND je.status = 'posted'
           AND je.transaction_date >= ?2 AND je.transaction_date <= ?3
         GROUP BY tc.id, tc.code, {name_column}, tc.direction, tc.rate_bps
         ORDER BY tc.code"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(params![book_id, start_date, end_date], |row| {
        let gross_amount_minor = row.get::<_, i64>(5)?;
        let rate_bps = row.get::<_, i64>(4)?;
        let tax_amount_minor = if rate_bps == 0 {
            0
        } else {
            ((gross_amount_minor as i128 * rate_bps as i128) / (10_000 + rate_bps) as i128) as i64
        };
        Ok(TaxSummaryRow {
            tax_code_id: row.get(0)?,
            code: row.get(1)?,
            name: row.get(2)?,
            direction: row.get(3)?,
            rate_bps,
            gross_amount_minor,
            net_amount_minor: gross_amount_minor - tax_amount_minor,
            tax_amount_minor,
        })
    })?;
    let rows = rows.collect::<Result<Vec<_>, _>>()?;
    let output_tax_minor = rows
        .iter()
        .filter(|row| row.direction == "sales")
        .map(|row| row.tax_amount_minor)
        .sum();
    let input_tax_minor = rows
        .iter()
        .filter(|row| row.direction == "purchase")
        .map(|row| row.tax_amount_minor)
        .sum();
    Ok(TaxSummary {
        rows,
        output_tax_minor,
        input_tax_minor,
        difference_minor: output_tax_minor - input_tax_minor,
    })
}

pub fn create_fixed_asset(
    connection: &Connection,
    book_id: &str,
    request: &CreateFixedAssetRequest,
) -> AppResult<FixedAsset> {
    validate_fixed_asset_request(request)?;
    if request.asset_account_id != EQUIPMENT_ACCOUNT_ID {
        return Err(AppError::Validation(
            "The current chart of accounts supports depreciation for Equipment only".into(),
        ));
    }
    ensure_book_account(
        connection,
        book_id,
        &request.asset_account_id,
        Some("asset"),
    )?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO fixed_assets
         (id, book_id, name, asset_account_id, acquisition_date, acquisition_cost_minor,
          residual_value_minor, useful_life_years, depreciation_method, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'straight_line', 'active', ?9, ?9)",
        params![
            id,
            book_id,
            request.name.trim(),
            request.asset_account_id,
            request.acquisition_date,
            request.acquisition_cost_minor,
            request.residual_value_minor,
            request.useful_life_years,
            now
        ],
    )?;
    find_fixed_asset(connection, book_id, &id)
}

pub fn list_fixed_assets(connection: &Connection, book_id: &str) -> AppResult<Vec<FixedAsset>> {
    let mut statement = connection.prepare(
        "SELECT fa.id, fa.name, fa.asset_account_id, a.code, a.name, fa.acquisition_date,
                fa.acquisition_cost_minor, fa.residual_value_minor, fa.useful_life_years,
                fa.depreciation_method, fa.status,
                COALESCE(SUM(fad.amount_minor), 0) AS accumulated
         FROM fixed_assets fa
         INNER JOIN accounts a ON a.id = fa.asset_account_id
         LEFT JOIN fixed_asset_depreciations fad ON fad.asset_id = fa.id
         WHERE fa.book_id = ?1
         GROUP BY fa.id, fa.name, fa.asset_account_id, a.code, a.name, fa.acquisition_date,
                  fa.acquisition_cost_minor, fa.residual_value_minor, fa.useful_life_years,
                  fa.depreciation_method, fa.status
         ORDER BY fa.acquisition_date, fa.created_at, fa.id",
    )?;
    let rows = statement.query_map([book_id], fixed_asset_from_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn post_depreciation(
    connection: &mut Connection,
    book_id: &str,
    asset_id: &str,
    fiscal_year: i64,
) -> AppResult<DepreciationResult> {
    if !(1900..=9999).contains(&fiscal_year) {
        return Err(AppError::Validation("Invalid fiscal year".into()));
    }
    let asset = find_fixed_asset(connection, book_id, asset_id)?;
    if asset.status != "active" {
        return Err(AppError::Validation("The fixed asset is not active".into()));
    }
    let acquisition = validate_date(&asset.acquisition_date)?;
    if fiscal_year < acquisition.year() as i64 {
        return Err(AppError::Validation(
            "Depreciation cannot precede the acquisition year".into(),
        ));
    }
    let total_months = asset.useful_life_years * 12;
    let elapsed_months = ((fiscal_year - acquisition.year() as i64) * 12
        + (13 - acquisition.month() as i64))
        .clamp(0, total_months);
    let depreciable = asset.acquisition_cost_minor - asset.residual_value_minor;
    let scheduled_accumulated =
        (depreciable as i128 * elapsed_months as i128 / total_months as i128) as i64;
    let amount_minor = scheduled_accumulated - asset.accumulated_depreciation_minor;
    if amount_minor <= 0 {
        return Err(AppError::Validation(
            "No depreciation remains for this fiscal year".into(),
        ));
    }

    let transaction = connection.transaction()?;
    ensure_book_account_tx(&transaction, book_id, DEPRECIATION_ACCOUNT_ID, None)?;
    ensure_book_account_tx(
        &transaction,
        book_id,
        ACCUMULATED_DEPRECIATION_ACCOUNT_ID,
        None,
    )?;
    let entry_id = insert_posted_entry(
        &transaction,
        book_id,
        &format!("{fiscal_year}-12-31"),
        &format!("Depreciation: {} ({fiscal_year})", asset.name),
        "fixed_asset_depreciation",
        &format!("{asset_id}:{fiscal_year}"),
        &[
            (DEPRECIATION_ACCOUNT_ID, "debit", amount_minor),
            (ACCUMULATED_DEPRECIATION_ACCOUNT_ID, "credit", amount_minor),
        ],
    )?;
    transaction.execute(
        "INSERT INTO fixed_asset_depreciations
         (id, asset_id, fiscal_year, amount_minor, journal_entry_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            Uuid::new_v4().to_string(),
            asset_id,
            fiscal_year,
            amount_minor,
            entry_id,
            Utc::now().to_rfc3339()
        ],
    )?;
    transaction.commit()?;
    Ok(DepreciationResult {
        asset_id: asset_id.to_owned(),
        fiscal_year,
        amount_minor,
        journal_entry_id: entry_id,
    })
}

pub fn list_inventory_counts(
    connection: &Connection,
    book_id: &str,
) -> AppResult<Vec<InventoryCount>> {
    let mut statement = connection.prepare(
        "SELECT ic.id, ic.fiscal_year, ic.count_date, ic.beginning_inventory_minor,
                ic.ending_inventory_minor, ic.journal_entry_id,
                COALESCE((
                    SELECT SUM(CASE WHEN jl.side = 'debit' THEN jl.amount_minor ELSE -jl.amount_minor END)
                    FROM journal_lines jl
                    INNER JOIN journal_entries je ON je.id = jl.entry_id
                    WHERE je.book_id = ic.book_id AND je.status = 'posted'
                      AND jl.account_id = 'account-purchases'
                      AND je.transaction_date >= printf('%04d-01-01', ic.fiscal_year)
                      AND je.transaction_date <= printf('%04d-12-31', ic.fiscal_year)
                ), 0) AS cost_of_goods_sold
         FROM inventory_counts ic WHERE ic.book_id = ?1 ORDER BY ic.fiscal_year DESC",
    )?;
    let rows = statement.query_map([book_id], |row| {
        Ok(InventoryCount {
            id: row.get(0)?,
            fiscal_year: row.get(1)?,
            count_date: row.get(2)?,
            beginning_inventory_minor: row.get(3)?,
            ending_inventory_minor: row.get(4)?,
            cost_of_goods_sold_minor: row.get(6)?,
            journal_entry_id: row.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn post_inventory_adjustment(
    connection: &mut Connection,
    book_id: &str,
    request: &InventoryAdjustmentRequest,
) -> AppResult<InventoryCount> {
    if !(1900..=9999).contains(&request.fiscal_year) {
        return Err(AppError::Validation("Invalid fiscal year".into()));
    }
    let count_date = validate_date(&request.count_date)?;
    if count_date.year() as i64 != request.fiscal_year {
        return Err(AppError::Validation(
            "The inventory count date must be within the fiscal year".into(),
        ));
    }
    if request.beginning_inventory_minor < 0 || request.ending_inventory_minor < 0 {
        return Err(AppError::Validation(
            "Inventory amounts cannot be negative".into(),
        ));
    }
    if request.beginning_inventory_minor == 0 && request.ending_inventory_minor == 0 {
        return Err(AppError::Validation(
            "At least one inventory amount is required".into(),
        ));
    }
    let transaction = connection.transaction()?;
    ensure_book_account_tx(&transaction, book_id, INVENTORY_ACCOUNT_ID, None)?;
    ensure_book_account_tx(&transaction, book_id, PURCHASES_ACCOUNT_ID, None)?;
    let mut lines = Vec::new();
    if request.beginning_inventory_minor > 0 {
        lines.push((
            PURCHASES_ACCOUNT_ID,
            "debit",
            request.beginning_inventory_minor,
        ));
        lines.push((
            INVENTORY_ACCOUNT_ID,
            "credit",
            request.beginning_inventory_minor,
        ));
    }
    if request.ending_inventory_minor > 0 {
        lines.push((
            INVENTORY_ACCOUNT_ID,
            "debit",
            request.ending_inventory_minor,
        ));
        lines.push((
            PURCHASES_ACCOUNT_ID,
            "credit",
            request.ending_inventory_minor,
        ));
    }
    let entry_id = insert_posted_entry(
        &transaction,
        book_id,
        &request.count_date,
        &format!("Year-end inventory adjustment ({})", request.fiscal_year),
        "inventory_adjustment",
        &request.fiscal_year.to_string(),
        &lines,
    )?;
    let id = Uuid::new_v4().to_string();
    transaction.execute(
        "INSERT INTO inventory_counts
         (id, book_id, fiscal_year, count_date, beginning_inventory_minor,
          ending_inventory_minor, journal_entry_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            book_id,
            request.fiscal_year,
            request.count_date,
            request.beginning_inventory_minor,
            request.ending_inventory_minor,
            entry_id,
            Utc::now().to_rfc3339()
        ],
    )?;
    transaction.commit()?;
    list_inventory_counts(connection, book_id)?
        .into_iter()
        .find(|count| count.id == id)
        .ok_or_else(|| AppError::Validation("The inventory count could not be reloaded".into()))
}

fn find_fixed_asset(
    connection: &Connection,
    book_id: &str,
    asset_id: &str,
) -> AppResult<FixedAsset> {
    connection
        .query_row(
            "SELECT fa.id, fa.name, fa.asset_account_id, a.code, a.name, fa.acquisition_date,
                    fa.acquisition_cost_minor, fa.residual_value_minor, fa.useful_life_years,
                    fa.depreciation_method, fa.status,
                    COALESCE(SUM(fad.amount_minor), 0) AS accumulated
             FROM fixed_assets fa
             INNER JOIN accounts a ON a.id = fa.asset_account_id
             LEFT JOIN fixed_asset_depreciations fad ON fad.asset_id = fa.id
             WHERE fa.book_id = ?1 AND fa.id = ?2
             GROUP BY fa.id, fa.name, fa.asset_account_id, a.code, a.name, fa.acquisition_date,
                      fa.acquisition_cost_minor, fa.residual_value_minor, fa.useful_life_years,
                      fa.depreciation_method, fa.status",
            params![book_id, asset_id],
            fixed_asset_from_row,
        )
        .optional()?
        .ok_or_else(|| AppError::Validation("The fixed asset does not exist".into()))
}

fn fixed_asset_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<FixedAsset> {
    let cost = row.get::<_, i64>(6)?;
    let accumulated = row.get::<_, i64>(11)?;
    Ok(FixedAsset {
        id: row.get(0)?,
        name: row.get(1)?,
        asset_account_id: row.get(2)?,
        asset_account_code: row.get(3)?,
        asset_account_name: row.get(4)?,
        acquisition_date: row.get(5)?,
        acquisition_cost_minor: cost,
        residual_value_minor: row.get(7)?,
        useful_life_years: row.get(8)?,
        depreciation_method: row.get(9)?,
        status: row.get(10)?,
        accumulated_depreciation_minor: accumulated,
        book_value_minor: cost - accumulated,
    })
}

fn validate_fixed_asset_request(request: &CreateFixedAssetRequest) -> AppResult<()> {
    validate_date(&request.acquisition_date)?;
    if request.name.trim().is_empty() || request.name.chars().count() > 200 {
        return Err(AppError::Validation(
            "Fixed asset name must be between 1 and 200 characters".into(),
        ));
    }
    if request.acquisition_cost_minor <= 0
        || request.residual_value_minor < 0
        || request.residual_value_minor >= request.acquisition_cost_minor
    {
        return Err(AppError::Validation("Invalid fixed asset amount".into()));
    }
    if !(1..=100).contains(&request.useful_life_years) {
        return Err(AppError::Validation(
            "Useful life must be between 1 and 100 years".into(),
        ));
    }
    Ok(())
}

fn validate_date(date: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Invalid YYYY-MM-DD date".into()))
}

fn validate_date_range(start_date: &str, end_date: &str) -> AppResult<()> {
    let start = validate_date(start_date)?;
    let end = validate_date(end_date)?;
    if start > end {
        return Err(AppError::Validation(
            "Start date must precede end date".into(),
        ));
    }
    Ok(())
}

fn ensure_book_account(
    connection: &Connection,
    book_id: &str,
    account_id: &str,
    account_type: Option<&str>,
) -> AppResult<()> {
    let count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM book_accounts ba
         INNER JOIN accounts a ON a.id = ba.account_id
         WHERE ba.book_id = ?1 AND ba.account_id = ?2 AND ba.is_active = 1
           AND a.is_active = 1 AND (?3 IS NULL OR a.account_type = ?3)",
        params![book_id, account_id, account_type],
        |row| row.get(0),
    )?;
    if count != 1 {
        return Err(AppError::Validation(
            "The selected account is unavailable in this book".into(),
        ));
    }
    Ok(())
}

fn ensure_book_account_tx(
    transaction: &Transaction<'_>,
    book_id: &str,
    account_id: &str,
    account_type: Option<&str>,
) -> AppResult<()> {
    ensure_book_account(transaction, book_id, account_id, account_type)
}

fn insert_posted_entry(
    transaction: &Transaction<'_>,
    book_id: &str,
    transaction_date: &str,
    description: &str,
    source_type: &str,
    source_id: &str,
    lines: &[(&str, &str, i64)],
) -> AppResult<String> {
    let debit: i64 = lines
        .iter()
        .filter(|(_, side, _)| *side == "debit")
        .map(|(_, _, amount)| amount)
        .sum();
    let credit: i64 = lines
        .iter()
        .filter(|(_, side, _)| *side == "credit")
        .map(|(_, _, amount)| amount)
        .sum();
    if debit <= 0 || debit != credit {
        return Err(AppError::Validation(
            "Generated journal entry is not balanced".into(),
        ));
    }
    let entry_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    transaction.execute(
        "INSERT INTO journal_entries
         (id, transaction_date, description, status, source_type, source_id,
          created_at, updated_at, posted_at, book_id)
         VALUES (?1, ?2, ?3, 'posted', ?4, ?5, ?6, ?6, ?6, ?7)",
        params![
            entry_id,
            transaction_date,
            description,
            source_type,
            source_id,
            now,
            book_id
        ],
    )?;
    for (index, (account_id, side, amount)) in lines.iter().enumerate() {
        transaction.execute(
            "INSERT INTO journal_lines
             (id, entry_id, line_number, account_id, side, amount_minor, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                Uuid::new_v4().to_string(),
                entry_id,
                index as i64 + 1,
                account_id,
                side,
                amount,
                now
            ],
        )?;
    }
    Ok(entry_id)
}
