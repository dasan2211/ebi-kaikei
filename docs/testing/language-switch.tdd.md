# 言語切替機能 TDD証跡

## Source

ユーザー要求から、このTDDセッション内でユーザージャーニーを作成した。外部の計画ファイルは使用していない。

## User journeys

- 日本語利用者として、日本語表示を初期状態で利用できる。
- 英語利用者として、画面上のセレクターから英語へ即時に切り替えられる。
- 継続利用者として、選択言語が端末内に保存され、次回起動時に復元される。
- 開発者として、日本語と英語のYAMLに翻訳キーの欠落がないことをテストで検出できる。

## RED / GREEN

- RED: `bun run test`
  - `src/i18n/i18n.test.ts` は未実装の `./i18n` を解決できず失敗した。
  - Appテスト2件は、言語セレクターと英語表示が未実装のため失敗した。
  - 既存15テストは維持された。
- GREEN: `bun run test`
  - 5テストファイル、20テストがすべて成功した。
- Coverage: `bun run test:coverage`
  - statements 90%、branches 86.36%、functions 93.44%、lines 96.69%。

## Test specification

| # | 保証内容 | テスト | 種別 | 結果 |
|---|---|---|---|---|
| 1 | 日本語と英語のYAMLが同じ翻訳キーを持つ | `src/i18n/i18n.test.ts` | unit | PASS |
| 2 | プレースホルダーへ値を埋め込める | `src/i18n/i18n.test.ts` | unit | PASS |
| 3 | `en-US` / `ja-JP`を対応言語へ正規化し、未対応言語は日本語へ戻す | `src/i18n/i18n.test.ts` | unit | PASS |
| 4 | 画面上で日本語から英語へ切り替えられる | `src/App.test.tsx` | integration | PASS |
| 5 | 言語変更が`lang`属性と端末内ストレージへ反映される | `src/App.test.tsx` | integration | PASS |
| 6 | 保存済みの英語設定を起動時に復元する | `src/App.test.tsx` | integration | PASS |

## Known gaps

- 現在の対応言語は日本語と英語のみ。
- 勘定科目名は利用者が編集する会計データであり、UI翻訳の対象外。
