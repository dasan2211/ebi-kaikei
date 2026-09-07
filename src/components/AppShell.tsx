import { useState, type ReactNode } from "react";
import { useI18n } from "../i18n/context";
import { fiscalYearTranslationParams } from "../lib/fiscal-year";
import { todayLocalDate } from "../lib/local-date";
import type { Book } from "../types/book";
import { HelpDialog } from "./HelpDialog";

export type PageId = "dashboard" | "accounts" | "journal" | "journal-book" | "ledger" | "trial-balance" | "closing" | "attachments" | "settings";

type NavigationItem = {
  id: PageId;
  labelKey: string;
  glyphKey: string;
};

const navigation: NavigationItem[] = [
  { id: "dashboard", labelKey: "navigation.dashboard", glyphKey: "navigation.glyphs.dashboard" },
  { id: "journal", labelKey: "navigation.journal", glyphKey: "navigation.glyphs.journal" },
  { id: "journal-book", labelKey: "navigation.journal_book", glyphKey: "navigation.glyphs.journal_book" },
  { id: "ledger", labelKey: "navigation.ledger", glyphKey: "navigation.glyphs.ledger" },
  { id: "trial-balance", labelKey: "navigation.trial_balance", glyphKey: "navigation.glyphs.trial_balance" },
  { id: "closing", labelKey: "navigation.closing", glyphKey: "navigation.glyphs.closing" },
  { id: "attachments", labelKey: "navigation.attachments", glyphKey: "navigation.glyphs.attachments" },
  { id: "accounts", labelKey: "navigation.accounts", glyphKey: "navigation.glyphs.accounts" }
];

const settingsNavigation: NavigationItem = { id: "settings", labelKey: "navigation.settings", glyphKey: "navigation.glyphs.settings" };

type Props = {
  activeBook: Book;
  activePage: PageId;
  books: Book[];
  bookError: string | null;
  fiscalYear: number;
  isSwitchingBook: boolean;
  onBookChange: (bookId: string) => void;
  onFiscalYearChange: (year: number) => void;
  onNavigate: (page: PageId) => void;
  children: ReactNode;
};

export function AppShell({
  activeBook,
  activePage,
  books,
  bookError,
  fiscalYear,
  isSwitchingBook,
  onBookChange,
  onFiscalYearChange,
  onNavigate,
  children
}: Props) {
  const { t } = useI18n();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const activeNavigation = [...navigation, settingsNavigation].find((item) => item.id === activePage);
  const fiscalYearParams = fiscalYearTranslationParams(fiscalYear);
  const isCurrentFiscalYear = fiscalYear === Number(todayLocalDate().slice(0, 4));

  return (
    <div className="app-shell" data-page={activePage}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark" aria-hidden="true">{t("meta.brand_mark")}</span>
          <span className="sidebar-brand-copy">
            <strong>{t("meta.app_name")}</strong>
            <small>{t("meta.brand_tagline")}</small>
          </span>
        </div>

        <section className="sidebar-context" aria-label={t("sidebar.context_aria_label")}>
          <div className="context-control">
            <label className="book-switcher">
              <span>{t("sidebar.book")}</span>
              <select
                aria-label={t("sidebar.switch_book")}
                value={activeBook.id}
                disabled={isSwitchingBook}
                onChange={(event) => onBookChange(event.target.value)}
              >
                {books.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}
              </select>
            </label>
          </div>
          <div className="context-control">
            <div className="context-control-label">
              <span>{t("sidebar.fiscal_year")}</span>
              {isCurrentFiscalYear ? <span className="current-fiscal-year-badge">{t("sidebar.current_fiscal_year")}</span> : null}
            </div>
            <div className={isCurrentFiscalYear ? "year-switcher current" : "year-switcher"}>
              <button type="button" aria-label={t("sidebar.previous_year")} disabled={fiscalYear <= 1900} onClick={() => onFiscalYearChange(fiscalYear - 1)}>‹</button>
              <strong aria-current={isCurrentFiscalYear ? "date" : undefined} aria-live="polite">{t("topbar.fiscal_year", fiscalYearParams)}</strong>
              <button type="button" aria-label={t("sidebar.next_year")} disabled={fiscalYear >= 9999} onClick={() => onFiscalYearChange(fiscalYear + 1)}>›</button>
            </div>
          </div>
          {bookError ? <span className="sidebar-context-error" role="alert">{t("books.switch_error")}</span> : null}
        </section>

        <nav className="main-navigation" aria-label={t("navigation.aria_label")}>
          {navigation.map((item) => (
            <button
              className={activePage === item.id ? "nav-item active" : "nav-item"}
              key={item.id}
              onClick={() => onNavigate(item.id)}
              type="button"
              aria-label={t(item.labelKey)}
              aria-current={activePage === item.id ? "page" : undefined}
            >
              <span className="nav-glyph" aria-hidden="true">{t(item.glyphKey)}</span>
              <span>{t(item.labelKey)}</span>
            </button>
          ))}
        </nav>

        <button
          className={activePage === "settings" ? "sidebar-foot active" : "sidebar-foot"}
          type="button"
          onClick={() => onNavigate("settings")}
          aria-label={t("sidebar.open_local_settings")}
          aria-current={activePage === "settings" ? "page" : undefined}
        >
          <span className="nav-glyph" aria-hidden="true">{t("navigation.glyphs.settings")}</span>
          <span>{t("navigation.settings")}</span>
          <span className="sidebar-foot-arrow" aria-hidden="true">›</span>
        </button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="page-context">
            <span className="nav-glyph" aria-hidden="true">{activeNavigation ? t(activeNavigation.glyphKey) : ""}</span>
            <span>
              <small>{activeBook.name}</small>
              <strong>{activeNavigation ? t(activeNavigation.labelKey) : ""}</strong>
            </span>
          </div>
          <div className="topbar-actions">
            <span className="fiscal-period">{t("topbar.fiscal_period", { start: `${fiscalYear}.01.01`, end: `${fiscalYear}.12.31` })}</span>
            <button
              className="icon-button"
              type="button"
              aria-label={t("topbar.help")}
              aria-haspopup="dialog"
              aria-expanded={isHelpOpen}
              onClick={() => setIsHelpOpen(true)}
            >
              ?
            </button>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
      {isHelpOpen ? <HelpDialog onClose={() => setIsHelpOpen(false)} onNavigate={onNavigate} /> : null}
    </div>
  );
}
