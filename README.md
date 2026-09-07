# EBI Kaikei

Phase 4の消費税、固定資産・減価償却、棚卸・売上原価、証憑については [docs/phase-4.md](docs/phase-4.md) を参照してください。Phase 3のバックアップ、CSV取込、10万件性能試験については [docs/phase-3.md](docs/phase-3.md) を参照してください。

個人事業主・小規模事業者向けの、ローカルファーストな複式簿記デスクトップアプリです。React UIからデータベースへ直接接続せず、用途別のTauriコマンド、Rustアプリケーション層、会計ドメイン、SQLiteリポジトリを順に通します。

事業所得と雑所得は独立した帳簿として切り替えられます。仕訳には必ず帳簿IDを付け、勘定科目の利用可否、将来の集計・帳票・バックアップも帳簿単位で扱います。

## アプリとして起動する

### 1. 開発環境を準備する

共通で次のツールが必要です。

- [Bun](https://bun.sh/docs/installation)（このプロジェクトでは `package.json` で Bun 1.3.14を指定）
- [Rust stable](https://www.rust-lang.org/tools/install) と Cargo
- Git

インストール後、ターミナルで利用できることを確認します。

```text
bun --version
rustc --version
cargo --version
```

Windowsでは、さらに次の環境が必要です。

- Microsoft C++ Build Toolsの「C++によるデスクトップ開発」ワークロード
- Microsoft Edge WebView2 Runtime

LinuxではWebKitGTKなどのシステムパッケージが必要です。Debian／Ubuntuの場合は次のように導入できます。

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

ほかのLinuxディストリビューションについては、[Tauri 2のPrerequisites](https://v2.tauri.app/start/prerequisites/)を参照してください。

### 2. 依存関係をインストールする

プロジェクトのルートディレクトリで実行します。

```text
bun install --frozen-lockfile
```

依存関係を更新する場合だけ `bun install` を使用し、更新された `bun.lock` の内容も確認してください。

### 3. デスクトップアプリを起動する

```text
bun run tauri dev
```

Viteの開発サーバーとRust側がビルドされ、EBI Kaikeiがデスクトップウィンドウとして起動します。通常は `bun run dev` を別ターミナルで実行する必要はありません。終了するときは、起動したターミナルで `Ctrl+C` を押します。

初回起動時は、次の流れを確認できます。

1. 日本語または英語を選択する（言語を選ぶまで通常画面には進めません）。
2. 選択言語に対応した初期勘定科目が作成される。
3. 画面上部の帳簿セレクターで「事業所得」と「雑所得」を切り替える。
4. 「仕訳を入力」の「かんたん入力」では、「経費・カード代金を支払った」「売上が発生した」「貸し借り」の3つから取引を選び、支払・入金方法や金額を入力して下書きまたは確定仕訳として保存する。「貸し借り」では、債権回収、債務支払い、貸付、借入、クレジットカード代金の引き落としを入力できる。カード代金の引き落としは「経費・カード代金を支払った」からも入力できる。複合仕訳は「複式入力」を使用する。
5. 「勘定科目」で選択中の帳簿に属する科目を確認する。
6. 「決算・税務」で消費税集計、減価償却、棚卸調整を行う。
7. 「証憑」で仕訳に領収書・請求書のファイル、または保存要件を満たす外部保管先URLを関連付ける。

会計データはOSのアプリデータ領域にあるSQLiteへ保存されます。初回セットアップをやり直す目的でデータベースを削除すると、保存済みの会計データもすべて失われるため注意してください。

## テストとコードチェック

フロントエンドの単体・コンポーネントテストを実行します。

```text
bun run test
```

TypeScript／Reactコードのlintを実行します。

```text
bun run lint
```

Rustのドメイン、SQLiteマイグレーション、帳簿分離のテストを実行します。

```text
cargo test --manifest-path src-tauri/Cargo.toml
```

フロントエンドの型チェックと本番ビルドを実行します。

```text
bun run build
```

変更後の基本的な確認では、上記4コマンドをすべて成功させてください。

## 配布用アプリをビルドする

インストーラーを含むTauriの配布物を生成します。

```text
bun run tauri build
```

成果物は通常、`src-tauri/target/release/bundle/` 以下のOS別ディレクトリに出力されます。フロントエンドだけを検証する `bun run build` とは用途が異なります。

現在の範囲とユーザージャーニーは [docs/phase-1.md](docs/phase-1.md) を参照してください。

UI翻訳の追加方法は [docs/i18n.md](docs/i18n.md) を参照してください。
