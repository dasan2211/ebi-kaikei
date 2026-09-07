import { invoke } from "@tauri-apps/api/core";
import type { Account } from "../types/account";
import type { BookState, ConsumptionTaxStatus } from "../types/book";
import type { DraftJournalEntry, JournalCorrectionResult, JournalTemplate, SaveJournalTemplateRequest, SimpleExpenseRequest, SimpleSaleRequest, SimpleSettlementRequest } from "../types/journal";
import type { Attachment, CreateFixedAssetRequest, DepreciationResult, FixedAsset, InventoryAdjustmentRequest, InventoryCount, TaxCode, TaxSummary } from "../types/phase4";
import type { DashboardSummary, ExportedFile, GeneralLedgerPage, GeneralLedgerRequest, JournalBookPage, ReportPageRequest, TrialBalance } from "../types/reports";
import type { BalanceAdjustmentRequest, BalanceAdjustmentResult, BalanceReconciliation, BalanceReconciliationRequest } from "../types/reconciliation";
import type { AutomaticBackupRunResult, AutomaticBackupSettings, AutomaticBackupSettingsInput, BackupFile, CsvImportPreview, CsvImportResult, DatabaseInfo, JournalDeletionResult, JournalDeletionScope, RestoreResult } from "../types/settings";

export type SetupStatus = {
  completed: boolean;
  locale: "ja" | "en" | null;
  defaultAccountCount: number;
};

function isInitialSetupPreview(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "initial-setup";
}

export function getSetupStatus(): Promise<SetupStatus> {
  if (isInitialSetupPreview()) {
    return Promise.resolve({ completed: false, locale: null, defaultAccountCount: 36 });
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "dashboard") {
    return Promise.resolve({ completed: true, locale: "ja", defaultAccountCount: 36 });
  }
  return invoke<SetupStatus>("get_setup_status");
}

export function completeInitialSetup(locale: "ja" | "en"): Promise<SetupStatus> {
  if (isInitialSetupPreview()) {
    return Promise.resolve({ completed: true, locale, defaultAccountCount: 35 });
  }
  return invoke<SetupStatus>("complete_initial_setup", { locale });
}

const previewBookState: BookState = {
  books: [
    { id: "book-business-income", name: "事業所得", consumptionTaxStatus: "taxable" },
    { id: "book-miscellaneous-income", name: "雑所得", consumptionTaxStatus: "taxable" }
  ],
  activeBookId: "book-business-income"
};

export function createBook(name: string): Promise<BookState> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview")) {
    const bookId = `book-preview-${previewBookState.books.length + 1}`;
    return Promise.resolve({
      books: [...previewBookState.books, { id: bookId, name, consumptionTaxStatus: "taxable" }],
      activeBookId: bookId
    });
  }
  return invoke<BookState>("create_book", { name });
}

export function deleteBook(bookId: string): Promise<BookState> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview")) {
    const books = previewBookState.books.filter((book) => book.id !== bookId);
    return Promise.resolve({
      books,
      activeBookId: previewBookState.activeBookId === bookId ? books[0]?.id ?? "" : previewBookState.activeBookId
    });
  }
  return invoke<BookState>("delete_book", { bookId });
}

export function deleteJournalEntries(bookId: string, scope: JournalDeletionScope, referenceDate: string, fiscalYear: number): Promise<JournalDeletionResult> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview")) {
    return Promise.resolve({ deletedEntryCount: 0, deletedAttachmentCount: 0, failedAttachmentFileCount: 0 });
  }
  return invoke<JournalDeletionResult>("delete_journal_entries", { bookId, scope, referenceDate, fiscalYear });
}

export function listBooks(): Promise<BookState> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview")) {
    return Promise.resolve(previewBookState);
  }
  return invoke<BookState>("list_books");
}

export function setActiveBook(bookId: string): Promise<BookState> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview")) {
    return Promise.resolve({ ...previewBookState, activeBookId: bookId });
  }
  return invoke<BookState>("set_active_book", { bookId });
}

export function setBookConsumptionTaxStatus(bookId: string, consumptionTaxStatus: ConsumptionTaxStatus): Promise<BookState> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview")) {
    return Promise.resolve({
      ...previewBookState,
      books: previewBookState.books.map((book) => book.id === bookId ? { ...book, consumptionTaxStatus } : book)
    });
  }
  return invoke<BookState>("set_book_consumption_tax_status", { bookId, consumptionTaxStatus });
}

