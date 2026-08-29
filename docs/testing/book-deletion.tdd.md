# Book deletion TDD evidence

## Source and user journeys

No source plan was provided. The journeys were derived from the request and the accounting-data safety requirements:

- A user can delete an empty book from Settings.
- The exact book name must be entered before deletion is enabled.
- Deleting the active empty book selects another remaining book atomically.
- A book containing accounting data cannot be deleted.
- The last remaining book cannot be deleted.

## RED and GREEN evidence

| Behavior | RED evidence | GREEN evidence | Guarantee |
|---|---|---|---|
| Repository deletion rules | `cargo test --test book_separation` failed to compile with five `E0425` errors because `book_repository::delete` did not exist | The same target passed: 6 tests | Empty books can be deleted, while data-bearing and last books are rejected in Rust |
| Active-book handoff | Covered by the same initial compile failure | `an_empty_active_book_can_be_deleted_and_another_book_becomes_active` passed | The delete and active-book switch happen in one SQLite transaction |
| Confirmation UI | `bun run test -- src/pages/SettingsPage.test.tsx` ran 11 tests with 1 failure because the delete button was absent | `bun run test -- src/pages/SettingsPage.test.tsx src/lib/tauri.test.ts` passed: 30 tests | The confirmation action stays disabled until the exact book name is entered, then calls the Tauri adapter with the selected ID |

## Final verification

| Check | Result |
|---|---|
| `bun run test` | 120/120 tests passed |
| `cargo test` | 64/64 tests passed |
| `bun run build` | Passed (`tsc -b` and Vite production build) |
| `bun run lint` | Passed |
| `cargo clippy --all-targets -- -D warnings` | Passed |
| `rustfmt --edition 2021 --check src/repository/book_repository.rs tests/book_separation.rs` | Passed |
| `git diff --check` | Passed; only line-ending notices were emitted |
| `bun run test:coverage` | 120/120 tests passed; command exits nonzero on the existing global 80% threshold |
| Frontend coverage | 71.23% statements, 72.20% branches, 75.21% functions, 75.15% lines |

## Known gap

The repository-wide frontend coverage remains below its global 80% threshold because several unrelated pages are only partially covered. The new deletion flows are exercised at both the Settings UI/Tauri-adapter layer and the Rust repository layer. No test was skipped or disabled.

No TDD checkpoint commits were created because the repository instructions reserve commits for the user.
