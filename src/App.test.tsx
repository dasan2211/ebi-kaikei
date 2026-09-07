import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { todayLocalDate } from "./lib/local-date";

const mocks = vi.hoisted(() => ({
  completeInitialSetup: vi.fn(),
  createBook: vi.fn(),
  addAttachment: vi.fn(),
  addEvidenceLink: vi.fn(),
  createBackup: vi.fn(),
  createFixedAsset: vi.fn(),
  deleteJournalTemplate: vi.fn(),
  deleteBook: vi.fn(),
  deleteJournalEntries: vi.fn(),
  deleteAttachment: vi.fn(),
  exportGeneralLedgerCsv: vi.fn(),
  exportJournalBookCsv: vi.fn(),
  exportTrialBalanceCsv: vi.fn(),
  getDashboardSummary: vi.fn(),
  getAutomaticBackupSettings: vi.fn(),
  getSetupStatus: vi.fn(),
  getTrialBalance: vi.fn(),
  getTaxSummary: vi.fn(),
  getDatabaseInfo: vi.fn(),
  importJournalCsv: vi.fn(),
  listAutomaticBackups: vi.fn(),
  listBackups: vi.fn(),
  listBooks: vi.fn(),
  listAccounts: vi.fn(),
  listAttachments: vi.fn(),
  listFixedAssets: vi.fn(),
  listGeneralLedger: vi.fn(),
  listInventoryCounts: vi.fn(),
  listJournalBook: vi.fn(),
  listJournalTemplates: vi.fn(),
  listTaxCodes: vi.fn(),
  postFixedAssetDepreciation: vi.fn(),
  postInventoryAdjustment: vi.fn(),
  postJournalEntry: vi.fn(),
  saveDraftEntry: vi.fn(),
  saveJournalTemplate: vi.fn(),
  saveSimpleExpenseDraft: vi.fn(),
  saveSimpleSaleDraft: vi.fn(),
  saveSimpleSettlementDraft: vi.fn(),
  revealDatabaseFile: vi.fn(),
  revealAttachment: vi.fn(),
  openEvidenceLink: vi.fn(),
  previewJournalCsv: vi.fn(),
  restoreBackup: vi.fn(),
  runAutomaticBackup: vi.fn(),
  saveAutomaticBackupSettings: vi.fn(),
  selectBackupDirectory: vi.fn(),
  setActiveBook: vi.fn(),
  setBookConsumptionTaxStatus: vi.fn()
}));

vi.mock("./lib/tauri", () => ({
  addAttachment: mocks.addAttachment,
  addEvidenceLink: mocks.addEvidenceLink,
  completeInitialSetup: mocks.completeInitialSetup,
  createBook: mocks.createBook,
  createBackup: mocks.createBackup,
  createFixedAsset: mocks.createFixedAsset,
  deleteJournalTemplate: mocks.deleteJournalTemplate,
  deleteBook: mocks.deleteBook,
  deleteJournalEntries: mocks.deleteJournalEntries,
  deleteAttachment: mocks.deleteAttachment,
  exportGeneralLedgerCsv: mocks.exportGeneralLedgerCsv,
  exportJournalBookCsv: mocks.exportJournalBookCsv,
  exportTrialBalanceCsv: mocks.exportTrialBalanceCsv,
  getDashboardSummary: mocks.getDashboardSummary,
  getAutomaticBackupSettings: mocks.getAutomaticBackupSettings,
  getSetupStatus: mocks.getSetupStatus,
  getTrialBalance: mocks.getTrialBalance,
  getTaxSummary: mocks.getTaxSummary,
  getDatabaseInfo: mocks.getDatabaseInfo,
  importJournalCsv: mocks.importJournalCsv,
  listAutomaticBackups: mocks.listAutomaticBackups,
  listBackups: mocks.listBackups,
  listBooks: mocks.listBooks,
  listAccounts: mocks.listAccounts,
  listAttachments: mocks.listAttachments,
  listFixedAssets: mocks.listFixedAssets,
  listGeneralLedger: mocks.listGeneralLedger,
  listInventoryCounts: mocks.listInventoryCounts,
  listJournalBook: mocks.listJournalBook,
  listJournalTemplates: mocks.listJournalTemplates,
  listTaxCodes: mocks.listTaxCodes,
  postFixedAssetDepreciation: mocks.postFixedAssetDepreciation,
  postInventoryAdjustment: mocks.postInventoryAdjustment,
  postJournalEntry: mocks.postJournalEntry,
  saveDraftEntry: mocks.saveDraftEntry,
  saveJournalTemplate: mocks.saveJournalTemplate,
  saveSimpleExpenseDraft: mocks.saveSimpleExpenseDraft,
  saveSimpleSaleDraft: mocks.saveSimpleSaleDraft,
  saveSimpleSettlementDraft: mocks.saveSimpleSettlementDraft,
  revealDatabaseFile: mocks.revealDatabaseFile,
  revealAttachment: mocks.revealAttachment,
  openEvidenceLink: mocks.openEvidenceLink,
  previewJournalCsv: mocks.previewJournalCsv,
  restoreBackup: mocks.restoreBackup,
  runAutomaticBackup: mocks.runAutomaticBackup,
  saveAutomaticBackupSettings: mocks.saveAutomaticBackupSettings,
  selectBackupDirectory: mocks.selectBackupDirectory,
  setActiveBook: mocks.setActiveBook,
  setBookConsumptionTaxStatus: mocks.setBookConsumptionTaxStatus
}));

