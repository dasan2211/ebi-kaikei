use crate::{
    domain::account::{Account, AccountType, NormalSide},
    error::{AppError, AppResult},
};
use rusqlite::Connection;

pub fn list_active(connection: &Connection, book_id: &str) -> AppResult<Vec<Account>> {
    let mut statement = connection.prepare(
        "SELECT a.id, a.code, a.name, a.account_type, a.normal_side, a.parent_id, a.is_active
         FROM accounts a
         INNER JOIN book_accounts ba ON ba.account_id = a.id
         WHERE ba.book_id = ?1 AND a.is_active = 1 AND ba.is_active = 1
         ORDER BY a.code
         LIMIT 500",
    )?;
    let rows = statement.query_map([book_id], |row| {
        let account_type: String = row.get(3)?;
        let normal_side: String = row.get(4)?;
        Ok((
            row.get(0)?,
            row.get(1)?,
            row.get(2)?,
            account_type,
            normal_side,
            row.get(5)?,
            row.get::<_, i64>(6)?,
        ))
    })?;
    rows.map(|row| {
        let (id, code, name, account_type, normal_side, parent_id, is_active) = row?;
        Ok(Account {
            id,
            code,
            name,
            account_type: AccountType::parse(&account_type)
                .ok_or_else(|| AppError::Validation("不明な勘定科目区分です".into()))?,
            normal_side: NormalSide::parse(&normal_side)
                .ok_or_else(|| AppError::Validation("不明な通常残高です".into()))?,
            parent_id,
            is_active: is_active == 1,
        })
    })
    .collect()
}
