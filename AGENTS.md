# デスクトップ会計アプリ 設計指示書

## 1. 目的

個人事業主・小規模事業者向けの、ローカルファーストな複式簿記アプリを開発する。

GnuCashより入力しやすく、現代的な見た目をしており、仕訳構造が明確で、日本語環境での日付入力や消費税処理を安定して扱えることを重視する。

利用者は複式簿記を知っていることを前提とするが、費用支出など簡易的な仕訳に限って直接入力も可能とする。

## 2. 対象環境

- Windows
- Linux
- モバイル対応は不要
- セルフホスト機能・複数人同時利用は当面不要
- 通常利用時の総RAM使用量は300MB以内を目標とする

## 3. 技術構成

- Tauri
- React
- Vite
- TypeScript
- Rust
- SQLite
- UIコンポーネントライブラリは未決定
  - MUIを前提にしない
  - 軽量性、表入力、キーボード操作、アクセシビリティを比較して後から決定する

構成は次のように分離する。

```text
React UI
    ↓ Tauri invoke
Rustアプリケーション層
    ↓
会計ドメイン層
    ↓
SQLiteリポジトリ
````

ReactからSQLiteを直接操作してはならない。すべて用途単位のRustコマンドを介する。

## 4. 基本方針

### ローカルファースト

* 会計データはローカルSQLiteに保存する
* 認証機能やサーバーは持たない
* 1ウィンドウ・1 WebViewを基本とする
* 複数画面はSPA内で切り替える

### 会計コアとUIの分離

会計ロジックをUIコードへ書かない。

Rust側に以下を集約する。

* 仕訳の検証
* 借方・貸方の一致確認
* 勘定科目の検証
* 会計期間の検証
* DBトランザクション
* 元帳・試算表などの集計
* CSV入出力
* バックアップ
* 将来の消費税・減価償却・在庫処理

## 5. 会計モデル

複式簿記の最小構造を変更しない。

```text
仕訳
├─ 仕訳明細：借方
├─ 仕訳明細：借方
├─ 仕訳明細：貸方
└─ 仕訳明細：貸方

借方合計 = 貸方合計
```

消費税、棚卸、売上原価、減価償却も、最終的には通常の仕訳として記録する。

総勘定元帳、試算表、貸借対照表、損益計算書は仕訳明細から算出し、原則として二重保存しない。

## 6. 最小データモデル

### accounts

```text
id
code
name
account_type
normal_side
parent_id
is_active
created_at
updated_at
```

`account_type`は最低限以下を持つ。

```text
asset
liability
equity
revenue
expense
```

### journal_entries

```text
id
transaction_date
description
status
source_type
source_id
reversal_of_entry_id
created_at
updated_at
posted_at
```

`status`は以下を基本とする。

```text
draft
posted
reversed
```

### journal_lines

```text
id
entry_id
line_number
account_id
side
amount_minor
memo
tax_code_id
partner_id
created_at
```

制約：

* `side`は`debit`または`credit`
* `amount_minor`は正の整数
* 金額に浮動小数点数を使用しない
* 同一仕訳内の借方合計と貸方合計を一致させる
* ヘッダーと明細は単一DBトランザクションで保存する
* 外部キー制約を有効にする
* 可能ならSQLiteのSTRICTテーブルを使用する

円のみの初期実装では、1円を整数の1として保存する。

## 7. 仕訳の確定と訂正

* 入力途中は`draft`
* 検証後に`posted`
* `posted`の仕訳は原則として直接変更しない
* 訂正時は逆仕訳または訂正仕訳を作成する
* 元仕訳との関連を`reversal_of_entry_id`で保持する

仕訳保存用コマンドの例：

```text
save_draft_entry
post_journal_entry
reverse_journal_entry
delete_draft_entry
```

## 8. 日付の扱い

会計上の日付をJavaScriptの`Date`で扱わない。

```text
フロントエンド：YYYY-MM-DD文字列
Rust：NaiveDate相当
SQLite：YYYY-MM-DD形式のTEXT
```

以下を区別する。

```text
transaction_date：会計上の取引日
document_date：請求書・領収書の日付
due_date：支払期限
created_at：登録日時
posted_at：確定日時
```

`transaction_date`等の暦日をUTCへ変換しない。

## 9. 派生帳簿

以下は仕訳データから動的に算出する。

* 仕訳帳
* 総勘定元帳
* 合計残高試算表
* 貸借対照表
* 損益計算書
* 勘定科目別残高
* 月別・年度別集計

大量データをフロントエンドへ一括送信しない。

Rust／SQLite側で以下を行う。

* 絞り込み
* 並び替え
* ページング
* 集計

一覧APIは100～500件程度のページ単位とする。

## 10. UI要件

最初に実装する画面：

1. 勘定科目一覧・編集
2. 仕訳入力
3. 仕訳帳
4. 総勘定元帳
5. 試算表
6. 設定・バックアップ

仕訳入力では以下を重視する。

* キーボードのみで入力可能
* Tab／Shift+Tabによる自然な移動
* 勘定科目の検索・補完
* 金額の右寄せ
* 複合仕訳への対応
* 借方・貸方差額の即時表示
* 日付を直接入力可能
* マウス操作を強制しない

UIライブラリへ会計ドメインを依存させない。

## 11. 消費税

初期版では税区分を任意項目として設計し、後から拡張できるようにする。

将来必要になる情報：

```text
税率
課税・非課税・不課税・対象外
課税売上・課税仕入
軽減税率
税込・税抜
仕入税額控除区分
インボイス区分
適用開始日・終了日
```

税率や制度上の割合をコードへ直接埋め込まず、期間を持つマスターデータとして扱う。

## 12. 補助台帳

会計コアとは別モジュールとして将来追加する。

* 固定資産台帳
* 減価償却計算
* 商品・在庫台帳
* 売掛金・買掛金
* 取引先
* 証憑・添付ファイル

補助台帳は仕訳を生成する側とし、仕訳帳を置き換えない。

```text
補助台帳
    ↓ 仕訳生成
