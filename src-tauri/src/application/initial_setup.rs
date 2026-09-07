use crate::{
    domain::book::{BUSINESS_BOOK_ID, MISCELLANEOUS_BOOK_ID},
    error::{AppError, AppResult},
};
use rusqlite::{params, Connection};
use serde::Serialize;

const SETUP_LOCALE_KEY: &str = "initial_setup_locale";

struct DefaultAccount {
    id: &'static str,
    code: &'static str,
    ja_name: &'static str,
    en_name: &'static str,
    account_type: &'static str,
    normal_side: &'static str,
}

const DEFAULT_ACCOUNTS: &[DefaultAccount] = &[
    DefaultAccount {
        id: "account-cash",
        code: "1000",
        ja_name: "現金",
        en_name: "Cash",
        account_type: "asset",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-bank",
        code: "1100",
        ja_name: "普通預金",
        en_name: "Bank account",
        account_type: "asset",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-receivable",
        code: "1200",
        ja_name: "売掛金",
        en_name: "Accounts receivable",
        account_type: "asset",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-loans-receivable",
        code: "1250",
        ja_name: "貸付金",
        en_name: "Loans receivable",
        account_type: "asset",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-inventory",
        code: "1300",
        ja_name: "棚卸資産",
        en_name: "Inventory",
        account_type: "asset",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-prepaid-expenses",
        code: "1400",
        ja_name: "前払費用",
        en_name: "Prepaid expenses",
        account_type: "asset",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-equipment",
        code: "1500",
        ja_name: "備品",
        en_name: "Equipment",
        account_type: "asset",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-equipment-accumulated-depreciation",
        code: "1590",
        ja_name: "減価償却累計額（備品）",
        en_name: "Accumulated depreciation — equipment",
        account_type: "asset",
        normal_side: "credit",
    },
    DefaultAccount {
        id: "account-owner-drawings",
        code: "1600",
        ja_name: "事業主貸",
        en_name: "Owner's drawings",
        account_type: "asset",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-payable",
        code: "2000",
        ja_name: "買掛金",
        en_name: "Accounts payable",
        account_type: "liability",
        normal_side: "credit",
    },
    DefaultAccount {
        id: "account-other-payable",
        code: "2100",
        ja_name: "未払金",
        en_name: "Other payables",
        account_type: "liability",
        normal_side: "credit",
    },
    DefaultAccount {
        id: "account-accrued-expenses",
        code: "2110",
        ja_name: "未払費用",
        en_name: "Accrued expenses",
        account_type: "liability",
        normal_side: "credit",
    },
    DefaultAccount {
        id: "account-loans-payable",
        code: "2200",
        ja_name: "借入金",
        en_name: "Loans payable",
        account_type: "liability",
        normal_side: "credit",
    },
    DefaultAccount {
        id: "account-deposits-received",
        code: "2300",
        ja_name: "預り金",
        en_name: "Deposits received",
        account_type: "liability",
        normal_side: "credit",
    },
    DefaultAccount {
        id: "account-owner-contributions",
        code: "2400",
        ja_name: "事業主借",
        en_name: "Owner's contributions",
        account_type: "liability",
        normal_side: "credit",
    },
    DefaultAccount {
        id: "account-capital",
        code: "3000",
        ja_name: "元入金",
        en_name: "Owner's capital",
        account_type: "equity",
        normal_side: "credit",
    },
    DefaultAccount {
        id: "account-sales",
        code: "4000",
        ja_name: "売上高",
        en_name: "Sales",
        account_type: "revenue",
        normal_side: "credit",
    },
    DefaultAccount {
        id: "account-other-income",
        code: "4100",
        ja_name: "雑収入",
        en_name: "Other income",
        account_type: "revenue",
        normal_side: "credit",
    },
    DefaultAccount {
        id: "account-purchases",
        code: "5000",
        ja_name: "仕入高",
        en_name: "Purchases",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-salaries",
        code: "6000",
        ja_name: "給料賃金",
        en_name: "Salaries and wages",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-rent",
        code: "6010",
        ja_name: "地代家賃",
        en_name: "Rent",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-utilities",
        code: "6020",
        ja_name: "水道光熱費",
        en_name: "Utilities",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-communications",
        code: "6030",
        ja_name: "通信費",
        en_name: "Communication expenses",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-travel",
        code: "6040",
        ja_name: "旅費交通費",
        en_name: "Travel and transportation",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-vehicle",
        code: "6050",
        ja_name: "車両費",
        en_name: "Vehicle expenses",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-advertising",
        code: "6060",
        ja_name: "広告宣伝費",
        en_name: "Advertising expenses",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-entertainment",
        code: "6070",
        ja_name: "接待交際費",
        en_name: "Entertainment expenses",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-insurance",
        code: "6080",
        ja_name: "損害保険料",
        en_name: "Insurance expenses",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-taxes-dues",
        code: "6090",
        ja_name: "租税公課",
        en_name: "Taxes and dues",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-supplies",
        code: "6100",
        ja_name: "消耗品費",
        en_name: "Supplies expense",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-repairs",
        code: "6110",
        ja_name: "修繕費",
        en_name: "Repairs and maintenance",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-fees",
        code: "6120",
        ja_name: "支払手数料",
        en_name: "Fees and commissions",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-depreciation",
        code: "6130",
        ja_name: "減価償却費",
        en_name: "Depreciation expense",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-interest",
        code: "6140",
        ja_name: "支払利息",
        en_name: "Interest expense",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-cash-over-short",
        code: "6180",
        ja_name: "現金過不足",
        en_name: "Cash over and short",
        account_type: "expense",
        normal_side: "debit",
    },
    DefaultAccount {
        id: "account-miscellaneous-expense",
        code: "6190",
        ja_name: "雑費",
        en_name: "Miscellaneous expense",
        account_type: "expense",
        normal_side: "debit",
    },
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    pub completed: bool,
    pub locale: Option<String>,
    pub default_account_count: usize,
}

