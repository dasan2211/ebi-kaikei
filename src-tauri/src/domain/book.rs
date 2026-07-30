use serde::Serialize;

pub const BUSINESS_BOOK_ID: &str = "book-business-income";
pub const MISCELLANEOUS_BOOK_ID: &str = "book-miscellaneous-income";
pub const ACTIVE_BOOK_SETTING_KEY: &str = "active_book_id";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IncomeType {
    Business,
    Miscellaneous,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: String,
    pub income_type: IncomeType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookState {
    pub books: Vec<Book>,
    pub active_book_id: String,
}

impl IncomeType {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "business" => Some(Self::Business),
            "miscellaneous" => Some(Self::Miscellaneous),
            _ => None,
        }
    }
}
