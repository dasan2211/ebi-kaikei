use ebi_kaikei_lib::{
    application::{initial_setup, performance_data},
    database::open_database,
    domain::{book::BUSINESS_BOOK_ID, reports::ReportPageRequest},
    repository::reports_repository,
};

#[test]
fn generated_performance_entries_are_balanced_and_reportable() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let mut connection =
        open_database(&directory.path().join("performance.sqlite")).expect("open database");
    initial_setup::complete(&mut connection, "en").expect("complete setup");

    let result = performance_data::generate(&mut connection, BUSINESS_BOOK_ID, 100)
        .expect("generate entries");
    let trial = reports_repository::get_trial_balance(
        &connection,
        BUSINESS_BOOK_ID,
        &ReportPageRequest {
            start_date: None,
            end_date: None,
            status: Some("posted".to_owned()),
            query: None,
            limit: Some(100),
            offset: Some(0),
        },
    )
    .expect("calculate trial balance");

    assert_eq!(result.entry_count, 100);
    assert_eq!(result.line_count, 200);
    assert_eq!(trial.difference_minor, 0);
    assert_eq!(trial.total, 2);
}
