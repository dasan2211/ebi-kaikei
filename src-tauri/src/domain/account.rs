use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AccountType {
    Asset,
    Liability,
    Equity,
    Revenue,
    Expense,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NormalSide {
    Debit,
    Credit,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub code: String,
    pub name: String,
    pub account_type: AccountType,
    pub normal_side: NormalSide,
    pub parent_id: Option<String>,
    pub is_active: bool,
}

impl AccountType {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "asset" => Some(Self::Asset),
            "liability" => Some(Self::Liability),
            "equity" => Some(Self::Equity),
            "revenue" => Some(Self::Revenue),
            "expense" => Some(Self::Expense),
            _ => None,
        }
    }
}

impl NormalSide {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "debit" => Some(Self::Debit),
            "credit" => Some(Self::Credit),
            _ => None,
        }
    }
}