const books = [
  { id: "book-business-income", name: "事業所得", consumptionTaxStatus: "taxable" },
  { id: "book-miscellaneous-income", name: "雑所得", consumptionTaxStatus: "taxable" }
] as const;

const accounts = [
  { id: "cash", code: "1000", name: "普通預金", accountType: "asset", normalSide: "debit", isActive: true },
  { id: "sales", code: "4000", name: "売上高", accountType: "revenue", normalSide: "credit", isActive: true }
] as const;

beforeEach(() => {
  window.localStorage.clear();
  mocks.getSetupStatus.mockReset().mockResolvedValue({ completed: true, locale: "ja", defaultAccountCount: 35 });
  mocks.completeInitialSetup.mockReset().mockResolvedValue({ completed: true, locale: "ja", defaultAccountCount: 35 });
  mocks.createBook.mockReset();
  mocks.exportGeneralLedgerCsv.mockReset();
  mocks.exportJournalBookCsv.mockReset();
  mocks.exportTrialBalanceCsv.mockReset();
  mocks.getDashboardSummary.mockReset().mockResolvedValue({ draftCount: 0, lastPostedDate: null, differenceMinor: 0 });
  mocks.getAutomaticBackupSettings.mockReset().mockResolvedValue({ enabled: false, intervalMinutes: 60, retentionCount: 10, destinationDirectory: "C:\\Users\\test\\Backups", lastBackupAt: null, lastError: null });
  mocks.runAutomaticBackup.mockReset().mockResolvedValue({ backup: null, error: null });
  mocks.listBooks.mockReset().mockResolvedValue({ books, activeBookId: "book-business-income" });
  mocks.listAccounts.mockReset().mockResolvedValue(accounts);
  mocks.listTaxCodes.mockReset().mockResolvedValue([]);
  mocks.listAttachments.mockReset().mockResolvedValue([]);
  mocks.listFixedAssets.mockReset().mockResolvedValue([]);
  mocks.listInventoryCounts.mockReset().mockResolvedValue([]);
  mocks.getTaxSummary.mockReset().mockResolvedValue({ rows: [], outputTaxMinor: 0, inputTaxMinor: 0, differenceMinor: 0 });
  mocks.listJournalBook.mockReset().mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
  mocks.listJournalTemplates.mockReset().mockResolvedValue([]);
  mocks.listGeneralLedger.mockReset().mockResolvedValue({
    account: { id: "cash", code: "1000", name: "現金", normalSide: "debit" },
    items: [], total: 0, limit: 100, offset: 0,
    totalDebitMinor: 0, totalCreditMinor: 0, openingBalanceMinor: 0, closingBalanceMinor: 0
  });
  mocks.getTrialBalance.mockReset().mockResolvedValue({
    items: [], total: 0, limit: 100, offset: 0, differenceMinor: 0,
    totals: {
      openingDebitMinor: 0, openingCreditMinor: 0,
      periodDebitMinor: 0, periodCreditMinor: 0,
      closingDebitMinor: 0, closingCreditMinor: 0
    }
  });
  mocks.getDatabaseInfo.mockReset().mockResolvedValue({
    path: "C:\\Users\\test\\accounting.sqlite",
    fileName: "accounting.sqlite",
    sizeBytes: 4096
  });
  mocks.listBackups.mockReset().mockResolvedValue([]);
  mocks.listAutomaticBackups.mockReset().mockResolvedValue([]);
  mocks.createBackup.mockReset();
  mocks.restoreBackup.mockReset();
  mocks.previewJournalCsv.mockReset();
  mocks.importJournalCsv.mockReset();
  mocks.revealDatabaseFile.mockReset().mockResolvedValue(undefined);
  mocks.saveDraftEntry.mockReset().mockResolvedValue("draft-12345678");
  mocks.saveJournalTemplate.mockReset().mockResolvedValue("template-12345678");
  mocks.deleteJournalTemplate.mockReset().mockResolvedValue(undefined);
  mocks.deleteBook.mockReset();
  mocks.deleteJournalEntries.mockReset().mockResolvedValue({ deletedEntryCount: 0, deletedAttachmentCount: 0, failedAttachmentFileCount: 0 });
  mocks.setActiveBook.mockReset().mockImplementation((bookId: string) => Promise.resolve({ books, activeBookId: bookId }));
  mocks.setBookConsumptionTaxStatus.mockReset().mockImplementation((bookId: string, consumptionTaxStatus: "taxable" | "exempt") => Promise.resolve({
    books: books.map((book) => book.id === bookId ? { ...book, consumptionTaxStatus } : book),
    activeBookId: "book-business-income"
  }));
});

