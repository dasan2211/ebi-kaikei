use chrono::{TimeZone, Utc};
use ebi_kaikei_lib::{
    application::{
        automatic_backup::{self, AutomaticBackupSettingsInput, DEFAULT_INTERVAL_MINUTES},
        backup,
    },
    database::open_database,
};

#[test]
fn automatic_backup_settings_are_saved_with_a_custom_destination() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let database_path = directory.path().join("accounting.sqlite");
    let connection = open_database(&database_path).expect("open database");
    let backup_directory = directory.path().join("external-backups");

    let defaults = automatic_backup::settings(&connection, &database_path)
        .expect("read default automatic backup settings");
    assert!(!defaults.enabled);
    assert_eq!(defaults.interval_minutes, DEFAULT_INTERVAL_MINUTES);
    assert_eq!(defaults.retention_count, 10);
    assert_eq!(
        defaults.destination_directory,
        directory.path().join("backups").to_string_lossy()
    );

    let saved = automatic_backup::save_settings(
        &connection,
        &database_path,
        &AutomaticBackupSettingsInput {
            enabled: true,
            interval_minutes: 30,
            retention_count: 5,
            destination_directory: backup_directory.to_string_lossy().into_owned(),
        },
    )
    .expect("save automatic backup settings");

    assert!(saved.enabled);
    assert_eq!(saved.interval_minutes, 30);
    assert_eq!(saved.retention_count, 5);
    assert_eq!(
        saved.destination_directory,
        backup_directory.to_string_lossy()
    );
    assert!(backup_directory.is_dir());
}

#[test]
fn automatic_backup_runs_only_when_the_selected_interval_is_due() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let database_path = directory.path().join("accounting.sqlite");
    let connection = open_database(&database_path).expect("open database");
    let backup_directory = directory.path().join("scheduled-backups");
    automatic_backup::save_settings(
        &connection,
        &database_path,
        &AutomaticBackupSettingsInput {
            enabled: true,
            interval_minutes: 60,
            retention_count: 2,
            destination_directory: backup_directory.to_string_lossy().into_owned(),
        },
    )
    .expect("enable automatic backup");
    let started_at = Utc
        .with_ymd_and_hms(2026, 8, 26, 9, 0, 0)
        .single()
        .expect("valid timestamp");

    let first = automatic_backup::run_if_due_at(&connection, &database_path, started_at)
        .expect("run first automatic backup");
    let first_backup_name = first.backup.expect("first backup file").file_name;
    assert!(first.error.is_none());

    let too_soon = automatic_backup::run_if_due_at(
        &connection,
        &database_path,
        started_at + chrono::Duration::minutes(59),
    )
    .expect("skip automatic backup before interval");
    assert!(too_soon.backup.is_none());
    assert!(too_soon.error.is_none());

    let due = automatic_backup::run_if_due_at(
        &connection,
        &database_path,
        started_at + chrono::Duration::minutes(60),
    )
    .expect("run automatic backup at interval");
    assert!(due.backup.is_some());

    let third = automatic_backup::run_if_due_at(
        &connection,
        &database_path,
        started_at + chrono::Duration::minutes(120),
    )
    .expect("run third automatic backup");
    assert!(third.backup.is_some());
    let automatic_directory = backup::automatic_directory(&backup_directory);
    assert_eq!(
        std::fs::read_dir(&automatic_directory)
            .expect("read backup directory")
            .filter_map(Result::ok)
            .filter(
                |entry| entry.path().extension().and_then(|value| value.to_str()) == Some("sqlite")
            )
            .count(),
        2
    );
    assert!(!automatic_directory.join(first_backup_name).exists());
    assert_eq!(
        std::fs::read_dir(&backup_directory)
            .expect("read configured backup root")
            .filter_map(Result::ok)
            .filter(|entry| entry.path().is_file())
            .count(),
        0
    );

    assert_eq!(
        backup::list_automatic_in_directory(&automatic_directory)
            .expect("list automatic backups")
            .len(),
        2
    );
    assert!(backup::list_snapshots_in_directory(&backup_directory)
        .expect("list manual snapshots")
        .is_empty());

    let snapshot_directory = backup::snapshot_directory(&backup_directory);
    backup::create_in_directory(&connection, &database_path, &snapshot_directory)
        .expect("create manual snapshot");
    assert_eq!(
        backup::list_snapshots_in_directory(&snapshot_directory)
            .expect("list manual snapshots")
            .len(),
        1
    );
    assert_eq!(
        backup::list_automatic_in_directory(&automatic_directory)
            .expect("manual snapshot must not affect automatic backups")
            .len(),
        2
    );
}
