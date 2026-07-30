import type { ReactNode } from "react";
import { useI18n } from "../i18n/context";
import type { Book } from "../types/book";

export type PageId = "dashboard" | "accounts" | "journal" | "journal-book" | "ledger" | "trial-balance" | "settings";

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
  { id: "accounts", labelKey: "navigation.accounts", glyphKey: "navigation.glyphs.accounts" },
  { id: "settings", labelKey: "navigation.settings", glyphKey: "navigation.glyphs.settings" }
];

type Props = {
  activeBook: Book;
  activePage: PageId;
  books: Book[];
  bookError: string | null;
  isSwitchingBook: boolean;
  onBookChange: (bookId: string) => void;
  onNavigate: (page: PageId) => void;
  children: ReactNode;
};

export function AppShell({
  activeBook,
  activePage,
  books,
  bookError,
  isSwitchingBook,
  onBookChange,
  onNavigate,
  children
}: Props) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" aria-label={t("meta.app_name")}>
          <span className="brand-mark" aria-hidden="true">{t("meta.brand_mark")}</span>
          <span>
            <strong>{t("meta.app_name")}</strong>
            <small>{t("meta.brand_tagline")}</small>
          </span>
        </div>

        <nav className="main-navigation" aria-label={t("navigation.aria_label")}>
          {navigation.map((item) => (
            <button
              className={activePage === item.id ? "nav-item active" : "nav-item"}
              key={item.id}
              onClick={() => onNavigate(item.id)}
              type="button"
              aria-current={activePage === item.id ? "page" : undefined}
            >
              <span className="nav-glyph" aria-hidden="true">{t(item.glyphKey)}</span>
              <span>{t(item.labelKey)}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className="status-dot" aria-hidden="true" />
          <span>{t("sidebar.local_storage")}</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="book-context">
            <p className="eyebrow">{t("topbar.fiscal_year", { year: 2026 })}</p>
            <label className="book-control">
              <span className="book-symbol" aria-hidden="true">帳</span>
              <span className="sr-only">{t("books.label")}</span>
              <select
                aria-label={t("books.label")}
                disabled={isSwitchingBook}
                onChange={(event) => onBookChange(event.target.value)}
                value={activeBook.id}
              >
                {books.map((book) => (
                  <option key={book.id} value={book.id}>{t(`books.types.${book.incomeType}`)}</option>
                ))}
              </select>
            </label>
            {bookError ? <span className="book-error" role="alert">{t("books.switch_error")}</span> : null}
          </div>
          <div className="topbar-actions">
            <span className="fiscal-period">{t("topbar.fiscal_period", { start: "2026.01.01", end: "2026.12.31" })}</span>
            <label className="language-control">
              <span className="sr-only">{t("language.label")}</span>
              <select aria-label={t("language.label")} value={locale} onChange={(event) => setLocale(event.target.value as "ja" | "en")}>
                <option value="ja">{t("language.ja")}</option>
                <option value="en">{t("language.en")}</option>
              </select>
            </label>
            <button className="icon-button" type="button" aria-label={t("topbar.help")}>?</button>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