describe("App", () => {
  it("初回セットアップでは言語選択を必須にする", async () => {
    mocks.getSetupStatus.mockResolvedValueOnce({ completed: false, locale: null, defaultAccountCount: 35 });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "はじめに、言語を選択" })).toBeInTheDocument();
    const continueButton = screen.getByRole("button", { name: /この言語で始める/ });
    expect(continueButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /日本語/ }));
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);

    expect(mocks.completeInitialSetup).toHaveBeenCalledWith("ja");
    expect(await screen.findByRole("heading", { name: "今日の会計" })).toBeInTheDocument();
  });

  it("英語でセットアップすると表示言語と保存言語を英語にする", async () => {
    mocks.getSetupStatus.mockResolvedValueOnce({ completed: false, locale: null, defaultAccountCount: 35 });
    mocks.completeInitialSetup.mockResolvedValueOnce({ completed: true, locale: "en", defaultAccountCount: 35 });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /English/ }));
    await user.click(screen.getByRole("button", { name: /Start in this language/ }));

    expect(mocks.completeInitialSetup).toHaveBeenCalledWith("en");
    expect(await screen.findByRole("heading", { name: "Today's accounting" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem("ebi-kaikei.locale")).toBe("en");
  });

  it("保存済みのセットアップ言語を起動時に復元する", async () => {
    mocks.getSetupStatus.mockResolvedValueOnce({ completed: true, locale: "en", defaultAccountCount: 35 });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Today's accounting" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open settings and backup" }));
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("en");
  });

  it("会計作業の現在地と主要画面を表示する", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "今日の会計" })).toBeInTheDocument();
    expect(screen.queryByLabelText("EBI Kaikei")).not.toBeInTheDocument();
    expect(document.title).toBe("EBI Kaikei");
    const navigation = screen.getByRole("navigation", { name: "主要メニュー" });
    expect(within(navigation).getByRole("button", { name: "仕訳を入力" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "帳簿を切り替える" })).toHaveValue("book-business-income");
    expect(screen.getByRole("region", { name: "帳簿コンテキスト" })).toBeInTheDocument();
  });

  it("作成済みの帳簿を名前で切り替える", async () => {
    const user = userEvent.setup();
    render(<App />);

    const bookSelect = await screen.findByRole("combobox", { name: "帳簿を切り替える" });
    await user.selectOptions(bookSelect, "book-miscellaneous-income");

    expect(mocks.setActiveBook).toHaveBeenCalledWith("book-miscellaneous-income");
    expect(await screen.findByRole("combobox", { name: "帳簿を切り替える" })).toHaveValue("book-miscellaneous-income");

    const navigation = screen.getByRole("navigation", { name: "主要メニュー" });
    await user.click(within(navigation).getByRole("button", { name: "勘定科目" }));
    expect(mocks.listAccounts).toHaveBeenLastCalledWith("book-miscellaneous-income");
  });

  it("年度を切り替えて帳簿画面の期間へ反映する", async () => {
    window.localStorage.setItem("ebi-kaikei.fiscal-year", "2026");
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "次年度へ" }));
    expect(screen.getByText("2027年度（令和9年度）")).toBeInTheDocument();
    expect(screen.getByText("会計期間 2027.01.01 — 2027.12.31")).toBeInTheDocument();
    expect(window.localStorage.getItem("ebi-kaikei.fiscal-year")).toBe("2027");

    const navigation = screen.getByRole("navigation", { name: "主要メニュー" });
    await user.click(within(navigation).getByRole("button", { name: "仕訳帳" }));
    await waitFor(() => expect(mocks.listJournalBook).toHaveBeenCalledWith(
      "book-business-income",
      expect.objectContaining({ startDate: "2027-01-01", endDate: "2027-12-31" })
    ));
  });

  it("サイドバーから勘定科目一覧へ移動できる", async () => {
    const user = userEvent.setup();
    render(<App />);

    const navigation = await screen.findByRole("navigation", { name: "主要メニュー" });
    await user.click(within(navigation).getByRole("button", { name: "勘定科目" }));

    expect(await screen.findByRole("heading", { name: "勘定科目" })).toBeInTheDocument();
    expect(await screen.findByText("普通預金")).toBeInTheDocument();
    expect(screen.getByText("売上高")).toBeInTheDocument();
  });

  it("サイドバーから合計残高試算表へ移動できる", async () => {
    window.localStorage.setItem("ebi-kaikei.fiscal-year", "2026");
    const user = userEvent.setup();
    render(<App />);

    const navigation = await screen.findByRole("navigation", { name: "主要メニュー" });
    await user.click(within(navigation).getByRole("button", { name: "試算表" }));

    expect(await screen.findByRole("heading", { name: "合計残高試算表" })).toBeInTheDocument();
    await waitFor(() => expect(mocks.getTrialBalance).toHaveBeenCalledWith("book-business-income", expect.objectContaining({
      startDate: "2026-01-01", endDate: "2026-12-31"
    })));
  });

  it("左下の設定ボタンから設定へ移動できる", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "設定・バックアップを開く" }));

    expect(await screen.findByRole("heading", { name: "設定・バックアップ" })).toBeInTheDocument();
    expect(await screen.findByText("accounting.sqlite")).toBeInTheDocument();
    expect(mocks.getDatabaseInfo).toHaveBeenCalledTimes(1);
  });

  it("設定から現在の帳簿の仕訳だけを指定範囲で削除する", async () => {
    window.localStorage.setItem("ebi-kaikei.fiscal-year", "2026");
    mocks.deleteJournalEntries.mockResolvedValueOnce({
      deletedEntryCount: 4,
      deletedAttachmentCount: 1,
      failedAttachmentFileCount: 0
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "設定・バックアップを開く" }));
    await user.click(screen.getByRole("button", { name: "すべての仕訳を削除" }));
    const dialog = screen.getByRole("dialog", { name: "仕訳を一括削除しますか？" });
    await user.type(within(dialog).getByRole("textbox", { name: /確認のため帳簿名/ }), "事業所得");
    await user.click(within(dialog).getByRole("button", { name: "仕訳を削除" }));

    expect(mocks.deleteJournalEntries).toHaveBeenCalledWith(
      "book-business-income",
      "all",
      todayLocalDate(),
      2026
    );
    expect(await screen.findByText("仕訳4件と証憑1件を削除しました。")).toBeInTheDocument();
  });

  it("仕訳入力で貸借差額を即時に表示する", async () => {
    const user = userEvent.setup();
    render(<App />);

    const navigation = await screen.findByRole("navigation", { name: "主要メニュー" });
    await user.click(within(navigation).getByRole("button", { name: "仕訳を入力" }));
    await user.click(screen.getByRole("tab", { name: /複式入力/ }));
    const amountInputs = await screen.findAllByRole("textbox", { name: "金額" });
    await user.type(amountInputs[0], "1200");

    expect(screen.getByText("差額 1,200円")).toBeInTheDocument();
    await user.type(amountInputs[1], "1200");
    expect(screen.getByText("貸借一致")).toBeInTheDocument();
  });

  it("貸借一致した仕訳をRustコマンドへ渡して保存する", async () => {
    const user = userEvent.setup();
    render(<App />);
    const navigation = await screen.findByRole("navigation", { name: "主要メニュー" });
    await user.click(within(navigation).getByRole("button", { name: "仕訳を入力" }));
    await user.click(screen.getByRole("tab", { name: /複式入力/ }));

    const accountInputs = await screen.findAllByRole("combobox", { name: "勘定科目" });
    const amountInputs = screen.getAllByRole("textbox", { name: "金額" });
    await user.selectOptions(accountInputs[0], "cash");
    await user.selectOptions(accountInputs[1], "sales");
    await user.type(screen.getByPlaceholderText("取引の内容を入力"), "売上入金");
    await user.type(amountInputs[0], "5000");
    await user.type(amountInputs[1], "5000");
    await user.click(screen.getByRole("button", { name: /下書きを保存/ }));

    expect(mocks.saveDraftEntry).toHaveBeenCalledWith("book-business-income", expect.objectContaining({
      description: "売上入金",
      lines: expect.arrayContaining([
        expect.objectContaining({ accountId: "cash", side: "debit", amountMinor: 5000 }),
        expect.objectContaining({ accountId: "sales", side: "credit", amountMinor: 5000 })
      ])
    }));
    expect(await screen.findByText(/^下書きを保存しました（draft-12）。/)).toBeInTheDocument();
  });

  it("勘定科目の読込失敗を画面上で通知する", async () => {
    mocks.listAccounts.mockRejectedValueOnce(new Error("DB unavailable"));
    const user = userEvent.setup();
    render(<App />);
    const navigation = await screen.findByRole("navigation", { name: "主要メニュー" });
    await user.click(within(navigation).getByRole("button", { name: "勘定科目" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("DB unavailable");
  });

  it("セットアップ状態の読込失敗を起動画面で通知する", async () => {
    mocks.getSetupStatus.mockRejectedValueOnce(new Error("setup database unavailable"));
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("setup database unavailable");
  });

  it("帳簿一覧の読込失敗が文字列でも起動画面で通知する", async () => {
    mocks.listBooks.mockRejectedValueOnce("book list unavailable");
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("book list unavailable");
  });

  it("通常画面の言語切替を端末内へ保存する", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "今日の会計" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "言語" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "設定・バックアップを開く" }));
    const languageSelect = await screen.findByRole("combobox", { name: "言語" });
    await user.selectOptions(languageSelect, "en");

    expect(await screen.findByRole("heading", { name: "Settings & backup" })).toBeInTheDocument();
    expect(window.localStorage.getItem("ebi-kaikei.locale")).toBe("en");
  });
});
