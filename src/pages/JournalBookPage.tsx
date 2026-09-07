import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ReportFilters, type ReportFilterValue } from "../components/ReportFilters";
import { ReportExportButton } from "../components/ReportExportButton";
import { ReportPagination } from "../components/ReportPagination";
import { useI18n } from "../i18n/context";
import { formatYen } from "../lib/money";
import { exportJournalBookCsv, listAccounts, listJournalBook, reviseJournalEntry, reverseJournalEntry } from "../lib/tauri";
import type { Account } from "../types/account";
import type { JournalSide } from "../types/journal";
import type { JournalBookEntry, JournalBookLine, JournalBookPage as JournalBookPageData } from "../types/reports";

const PAGE_SIZE = 100;

type EditableLine = {
  accountId: string;
  side: JournalSide;
  amount: string;
  memo: string;
  taxCodeId: string | null;
};

type EditableEntry = {
  id: string;
  transactionDate: string;
  description: string;
  lines: EditableLine[];
};

function initialFilters(fiscalYear: number): ReportFilterValue {
  return { startDate: `${fiscalYear}-01-01`, endDate: `${fiscalYear}-12-31`, status: "", query: "" };
}

function SideLines({ lines }: { lines: JournalBookLine[] }) {
  return (
    <div className="book-side-lines">
      {lines.map((line) => (
        <div key={line.id}>
          <span><small>{line.accountCode}</small>{line.accountName}{line.memo ? <em>{line.memo}</em> : null}</span>
          <strong>{formatYen(line.amountMinor)}</strong>
        </div>
      ))}
    </div>
  );
}

function toEditableEntry(entry: JournalBookEntry): EditableEntry {
  return {
    id: entry.id,
    transactionDate: entry.transactionDate,
    description: entry.description,
    lines: [...entry.lines]
      .sort((left, right) => left.lineNumber - right.lineNumber)
      .map((line) => ({
        accountId: line.accountId,
        side: line.side,
        amount: String(line.amountMinor),
        memo: line.memo ?? "",
        taxCodeId: line.taxCodeId ?? null
      }))
  };
}

function parseAmount(value: string): number {
  const normalized = value.replaceAll(",", "").trim();
  return /^\d+$/.test(normalized) ? Number(normalized) : 0;
}

