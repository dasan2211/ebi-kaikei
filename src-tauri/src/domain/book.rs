use serde::{Deserialize, Serialize};

pub const BUSINESS_BOOK_ID: &str = "book-business-income";
pub const MISCELLANEOUS_BOOK_ID: &str = "book-miscellaneous-income";
pub const ACTIVE_BOOK_SETTING_KEY: &str = "active_book_id";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConsumptionTaxStatus {
    Taxable,
    Exempt,
}

impl ConsumptionTaxStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Taxable => "taxable",
            Self::Exempt => "exempt",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "taxable" => Some(Self::Taxable),
            "exempt" => Some(Self::Exempt),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: String,
    pub name: String,
    pub consumption_tax_status: ConsumptionTaxStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookState {
    pub books: Vec<Book>,
    pub active_book_id: String,
}