export function listAccounts(bookId: string): Promise<Account[]> {
  return invoke<Account[]>("list_accounts", { bookId });
}

export function saveDraftEntry(bookId: string, request: DraftJournalEntry): Promise<string> {
  return invoke<string>("save_draft_entry", { bookId, request });
}

export function saveSimpleExpenseDraft(bookId: string, request: SimpleExpenseRequest): Promise<string> {
  return invoke<string>("save_simple_expense_draft", { bookId, request });
}

export function saveSimpleSaleDraft(bookId: string, request: SimpleSaleRequest): Promise<string> {
  return invoke<string>("save_simple_sale_draft", { bookId, request });
}

export function saveSimpleSettlementDraft(bookId: string, request: SimpleSettlementRequest): Promise<string> {
  return invoke<string>("save_simple_settlement_draft", { bookId, request });
}

export function listJournalTemplates(bookId: string): Promise<JournalTemplate[]> {
  return invoke<JournalTemplate[]>("list_journal_templates", { bookId });
}

export function saveJournalTemplate(bookId: string, request: SaveJournalTemplateRequest): Promise<string> {
  return invoke<string>("save_journal_template", { bookId, request });
}

export function deleteJournalTemplate(bookId: string, templateId: string): Promise<void> {
  return invoke<void>("delete_journal_template", { bookId, templateId });
}

export function postJournalEntry(bookId: string, entryId: string): Promise<void> {
  return invoke<void>("post_journal_entry", { bookId, entryId });
}

export function reverseJournalEntry(bookId: string, entryId: string, locale: "ja" | "en"): Promise<JournalCorrectionResult> {
  return invoke<JournalCorrectionResult>("reverse_journal_entry", { bookId, entryId, locale });
}

export function reviseJournalEntry(bookId: string, entryId: string, locale: "ja" | "en", request: DraftJournalEntry): Promise<JournalCorrectionResult> {
  return invoke<JournalCorrectionResult>("revise_journal_entry", { bookId, entryId, locale, request });
}

export function getDashboardSummary(bookId: string, startDate: string, endDate: string): Promise<DashboardSummary> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview")) {
    return Promise.resolve({ draftCount: 2, lastPostedDate: "2026-08-13", differenceMinor: 0 });
  }
  return invoke<DashboardSummary>("get_dashboard_summary", { bookId, startDate, endDate });
}

export function listJournalBook(bookId: string, request: ReportPageRequest): Promise<JournalBookPage> {
  return invoke<JournalBookPage>("list_journal_book", { bookId, request });
}

export function listGeneralLedger(bookId: string, request: GeneralLedgerRequest): Promise<GeneralLedgerPage> {
  return invoke<GeneralLedgerPage>("list_general_ledger", { bookId, request });
}

export function getTrialBalance(bookId: string, request: ReportPageRequest): Promise<TrialBalance> {
  return invoke<TrialBalance>("get_trial_balance", { bookId, request });
}

export function getAccountReconciliation(bookId: string, request: BalanceReconciliationRequest): Promise<BalanceReconciliation> {
  return invoke<BalanceReconciliation>("get_account_reconciliation", { bookId, request });
}

export function postBalanceAdjustment(bookId: string, request: BalanceAdjustmentRequest): Promise<BalanceAdjustmentResult> {
  return invoke<BalanceAdjustmentResult>("post_balance_adjustment", { bookId, request });
}

export function exportJournalBookCsv(bookId: string, request: ReportPageRequest): Promise<ExportedFile> {
  return invoke<ExportedFile>("export_journal_book_csv", { bookId, request });
}

export function exportGeneralLedgerCsv(bookId: string, request: GeneralLedgerRequest): Promise<ExportedFile> {
  return invoke<ExportedFile>("export_general_ledger_csv", { bookId, request });
}

export function exportTrialBalanceCsv(bookId: string, request: ReportPageRequest): Promise<ExportedFile> {
  return invoke<ExportedFile>("export_trial_balance_csv", { bookId, request });
}