pub fn status(connection: &Connection) -> AppResult<SetupStatus> {
    let locale = connection
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            [SETUP_LOCALE_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()?;

    Ok(SetupStatus {
        completed: locale.is_some(),
        locale,
        default_account_count: DEFAULT_ACCOUNTS.len(),
    })
}

pub fn complete(connection: &mut Connection, locale: &str) -> AppResult<SetupStatus> {
    if !matches!(locale, "ja" | "en") {
        return Err(AppError::Validation("対応していない言語です".into()));
    }

    if status(connection)?.completed {
        return status(connection);
    }

    let transaction = connection.transaction()?;
    for account in DEFAULT_ACCOUNTS {
        let name = if locale == "en" {
            account.en_name
        } else {
            account.ja_name
        };
        transaction.execute(
            "INSERT INTO accounts (id, code, name, account_type, normal_side, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET
                code = excluded.code,
                name = excluded.name,
                account_type = excluded.account_type,
                normal_side = excluded.normal_side,
                is_active = 1,
                updated_at = CURRENT_TIMESTAMP",
            params![
                account.id,
                account.code,
                name,
                account.account_type,
                account.normal_side
            ],
        )?;
        for book_id in [BUSINESS_BOOK_ID, MISCELLANEOUS_BOOK_ID] {
            transaction.execute(
                "INSERT OR IGNORE INTO book_accounts (book_id, account_id, created_at)
                 VALUES (?1, ?2, CURRENT_TIMESTAMP)",
                params![book_id, account.id],
            )?;
        }
    }
    transaction.execute(
        "INSERT INTO app_settings (key, value, updated_at)
         VALUES (?1, ?2, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
        params![SETUP_LOCALE_KEY, locale],
    )?;
    transaction.commit()?;

    status(connection)
}

use rusqlite::OptionalExtension;
