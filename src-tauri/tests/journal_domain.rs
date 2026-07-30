use ebi_kaikei_lib::domain::journal_entry::{DraftJournalEntry, JournalLine, Side};

fn line(account_id: &str, side: Side, amount_minor: i64) -> JournalLine {
    JournalLine {
        account_id: account_id.to_owned(),
        side,
        amount_minor,
        memo: None,
    }
}

#[test]
fn balanced_compound_entry_is_valid() {
    let entry = DraftJournalEntry {
        transaction_date: "2026-07-16".to_owned(),
        description: "備品を現金と普通預金で購入".to_owned(),
        lines: vec![
            line("supplies", Side::Debit, 10_000),
            line("cash", Side::Credit, 4_000),
            line("bank", Side::Credit, 6_000),
        ],
    };

    assert!(entry.validate().is_ok());
}

#[test]
fn unbalanced_entry_is_rejected() {
    let entry = DraftJournalEntry {
        transaction_date: "2026-07-16".to_owned(),
        description: "不一致".to_owned(),
        lines: vec![
            line("supplies", Side::Debit, 10_000),
            line("cash", Side::Credit, 9_999),
        ],
    };

    let error = entry.validate().expect_err("貸借不一致を拒否する");
    assert!(error.to_string().contains("貸借"));
}

#[test]
fn invalid_calendar_date_is_rejected() {
    let entry = DraftJournalEntry {
        transaction_date: "2026-02-30".to_owned(),
        description: "日付不正".to_owned(),
        lines: vec![
            line("supplies", Side::Debit, 100),
            line("cash", Side::Credit, 100),
        ],
    };

    assert!(entry.validate().is_err());
}

#[test]
fn zero_amount_is_rejected() {
    let entry = DraftJournalEntry {
        transaction_date: "2026-07-16".to_owned(),
        description: "ゼロ円".to_owned(),
        lines: vec![
            line("supplies", Side::Debit, 0),
            line("cash", Side::Credit, 0),
        ],
    };

    assert!(entry.validate().is_err());
}
