import { useEffect, useState } from "react";
import { useI18n } from "../i18n/context";
import { getStoredFontFamily, saveFontFamily } from "../lib/font-family";
import { todayLocalDate } from "../lib/local-date";
import { formatYen } from "../lib/money";
import { getStoredThemePreference, saveThemePreference } from "../lib/theme";
import {
  createBackup,
  getAutomaticBackupSettings,
  getDatabaseInfo,
  importJournalCsv,
  listAutomaticBackups,
  listBackups,
  previewJournalCsv,
  restoreBackup,
  revealDatabaseFile,
  saveAutomaticBackupSettings,
  selectBackupDirectory
} from "../lib/tauri";
import type { AutomaticBackupSettings, BackupFile, CsvImportPreview, DatabaseInfo, FontFamily, JournalDeletionResult, JournalDeletionScope, ThemePreference } from "../types/settings";
import type { Book, ConsumptionTaxStatus } from "../types/book";

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

function formatFileSize(bytes: number, locale: string): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

type Props = {
  bookId: string;
  fiscalYear?: number;
  books?: Book[];
  activeBookId?: string;
  onBookCreate?: (name: string) => Promise<void>;
  onBookDelete?: (bookId: string) => Promise<void>;
  onJournalEntriesDelete?: (scope: JournalDeletionScope) => Promise<JournalDeletionResult>;
  consumptionTaxStatus?: ConsumptionTaxStatus;
  onConsumptionTaxStatusChange?: (status: ConsumptionTaxStatus) => Promise<void>;
  onDatabaseRestored?: () => void;
};

