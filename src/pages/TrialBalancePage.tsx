import { useEffect, useState } from "react";
import { ReportFilters, type ReportFilterValue } from "../components/ReportFilters";
import { ReportExportButton } from "../components/ReportExportButton";
import { ReportPagination } from "../components/ReportPagination";
import { useI18n } from "../i18n/context";
import { formatYen } from "../lib/money";
import { exportTrialBalanceCsv, getTrialBalance } from "../lib/tauri";
import type { TrialBalance as TrialBalanceData } from "../types/reports";

const PAGE_SIZE = 100;

function initialFilters(fiscalYear: number): ReportFilterValue {
  return { startDate: `${fiscalYear}-01-01`, endDate: `${fiscalYear}-12-31`, status: "", query: "" };
}

function amount(value: number, emptyLabel: string): string {
  return value === 0 ? emptyLabel : formatYen(value);
}

export function TrialBalancePage({ bookId, fiscalYear }: { bookId: string; fiscalYear: number }) {
  const { t } = useI18n();
  const [filters, setFilters] = useState(() => initialFilters(fiscalYear));
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<TrialBalanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getTrialBalance(bookId, {
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      status: filters.status || undefined,
      query: filters.query.trim() || undefined,
      limit: PAGE_SIZE,
      offset
    })
      .then((result) => { if (active) setData(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookId, filters, offset]);

  function handleFilterChange(value: ReportFilterValue) {
    setLoading(true);
    setError(null);
    setFilters(value);
    setOffset(0);
  }

  function handlePageChange(nextOffset: number) {
    setLoading(true);
    setError(null);
    setOffset(nextOffset);
  }

  const emptyLabel = t("common.not_available");
  const isBalanced = data?.differenceMinor === 0;

  return (
    <section className="page" aria-labelledby="trial-balance-title">
      <div className="page-heading compact-heading">
        <div><p className="kicker">{t("trial_balance.kicker")}</p><h1 id="trial-balance-title">{t("trial_balance.title")}</h1><p>{t("trial_balance.subtitle")}</p></div>
        <div className="report-heading-actions">
          <div className={isBalanced ? "balance-chip balanced" : "balance-chip"} aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            {!data ? t("trial_balance.calculating") : isBalanced ? t("trial_balance.balanced") : t("trial_balance.difference", { amount: formatYen(data.differenceMinor) })}
          </div>
          <ReportExportButton onExport={() => exportTrialBalanceCsv(bookId, {
            startDate: filters.startDate || undefined,
            endDate: filters.endDate || undefined,
            status: filters.status || undefined,
            query: filters.query.trim() || undefined
          })} />
        </div>
      </div>

      <div className="table-card report-card trial-balance-card">
        <div className="table-toolbar"><ReportFilters value={filters} onChange={handleFilterChange} /><span className="row-count">{t("trial_balance.count", { count: data?.total ?? 0 })}</span></div>
        {error ? <p className="error-banner" role="alert">{t("trial_balance.load_error", { error })}</p> : null}
        {loading ? <p className="report-message" role="status">{t("reports.loading")}</p> : null}
        {!loading && !error && data?.items.length === 0 ? <p className="report-message">{t("trial_balance.empty")}</p> : null}
        {!loading && !error && data && data.items.length > 0 ? (
          <div className="table-scroll">
            <table className="trial-balance-table">
              <thead>
                <tr>
                  <th rowSpan={2}>{t("trial_balance.columns.code")}</th>
                  <th rowSpan={2}>{t("trial_balance.columns.account")}</th>
                  <th rowSpan={2}>{t("trial_balance.columns.type")}</th>
                  <th colSpan={2}>{t("trial_balance.columns.opening")}</th>
                  <th colSpan={2}>{t("trial_balance.columns.period")}</th>
                  <th colSpan={2}>{t("trial_balance.columns.closing")}</th>
                </tr>
                <tr>
                  <th className="money-column">{t("common.debit")}</th><th className="money-column">{t("common.credit")}</th>
                  <th className="money-column">{t("common.debit")}</th><th className="money-column">{t("common.credit")}</th>
                  <th className="money-column">{t("common.debit")}</th><th className="money-column">{t("common.credit")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.accountId}>
                    <td className="account-code">{row.accountCode}</td>
                    <td className="account-name">{row.accountName}</td>
                    <td>{t(`account_types.${row.accountType}`)}</td>
                    <td className="money-cell">{amount(row.openingDebitMinor, emptyLabel)}</td>
                    <td className="money-cell">{amount(row.openingCreditMinor, emptyLabel)}</td>
                    <td className="money-cell period-cell">{amount(row.periodDebitMinor, emptyLabel)}</td>
                    <td className="money-cell period-cell">{amount(row.periodCreditMinor, emptyLabel)}</td>
                    <td className="money-cell balance-cell">{amount(row.closingDebitMinor, emptyLabel)}</td>
                    <td className="money-cell balance-cell">{amount(row.closingCreditMinor, emptyLabel)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={3}>{t("trial_balance.total")}</th>
                  <td className="money-cell">{formatYen(data.totals.openingDebitMinor)}</td>
                  <td className="money-cell">{formatYen(data.totals.openingCreditMinor)}</td>
                  <td className="money-cell period-cell">{formatYen(data.totals.periodDebitMinor)}</td>
                  <td className="money-cell period-cell">{formatYen(data.totals.periodCreditMinor)}</td>
                  <td className="money-cell balance-cell">{formatYen(data.totals.closingDebitMinor)}</td>
                  <td className="money-cell balance-cell">{formatYen(data.totals.closingCreditMinor)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}
        {data ? <ReportPagination limit={data.limit} offset={data.offset} total={data.total} onPageChange={handlePageChange} /> : null}
      </div>
    </section>
  );
}