export function getDatabaseInfo(): Promise<DatabaseInfo> {
  return invoke<DatabaseInfo>("get_database_info");
}

export function revealDatabaseFile(): Promise<void> {
  return invoke<void>("reveal_database_file");
}

export function listBackups(): Promise<BackupFile[]> {
  return invoke<BackupFile[]>("list_backups");
}

export function listAutomaticBackups(): Promise<BackupFile[]> {
  return invoke<BackupFile[]>("list_automatic_backups");
}

export function createBackup(): Promise<BackupFile> {
  return invoke<BackupFile>("create_backup");
}

export function restoreBackup(fileName: string): Promise<RestoreResult> {
  return invoke<RestoreResult>("restore_backup", { fileName });
}

export function getAutomaticBackupSettings(): Promise<AutomaticBackupSettings> {
  return invoke<AutomaticBackupSettings>("get_automatic_backup_settings");
}

export function saveAutomaticBackupSettings(settings: AutomaticBackupSettingsInput): Promise<AutomaticBackupSettings> {
  return invoke<AutomaticBackupSettings>("save_automatic_backup_settings", { settings });
}

export function runAutomaticBackup(): Promise<AutomaticBackupRunResult> {
  return invoke<AutomaticBackupRunResult>("run_automatic_backup");
}

export function selectBackupDirectory(initialDirectory: string): Promise<string | null> {
  return invoke<string | null>("select_backup_directory", { initialDirectory });
}

export function previewJournalCsv(bookId: string, csvContent: string): Promise<CsvImportPreview> {
  return invoke<CsvImportPreview>("preview_journal_csv", { bookId, csvContent });
}

export function importJournalCsv(bookId: string, csvContent: string): Promise<CsvImportResult> {
  return invoke<CsvImportResult>("import_journal_csv", { bookId, csvContent });
}

export function listTaxCodes(date: string, locale: "ja" | "en"): Promise<TaxCode[]> {
  return invoke<TaxCode[]>("list_tax_codes", { date, locale });
}

export function getTaxSummary(bookId: string, startDate: string, endDate: string, locale: "ja" | "en"): Promise<TaxSummary> {
  return invoke<TaxSummary>("get_tax_summary", { bookId, startDate, endDate, locale });
}

export function listFixedAssets(bookId: string): Promise<FixedAsset[]> {
  return invoke<FixedAsset[]>("list_fixed_assets", { bookId });
}

export function createFixedAsset(bookId: string, request: CreateFixedAssetRequest): Promise<FixedAsset> {
  return invoke<FixedAsset>("create_fixed_asset", { bookId, request });
}

export function postFixedAssetDepreciation(bookId: string, assetId: string, fiscalYear: number): Promise<DepreciationResult> {
  return invoke<DepreciationResult>("post_fixed_asset_depreciation", { bookId, assetId, fiscalYear });
}

export function listInventoryCounts(bookId: string): Promise<InventoryCount[]> {
  return invoke<InventoryCount[]>("list_inventory_counts", { bookId });
}

export function postInventoryAdjustment(bookId: string, request: InventoryAdjustmentRequest): Promise<InventoryCount> {
  return invoke<InventoryCount>("post_inventory_adjustment", { bookId, request });
}

export function listAttachments(bookId: string): Promise<Attachment[]> {
  return invoke<Attachment[]>("list_attachments", { bookId });
}

export function addAttachment(bookId: string, entryId: string, originalName: string, data: number[]): Promise<Attachment> {
  return invoke<Attachment>("add_attachment", { bookId, entryId, originalName, data });
}

export function addEvidenceLink(bookId: string, entryId: string, title: string, externalUrl: string): Promise<Attachment> {
  return invoke<Attachment>("add_evidence_link", { bookId, entryId, title, externalUrl });
}

export function revealAttachment(bookId: string, attachmentId: string): Promise<void> {
  return invoke<void>("reveal_attachment", { bookId, attachmentId });
}

export function openEvidenceLink(bookId: string, attachmentId: string): Promise<void> {
  return invoke<void>("open_evidence_link", { bookId, attachmentId });
}

export function deleteAttachment(bookId: string, attachmentId: string): Promise<void> {
  return invoke<void>("delete_attachment", { bookId, attachmentId });
}
