# テストカバレッジ回復 TDD evidence

## Source and user journeys

既存の全テストとカバレッジ設定を起点に、未検証だった次の利用者行動を補った。

- 決算画面で固定資産・減価償却・棚卸・残高照合を操作し、読込や登録の失敗も確認できる。
- 証憑画面でファイルとURLを登録・表示・削除でき、不正なURLや大きすぎるファイルを拒否できる。
- ヘルプダイアログをキーボード、背景クリック、画面遷移ボタンで操作でき、フォーカスが適切に循環・復元される。
- CSVエクスポートの実行中、成功、失敗、無効状態が画面に反映される。
- 起動時のセットアップ状態または帳簿一覧の読込失敗が画面に通知される。

## RED / GREEN evidence

| # | 保証内容 | テスト | 結果・証拠 |
|---|---|---|---|
| 1 | 既存の機能テストを壊していない | フロントエンド・Rust全テスト | RED時点でも機能テストは通過。GREENではVitest 139件、Rust 71件が通過。 |
| 2 | 決算・証憑の主要操作と失敗経路を検証する | `src/pages/ClosingOperationsPage.test.tsx`, `src/pages/AttachmentsPage.test.tsx` | 未検証だった登録、削除、再読込、入力検証、コマンド失敗を追加して通過。 |
| 3 | モーダルのアクセシビリティ操作を検証する | `src/components/HelpDialog.test.tsx` | Esc、Tab循環、背景クリック、フォーカス復元、遷移を検証して通過。 |
| 4 | エクスポートの全状態を検証する | `src/components/ReportExportButton.test.tsx` | 実行中、成功、Errorと文字列の失敗、disabledを検証して通過。 |
| 5 | 起動時データ読込の失敗を通知する | `src/App.test.tsx` | セットアップ状態と帳簿一覧の失敗表示を検証して通過。 |
| 6 | 設定済み80%閾値を下げずに満たす | `bun run test:coverage` | RED: statements 74.4%、branches 74.37%、functions 77.35%、lines 78.5%。GREEN: statements 82.86%、branches 80.11%、functions 84.76%、lines 86.94%。 |

## Verification

- `bun run test:coverage`: 20ファイル、139テストが通過し、全カバレッジ閾値を達成。
- `bun run build`: TypeScript型検査とVite本番ビルドが通過。
- `bun run lint`: エラーなし。
- `cargo test`（`src-tauri`）: 71テストが通過。
- `cargo clippy --all-targets --all-features -- -D warnings`（`src-tauri`）: 通過。
- `git diff --check`: 空白エラーなし（既存ファイルの改行コード警告のみ）。

Gitチェックポイントは、プロジェクト指示に従いコミットを作成していない。
