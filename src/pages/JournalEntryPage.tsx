import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/context";
import type { TranslationParams } from "../i18n/i18n";
import { isLocalDate, todayLocalDate } from "../lib/local-date";
import { formatYen, parseYenInput } from "../lib/money";
import { listAccounts, saveDraftEntry } from "../lib/tauri";
import type { Account } from "../types/account";
import type { JournalSide } from "../types/journal";

type EditableLine = { id: number; side: JournalSide; accountId: string; amount: string; memo: string };
type JournalMessage = { key: string; params?: TranslationParams } | { raw: string };

const initialLines: EditableLine[] = [
  { id: 1, side: "debit", accountId: "", amount: "", memo: "" },
  { id: 2, side: "credit", accountId: "", amount: "", memo: "" }
];

function amountOrZero(value: string): number {
  try { return parseYenInput(value); } catch { return 0; }
}

export function JournalEntryPage({ bookId }: { bookId: string }) {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactionDate, setTransactionDate] = useState(todayLocalDate());
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<EditableLine[]>(initialLines);
  const [message, setMessage] = useState<JournalMessage | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { listAccounts(bookId).then(setAccounts).catch(() => setAccounts([])); }, [bookId]);

  const totals = useMemo(() => lines.reduce(
    (result, line) => ({ ...result, [line.side]: result[line.side] + amountOrZero(line.amount) }),
    { debit: 0, credit: 0 }
  ), [lines]);
  const difference = Math.abs(totals.debit - totals.credit);

  function updateLine(id: number, patch: Partial<EditableLine>) {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  }

  function addLine(side: JournalSide) {
    setLines((current) => [...current, { id: Math.max(...current.map((line) => line.id)) + 1, side, accountId: "", amount: "", memo: "" }]);
  }

  async function handleSave() {
    setMessage(null);
    if (!isLocalDate(transactionDate)) { setMessage({ key: "journal.validation_date" }); return; }
    if (difference !== 0 || totals.debit === 0) { setMessage({ key: "journal.validation_balance" }); return; }
    if (lines.some((line) => !line.accountId)) { setMessage({ key: "journal.validation_account" }); return; }

    setSaving(true);
    try {
      const entryId = await saveDraftEntry(bookId, {
        transactionDate,
        description,
        lines: lines.map((line) => ({ accountId: line.accountId, side: line.side, amountMinor: parseYenInput(line.amount), memo: line.memo || null }))
      });
      setMessage({ key: "journal.saved", params: { id: entryId.slice(0, 8) } });
    } catch (reason) {
      setMessage({ raw: reason instanceof Error ? reason.message : String(reason) });
    } finally { setSaving(false); }
  }

  return (
    <section className="page" aria-labelledby="journal-title">
      <div className="page-heading compact-heading">
        <div><p className="kicker">{t("journal.kicker")}</p><h1 id="journal-title">{t("journal.title")}</h1><p>{t("journal.subtitle")}</p></div>
        <div className={difference === 0 && totals.debit > 0 ? "balance-chip balanced" : "balance-chip"} aria-live="polite">
          <span className="status-dot" aria-hidden="true" />
          {difference === 0 && totals.debit > 0 ? t("journal.balanced") : t("journal.difference", { amount: formatYen(difference) })}
        </div>
      </div>

      <div className="entry-card">
        <div className="entry-header-fields">
          <label><span>{t("journal.transaction_date")}</span><input type="text" inputMode="numeric" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} placeholder={t("journal.date_placeholder")} /></label>
          <label className="description-field"><span>{t("journal.description")}</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("journal.description_placeholder")} /></label>
        </div>

        <div className="entry-columns" aria-label={t("journal.lines_aria_label")}>
          {(["debit", "credit"] as const).map((side) => (
            <section className={`entry-side ${side}`} key={side} aria-labelledby={`${side}-title`}>
              <div className="side-title"><span>{t(side === "debit" ? "common.debit_glyph" : "common.credit_glyph")}</span><div><p>{t(side === "debit" ? "journal.debit_kicker" : "journal.credit_kicker")}</p><h2 id={`${side}-title`}>{t(side === "debit" ? "common.debit" : "common.credit")}</h2></div></div>
              <div className="line-list">
                {lines.filter((line) => line.side === side).map((line, index) => (
                  <div className="journal-line" key={line.id}>
                    <span className="line-number">{String(index + 1).padStart(2, "0")}</span>
                    <label><span className="sr-only">{t("journal.account")}</span><select aria-label={t("journal.account")} value={line.accountId} onChange={(event) => updateLine(line.id, { accountId: event.target.value })}><option value="">{t("journal.select_account")}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}</select></label>
                    <label className="amount-field"><span className="sr-only">{t("journal.amount")}</span><input aria-label={t("journal.amount")} type="text" inputMode="numeric" value={line.amount} onChange={(event) => updateLine(line.id, { amount: event.target.value })} placeholder="0" /><span>{t("common.currency_unit")}</span></label>
                    <label className="memo-field"><span className="sr-only">{t("journal.memo")}</span><input aria-label={t("journal.memo")} value={line.memo} onChange={(event) => updateLine(line.id, { memo: event.target.value })} placeholder={t("journal.memo_placeholder")} /></label>
                  </div>
                ))}
              </div>
              <button className="add-line-button" type="button" onClick={() => addLine(side)}>{t("journal.add_line", { side: t(side === "debit" ? "common.debit" : "common.credit") })}</button>
              <div className="side-total"><span>{t("journal.total", { side: t(side === "debit" ? "common.debit" : "common.credit") })}</span><strong>{formatYen(totals[side])}<small>{t("common.currency_unit")}</small></strong></div>
            </section>
          ))}
        </div>

        <footer className="entry-footer">
          <p className="entry-message" role="status">{message ? ("raw" in message ? message.raw : t(message.key, message.params)) : t("journal.draft_hint")}</p>
          <div><button className="secondary-button" type="button">{t("journal.clear")}</button><button className="primary-button" type="button" disabled={saving} onClick={handleSave}>{t(saving ? "journal.saving" : "journal.save_draft")}<span className="shortcut">{t("journal.save_shortcut")}</span></button></div>
        </footer>
      </div>
    </section>
  );
}
