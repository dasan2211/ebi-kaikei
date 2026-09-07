import { useEffect, useState } from "react";
import { ReportFilters, type ReportFilterValue } from "../components/ReportFilters";
import { ReportExportButton } from "../components/ReportExportButton";
import { ReportPagination } from "../components/ReportPagination";
import { useI18n } from "../i18n/context";
import { formatYen } from "../lib/money";
import { exportGeneralLedgerCsv, listAccounts, listGeneralLedger } from "../lib/tauri";
import type { Account } from "../types/account";
import type { GeneralLedgerPage as GeneralLedgerPageData } from "../types/reports";

const PAGE_SIZE = 100;
function initialFilters(fiscalYear: number): ReportFilterValue {
  return { startDate: `${fiscalYear}-01-01`, endDate: `${fiscalYear}-12-31`, status: "", query: "" };
}

export function GeneralLedgerPage({ bookId, fiscalYear }: { bookId: string; fiscalYear: number }) {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [filters, setFilters] = useState(() => initialFilters(fiscalYear));
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<GeneralLedgerPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    listAccounts(bookId)
      .then((items) => {
        if (!active) return;
        setAccounts(items);
        setAccountId((current) => items.some((account) => account.id === current) ? current : (items[0]?.id ?? ""));
        if (items.length === 0) setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setLoading(false);
      });
    return () => { active = false; };
  }, [bookId]);

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    listGeneralLedger(bookId, {
      accountId,
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
  }, [accountId, bookId, filters, offset]);

  function handleFilterChange(value: ReportFilterValue) {
    setLoading(true);
    setError(null);
    setFilters(value);
    setOffset(0);
  }

  function handleAccountChange(nextAccountId: string) {
    setLoading(true);
    setError(null);
    setAccountId(nextAccountId);
    setOffset(0);
  }

  function handlePageChange(nextOffset: number) {
    setLoading(true);
    setError(null);
    setOffset(nextOffset);
  }

  return (
    <section className="page" aria-labelledby="general-ledger-title">
      <div className="page-heading">
        <div><p className="kicker">{t("general_ledger.kicker")}</p><h1 id="general-ledger-title">{t("general_ledger.title")}</h1><p>{t("general_ledger.subtitle")}</p></div>
        <ReportExportButton disabled={!accountId} onExport={() => exportGeneralLedgerCsv(bookId, {
          accountId,
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
          status: filters.status || undefined,
          query: filters.query.trim() || undefined
        })} />
      </div>

      <div className="ledger-summary">
        <label className="account-picker"><span>{t("general_ledger.account")}</span><select value={accountId} onChange={(event) => handleAccountChange(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}</select></label>
        <div><span>{t("general_ledger.opening_balance")}</span><strong>{formatYen(data?.openingBalanceMinor ?? 0)}<small>{t("common.currency_unit")}</small></strong></div>
        <div><span>{t("general_ledger.total_debit")}</span><strong>{formatYen(data?.totalDebitMinor ?? 0)}<small>{t("common.currency_unit")}</small></strong></div>
        <div><span>{t("general_ledger.total_credit")}</span><strong>{formatYen(data?.totalCreditMinor ?? 0)}<small>{t("common.currency_unit")}</small></strong></div>
        <div className="closing-balance"><span>{t("general_ledger.closing_balance")}</span><strong>{formatYen(data?.closingBalanceMinor ?? 0)}<small>{t("common.currency_unit")}</small></strong></div>
      </div>

      <div className="table-card report-card">
        <div className="table-toolbar"><ReportFilters value={filters} onChange={handleFilterChange} /><span className="row-count">{t("general_ledger.count", { count: data?.total ?? 0 })}</span></div>
        {error ? <p className="error-banner" role="alert">{t("general_ledger.load_error", { error })}</p> : null}
        {loading ? <p className="report-message" role="status">{t("reports.loading")}</p> : null}
        {!loading && !error && data?.items.length === 0 ? <p className="report-message">{t("general_ledger.empty")}</p> : null}
        {!loading && !error && data && data.items.length > 0 ? (
          <div className="table-scroll">
            <table className="general-ledger-table">
              <thead><tr><th>{t("general_ledger.columns.date")}</th><th>{t("general_ledger.columns.description")}</th><th className="money-column">{t("common.debit")}</th><th className="money-column">{t("common.credit")}</th><th className="money-column">{t("general_ledger.columns.balance")}</th><th>{t("general_ledger.columns.status")}</th></tr></thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.lineId}>
                    <td className="report-date">{row.transactionDate}</td>
                    <td><strong>{row.description}</strong>{row.memo ? <small className="ledger-memo">{row.memo}</small> : null}</td>
                    <td className="money-cell">{row.debitAmountMinor ? formatYen(row.debitAmountMinor) : t("common.not_available")}</td>
                    <td className="money-cell">{row.creditAmountMinor ? formatYen(row.creditAmountMinor) : t("common.not_available")}</td>
                    <td className="money-cell balance-cell">{formatYen(row.balanceMinor)}</td>
                    <td><span className={`state report-status ${row.status}`}>{t(`reports.status.${row.status}`)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {data ? <ReportPagination limit={data.limit} offset={data.offset} total={data.total} onPageChange={handlePageChange} /> : null}
      </div>
    </section>
  );
}
