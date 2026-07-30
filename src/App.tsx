import { useCallback, useEffect, useState } from "react";
import { AppShell, type PageId } from "./components/AppShell";
import { useI18n } from "./i18n/context";
import { I18nProvider } from "./i18n/I18nProvider";
import type { Locale } from "./i18n/i18n";
import { completeInitialSetup, getSetupStatus, listBooks, setActiveBook, type SetupStatus } from "./lib/tauri";
import { AccountsPage } from "./pages/AccountsPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InitialSetupPage } from "./pages/InitialSetupPage";
import { JournalEntryPage } from "./pages/JournalEntryPage";
import type { BookState } from "./types/book";

function AppContent() {
  const { setLocale, t } = useI18n();
  const [page, setPage] = useState<PageId>("dashboard");
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isSavingSetup, setIsSavingSetup] = useState(false);
  const [bookState, setBookState] = useState<BookState | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const [isSwitchingBook, setIsSwitchingBook] = useState(false);

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
      isSwitchingBook={isSwitchingBook}
      onBookChange={handleBookChange}
      onNavigate={setPage}
    >
      {page === "dashboard" ? <DashboardPage onStartJournal={() => setPage("journal")} /> : null}
      {page === "accounts" ? <AccountsPage bookId={activeBook.id} key={`accounts-${activeBook.id}`} /> : null}
      {page === "journal" ? <JournalEntryPage bookId={activeBook.id} key={`journal-${activeBook.id}`} /> : null}
      {page === "journal-book" || page === "ledger" || page === "trial-balance" || page === "settings" ? <ComingSoonPage page={page} /> : null}
    </AppShell>
  );
}

export function App() {
  return <I18nProvider><AppContent /></I18nProvider>;
}
