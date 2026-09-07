import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  addAttachment,
  addEvidenceLink,
  completeInitialSetup,
  createBook,
  createFixedAsset,
  deleteAttachment,
  deleteBook,
  deleteJournalEntries,
  createBackup,
  exportGeneralLedgerCsv,
  exportJournalBookCsv,
  exportTrialBalanceCsv,
  getAccountReconciliation,
  getDashboardSummary,
  getAutomaticBackupSettings,
  getDatabaseInfo,
  getTaxSummary,
  getTrialBalance,
  getSetupStatus,
  listAccounts,
  listAutomaticBackups,
  listAttachments,
  listBackups,
  listBooks,
  listGeneralLedger,
  listFixedAssets,
  listInventoryCounts,
  listJournalBook,
  listTaxCodes,
  postFixedAssetDepreciation,
  postBalanceAdjustment,
  postInventoryAdjustment,
  postJournalEntry,
  reviseJournalEntry,
  reverseJournalEntry,
  openEvidenceLink,
  revealAttachment,
  revealDatabaseFile,
  restoreBackup,
  runAutomaticBackup,
  saveAutomaticBackupSettings,
  selectBackupDirectory,
  previewJournalCsv,
  importJournalCsv,
  saveDraftEntry,
  saveSimpleExpenseDraft,
  saveSimpleSaleDraft,
  saveSimpleSettlementDraft,
  setActiveBook,
  setBookConsumptionTaxStatus
} from "./tauri";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("Tauri command adapters", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("用途別の勘定科目コマンドを呼び出す", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    await listAccounts("book-business-income");
    expect(invoke).toHaveBeenCalledWith("list_accounts", { bookId: "book-business-income" });
  });

  it("帳簿一覧を取得して選択状態を保存する", async () => {
    vi.mocked(invoke).mockResolvedValue({ books: [], activeBookId: "book-business-income" });
    await listBooks();
    expect(invoke).toHaveBeenCalledWith("list_books");

    await createBook("Online shop");
    expect(invoke).toHaveBeenCalledWith("create_book", { name: "Online shop" });

    await deleteBook("book-online-shop");
    expect(invoke).toHaveBeenCalledWith("delete_book", { bookId: "book-online-shop" });

    await deleteJournalEntries("book-business-income", "fiscal_year", "2026-08-26", 2026);
    expect(invoke).toHaveBeenCalledWith("delete_journal_entries", {
      bookId: "book-business-income",
      scope: "fiscal_year",
      referenceDate: "2026-08-26",
      fiscalYear: 2026
    });

    await setActiveBook("book-miscellaneous-income");
    expect(invoke).toHaveBeenCalledWith("set_active_book", { bookId: "book-miscellaneous-income" });

    await setBookConsumptionTaxStatus("book-business-income", "exempt");
    expect(invoke).toHaveBeenCalledWith("set_book_consumption_tax_status", {
      bookId: "book-business-income",
      consumptionTaxStatus: "exempt"
    });
  });

  it("初期セットアップ状態を取得する", async () => {
    vi.mocked(invoke).mockResolvedValue({ completed: false, locale: null, defaultAccountCount: 35 });
    await getSetupStatus();
    expect(invoke).toHaveBeenCalledWith("get_setup_status");
  });

  it("選択言語を初期セットアップコマンドへ渡す", async () => {
    vi.mocked(invoke).mockResolvedValue({ completed: true, locale: "en", defaultAccountCount: 35 });
    await completeInitialSetup("en");
    expect(invoke).toHaveBeenCalledWith("complete_initial_setup", { locale: "en" });
  });

  it("仕訳下書きをrequest引数として渡す", async () => {
    vi.mocked(invoke).mockResolvedValue("entry-1");
    const request = {
      transactionDate: "2026-07-16",
      description: "テスト",
      lines: [
        { accountId: "cash", side: "debit" as const, amountMinor: 100 },
        { accountId: "sales", side: "credit" as const, amountMinor: 100 }
      ]
    };
    await expect(saveDraftEntry("book-miscellaneous-income", request)).resolves.toBe("entry-1");
    expect(invoke).toHaveBeenCalledWith("save_draft_entry", {
      bookId: "book-miscellaneous-income",
      request
    });
  });

  it("かんたん支出を用途別のRustコマンドへ渡す", async () => {
    vi.mocked(invoke).mockResolvedValue("entry-simple");
    const request = {
      transactionDate: "2026-08-13",
      description: "Office supplies",
      expenseAccountId: "account-supplies",
      paymentAccountId: "account-cash",
      amountMinor: 1100,
      memo: "Notebook",
      taxCodeId: "jp-purchase-10"
    };
    await saveSimpleExpenseDraft("book-business-income", request);
    expect(invoke).toHaveBeenCalledWith("save_simple_expense_draft", {
      bookId: "book-business-income",
      request
    });
  });

  it("かんたん売上と貸借精算を用途別のRustコマンドへ渡す", async () => {
    vi.mocked(invoke).mockResolvedValue("entry-simple");
    const sale = {
      transactionDate: "2026-08-13",
      description: "Sale",
      revenueAccountId: "account-sales",
      receiptAccountId: "account-receivable",
      amountMinor: 55000,
      memo: null,
      taxCodeId: "jp-sales-10"
    };
    await saveSimpleSaleDraft("book-business-income", sale);
    expect(invoke).toHaveBeenCalledWith("save_simple_sale_draft", {
      bookId: "book-business-income",
      request: sale
    });

    const settlement = {
      transactionDate: "2026-08-20",
      description: "Collection",
      settlementType: "receivable_collection" as const,
      cashAccountId: "account-bank",
      settlementAccountId: "account-receivable",
      amountMinor: 55000,
      memo: null
    };
    await saveSimpleSettlementDraft("book-business-income", settlement);
    expect(invoke).toHaveBeenCalledWith("save_simple_settlement_draft", {
      bookId: "book-business-income",
      request: settlement
    });
  });

  it("仕訳の確定と税区分マスター・税集計を用途別コマンドへ渡す", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await postJournalEntry("book-business-income", "entry-1");
    expect(invoke).toHaveBeenCalledWith("post_journal_entry", { bookId: "book-business-income", entryId: "entry-1" });

    vi.mocked(invoke).mockResolvedValue([]);
    await listTaxCodes("2026-08-13", "ja");
    expect(invoke).toHaveBeenCalledWith("list_tax_codes", { date: "2026-08-13", locale: "ja" });
    await getTaxSummary("book-business-income", "2026-01-01", "2026-12-31", "ja");
    expect(invoke).toHaveBeenCalledWith("get_tax_summary", {
      bookId: "book-business-income",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      locale: "ja"
    });
  });

  it("実残高の照合と差額調整を用途別コマンドへ渡す", async () => {
    const reconciliationRequest = {
      accountId: "account-cash",
      reconciliationDate: "2026-08-26",
      actualBalanceMinor: 9500
    };
    vi.mocked(invoke).mockResolvedValue({
      ...reconciliationRequest,
      accountCode: "1000",
      accountName: "現金",
      normalSide: "debit",
      ledgerBalanceMinor: 10000,
      differenceMinor: -500
    });
    await getAccountReconciliation("book-business-income", reconciliationRequest);
    expect(invoke).toHaveBeenCalledWith("get_account_reconciliation", {
      bookId: "book-business-income",
      request: reconciliationRequest
    });

    const adjustmentRequest = {
      ...reconciliationRequest,
      adjustmentAccountId: "account-cash-over-short",
      memo: "原因不明"
    };
    await postBalanceAdjustment("book-business-income", adjustmentRequest);
    expect(invoke).toHaveBeenCalledWith("post_balance_adjustment", {
      bookId: "book-business-income",
      request: adjustmentRequest
    });
  });

  it("固定資産と棚卸の処理を帳簿単位のコマンドへ渡す", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    await listFixedAssets("book-business-income");
    await createFixedAsset("book-business-income", {
      name: "PC",
      assetAccountId: "account-equipment",
      acquisitionDate: "2026-08-13",
      acquisitionCostMinor: 120000,
      residualValueMinor: 0,
      usefulLifeYears: 5
    });
    await postFixedAssetDepreciation("book-business-income", "asset-1", 2026);
    await listInventoryCounts("book-business-income");
    await postInventoryAdjustment("book-business-income", {
      fiscalYear: 2026,
      countDate: "2026-12-31",
      beginningInventoryMinor: 10000,
      endingInventoryMinor: 20000
    });
    expect(invoke).toHaveBeenCalledWith("post_fixed_asset_depreciation", {
      bookId: "book-business-income",
      assetId: "asset-1",
      fiscalYear: 2026
    });
    expect(invoke).toHaveBeenCalledWith("post_inventory_adjustment", {
      bookId: "book-business-income",
      request: expect.objectContaining({ fiscalYear: 2026, endingInventoryMinor: 20000 })
    });
  });

  it("証憑をバイナリ配列として追加・表示・削除する", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    await listAttachments("book-business-income");
    await addAttachment("book-business-income", "entry-1", "receipt.pdf", [37, 80, 68, 70]);
    await addEvidenceLink("book-business-income", "entry-1", "Cloud receipt", "https://example.com/receipt/1");
    await revealAttachment("book-business-income", "attachment-1");
    await openEvidenceLink("book-business-income", "link-1");
    await deleteAttachment("book-business-income", "attachment-1");
    expect(invoke).toHaveBeenCalledWith("add_attachment", {
      bookId: "book-business-income",
      entryId: "entry-1",
      originalName: "receipt.pdf",
      data: [37, 80, 68, 70]
    });
    expect(invoke).toHaveBeenCalledWith("add_evidence_link", {
      bookId: "book-business-income",
      entryId: "entry-1",
      title: "Cloud receipt",
      externalUrl: "https://example.com/receipt/1"
    });
    expect(invoke).toHaveBeenCalledWith("open_evidence_link", {
      bookId: "book-business-income",
      attachmentId: "link-1"
    });
    expect(invoke).toHaveBeenCalledWith("delete_attachment", {
      bookId: "book-business-income",
      attachmentId: "attachment-1"
    });
  });

  it("仕訳帳を帳簿・絞り込み・ページング条件付きで取得する", async () => {
    vi.mocked(invoke).mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
    const request = { startDate: "2026-01-01", status: "posted" as const, limit: 100, offset: 0 };

    await listJournalBook("book-business-income", request);

    expect(invoke).toHaveBeenCalledWith("list_journal_book", { bookId: "book-business-income", request });
  });

  it("ホーム集計を帳簿と期間を指定して取得する", async () => {
    vi.mocked(invoke).mockResolvedValue({ draftCount: 1, lastPostedDate: "2026-08-13", differenceMinor: 0 });

    await getDashboardSummary("book-business-income", "2026-01-01", "2026-12-31");

    expect(invoke).toHaveBeenCalledWith("get_dashboard_summary", {
      bookId: "book-business-income",
      startDate: "2026-01-01",
      endDate: "2026-12-31"
    });
  });

  it("総勘定元帳を選択科目と帳簿を指定して取得する", async () => {
    vi.mocked(invoke).mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
    const request = { accountId: "account-cash", limit: 100, offset: 0 };

    await listGeneralLedger("book-miscellaneous-income", request);

    expect(invoke).toHaveBeenCalledWith("list_general_ledger", { bookId: "book-miscellaneous-income", request });
  });

  it("試算表を帳簿・期間・状態条件付きで取得する", async () => {
    vi.mocked(invoke).mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
    const request = { startDate: "2026-01-01", endDate: "2026-12-31", status: "posted" as const, limit: 100, offset: 0 };

    await getTrialBalance("book-business-income", request);

    expect(invoke).toHaveBeenCalledWith("get_trial_balance", { bookId: "book-business-income", request });
  });

  it("データベース情報を取得し、保存場所で表示する", async () => {
    vi.mocked(invoke).mockResolvedValue({ path: "C:\\data\\accounting.sqlite", fileName: "accounting.sqlite", sizeBytes: 1024 });
    await getDatabaseInfo();
    expect(invoke).toHaveBeenCalledWith("get_database_info");

    vi.mocked(invoke).mockResolvedValue(undefined);
    await revealDatabaseFile();
    expect(invoke).toHaveBeenCalledWith("reveal_database_file");
  });

  it("passes journal corrections to their Rust commands", async () => {
    vi.mocked(invoke).mockResolvedValue({ reversalEntryId: "reversal-1", replacementEntryId: null });
    await reverseJournalEntry("book-business-income", "entry-1", "ja");
    expect(invoke).toHaveBeenCalledWith("reverse_journal_entry", {
      bookId: "book-business-income",
      entryId: "entry-1",
      locale: "ja"
    });

    const request = {
      transactionDate: "2026-08-14",
      description: "Corrected entry",
      lines: [
        { accountId: "cash", side: "debit" as const, amountMinor: 200 },
        { accountId: "sales", side: "credit" as const, amountMinor: 200 }
      ]
    };
    await reviseJournalEntry("book-business-income", "entry-1", "en", request);
    expect(invoke).toHaveBeenCalledWith("revise_journal_entry", {
      bookId: "book-business-income",
      entryId: "entry-1",
      locale: "en",
      request
    });
  });

  it("passes each CSV export request to its Rust command", async () => {
    vi.mocked(invoke).mockResolvedValue({ path: "C:\\Downloads\\report.csv", fileName: "report.csv", rowCount: 1 });
    const reportRequest = { startDate: "2026-01-01", query: "sales" };
    const ledgerRequest = { ...reportRequest, accountId: "account-cash" };

    await exportJournalBookCsv("book-business-income", reportRequest);
    expect(invoke).toHaveBeenCalledWith("export_journal_book_csv", { bookId: "book-business-income", request: reportRequest });
    await exportGeneralLedgerCsv("book-business-income", ledgerRequest);
    expect(invoke).toHaveBeenCalledWith("export_general_ledger_csv", { bookId: "book-business-income", request: ledgerRequest });
    await exportTrialBalanceCsv("book-business-income", reportRequest);
    expect(invoke).toHaveBeenCalledWith("export_trial_balance_csv", { bookId: "book-business-income", request: reportRequest });
  });

  it("passes backup and CSV import requests to Rust commands", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    await listBackups();
    expect(invoke).toHaveBeenCalledWith("list_backups");
    await createBackup();
    expect(invoke).toHaveBeenCalledWith("create_backup");
    await restoreBackup("backup.sqlite");
    expect(invoke).toHaveBeenCalledWith("restore_backup", { fileName: "backup.sqlite" });
    await previewJournalCsv("book-business-income", "csv");
    expect(invoke).toHaveBeenCalledWith("preview_journal_csv", { bookId: "book-business-income", csvContent: "csv" });
    await importJournalCsv("book-business-income", "csv");
    expect(invoke).toHaveBeenCalledWith("import_journal_csv", { bookId: "book-business-income", csvContent: "csv" });
  });

  it("passes automatic backup settings and scheduling to Rust commands", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await listAutomaticBackups();
    expect(invoke).toHaveBeenCalledWith("list_automatic_backups");
    await getAutomaticBackupSettings();
    expect(invoke).toHaveBeenCalledWith("get_automatic_backup_settings");

    const settings = {
      enabled: true,
      intervalMinutes: 60,
      retentionCount: 10,
      destinationDirectory: "D:\\Accounting Backups"
    };
    await saveAutomaticBackupSettings(settings);
    expect(invoke).toHaveBeenCalledWith("save_automatic_backup_settings", { settings });
    await runAutomaticBackup();
    expect(invoke).toHaveBeenCalledWith("run_automatic_backup");
    await selectBackupDirectory(settings.destinationDirectory);
    expect(invoke).toHaveBeenCalledWith("select_backup_directory", {
      initialDirectory: settings.destinationDirectory
    });
  });
});
