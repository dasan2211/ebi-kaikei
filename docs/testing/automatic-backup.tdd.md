# Automatic backup TDD evidence

## Source and user journeys

No source plan was provided. The journeys were derived from the request:

- While the desktop app is open, an enabled schedule checks whether a backup is due.
- A user can select the backup destination, interval, and number of automatic backups to retain.
- Retention removes only the oldest automatic backups and their attachment bundles.
- Manual backups remain separate, user-created snapshots and are never removed by automatic retention.

## RED and GREEN evidence

| Behavior | RED evidence | GREEN evidence | Guarantee |
|---|---|---|---|
| In-app scheduler | `bun run test -- src/lib/automatic-backup.test.ts src/pages/SettingsPage.test.tsx` failed because `automatic-backup.ts` did not exist | The same target passed: 11 tests | The scheduler checks immediately, checks every minute while mounted, and stops with the app lifecycle |
| Settings UI | The same RED run could not find the automatic-backup checkbox | The same target passed | Enabled state, interval, retention count, and selected folder are sent to the Rust command |
| Retention ordering | `cargo test --test automatic_backup` failed because the first of three automatic backups was not pruned deterministically | The same target passed: 2 tests | With retention set to 2, the oldest of 3 automatic backups is deleted |
| Snapshot separation | `cargo test --test automatic_backup` failed to compile because the required `automatic_directory` and `snapshot_directory` separation did not exist | The same target passed: 2 tests | Automatic files live under `automatic/`, manual files under `snapshots/`; automatic pruning leaves manual snapshots intact |

The initial Rust RED command was blocked from writing to the Cargo cache by the sandbox, so it is not counted as business-logic RED evidence. The command was rerun with approved Cargo access.

## Final verification

| Check | Result |
|---|---|
| `bun run test:coverage` | 119/119 tests passed; command exits nonzero on the existing global 80% threshold |
| Frontend coverage | 71.32% statements, 72.31% branches, 75.43% functions, 75.24% lines |
| New scheduler coverage | 92.85% statements, 100% functions, 100% lines |
| `cargo test` | 62/62 tests passed |
| `bun run build` | Passed (`tsc -b` and Vite production build) |
| `bun run lint` | Passed |
| `cargo clippy --all-targets -- -D warnings` | Passed |
| `rustfmt --check` for new Rust files | Passed |
| `git diff --check` | Passed; only line-ending notices were emitted |

## Known gap

The repository-wide frontend coverage threshold was already broader than the currently tested surface. The automatic-backup feature paths are covered, but unrelated pages keep the global totals below 80%. No test was skipped or disabled.

No TDD checkpoint commits were created because the repository instructions reserve commits for the user.
