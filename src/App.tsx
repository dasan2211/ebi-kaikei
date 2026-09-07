import { useCallback, useEffect, useState } from "react";
import { AppShell, type PageId } from "./components/AppShell";
import { useI18n } from "./i18n/context";
import { I18nProvider } from "./i18n/I18nProvider";
import type { Locale } from "./i18n/i18n";
import { todayLocalDate } from "./lib/local-date";
import { startAutomaticBackupScheduler } from "./lib/automatic-backup";
import { completeInitialSetup, createBook, deleteBook, deleteJournalEntries, getSetupStatus, listBooks, setActiveBook, setBookConsumptionTaxStatus, type SetupStatus } from "./lib/tauri";
import { AccountsPage } from "./pages/AccountsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InitialSetupPage } from "./pages/InitialSetupPage";
import { JournalEntryPage } from "./pages/JournalEntryPage";
import { JournalBookPage } from "./pages/JournalBookPage";
import { GeneralLedgerPage } from "./pages/GeneralLedgerPage";
import { TrialBalancePage } from "./pages/TrialBalancePage";
import { SettingsPage } from "./pages/SettingsPage";
import { ClosingOperationsPage } from "./pages/ClosingOperationsPage";
import { AttachmentsPage } from "./pages/AttachmentsPage";
import type { BookState, ConsumptionTaxStatus } from "./types/book";
import type { JournalDeletionResult, JournalDeletionScope } from "./types/settings";

const FISCAL_YEAR_STORAGE_KEY = "ebi-kaikei.fiscal-year";

function initialFiscalYear(): number {
  const stored = Number(window.localStorage.getItem(FISCAL_YEAR_STORAGE_KEY));
  if (Number.isInteger(stored) && stored >= 1900 && stored <= 9999) return stored;
  return Number(todayLocalDate().slice(0, 4));
}

