# 実残高照合・差額調整 TDD evidence

## Source and user journeys

計画ファイルは使用せず、依頼内容から次の利用者行動を定義した。

- 利用者は現金など任意の1科目と照合日を選び、実残高と帳簿残高を比較できる。
- 下書きや照合日より後の仕訳は帳簿残高に含まれず、取消済み元仕訳と逆仕訳は正しく相殺される。
- 原因不明の不足・超過は、現金過不足などの収益・費用科目を相手科目にした確定仕訳で調整できる。
- 差額がない場合は不要な調整仕訳を作成できない。

## RED / GREEN evidence

| # | 保証内容 | テスト | 種別 | 結果・証拠 |
|---|---|---|---|---|
| 1 | 確定済みかつ照合日以前の仕訳だけで1科目の帳簿残高を算出する | `src-tauri/tests/balance_reconciliation.rs` | Rust統合 | RED: 照合モジュール未実装でコンパイル失敗。GREEN: `cargo test --test balance_reconciliation` で通過。 |
| 2 | 現金不足は現金過不足の借方・現金の貸方、現金超過は逆方向に自動計上する | 同上 | Rust統合 | GREEN: 不足・超過の貸借明細と確定状態を検証。 |
| 3 | 取消済み元仕訳と逆仕訳をともに含め、取消後残高を0円として扱う | 同上 | Rust統合 | RED: 帳簿残高が `-10000`。GREEN: 状態条件を修正後に0円で通過。 |
| 4 | 画面で科目・日付・実残高を照合し、現金過不足を選んで調整できる | `src/pages/ClosingOperationsPage.test.tsx` | React統合 | RED: 照合セクションが存在せず失敗。GREEN: Vitestで通過。 |
| 5 | TypeScriptから用途別Tauriコマンドへ帳簿IDと要求を渡す | `src/lib/tauri.test.ts` | 単体 | GREEN: コマンド名と引数を検証。 |
| 6 | 新規・既存DBで現金過不足科目を利用できる | `src-tauri/tests/database_migrations.rs` | DB統合 | GREEN: スキーマv14、初期設定前0科目、日本語初期設定後36科目を検証。 |

## Verification and coverage

- `bun run test`: 18ファイル、124テストが通過。
- `cargo test`: 全Rustテストが通過（実残高照合は最終的に5テスト）。
- `bun run lint`: エラー・警告なし。
- `bun run build`: TypeScript型検査とViteビルドが通過。
- `cargo clippy` / `cargo build`: 通過。
- `bun run test:coverage`: 124テスト自体はすべて通過。リポジトリ全体の既存カバレッジは statements 74.4%、branches 74.37%、functions 77.35%、lines 78.5% で、設定済みの全体80%閾値には未達。この機能のRust主要分岐と画面の利用者フローは上記テストで直接検証した。

Gitチェックポイントは、プロジェクト指示に従いコミットを作成していない。
