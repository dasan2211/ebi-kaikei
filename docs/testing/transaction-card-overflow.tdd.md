# 取引種別カードの文字はみ出し修正 — TDD証跡

## Source

計画ファイルは使用せず、2026-08-26の不具合報告と添付スクリーンショットからテスト条件を導出した。

## User journey

個人・小規模事業者として、狭いウィンドウでも取引種別カードのタイトルと説明をカード内で読めるため、隣のカードへ文字がはみ出してほしくない。

## RED / GREEN

| 段階 | 実行コマンド | 結果 | 証拠 |
|---|---|---|---|
| RED | `bun run test -- src/styles.test.ts` | FAIL | `.simple-kind-button` に `min-width: 0` がなく、追加した回帰テスト1件が意図どおり失敗した。 |
| GREEN | `bun run test -- src/styles.test.ts` | PASS | 20/20 tests passed。カード本体・コピー列・文字要素の縮小／折返しCSS契約を確認した。 |
| Full suite | `bun run test` | PASS | 16 files、115/115 tests passed。 |

## Test specification

| # | 保証内容 | テスト／確認方法 | 種別 | 結果 |
|---|---|---|---|---|
| 1 | 取引種別カード自体がグリッド幅まで縮小でき、子テキストに折返しが継承される | `src/styles.test.ts` の `transaction choice card text containment` | unit / CSS contract | PASS |
| 2 | コピー列が縮小でき、描画内容をカード境界内に封じる | 同上 | unit / CSS contract | PASS |
| 3 | タイトルと説明が、空白のない長い文字列でも折り返せる | 同上 | unit / CSS contract | PASS |
| 4 | 報告時と同じ3列・日本語文言で、カードとコピー列に横方向のオーバーフローがない | 一時ViteプレビューをPlaywrightで計測 | browser integration | PASS（全3カード） |

## Verification

- `bun run build`: PASS（TypeScript build + Vite production build）
- `bun run lint`: PASS
- `bun run test`: PASS（115/115）
- 機密情報パターン／`console.log` の `src` スキャン: 該当なし
- `git diff --check -- src/styles.css src/styles.test.ts`: PASS

## Coverage and known gaps

`bun run test:coverage` では全115テストが成功したが、リポジトリ全体の既存カバレッジは statements 70.59%、branches 72.60%、functions 74.77%、lines 74.41% で、設定済みの80%閾値には未達だった。本修正はCSS契約の回帰テストで直接保護されている。全体カバレッジ改善は本不具合の範囲外として残す。

## Merge evidence

プロジェクト方針によりCodexからコミットは作成していない。RED/GREENの実行結果は本書に保存した。