通常の仕訳帳
    ↓ 集計
元帳・財務諸表
```

## 13. バックアップ

稼働中のSQLiteファイルを単純コピーしない。

整合したスナップショットを生成する。

候補：

* SQLite Online Backup API
* `VACUUM INTO`

バックアップ形式の例：

```text
accounting-backup-YYYY-MM-DD.zip
├─ database.sqlite
├─ manifest.json
└─ attachments/
```

バックアップ先としてNextcloud等を利用できるが、稼働中DB自体を複数端末で同期しない。

## 14. パフォーマンス要件

* 1ウィンドウ・1 WebView
* 仕訳全件をReact stateへ保持しない
* 一覧はページングまたは仮想化する
* 添付画像をBase64文字列で保持しない
* 画像は必要時のみ読み込む
* 重い画面は遅延読み込みする
* 不要な常駐イベントや高頻度IPCを避ける
* 通常時300MB以内を目標とする

性能検証用に、最低10万件のダミー仕訳を生成できるようにする。

## 15. 推奨ディレクトリ構成

```text
src/
├─ app/
├─ pages/
├─ features/
│  ├─ accounts/
│  ├─ journal/
│  ├─ ledger/
│  └─ reports/
├─ components/
├─ lib/
│  ├─ tauri.ts
│  ├─ local-date.ts
│  └─ money.ts
└─ types/

src-tauri/src/
├─ commands/
├─ application/
├─ domain/
│  ├─ account.rs
│  ├─ journal_entry.rs
│  ├─ journal_line.rs
│  ├─ money.rs
│  └─ reports.rs
├─ repository/
├─ database/
│  ├─ connection.rs
│  └─ migrations/
├─ backup/
└─ error.rs
```

## 16. 初期開発順序

### Phase 1

* Tauri＋React＋SQLiteの基盤
* マイグレーション
* 勘定科目CRUD
* 下書き仕訳の作成・編集
* 貸借一致検証
* 仕訳確定

### Phase 2

* 仕訳帳
* 総勘定元帳
* 試算表
* 検索、期間指定、ページング
* CSVエクスポート

### Phase 3

* バックアップ・復元
* CSVインポート
* UI・キーボード操作の改善
* 大量データ性能試験

### Phase 4

* 消費税
* 固定資産・減価償却
* 在庫・売上原価
* 証憑添付

## 17. 非目標

初期版では以下を実装しない。

* クラウド同期
* 複数人同時編集
* Web版
* モバイル版
* 銀行API連携
* e-Tax直接送信
* 高度なERP機能
* 全機能を初回から実装すること

まず、勘定科目、仕訳、元帳、試算表が正確かつ快適に動作する最小構成を完成させる。