use ebi_kaikei_lib::{
    application::initial_setup,
    database::open_database,
    domain::{
        journal_entry::Side,
        journal_template::{JournalTemplateLine, SaveJournalTemplateRequest},
    },
    repository::journal_template_repository,
};

fn template_request() -> SaveJournalTemplateRequest {
    SaveJournalTemplateRequest {
        id: None,
        name: "月次授業報酬".into(),
        description_template: "{MM-1}月授業報酬".into(),
        lines: vec![
            JournalTemplateLine {
                account_id: "account-receivable".into(),
                side: Side::Debit,
                amount_minor: 50_000,
                memo_template: Some("{MM-1}月分".into()),
                tax_code_id: None,
            },
            JournalTemplateLine {
                account_id: "account-sales".into(),
                side: Side::Credit,
                amount_minor: 50_000,
                memo_template: None,
                tax_code_id: None,
            },
        ],
    }
}

#[test]
fn templates_are_saved_updated_listed_and_deleted_per_book() {
    let directory = tempfile::tempdir().expect("create test directory");
    let path = directory.path().join("templates.sqlite");
    let mut connection = open_database(&path).expect("open database");
    initial_setup::complete(&mut connection, "ja").expect("complete setup");

    let id = journal_template_repository::save(
        &mut connection,
        "book-business-income",
        &template_request(),
    )
    .expect("save template");
    let templates = journal_template_repository::list(&connection, "book-business-income")
        .expect("list templates");
    assert_eq!(templates.len(), 1);
    assert_eq!(templates[0].description_template, "{MM-1}月授業報酬");
    assert_eq!(
        templates[0].lines[0].memo_template.as_deref(),
        Some("{MM-1}月分")
    );
    assert!(
        journal_template_repository::list(&connection, "book-miscellaneous-income")
            .expect("list other book templates")
            .is_empty()
    );

    let mut update = template_request();
    update.id = Some(id.clone());
    update.name = "更新後の定型".into();
    journal_template_repository::save(&mut connection, "book-business-income", &update)
        .expect("update template");
    let templates = journal_template_repository::list(&connection, "book-business-income")
        .expect("list updated templates");
    assert_eq!(templates.len(), 1);
    assert_eq!(templates[0].name, "更新後の定型");

    journal_template_repository::delete(&connection, "book-business-income", &id)
        .expect("delete template");
    assert!(
        journal_template_repository::list(&connection, "book-business-income")
            .expect("list after deletion")
            .is_empty()
    );
}

#[test]
fn an_unbalanced_template_is_rejected_before_writing() {
    let directory = tempfile::tempdir().expect("create test directory");
    let path = directory.path().join("unbalanced-template.sqlite");
    let mut connection = open_database(&path).expect("open database");
    initial_setup::complete(&mut connection, "ja").expect("complete setup");
    let mut request = template_request();
    request.lines[1].amount_minor = 49_999;

    assert!(
        journal_template_repository::save(&mut connection, "book-business-income", &request)
            .is_err()
    );
    assert!(
        journal_template_repository::list(&connection, "book-business-income")
            .expect("list templates")
            .is_empty()
    );
}
