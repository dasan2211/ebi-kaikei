# EBI Kaikei

個人事業主・小規模事業者向けの、ローカルファーストな複式簿記デスクトップアプリです。React UIからデータベースへ直接接続せず、用途別のTauriコマンド、Rustアプリケーション層、会計ドメイン、SQLiteリポジトリを順に通します。

事業所得と雑所得は独立した帳簿として切り替えられます。仕訳には必ず帳簿IDを付け、勘定科目の利用可否、将来の集計・帳票・バックアップも帳簿単位で扱います。

## 開発

前提: Bun、Rust stable（MSVC）、WindowsではMicrosoft C++ Build ToolsとWebView2。

```powershell
bun install
bun run test
bun run build
bun run tauri dev
```

Rust単体の検証:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

現在の範囲とユーザージャーニーは [docs/phase-1.md](docs/phase-1.md) を参照してください。

UI翻訳の追加方法は [docs/i18n.md](docs/i18n.md) を参照してください。
