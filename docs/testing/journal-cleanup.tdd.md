# Journal cleanup TDD evidence

## Source and user journeys

No source plan was provided. The journeys were derived from the request and the accounting-data safety requirements:

- A user can delete only the current local month's journal entries from the active book.
- A user can delete only the selected fiscal year's journal entries from the active book.
- A user can delete all journal entries from the active book without deleting the book or another book's entries.
- The exact active-book name must be entered before deletion is enabled.
- Linked documents, depreciation records, and inventory-adjustment records are cleaned up with their journal entries.
- A partial-period deletion cannot split an original/reversal pair across the deletion boundary.

## RED and GREEN evidence

| Behavior | RED evidence | GREEN evidence | Guarantee |
|---|---|---|---|
| Rust deletion scopes and accounting isolation | `cargo test --test journal_cleanup` failed to compile because `application::journal_cleanup` did not exist | The same target passed: 2 tests | Current-month, selected-year, and all-entry scopes affect only the selected book |
| Related-record cleanup | Covered by the same initial compile failure | `journal_entries_can_be_deleted_by_month_fiscal_year_and_all_without_touching_other_books` passed | Journal lines and evidence metadata cascade; document files, depreciation rows, and inventory rows are cleaned up |
| Correction boundary safety | Covered by the same initial compile failure | `a_partial_range_cannot_split_a_reversal_pair` passed | A partial range is rejected when it would leave one side of a correction pair; the complete pair can be removed with the all scope |
| Settings confirmation and Tauri adapter | `bun run test -- src/pages/SettingsPage.test.tsx src/lib/tauri.test.ts` ran 31 tests with 2 failures because the three controls and adapter were absent | `bun run test -- src/App.test.tsx src/pages/SettingsPage.test.tsx src/lib/tauri.test.ts` passed: 45 tests | The actions are separate from book deletion, exact-name confirmation is required, and scope/date/year reach the Rust command |

## Final verification

| Check | Result |
|---|---|
| `bun run test` | 122/122 tests passed |
| `cargo test` | 66/66 tests passed |
| `bun run build` | Passed (`tsc -b` and Vite production build) |
| `bun run lint` | Passed |
| `cargo clippy --all-targets -- -D warnings` | Passed |
| `rustfmt --edition 2021 --check ...` for all touched Rust files | Passed |
| Secret/debug scan | No `sk-`, `api_key`, or `console.log` matches in TypeScript or Rust sources |
| `git diff --check` | Passed; only line-ending notices were emitted |
| `bun run test:coverage` | 122/122 tests passed; command exits nonzero on the existing global 80% threshold |
| Frontend coverage | 71.54% statements, 72.65% branches, 75.41% functions, 75.60% lines |

## Known gap

The repository-wide frontend coverage remains below its global 80% threshold because several unrelated pages are only partially covered. The new cleanup flow is exercised through the Settings UI, App wiring, Tauri adapter, and Rust integration tests. No test was skipped or disabled.

No TDD checkpoint commits were created because the repository instructions reserve commits for the user.
