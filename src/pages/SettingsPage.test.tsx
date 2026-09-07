import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";

const mocks = vi.hoisted(() => ({
  createBackup: vi.fn(),
  getAutomaticBackupSettings: vi.fn(),
  getDatabaseInfo: vi.fn(),
  importJournalCsv: vi.fn(),
  listAutomaticBackups: vi.fn(),
  listBackups: vi.fn(),
  previewJournalCsv: vi.fn(),
  restoreBackup: vi.fn(),
  saveAutomaticBackupSettings: vi.fn(),
  selectBackupDirectory: vi.fn(),
  revealDatabaseFile: vi.fn(),
  setLocale: vi.fn()
}));

vi.mock("../i18n/context", () => ({
  useI18n: () => ({ locale: "ja", setLocale: mocks.setLocale, t: (key: string) => key })
}));

vi.mock("../lib/tauri", () => ({
  createBackup: mocks.createBackup,
  getAutomaticBackupSettings: mocks.getAutomaticBackupSettings,
  getDatabaseInfo: mocks.getDatabaseInfo,
  importJournalCsv: mocks.importJournalCsv,
  listAutomaticBackups: mocks.listAutomaticBackups,
  listBackups: mocks.listBackups,
  previewJournalCsv: mocks.previewJournalCsv,
  restoreBackup: mocks.restoreBackup,
  saveAutomaticBackupSettings: mocks.saveAutomaticBackupSettings,
  selectBackupDirectory: mocks.selectBackupDirectory,
  revealDatabaseFile: mocks.revealDatabaseFile
}));

beforeEach(() => {
  vi.stubGlobal("confirm", vi.fn(() => true));
  window.localStorage.clear();
  delete document.documentElement.dataset.fontFamily;
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themePreference;
  mocks.createBackup.mockReset();
  mocks.getAutomaticBackupSettings.mockReset().mockResolvedValue({
    enabled: false,
    intervalMinutes: 60,
    retentionCount: 10,
    destinationDirectory: "C:\\Users\\test\\Backups",
    lastBackupAt: null,
    lastError: null
  });
  mocks.getDatabaseInfo.mockReset().mockResolvedValue({
    path: "C:\\Users\\test\\AppData\\accounting.sqlite",
    fileName: "accounting.sqlite",
    sizeBytes: 2048
  });
  mocks.revealDatabaseFile.mockReset().mockResolvedValue(undefined);
  mocks.importJournalCsv.mockReset();
  mocks.listAutomaticBackups.mockReset().mockResolvedValue([]);
  mocks.listBackups.mockReset().mockResolvedValue([]);
  mocks.previewJournalCsv.mockReset();
  mocks.restoreBackup.mockReset();
  mocks.saveAutomaticBackupSettings.mockReset();
  mocks.selectBackupDirectory.mockReset();
  mocks.setLocale.mockReset();
});