function AppContent() {
  const { setLocale, t } = useI18n();
  const [page, setPage] = useState<PageId>("dashboard");
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isSavingSetup, setIsSavingSetup] = useState(false);
  const [bookState, setBookState] = useState<BookState | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const [isSwitchingBook, setIsSwitchingBook] = useState(false);
  const [fiscalYear, setFiscalYear] = useState(initialFiscalYear);

  useEffect(() => {
    let active = true;
    getSetupStatus()
      .then((status) => {
        if (!active) return;
        setSetupStatus(status);
        if (status.completed && status.locale) setLocale(status.locale);
      })
      .catch((error: unknown) => {
        if (active) setSetupError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, [setLocale]);

  useEffect(() => {
    if (!setupStatus?.completed) return;
    let active = true;
    listBooks()
      .then((state) => {
        if (active) setBookState(state);
      })
      .catch((error: unknown) => {
        if (active) setBookError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, [setupStatus?.completed]);

  useEffect(() => {
    if (!setupStatus?.completed) return;
    return startAutomaticBackupScheduler();
  }, [setupStatus?.completed]);

  const handleSetupComplete = useCallback(async (locale: Locale) => {
    setIsSavingSetup(true);
    setSetupError(null);
    try {
      const status = await completeInitialSetup(locale);
      setLocale(locale);
      setSetupStatus(status);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingSetup(false);
    }
  }, [setLocale]);

  const handleBookChange = useCallback(async (bookId: string) => {
    setIsSwitchingBook(true);
    setBookError(null);
    try {
      setBookState(await setActiveBook(bookId));
    } catch (error) {
      setBookError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSwitchingBook(false);
    }
  }, []);

  const handleBookCreate = useCallback(async (name: string) => {
    setBookError(null);
    try {
      setBookState(await createBook(name));
    } catch (error) {
      setBookError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, []);

  const handleBookDelete = useCallback(async (bookId: string) => {
    setBookError(null);
    try {
      setBookState(await deleteBook(bookId));
    } catch (error) {
      setBookError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, []);

  const handleJournalEntriesDelete = useCallback((bookId: string, scope: JournalDeletionScope): Promise<JournalDeletionResult> => (
    deleteJournalEntries(bookId, scope, todayLocalDate(), fiscalYear)
  ), [fiscalYear]);

  const handleFiscalYearChange = useCallback((year: number) => {
    const nextYear = Math.min(9999, Math.max(1900, year));
    window.localStorage.setItem(FISCAL_YEAR_STORAGE_KEY, String(nextYear));
    setFiscalYear(nextYear);
  }, []);

  const handleConsumptionTaxStatusChange = useCallback(async (bookId: string, status: ConsumptionTaxStatus) => {
    setBookError(null);
    try {
      setBookState(await setBookConsumptionTaxStatus(bookId, status));
    } catch (error) {
      setBookError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, []);

  if (!setupStatus) {
    if (setupError) {
      return (
        <main className="setup-page">
          <section className="setup-card setup-status" role="alert">
            <h1>{t("setup.load_error_title")}</h1>
            <p>{t("setup.error", { error: setupError })}</p>
          </section>
        </main>
      );
    }
    return <main className="setup-page"><p className="setup-loading" role="status">{t("setup.loading")}</p></main>;
  }

  if (!setupStatus.completed) {
    return (
      <InitialSetupPage
        accountCount={setupStatus.defaultAccountCount}
        error={setupError}
        isSaving={isSavingSetup}
        onComplete={handleSetupComplete}
      />
    );
  }

  if (!bookState) {
    if (bookError) {
      return (
        <main className="setup-page">
          <section className="setup-card setup-status" role="alert">
            <h1>{t("books.load_error_title")}</h1>
            <p>{t("books.load_error", { error: bookError })}</p>
          </section>
        </main>
      );
    }
    return <main className="setup-page"><p className="setup-loading" role="status">{t("books.loading")}</p></main>;
  }

  const activeBook = bookState.books.find((book) => book.id === bookState.activeBookId) ?? bookState.books[0];

  return (
    <AppShell
      activeBook={activeBook}
      activePage={page}
      books={bookState.books}
      bookError={bookError}
      fiscalYear={fiscalYear}
      isSwitchingBook={isSwitchingBook}
      onBookChange={handleBookChange}
      onFiscalYearChange={handleFiscalYearChange}
      onNavigate={setPage}
    >
      {page === "dashboard" ? <DashboardPage bookId={activeBook.id} fiscalYear={fiscalYear} onNavigate={setPage} onStartJournal={() => setPage("journal")} /> : null}
      {page === "accounts" ? <AccountsPage bookId={activeBook.id} key={`accounts-${activeBook.id}`} /> : null}
      {page === "journal" ? <JournalEntryPage bookId={activeBook.id} consumptionTaxStatus={activeBook.consumptionTaxStatus} key={`journal-${activeBook.id}`} /> : null}
      {page === "journal-book" ? <JournalBookPage bookId={activeBook.id} fiscalYear={fiscalYear} key={`journal-book-${activeBook.id}-${fiscalYear}`} /> : null}
      {page === "ledger" ? <GeneralLedgerPage bookId={activeBook.id} fiscalYear={fiscalYear} key={`ledger-${activeBook.id}-${fiscalYear}`} /> : null}
      {page === "trial-balance" ? <TrialBalancePage bookId={activeBook.id} fiscalYear={fiscalYear} key={`trial-balance-${activeBook.id}-${fiscalYear}`} /> : null}
      {page === "closing" ? <ClosingOperationsPage bookId={activeBook.id} fiscalYear={fiscalYear} key={`closing-${activeBook.id}-${fiscalYear}`} /> : null}
      {page === "attachments" ? <AttachmentsPage bookId={activeBook.id} fiscalYear={fiscalYear} key={`attachments-${activeBook.id}-${fiscalYear}`} /> : null}
      {page === "settings" ? <SettingsPage bookId={activeBook.id} fiscalYear={fiscalYear} books={bookState.books} activeBookId={activeBook.id} consumptionTaxStatus={activeBook.consumptionTaxStatus} onBookCreate={handleBookCreate} onBookDelete={handleBookDelete} onJournalEntriesDelete={(scope) => handleJournalEntriesDelete(activeBook.id, scope)} onConsumptionTaxStatusChange={(status) => handleConsumptionTaxStatusChange(activeBook.id, status)} onDatabaseRestored={() => window.location.reload()} /> : null}
    </AppShell>
  );
}

export function App() {
  return <I18nProvider><AppContent /></I18nProvider>;
}
