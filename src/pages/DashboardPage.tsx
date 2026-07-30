type Props = {
  onStartJournal: () => void;
};

export function DashboardPage({ onStartJournal }: Props) {
  const { t } = useI18n();

  return (
    <section className="page dashboard-page" aria-labelledby="dashboard-title">
      <div className="page-heading dashboard-heading">
        <div>
          <p className="kicker">{t("dashboard.kicker")}</p>
          <h1 id="dashboard-title">{t("dashboard.title")}</h1>
          <p>{t("dashboard.subtitle")}</p>
        </div>
        <button className="primary-button" type="button" onClick={onStartJournal}>
          <span aria-hidden="true">＋</span> {t("dashboard.start_journal")}
        </button>
      </div>

      <div className="dashboard-grid">
        <article className="focus-panel">
          <p className="panel-label">{t("dashboard.quick_start_kicker")}</p>
          <h2>{t("dashboard.quick_title_line_1")}<br />{t("dashboard.quick_title_line_2")}</h2>
          <p>{t("dashboard.quick_description")}</p>
          <button className="text-button" type="button" onClick={onStartJournal}>{t("dashboard.open_entry")} <span aria-hidden="true">→</span></button>
          <div className="ledger-lines" aria-hidden="true">
            <span /><span /><span /><span />
          </div>
        </article>

        <div className="dashboard-side">
          <article className="summary-panel">
            <div className="panel-header">
              <p className="panel-label">{t("dashboard.current_period_kicker")}</p>
              <span className="badge">{t("dashboard.preparing")}</span>
            </div>
            <dl className="summary-list">
              <div><dt>{t("dashboard.unposted_entries")}</dt><dd>{t("common.not_available")}</dd></div>
              <div><dt>{t("dashboard.last_posted_date")}</dt><dd>{t("common.not_available")}</dd></div>
              <div><dt>{t("dashboard.balance_difference")}</dt><dd>{t("dashboard.zero_yen")}</dd></div>
            </dl>
          </article>
          <aside className="notice-panel">
            <span className="notice-number">01</span>
            <div><strong>{t("dashboard.phase_title")}</strong><p>{t("dashboard.phase_description")}</p></div>
          </aside>
        </div>
      </div>
    </section>
  );
}
import { useI18n } from "../i18n/context";