describe("SettingsPage", () => {
  it("creates a named book from settings", async () => {
    const onBookCreate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <SettingsPage
        bookId="book-business-income"
        activeBookId="book-business-income"
        books={[{ id: "book-business-income", name: "事業所得", consumptionTaxStatus: "taxable" }]}
        onBookCreate={onBookCreate}
      />
    );

    await user.type(screen.getByRole("textbox", { name: "settings.books.name" }), "オンラインショップ");
    await user.click(screen.getByRole("button", { name: "settings.books.create" }));

    expect(onBookCreate).toHaveBeenCalledWith("オンラインショップ");
    expect(await screen.findByText("settings.books.created")).toBeInTheDocument();
  });

  it("requires the exact book name before deleting an empty book", async () => {
    const onBookDelete = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <SettingsPage
        bookId="book-online"
        activeBookId="book-online"
        books={[
          { id: "book-business-income", name: "事業所得", consumptionTaxStatus: "taxable" },
          { id: "book-online", name: "オンラインショップ", consumptionTaxStatus: "taxable" }
        ]}
        onBookDelete={onBookDelete}
      />
    );

    const row = screen.getByText("オンラインショップ").closest(".book-settings-row");
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole("button", { name: "settings.books.delete_label" }));
    const dialog = screen.getByRole("dialog", { name: "settings.books.delete_title" });
    const confirm = within(dialog).getByRole("button", { name: "settings.books.confirm_delete" });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByRole("textbox", { name: "settings.books.confirm_name" }), "オンラインショップ");
    await user.click(confirm);

    expect(onBookDelete).toHaveBeenCalledWith("book-online");
    expect(await screen.findByText("settings.books.deleted")).toBeInTheDocument();
  });

  it("separates journal cleanup from book deletion and requires the exact book name", async () => {
    const onJournalEntriesDelete = vi.fn().mockResolvedValue({
      deletedEntryCount: 3,
      deletedAttachmentCount: 1,
      failedAttachmentFileCount: 0
    });
    const user = userEvent.setup();
    render(
      <SettingsPage
        bookId="book-business-income"
        fiscalYear={2026}
        activeBookId="book-business-income"
        books={[{ id: "book-business-income", name: "事業所得", consumptionTaxStatus: "taxable" }]}
        onJournalEntriesDelete={onJournalEntriesDelete}
      />
    );

    expect(screen.getByRole("button", { name: "settings.journal_deletion.current_month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "settings.journal_deletion.fiscal_year" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "settings.journal_deletion.all" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "settings.journal_deletion.current_month" }));
    const dialog = screen.getByRole("dialog", { name: "settings.journal_deletion.dialog_title" });
    const confirm = within(dialog).getByRole("button", { name: "settings.journal_deletion.confirm_delete" });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByRole("textbox", { name: "settings.journal_deletion.confirm_name" }), "事業所得");
    await user.click(confirm);

    expect(onJournalEntriesDelete).toHaveBeenCalledWith("current_month");
    expect(await screen.findByText("settings.journal_deletion.deleted")).toBeInTheDocument();
  });

  it("switches the application language from settings", async () => {
    const user = userEvent.setup();
    render(<SettingsPage bookId="book-business-income" />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "language.label" }),
      "en"
    );

    expect(mocks.setLocale).toHaveBeenCalledWith("en");
  });

  it("switches the application font family and saves the preference", async () => {
    const user = userEvent.setup();
    render(<SettingsPage bookId="book-business-income" />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "settings.appearance.font_family" }),
      "mincho"
    );

    expect(window.localStorage.getItem("ebi-kaikei.font-family")).toBe("mincho");
    expect(document.documentElement).toHaveAttribute("data-font-family", "mincho");
  });

  it("switches the application theme and saves the preference", async () => {
    const user = userEvent.setup();
    render(<SettingsPage bookId="book-business-income" />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "settings.appearance.theme" }),
      "dark"
    );

    expect(window.localStorage.getItem("ebi-kaikei.theme")).toBe("dark");
    expect(document.documentElement).toHaveAttribute("data-theme-preference", "dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("saves the tax-exempt business setting", async () => {
    const onConsumptionTaxStatusChange = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <SettingsPage
        bookId="book-business-income"
        consumptionTaxStatus="taxable"
        onConsumptionTaxStatusChange={onConsumptionTaxStatusChange}
      />
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "settings.consumption_tax.business_status" }),
      "exempt"
    );

    expect(onConsumptionTaxStatusChange).toHaveBeenCalledWith("exempt");
    expect(await screen.findByText("settings.consumption_tax.saved")).toBeInTheDocument();
  });

  it("データベース情報を表示してファイルマネージャーを開ける", async () => {
    const user = userEvent.setup();
    render(<SettingsPage bookId="book-business-income" />);

    expect(await screen.findByText("accounting.sqlite")).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\test\\AppData\\accounting.sqlite")).toBeInTheDocument();
    expect(screen.getByText("2 KB")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /settings.database.reveal/ }));

    expect(mocks.revealDatabaseFile).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("settings.database.revealed")).toBeInTheDocument();
  });

  it("creates and restores an online backup", async () => {
    const backup = { fileName: "ebi-kaikei-backup-20260813.sqlite", createdAt: "2026-08-13T00:00:00Z", sizeBytes: 4096 };
    mocks.createBackup.mockResolvedValue(backup);
    mocks.restoreBackup.mockResolvedValue({ restoredFileName: backup.fileName, safetyBackupFileName: "ebi-kaikei-pre-restore.sqlite" });
    const user = userEvent.setup();
    render(<SettingsPage bookId="book-business-income" />);

    await user.click(await screen.findByRole("button", { name: "settings.backup.create" }));
    expect(mocks.createBackup).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(backup.fileName)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "settings.backup.restore" }));
    expect(mocks.restoreBackup).toHaveBeenCalledWith(backup.fileName);
  });

  it("enables automatic backups and saves a selected destination", async () => {
    mocks.selectBackupDirectory.mockResolvedValue("D:\\Accounting Backups");
    mocks.saveAutomaticBackupSettings.mockResolvedValue({
      enabled: true,
      intervalMinutes: 30,
      retentionCount: 5,
      destinationDirectory: "D:\\Accounting Backups",
      lastBackupAt: null,
      lastError: null
    });
    const user = userEvent.setup();
    render(<SettingsPage bookId="book-business-income" />);

    await user.click(await screen.findByRole("checkbox", { name: "settings.backup.automatic_enabled" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "settings.backup.interval" }),
      "30"
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "settings.backup.retention_count" }),
      "5"
    );
    await user.click(screen.getByRole("button", { name: "settings.backup.choose_destination" }));
    await user.click(screen.getByRole("button", { name: "settings.backup.save_automatic" }));

    expect(mocks.selectBackupDirectory).toHaveBeenCalledWith("C:\\Users\\test\\Backups");
    expect(mocks.saveAutomaticBackupSettings).toHaveBeenCalledWith({
      enabled: true,
      intervalMinutes: 30,
      retentionCount: 5,
      destinationDirectory: "D:\\Accounting Backups"
    });
    expect(await screen.findByText("settings.backup.automatic_saved")).toBeInTheDocument();
  });

  it("shows manual snapshots separately from automatic backups", async () => {
    mocks.listBackups.mockResolvedValue([
      { fileName: "ebi-kaikei-backup-manual.sqlite", createdAt: "2026-08-26T00:00:00Z", sizeBytes: 2048 }
    ]);
    mocks.listAutomaticBackups.mockResolvedValue([
      { fileName: "ebi-kaikei-auto-backup-scheduled.sqlite", createdAt: "2026-08-26T01:00:00Z", sizeBytes: 2048 }
    ]);

    render(<SettingsPage bookId="book-business-income" />);

    const snapshots = await screen.findByLabelText("settings.backup.snapshot_list_label");
    const automatic = await screen.findByLabelText("settings.backup.automatic_list_label");
    expect(within(snapshots).getByText("ebi-kaikei-backup-manual.sqlite")).toBeInTheDocument();
    expect(within(snapshots).queryByText("ebi-kaikei-auto-backup-scheduled.sqlite")).not.toBeInTheDocument();
    expect(within(automatic).getByText("ebi-kaikei-auto-backup-scheduled.sqlite")).toBeInTheDocument();
  });

  it("previews and imports a selected journal CSV", async () => {
    mocks.previewJournalCsv.mockResolvedValue({ entryCount: 1, lineCount: 2, totalDebitMinor: 100, totalCreditMinor: 100 });
    mocks.importJournalCsv.mockResolvedValue({ importedEntryCount: 1, importedLineCount: 2 });
    const user = userEvent.setup();
    render(<SettingsPage bookId="book-business-income" />);
    const file = new File(["header\nrow"], "journal.csv", { type: "text/csv" });

    await user.upload(await screen.findByLabelText("settings.import.file"), file);
    expect(mocks.previewJournalCsv).toHaveBeenCalledWith("book-business-income", "header\nrow");
    await user.click(await screen.findByRole("button", { name: "settings.import.import" }));
    expect(mocks.importJournalCsv).toHaveBeenCalledWith("book-business-income", "header\nrow");
  });
});