export function JournalBookPage({ bookId, fiscalYear }: { bookId: string; fiscalYear: number }) {
  const { locale, t } = useI18n();
  const [filters, setFilters] = useState(() => initialFilters(fiscalYear));
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<JournalBookPageData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [editing, setEditing] = useState<EditableEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JournalBookEntry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    let active = true;
    listAccounts(bookId)
      .then((result) => { if (active) setAccounts(result); })
      .catch(() => { if (active) setAccounts([]); });
    return () => { active = false; };
  }, [bookId]);

  useEffect(() => {
    let active = true;
    listJournalBook(bookId, {
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      status: filters.status || undefined,
      query: filters.query.trim() || undefined,
      limit: PAGE_SIZE,
      offset
    })
      .then((result) => {
        if (active) {
          setData(result);
          setError(null);
        }
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookId, filters, offset, reloadVersion]);

  const correctionTotals = useMemo(() => {
    if (!editing) return { debit: 0, credit: 0 };
    return editing.lines.reduce((totals, line) => {
      totals[line.side] += parseAmount(line.amount);
      return totals;
    }, { debit: 0, credit: 0 });
  }, [editing]);

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

  function updateEditingLine(index: number, patch: Partial<EditableLine>) {
    setEditing((current) => current ? {
      ...current,
      lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line)
    } : null);
  }

  function addEditingLine() {
    setEditing((current) => current ? {
      ...current,
      lines: [...current.lines, { accountId: accounts[0]?.id ?? "", side: "debit", amount: "", memo: "", taxCodeId: null }]
    } : null);
  }

  function removeEditingLine(index: number) {
    setEditing((current) => current && current.lines.length > 2 ? {
      ...current,
      lines: current.lines.filter((_, lineIndex) => lineIndex !== index)
    } : current);
  }

  async function saveCorrection() {
    if (!editing) return;
    const amounts = editing.lines.map((line) => parseAmount(line.amount));
    if (!editing.transactionDate || !editing.description.trim() || editing.lines.length < 2 || editing.lines.some((line, index) => !line.accountId || amounts[index] <= 0)) {
      setActionError(t("journal_book.edit.validation"));
      return;
    }
    if (correctionTotals.debit !== correctionTotals.credit) {
      setActionError(t("journal_book.edit.unbalanced", { amount: Math.abs(correctionTotals.debit - correctionTotals.credit) }));
      return;
    }

    setActionPending(true);
    setActionError(null);
    try {
      await reviseJournalEntry(bookId, editing.id, locale, {
        transactionDate: editing.transactionDate,
        description: editing.description.trim(),
        lines: editing.lines.map((line, index) => ({
          accountId: line.accountId,
          side: line.side,
          amountMinor: amounts[index],
          memo: line.memo.trim() || null,
          taxCodeId: line.taxCodeId
        }))
      });
      setEditing(null);
      setActionMessage(t("journal_book.edit.success"));
      setLoading(true);
      setReloadVersion((version) => version + 1);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setActionPending(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setActionPending(true);
    setActionError(null);
    try {
      await reverseJournalEntry(bookId, deleteTarget.id, locale);
      setDeleteTarget(null);
      setActionMessage(t("journal_book.delete.success"));
      setLoading(true);
      setReloadVersion((version) => version + 1);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setActionPending(false);
    }
  }

  return (
    <section className="page" aria-labelledby="journal-book-title">
      <div className="page-heading">
        <div><p className="kicker">{t("journal_book.kicker")}</p><h1 id="journal-book-title">{t("journal_book.title")}</h1><p>{t("journal_book.subtitle")}</p></div>
        <div className="report-heading-actions">
          <span className="report-count">{t("journal_book.count", { count: data?.total ?? 0 })}</span>
          <ReportExportButton onExport={() => exportJournalBookCsv(bookId, {
            startDate: filters.startDate || undefined,
            endDate: filters.endDate || undefined,
            status: filters.status || undefined,
            query: filters.query.trim() || undefined
          })} />
        </div>
      </div>

      {actionMessage ? <p className="action-banner success" role="status">{actionMessage}</p> : null}
      {actionError && !editing && !deleteTarget ? <p className="error-banner" role="alert">{actionError}</p> : null}

      <div className="table-card report-card">
        <div className="table-toolbar"><ReportFilters value={filters} onChange={handleFilterChange} /></div>
        {error ? <p className="error-banner" role="alert">{t("journal_book.load_error", { error })}</p> : null}
        {loading ? <p className="report-message" role="status">{t("reports.loading")}</p> : null}
        {!loading && !error && data?.items.length === 0 ? <p className="report-message">{t("journal_book.empty")}</p> : null}
        {!loading && !error && data && data.items.length > 0 ? (
          <div className="table-scroll">
            <table className="journal-book-table">
              <thead><tr><th>{t("journal_book.columns.date")}</th><th>{t("journal_book.columns.description")}</th><th>{t("common.debit")}</th><th>{t("common.credit")}</th><th>{t("journal_book.columns.status")}</th><th>{t("journal_book.columns.actions")}</th></tr></thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr key={entry.id}>
                    <td className="report-date">{entry.transactionDate}</td>
                    <td><strong>{entry.description}</strong><small className="entry-reference">{entry.id.slice(0, 8)}</small></td>
                    <td><SideLines lines={entry.lines.filter((line) => line.side === "debit")} /></td>
                    <td><SideLines lines={entry.lines.filter((line) => line.side === "credit")} /></td>
                    <td><span className={`state report-status ${entry.status}`}>{t(`reports.status.${entry.status}`)}</span></td>
                    <td>
                      {entry.status === "posted" ? (
                        <div className="journal-row-actions">
                          <button type="button" onClick={() => { setActionError(null); setActionMessage(null); setEditing(toEditableEntry(entry)); }}>{t("journal_book.actions.edit")}</button>
                          <button type="button" className="danger" onClick={() => { setActionError(null); setActionMessage(null); setDeleteTarget(entry); }}>{t("journal_book.actions.delete")}</button>
                        </div>
                      ) : <span className="no-row-actions" aria-label={t("journal_book.actions.unavailable")}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {data ? <ReportPagination limit={data.limit} offset={data.offset} total={data.total} onPageChange={handlePageChange} /> : null}
      </div>

      {editing ? createPortal((
        <div className="modal-backdrop" role="presentation">
          <div className="correction-dialog" role="dialog" aria-modal="true" aria-labelledby="correction-dialog-title" onKeyDown={(event) => { if (event.key === "Escape" && !actionPending) setEditing(null); }}>
            <div className="correction-dialog-heading">
              <div><p className="kicker">{t("journal_book.edit.kicker")}</p><h2 id="correction-dialog-title">{t("journal_book.edit.title")}</h2></div>
              <button type="button" className="dialog-close" aria-label={t("common.close")} disabled={actionPending} onClick={() => setEditing(null)}>×</button>
            </div>
            <p className="correction-notice">{t("journal_book.edit.notice")}</p>
            <div className="correction-header-fields">
              <label><span>{t("journal_book.edit.date")}</span><input type="date" value={editing.transactionDate} onChange={(event) => setEditing({ ...editing, transactionDate: event.target.value })} /></label>
              <label><span>{t("journal_book.edit.description")}</span><input value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></label>
            </div>
            <div className="correction-lines" aria-label={t("journal_book.edit.lines")}>
              {editing.lines.map((line, index) => (
                <div className="correction-line" key={index}>
                  <span className="correction-line-number">{index + 1}</span>
                  <select aria-label={t("journal_book.edit.account", { line: index + 1 })} value={line.accountId} onChange={(event) => updateEditingLine(index, { accountId: event.target.value })}>
                    <option value="">{t("journal_book.edit.select_account")}</option>
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
                  </select>
                  <select aria-label={t("journal_book.edit.side", { line: index + 1 })} value={line.side} onChange={(event) => updateEditingLine(index, { side: event.target.value as JournalSide })}>
                    <option value="debit">{t("common.debit")}</option><option value="credit">{t("common.credit")}</option>
                  </select>
                  <input aria-label={t("journal_book.edit.amount", { line: index + 1 })} inputMode="numeric" value={line.amount} onChange={(event) => updateEditingLine(index, { amount: event.target.value })} />
                  <input aria-label={t("journal_book.edit.memo", { line: index + 1 })} value={line.memo} onChange={(event) => updateEditingLine(index, { memo: event.target.value })} />
                  <button type="button" className="remove-correction-line" aria-label={t("journal_book.edit.remove_line", { line: index + 1 })} disabled={editing.lines.length <= 2} onClick={() => removeEditingLine(index)}>×</button>
                </div>
              ))}
            </div>
            <div className="correction-balance">
              <span>{t("common.debit")} <strong>{formatYen(correctionTotals.debit)}</strong></span>
              <span>{t("common.credit")} <strong>{formatYen(correctionTotals.credit)}</strong></span>
              <span className={correctionTotals.debit === correctionTotals.credit ? "balanced" : "unbalanced"}>{t("journal_book.edit.difference", { amount: Math.abs(correctionTotals.debit - correctionTotals.credit) })}</span>
            </div>
            <button type="button" className="add-correction-line" onClick={addEditingLine}>＋ {t("journal_book.edit.add_line")}</button>
            {actionError ? <p className="dialog-error" role="alert">{actionError}</p> : null}
            <div className="correction-dialog-actions">
              <button type="button" className="secondary-button" disabled={actionPending} onClick={() => setEditing(null)}>{t("common.cancel")}</button>
              <button type="button" className="primary-button" disabled={actionPending || correctionTotals.debit !== correctionTotals.credit} onClick={saveCorrection}>{actionPending ? t("journal_book.edit.saving") : t("journal_book.edit.save")}</button>
            </div>
          </div>
        </div>
      ), document.body) : null}

      {deleteTarget ? createPortal((
        <div className="modal-backdrop" role="presentation">
          <div className="delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description">
            {deleteTarget.sourceType === "correction_reversal" ? <>
              <span className="delete-dialog-mark" aria-hidden="true">!</span>
              <h2 id="delete-dialog-title">{t("journal_book.reversal_warning.title")}</h2>
              <p id="delete-dialog-description">{t("journal_book.reversal_warning.description", { description: deleteTarget.description })}</p>
              <p className="correction-notice">{t("journal_book.reversal_warning.notice")}</p>
              <div className="correction-dialog-actions">
                <button type="button" className="primary-button" onClick={() => setDeleteTarget(null)}>{t("common.close")}</button>
              </div>
            </> : <>
              <span className="delete-dialog-mark" aria-hidden="true">↺</span>
              <h2 id="delete-dialog-title">{t("journal_book.delete.title")}</h2>
              <p id="delete-dialog-description">{t("journal_book.delete.description", { description: deleteTarget.description })}</p>
              <p className="correction-notice">{t("journal_book.delete.notice")}</p>
              {actionError ? <p className="dialog-error" role="alert">{actionError}</p> : null}
              <div className="correction-dialog-actions">
                <button type="button" className="secondary-button" disabled={actionPending} onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</button>
                <button type="button" className="danger-button" disabled={actionPending} onClick={confirmDelete}>{actionPending ? t("journal_book.delete.deleting") : t("journal_book.delete.confirm")}</button>
              </div>
            </>}
          </div>
        </div>
      ), document.body) : null}
    </section>
  );
}
