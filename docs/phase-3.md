# Phase 3: バックアップ・CSV取込・性能試験

設定画面から次の操作ができます。

- SQLite Online Backup APIによる整合性のあるバックアップ作成
- 保存済みバックアップの一覧表示と復元
- 復元前の現在データの自動退避
- 仕訳帳から出力したCSVの検証、プレビュー、下書き一括取込

## 仕訳CSV取込

`transaction_date`, `entry_id`, `description`, `line_number`, `side`, `account_code`, `amount_minor` が必須です。EBI Kaikeiの仕訳帳CSVにはこれらが含まれています。

同じ `entry_id` の行を一つの複式仕訳としてまとめ、全件の貸借一致と勘定科目を確認した後に単一DBトランザクションで保存します。取込データはすべて下書きになります。既に取り込まれた `entry_id` は重複取込を防ぐため拒否されます。

## 10万件性能試験

性能試験用データベースは、通常利用中のデータベースを変更せず、指定した新規ファイルへ生成できます。既存ファイルは上書きしません。

```text
cargo run --release --manifest-path src-tauri/Cargo.toml --example generate_performance_database -- ./performance/ebi-kaikei-100k.sqlite 100000
```

完了すると、生成時間、DBサイズ、仕訳帳・総勘定元帳・試算表の代表クエリ時間がJSONで表示されます。同じマシン、同じ件数、`--release`ビルドで測定した結果を比較してください。

生成した `performance/*.sqlite` は性能試験専用であり、アプリの本番データとして使用しないでください。
