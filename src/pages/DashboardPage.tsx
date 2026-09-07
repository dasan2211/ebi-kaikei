import { useEffect, useState } from "react";
import type { PageId } from "../components/AppShell";
import { useI18n } from "../i18n/context";
import { formatYen } from "../lib/money";
import { getDashboardSummary } from "../lib/tauri";
import type { DashboardSummary } from "../types/reports";

type DashboardDestination = Exclude<PageId, "dashboard">;

const dashboardDestinations: Array<{
  id: DashboardDestination;
  glyphKey: string;
  labelKey: string;
}> = [
  { id: "journal", glyphKey: "navigation.glyphs.journal", labelKey: "navigation.journal" },
  { id: "journal-book", glyphKey: "navigation.glyphs.journal_book", labelKey: "navigation.journal_book" },
  { id: "ledger", glyphKey: "navigation.glyphs.ledger", labelKey: "navigation.ledger" },
  { id: "trial-balance", glyphKey: "navigation.glyphs.trial_balance", labelKey: "navigation.trial_balance" },
  { id: "closing", glyphKey: "navigation.glyphs.closing", labelKey: "navigation.closing" },
  { id: "attachments", glyphKey: "navigation.glyphs.attachments", labelKey: "navigation.attachments" },
  { id: "accounts", glyphKey: "navigation.glyphs.accounts", labelKey: "navigation.accounts" },
  { id: "settings", glyphKey: "navigation.glyphs.settings", labelKey: "navigation.settings" }
];

type Props = {
  bookId: string;
  fiscalYear: number;
  onNavigate?: (page: DashboardDestination) => void;
  onStartJournal: () => void;
};

export function DashboardPage({ bookId, fiscalYear, onNavigate, onStartJournal }: Props) {
  const { t } = useI18n();
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestKey = `${bookId}:${fiscalYear}:${reloadVersion}`;
  const [summaryState, setSummaryState] = useState<{
    requestKey: string;
    data: DashboardSummary | null;
    error: string | null;
  }>({ requestKey: "", data: null, error: null });

  useEffect(() => {
    let active = true;
    getDashboardSummary(bookId, `${fiscalYear}-01-01`, `${fiscalYear}-12-31`)
      .then((result) => {
        if (active) setSummaryState({ requestKey, data: result, error: null });
      })
      .catch((reason: unknown) => {
        if (active) {
          setSummaryState({
            requestKey,
            data: null,
            error: reason instanceof Error ? reason.message : String(reason)
          });
        }
      });
    return () => {
      active = false;
    };
  }, [bookId, fiscalYear, requestKey]);

  const isLoading = summaryState.requestKey !== requestKey;
  const summary = isLoading ? null : summaryState.data;
  const error = isLoading ? null : summaryState.error;

  const statusLabel = isLoading
    ? t("common.loading")
    : error
      ? t("dashboard.summary_error")
      : t("dashboard.summary_ready");
  const statusClass = error ? "error" : isLoading ? "" : "ready";
  const navigate = (destination: DashboardDestination) => {
    if (destination === "journal") {
      onStartJournal();
      return;
    }
    onNavigate?.(destination);
  };

  return (
    <section className="page dashboard-page" aria-labelledby="dashboard-title">
      <div className="page-heading dashboard-heading">
        <div>
          <h1 id="dashboard-title">{t("dashboard.title")}</h1>
          <p>{t("dashboard.subtitle")}</p>
        </div>
      </div>

      <div className="dashboard-workbench">
        <article className="summary-panel dashboard-summary" aria-busy={isLoading}>
          <div className="panel-header">
            <h2>{t("dashboard.current_period_kicker")}</h2>
            <span className={`badge ${statusClass}`} aria-live="polite">{statusLabel}</span>
          </div>
          <dl className="summary-list">
            <div><dt>{t("dashboard.unposted_entries")}</dt><dd>{summary ? t("dashboard.entries_count", { count: formatYen(summary.draftCount) }) : t("common.not_available")}</dd></div>
            <div><dt>{t("dashboard.last_posted_date")}</dt><dd>{summary?.lastPostedDate ?? t("common.not_available")}</dd></div>
            <div><dt>{t("dashboard.balance_difference")}</dt><dd>{summary ? t("dashboard.balance_amount", { amount: formatYen(summary.differenceMinor) }) : t("common.not_available")}</dd></div>
          </dl>
          {error ? (
            <div className="summary-error" role="alert">
              <span>{t("dashboard.summary_load_error", { error })}</span>
              <button type="button" onClick={() => setReloadVersion((version) => version + 1)}>{t("common.reload")}</button>
            </div>
          ) : null}
        </article>

        <section className="dashboard-index" aria-labelledby="dashboard-index-title">
          <div className="dashboard-index-heading">
            <h2 id="dashboard-index-title">{t("navigation.aria_label")}</h2>
            <span>{dashboardDestinations.length.toString().padStart(2, "0")}</span>
          </div>
          <div className="dashboard-command-list">
            {dashboardDestinations.map((destination, index) => (
              <button
                className="dashboard-command"
                key={destination.id}
                type="button"
                onClick={() => navigate(destination.id)}
              >
                <span className="dashboard-command-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className="dashboard-command-glyph" aria-hidden="true">{t(destination.glyphKey)}</span>
                <strong>{t(destination.labelKey)}</strong>
                <span className="dashboard-command-arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