export function SettingsPage({ bookId, fiscalYear = Number(todayLocalDate().slice(0, 4)), books = [], activeBookId = bookId, onBookCreate, onBookDelete, onJournalEntriesDelete, consumptionTaxStatus = "taxable", onConsumptionTaxStatusChange, onDatabaseRestored }: Props) {
  const { locale, setLocale, t } = useI18n();
  const [database, setDatabase] = useState<DatabaseInfo | null>(null);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [databaseMessage, setDatabaseMessage] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [automaticBackups, setAutomaticBackups] = useState<BackupFile[]>([]);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState<string | null>(null);
  const [automaticBackup, setAutomaticBackup] = useState<AutomaticBackupSettings | null>(null);
  const [automaticBackupBusy, setAutomaticBackupBusy] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importContent, setImportContent] = useState("");
  const [importPreview, setImportPreview] = useState<CsvImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [taxStatusBusy, setTaxStatusBusy] = useState(false);
  const [taxStatusError, setTaxStatusError] = useState<string | null>(null);
  const [taxStatusMessage, setTaxStatusMessage] = useState<string | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);
  const [fontFamily, setFontFamily] = useState<FontFamily>(getStoredFontFamily);
  const [newBookName, setNewBookName] = useState("");
  const [bookBusy, setBookBusy] = useState(false);
  const [bookCreateError, setBookCreateError] = useState<string | null>(null);
  const [bookMessage, setBookMessage] = useState<string | null>(null);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [bookDeleteConfirmation, setBookDeleteConfirmation] = useState("");
  const [bookDeleteBusy, setBookDeleteBusy] = useState(false);
  const [bookDeleteError, setBookDeleteError] = useState<string | null>(null);
  const [journalDeletionScope, setJournalDeletionScope] = useState<JournalDeletionScope | null>(null);
  const [journalDeletionConfirmation, setJournalDeletionConfirmation] = useState("");
  const [journalDeletionBusy, setJournalDeletionBusy] = useState(false);
  const [journalDeletionError, setJournalDeletionError] = useState<string | null>(null);
  const [journalDeletionMessage, setJournalDeletionMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getDatabaseInfo()
      .then((info) => { if (active) setDatabase(info); })
      .catch((reason: unknown) => { if (active) setDatabaseError(errorText(reason)); });
    listBackups()
      .then((items) => { if (active) setBackups(items); })
      .catch((reason: unknown) => { if (active) setBackupError(errorText(reason)); });
    listAutomaticBackups()
      .then((items) => { if (active) setAutomaticBackups(items); })
      .catch((reason: unknown) => { if (active) setBackupError(errorText(reason)); });
    getAutomaticBackupSettings()
      .then((settings) => { if (active) setAutomaticBackup(settings); })
      .catch((reason: unknown) => { if (active) setBackupError(errorText(reason)); });
    return () => { active = false; };
  }, []);

  async function handleReveal() {
    setRevealing(true);
    setDatabaseError(null);
    setDatabaseMessage(null);
    try {
      await revealDatabaseFile();
      setDatabaseMessage(t("settings.database.revealed"));
    } catch (reason) {
      setDatabaseError(errorText(reason));
    } finally {
      setRevealing(false);
    }
  }

  async function handleCreateBackup() {
    setBackupBusy("create");
    setBackupError(null);
    setBackupMessage(null);
    try {
      const backup = await createBackup();
      setBackups((current) => [backup, ...current]);
      setBackupMessage(t("settings.backup.created", { fileName: backup.fileName }));
    } catch (reason) {
      setBackupError(errorText(reason));
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleRestore(fileName: string) {
    if (!window.confirm(t("settings.backup.confirm_restore", { fileName }))) return;
    setBackupBusy(fileName);
    setBackupError(null);
    setBackupMessage(null);
    try {
      const result = await restoreBackup(fileName);
      setBackupMessage(t("settings.backup.restored", {
        fileName: result.restoredFileName,
        safetyBackup: result.safetyBackupFileName
      }));
      onDatabaseRestored?.();
    } catch (reason) {
      setBackupError(errorText(reason));
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleChooseBackupDestination() {
    if (!automaticBackup) return;
    setAutomaticBackupBusy(true);
    setBackupError(null);
    try {
      const destination = await selectBackupDirectory(automaticBackup.destinationDirectory);
      if (destination) {
        setAutomaticBackup((current) => current ? { ...current, destinationDirectory: destination } : current);
      }
    } catch (reason) {
      setBackupError(errorText(reason));
    } finally {
      setAutomaticBackupBusy(false);
    }
  }

  async function handleSaveAutomaticBackup() {
    if (!automaticBackup) return;
    setAutomaticBackupBusy(true);
    setBackupError(null);
    setBackupMessage(null);
    try {
      const saved = await saveAutomaticBackupSettings({
        enabled: automaticBackup.enabled,
        intervalMinutes: automaticBackup.intervalMinutes,
        retentionCount: automaticBackup.retentionCount,
        destinationDirectory: automaticBackup.destinationDirectory
      });
      setAutomaticBackup(saved);
      setBackups(await listBackups());
      setAutomaticBackups(await listAutomaticBackups());
      setBackupMessage(t("settings.backup.automatic_saved"));
    } catch (reason) {
      setBackupError(errorText(reason));
    } finally {
      setAutomaticBackupBusy(false);
    }
  }

  async function handleCsvFile(file: File | undefined) {
    setImportFileName(file?.name ?? "");
    setImportContent("");
    setImportPreview(null);
    setImportError(null);
    setImportMessage(null);
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setImportError(t("settings.import.too_large"));
      return;
    }
    setImportBusy(true);
    try {
      const content = await file.text();
      const preview = await previewJournalCsv(bookId, content);
      setImportContent(content);
      setImportPreview(preview);
    } catch (reason) {
      setImportError(errorText(reason));
    } finally {
      setImportBusy(false);
    }
  }

  async function handleImport() {
    if (!importContent || !importPreview) return;
    setImportBusy(true);
    setImportError(null);
    setImportMessage(null);
    try {
      const result = await importJournalCsv(bookId, importContent);
      setImportMessage(t("settings.import.imported", {
        entries: result.importedEntryCount,
        lines: result.importedLineCount
      }));
      setImportContent("");
      setImportPreview(null);
      setImportFileName("");
    } catch (reason) {
      setImportError(errorText(reason));
    } finally {
      setImportBusy(false);
    }
  }

  async function handleTaxStatusChange(status: ConsumptionTaxStatus) {
    if (status === consumptionTaxStatus) return;
    setTaxStatusBusy(true);
    setTaxStatusError(null);
    setTaxStatusMessage(null);
    try {
      await onConsumptionTaxStatusChange?.(status);
      setTaxStatusMessage(t("settings.consumption_tax.saved"));
    } catch (reason) {
      setTaxStatusError(errorText(reason));
    } finally {
      setTaxStatusBusy(false);
    }
  }

  function handleFontFamilyChange(nextFontFamily: FontFamily) {
    saveFontFamily(nextFontFamily);
    setFontFamily(nextFontFamily);
  }

  function handleThemeChange(nextTheme: ThemePreference) {
    saveThemePreference(nextTheme);
    setThemePreference(nextTheme);
  }

  async function handleBookCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newBookName.trim();
    if (!name || !onBookCreate) return;
    setBookBusy(true);
    setBookCreateError(null);
    setBookMessage(null);
    try {
      await onBookCreate(name);
      setNewBookName("");
      setBookMessage(t("settings.books.created", { name }));
    } catch (reason) {
      setBookCreateError(errorText(reason));
    } finally {
      setBookBusy(false);
    }
  }

  function openBookDeleteDialog(book: Book) {
    setBookToDelete(book);
    setBookDeleteConfirmation("");
    setBookDeleteError(null);
    setBookMessage(null);
  }

  async function handleBookDelete() {
    if (!bookToDelete || bookDeleteConfirmation !== bookToDelete.name || !onBookDelete) return;
    setBookDeleteBusy(true);
    setBookDeleteError(null);
    try {
      const deletedName = bookToDelete.name;
      await onBookDelete(bookToDelete.id);
      setBookToDelete(null);
      setBookDeleteConfirmation("");
      setBookMessage(t("settings.books.deleted", { name: deletedName }));
    } catch (reason) {
      setBookDeleteError(errorText(reason));
    } finally {
      setBookDeleteBusy(false);
    }
  }

  const activeBookName = books.find((book) => book.id === bookId)?.name ?? "";

  function journalDeletionScopeLabel(scope: JournalDeletionScope): string {
    if (scope === "current_month") return t("settings.journal_deletion.current_month");
    if (scope === "fiscal_year") return t("settings.journal_deletion.fiscal_year", { year: fiscalYear });
    return t("settings.journal_deletion.all");
  }

  function openJournalDeletionDialog(scope: JournalDeletionScope) {
    if (!activeBookName || !onJournalEntriesDelete) return;
    setJournalDeletionScope(scope);
    setJournalDeletionConfirmation("");
    setJournalDeletionError(null);
    setJournalDeletionMessage(null);
  }

  async function handleJournalEntriesDelete() {
    if (!journalDeletionScope || journalDeletionConfirmation !== activeBookName || !onJournalEntriesDelete) return;
    setJournalDeletionBusy(true);
    setJournalDeletionError(null);
    try {
      const result = await onJournalEntriesDelete(journalDeletionScope);
      setJournalDeletionScope(null);
      setJournalDeletionConfirmation("");
      setJournalDeletionMessage(t(
        result.failedAttachmentFileCount > 0
          ? "settings.journal_deletion.deleted_with_file_warning"
          : "settings.journal_deletion.deleted",
        {
          entries: result.deletedEntryCount,
          attachments: result.deletedAttachmentCount,
          failedFiles: result.failedAttachmentFileCount
        }
      ));
    } catch (reason) {
      setJournalDeletionError(errorText(reason));
    } finally {
      setJournalDeletionBusy(false);
    }
  }

  return (
    <section className="page" aria-labelledby="settings-title">
      <div className="page-heading">
        <div><p className="kicker">{t("settings.kicker")}</p><h1 id="settings-title">{t("settings.title")}</h1><p>{t("settings.subtitle")}</p></div>
      </div>

      <div className="settings-grid">
        <article className="settings-card">
          <header className="settings-card-header">
            <span className="settings-glyph" aria-hidden="true">BK</span>
            <div><p>{t("settings.books.kicker")}</p><h2>{t("settings.books.title")}</h2><small>{t("settings.books.description")}</small></div>
          </header>
          <div className="book-settings-list" aria-label={t("settings.books.list_label")}>
            {books.map((book) => (
              <div className="book-settings-row" key={book.id}>
                <div className="book-settings-name">
                  <strong>{book.name}</strong>
                  {book.id === activeBookId ? <span>{t("settings.books.current")}</span> : null}
                </div>
                <button
                  className="book-delete-button"
                  type="button"
                  aria-label={t("settings.books.delete_label", { name: book.name })}
                  title={books.length <= 1 ? t("settings.books.last_book") : t("settings.books.delete_label", { name: book.name })}
                  disabled={books.length <= 1 || bookDeleteBusy || !onBookDelete}
                  onClick={() => openBookDeleteDialog(book)}
                >
                  {t("settings.books.delete")}
                </button>
              </div>
            ))}
          </div>
          <form className="settings-action-row book-create-form" onSubmit={handleBookCreate}>
            <label>
              <strong>{t("settings.books.name")}</strong>
              <small>{t("settings.books.name_help")}</small>
            </label>
            <div>
              <input aria-label={t("settings.books.name")} maxLength={100} value={newBookName} disabled={bookBusy} onChange={(event) => setNewBookName(event.target.value)} />
              <button className="primary-button" type="submit" disabled={bookBusy || !newBookName.trim() || !onBookCreate}>{t(bookBusy ? "settings.books.creating" : "settings.books.create")}</button>
            </div>
          </form>
          {bookCreateError ? <p className="error-banner" role="alert">{t("settings.books.error", { error: bookCreateError })}</p> : null}
          {bookMessage ? <p className="settings-message" role="status">{bookMessage}</p> : null}
        </article>

        {bookToDelete ? (
          <div className="modal-backdrop" role="presentation">
            <div className="delete-dialog book-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="book-delete-title" aria-describedby="book-delete-description">
              <span className="delete-dialog-mark" aria-hidden="true">!</span>
              <h2 id="book-delete-title">{t("settings.books.delete_title")}</h2>
              <p id="book-delete-description">{t("settings.books.delete_description", { name: bookToDelete.name })}</p>
              <p className="correction-notice">{t("settings.books.delete_empty_only")}</p>
              <label className="book-delete-confirmation">
                <span>{t("settings.books.confirm_name", { name: bookToDelete.name })}</span>
                <input
                  autoFocus
                  aria-label={t("settings.books.confirm_name", { name: bookToDelete.name })}
                  value={bookDeleteConfirmation}
                  disabled={bookDeleteBusy}
                  onChange={(event) => setBookDeleteConfirmation(event.target.value)}
                />
              </label>
              {bookDeleteError ? <p className="dialog-error" role="alert">{t("settings.books.delete_error", { error: bookDeleteError })}</p> : null}
              <div className="correction-dialog-actions">
                <button className="secondary-button" type="button" disabled={bookDeleteBusy} onClick={() => setBookToDelete(null)}>{t("common.cancel")}</button>
                <button className="danger-button" type="button" disabled={bookDeleteBusy || bookDeleteConfirmation !== bookToDelete.name} onClick={handleBookDelete}>{t(bookDeleteBusy ? "settings.books.deleting" : "settings.books.confirm_delete")}</button>
              </div>
            </div>
          </div>
        ) : null}

        <article className="settings-card journal-deletion-card">
          <header className="settings-card-header">
            <span className="settings-glyph danger-glyph" aria-hidden="true">!</span>
            <div><p>{t("settings.journal_deletion.kicker")}</p><h2>{t("settings.journal_deletion.title")}</h2><small>{t("settings.journal_deletion.description", { name: activeBookName })}</small></div>
          </header>
          <div className="journal-deletion-actions">
            <button className="book-delete-button" type="button" disabled={!onJournalEntriesDelete || !activeBookName || journalDeletionBusy} onClick={() => openJournalDeletionDialog("current_month")}>{t("settings.journal_deletion.current_month")}</button>
            <button className="book-delete-button" type="button" disabled={!onJournalEntriesDelete || !activeBookName || journalDeletionBusy} onClick={() => openJournalDeletionDialog("fiscal_year")}>{t("settings.journal_deletion.fiscal_year", { year: fiscalYear })}</button>
            <button className="book-delete-button" type="button" disabled={!onJournalEntriesDelete || !activeBookName || journalDeletionBusy} onClick={() => openJournalDeletionDialog("all")}>{t("settings.journal_deletion.all")}</button>
          </div>
          <p className="journal-deletion-note">{t("settings.journal_deletion.note")}</p>
          {journalDeletionMessage ? <p className="settings-message" role="status">{journalDeletionMessage}</p> : null}
        </article>

        {journalDeletionScope ? (
          <div className="modal-backdrop" role="presentation">
            <div className="delete-dialog book-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="journal-deletion-title" aria-describedby="journal-deletion-description">
              <span className="delete-dialog-mark" aria-hidden="true">!</span>
              <h2 id="journal-deletion-title">{t("settings.journal_deletion.dialog_title")}</h2>
              <p id="journal-deletion-description">{t("settings.journal_deletion.dialog_description", { name: activeBookName, scope: journalDeletionScopeLabel(journalDeletionScope) })}</p>
              <p className="correction-notice">{t("settings.journal_deletion.warning")}</p>
              <label className="book-delete-confirmation">
                <span>{t("settings.journal_deletion.confirm_name", { name: activeBookName })}</span>
                <input autoFocus aria-label={t("settings.journal_deletion.confirm_name", { name: activeBookName })} value={journalDeletionConfirmation} disabled={journalDeletionBusy} onChange={(event) => setJournalDeletionConfirmation(event.target.value)} />
              </label>
              {journalDeletionError ? <p className="dialog-error" role="alert">{t("settings.journal_deletion.error", { error: journalDeletionError })}</p> : null}
              <div className="correction-dialog-actions">
                <button className="secondary-button" type="button" disabled={journalDeletionBusy} onClick={() => setJournalDeletionScope(null)}>{t("common.cancel")}</button>
                <button className="danger-button" type="button" disabled={journalDeletionBusy || journalDeletionConfirmation !== activeBookName} onClick={handleJournalEntriesDelete}>{t(journalDeletionBusy ? "settings.journal_deletion.deleting" : "settings.journal_deletion.confirm_delete")}</button>
              </div>
            </div>
          </div>
        ) : null}

        <article className="settings-card">
          <header className="settings-card-header">
            <span className="settings-glyph" aria-hidden="true">Aa</span>
            <div><p>{t("settings.appearance.kicker")}</p><h2>{t("settings.appearance.title")}</h2><small>{t("settings.appearance.description")}</small></div>
          </header>
          <div className="settings-action-row appearance-setting-row">
            <p><strong>{t("language.label")}</strong><small>{t("settings.appearance.language_help")}</small></p>
            <label>
              <span className="sr-only">{t("language.label")}</span>
              <select aria-label={t("language.label")} value={locale} onChange={(event) => setLocale(event.target.value as "ja" | "en")}>
                <option value="ja">{t("language.ja")}</option>
                <option value="en">{t("language.en")}</option>
              </select>
            </label>
          </div>
          <div className="settings-action-row appearance-setting-row">
            <p><strong>{t("settings.appearance.theme")}</strong><small>{t("settings.appearance.theme_help")}</small></p>
            <label>
              <span className="sr-only">{t("settings.appearance.theme")}</span>
              <select aria-label={t("settings.appearance.theme")} value={themePreference} onChange={(event) => handleThemeChange(event.target.value as ThemePreference)}>
                <option value="system">{t("settings.appearance.theme_system")}</option>
                <option value="dark">{t("settings.appearance.theme_dark")}</option>
                <option value="light">{t("settings.appearance.theme_light")}</option>
              </select>
            </label>
          </div>
          <div className="settings-action-row appearance-setting-row">
            <p><strong>{t("settings.appearance.font_family")}</strong><small>{t("settings.appearance.help")}</small></p>
            <label>
              <span className="sr-only">{t("settings.appearance.font_family")}</span>
              <select aria-label={t("settings.appearance.font_family")} value={fontFamily} onChange={(event) => handleFontFamilyChange(event.target.value as FontFamily)}>
                <option value="gothic">{t("settings.appearance.gothic")}</option>
                <option value="mincho">{t("settings.appearance.mincho")}</option>
              </select>
            </label>
          </div>
        </article>

        <article className="settings-card">
          <header className="settings-card-header">
            <span className="settings-glyph" aria-hidden="true">TX</span>
            <div><p>{t("settings.consumption_tax.kicker")}</p><h2>{t("settings.consumption_tax.title")}</h2><small>{t("settings.consumption_tax.description")}</small></div>
          </header>
          <div className="settings-action-row">
            <p><strong>{t("settings.consumption_tax.business_status")}</strong><small>{t("settings.consumption_tax.input_behavior")}</small></p>
            <label>
              <span className="sr-only">{t("settings.consumption_tax.business_status")}</span>
              <select aria-label={t("settings.consumption_tax.business_status")} value={consumptionTaxStatus} disabled={taxStatusBusy} onChange={(event) => handleTaxStatusChange(event.target.value as ConsumptionTaxStatus)}>
                <option value="taxable">{t("settings.consumption_tax.taxable")}</option>
                <option value="exempt">{t("settings.consumption_tax.exempt")}</option>
              </select>
            </label>
          </div>
          {taxStatusError ? <p className="error-banner" role="alert">{t("settings.consumption_tax.error", { error: taxStatusError })}</p> : null}
          {taxStatusMessage ? <p className="settings-message" role="status">{taxStatusMessage}</p> : null}
        </article>

        <article className="settings-card">
          <header className="settings-card-header">
            <span className="settings-glyph" aria-hidden="true">DB</span>
            <div><p>{t("settings.database.kicker")}</p><h2>{t("settings.database.title")}</h2><small>{t("settings.database.description")}</small></div>
          </header>
          {databaseError ? <p className="error-banner" role="alert">{t("settings.database.error", { error: databaseError })}</p> : null}
          {!database && !databaseError ? <p className="settings-loading" role="status">{t("settings.database.loading")}</p> : null}
          {database ? (
            <div className="database-details">
              <div><span>{t("settings.database.file_name")}</span><strong>{database.fileName}</strong></div>
              <div><span>{t("settings.database.size")}</span><strong>{formatFileSize(database.sizeBytes, locale)}</strong></div>
              <div className="database-path"><span>{t("settings.database.path")}</span><code>{database.path}</code></div>
            </div>
          ) : null}
          <div className="settings-action-row">
            <p><strong>{t("settings.database.warning_title")}</strong><small>{t("settings.database.warning")}</small></p>
            <button className="primary-button" type="button" disabled={!database || revealing} onClick={handleReveal}>
              <span aria-hidden="true">↗</span>{t(revealing ? "settings.database.opening" : "settings.database.reveal")}
            </button>
          </div>
          {databaseMessage ? <p className="settings-message" role="status">{databaseMessage}</p> : null}
        </article>

        <article className="settings-card">
          <header className="settings-card-header">
            <span className="settings-glyph" aria-hidden="true">BK</span>
            <div><p>{t("settings.backup.kicker")}</p><h2>{t("settings.backup.title")}</h2><small>{t("settings.backup.description")}</small></div>
          </header>
          {!automaticBackup && !backupError ? <p className="settings-loading" role="status">{t("settings.backup.loading_automatic")}</p> : null}
          {automaticBackup ? (
            <div className="automatic-backup-settings">
              <div className="automatic-backup-heading">
                <div><strong>{t("settings.backup.automatic_title")}</strong><small>{t("settings.backup.automatic_description")}</small></div>
                <label className="automatic-backup-toggle">
                  <input type="checkbox" aria-label={t("settings.backup.automatic_enabled")} checked={automaticBackup.enabled} disabled={automaticBackupBusy} onChange={(event) => setAutomaticBackup({ ...automaticBackup, enabled: event.target.checked })} />
                  <span>{t(automaticBackup.enabled ? "settings.backup.enabled" : "settings.backup.disabled")}</span>
                </label>
              </div>
              <div className="automatic-backup-fields">
                <label>
                  <span>{t("settings.backup.interval")}</span>
                  <select aria-label={t("settings.backup.interval")} value={automaticBackup.intervalMinutes} disabled={automaticBackupBusy} onChange={(event) => setAutomaticBackup({ ...automaticBackup, intervalMinutes: Number(event.target.value) })}>
                    {[15, 30, 60, 180, 360, 720, 1440].map((minutes) => <option key={minutes} value={minutes}>{t(`settings.backup.interval_${minutes}`)}</option>)}
                  </select>
                </label>
                <label>
                  <span>{t("settings.backup.retention_count")}</span>
                  <select aria-label={t("settings.backup.retention_count")} value={automaticBackup.retentionCount} disabled={automaticBackupBusy} onChange={(event) => setAutomaticBackup({ ...automaticBackup, retentionCount: Number(event.target.value) })}>
                    {[1, 3, 5, 10, 20, 30, 50, 100].map((count) => <option key={count} value={count}>{t("settings.backup.retention_option", { count })}</option>)}
                  </select>
                </label>
              </div>
              <div className="backup-destination-row">
                <div><span>{t("settings.backup.destination")}</span><code>{automaticBackup.destinationDirectory}</code></div>
                <button className="secondary-button" type="button" disabled={automaticBackupBusy} onClick={handleChooseBackupDestination}>{t("settings.backup.choose_destination")}</button>
              </div>
              <div className="automatic-backup-footer">
                <div>
                  {automaticBackup.lastBackupAt ? <small>{t("settings.backup.last_success", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(automaticBackup.lastBackupAt)) })}</small> : <small>{t("settings.backup.never_run")}</small>}
                  {automaticBackup.lastError ? <small className="automatic-backup-error">{t("settings.backup.last_error", { error: automaticBackup.lastError })}</small> : null}
                </div>
                <button className="primary-button" type="button" disabled={automaticBackupBusy} onClick={handleSaveAutomaticBackup}>{t(automaticBackupBusy ? "settings.backup.saving_automatic" : "settings.backup.save_automatic")}</button>
              </div>
            </div>
          ) : null}
          <div className="backup-section-heading">
            <strong>{t("settings.backup.automatic_history")}</strong>
            <small>{t("settings.backup.automatic_history_description")}</small>
          </div>
          <div className="backup-list" aria-label={t("settings.backup.automatic_list_label")}>
            {automaticBackups.length === 0 ? <p className="settings-loading">{t("settings.backup.automatic_empty")}</p> : automaticBackups.map((backup) => (
              <div className="backup-row" key={backup.fileName}>
                <div><strong>{backup.fileName}</strong><small>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(backup.createdAt))} · {formatFileSize(backup.sizeBytes, locale)}</small></div>
                <button className="secondary-button" type="button" disabled={backupBusy !== null} onClick={() => handleRestore(backup.fileName)}>
                  {backupBusy === backup.fileName ? t("settings.backup.restoring") : t("settings.backup.restore")}
                </button>
              </div>
            ))}
          </div>
          <div className="settings-action-row">
            <p><strong>{t("settings.backup.snapshot_title")}</strong><small>{t("settings.backup.snapshot_description")}</small></p>
            <button className="primary-button" type="button" disabled={backupBusy !== null} onClick={handleCreateBackup}>
              {t(backupBusy === "create" ? "settings.backup.creating" : "settings.backup.create")}
            </button>
          </div>
          {backupError ? <p className="error-banner" role="alert">{t("settings.backup.error", { error: backupError })}</p> : null}
          {backupMessage ? <p className="settings-message" role="status">{backupMessage}</p> : null}
          <div className="backup-list" aria-label={t("settings.backup.snapshot_list_label")}>
            {backups.length === 0 ? <p className="settings-loading">{t("settings.backup.empty")}</p> : backups.map((backup) => (
              <div className="backup-row" key={backup.fileName}>
                <div><strong>{backup.fileName}</strong><small>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(backup.createdAt))} · {formatFileSize(backup.sizeBytes, locale)}</small></div>
                <button className="secondary-button" type="button" disabled={backupBusy !== null} onClick={() => handleRestore(backup.fileName)}>
                  {backupBusy === backup.fileName ? t("settings.backup.restoring") : t("settings.backup.restore")}
                </button>
              </div>
            ))}
          </div>
        </article>

        <article className="settings-card">
          <header className="settings-card-header">
            <span className="settings-glyph" aria-hidden="true">CSV</span>
            <div><p>{t("settings.import.kicker")}</p><h2>{t("settings.import.title")}</h2><small>{t("settings.import.description")}</small></div>
          </header>
          <div className="csv-import-body">
            <label className="csv-file-picker"><span>{t("settings.import.file")}</span><input type="file" accept=".csv,text/csv" disabled={importBusy} onChange={(event) => handleCsvFile(event.currentTarget.files?.[0])} /></label>
            {importFileName ? <p className="selected-file">{importFileName}</p> : null}
            {importBusy && !importPreview ? <p className="settings-loading" role="status">{t("settings.import.previewing")}</p> : null}
            {importError ? <p className="error-banner" role="alert">{t("settings.import.error", { error: importError })}</p> : null}
            {importPreview ? (
              <div className="import-preview" aria-label={t("settings.import.preview_label")}>
                <div><span>{t("settings.import.entries")}</span><strong>{importPreview.entryCount}</strong></div>
                <div><span>{t("settings.import.lines")}</span><strong>{importPreview.lineCount}</strong></div>
                <div><span>{t("common.debit")}</span><strong>{formatYen(importPreview.totalDebitMinor)}</strong></div>
                <div><span>{t("common.credit")}</span><strong>{formatYen(importPreview.totalCreditMinor)}</strong></div>
              </div>
            ) : null}
          </div>
          <div className="settings-action-row">
            <p><strong>{t("settings.import.draft_title")}</strong><small>{t("settings.import.draft_description")}</small></p>
            <button className="primary-button" type="button" disabled={!importPreview || importBusy} onClick={handleImport}>
              {t(importBusy && importPreview ? "settings.import.importing" : "settings.import.import")}
            </button>
          </div>
          {importMessage ? <p className="settings-message" role="status">{importMessage}</p> : null}
        </article>
      </div>
    </section>
  );
}
