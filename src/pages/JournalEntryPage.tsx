import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/context";
import type { TranslationParams } from "../i18n/i18n";
import { isLocalDate, todayLocalDate } from "../lib/local-date";
import { expandJournalTemplate } from "../lib/journal-template";
import { formatYen, parseYenInput } from "../lib/money";
import { deleteJournalTemplate, listAccounts, listJournalTemplates, listTaxCodes, postJournalEntry, saveDraftEntry, saveJournalTemplate, saveSimpleExpenseDraft, saveSimpleSaleDraft, saveSimpleSettlementDraft } from "../lib/tauri";
import type { Account } from "../types/account";
import type { ConsumptionTaxStatus } from "../types/book";
import type { JournalSide, JournalTemplate, SimpleSettlementType } from "../types/journal";
import type { TaxCode } from "../types/phase4";

type EditableLine = { id: number; side: JournalSide; accountId: string; amount: string; memo: string; taxCodeId: string };
type JournalMessage =
  | { kind: "success" | "error"; key: string; params?: TranslationParams }
  | { kind: "error"; raw: string };
type EntryMode = "simple" | "template" | "compound";
type SimpleTransactionKind = "expense" | "sale" | "settlement";
type ExpenseAction = "expense" | "card_payment";
type SettlementAction = SimpleSettlementType | "card_payment";
type SaveOperation = "idle" | "saving-draft" | "saving-for-post" | "posting";
type SavedSubmission = { entryId: string; fingerprint: string; status: "draft" | "posted" };

const initialLines: EditableLine[] = [
  { id: 1, side: "debit", accountId: "", amount: "", memo: "", taxCodeId: "" },
  { id: 2, side: "credit", accountId: "", amount: "", memo: "", taxCodeId: "" }
];

function amountOrZero(value: string): number {
  try { return parseYenInput(value); } catch { return 0; }
}

export function JournalEntryPage({ bookId, consumptionTaxStatus = "taxable" }: { bookId: string; consumptionTaxStatus?: ConsumptionTaxStatus }) {
  const { locale, t } = useI18n();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [transactionDate, setTransactionDate] = useState(todayLocalDate());
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<EntryMode>("simple");
  const [simpleKind, setSimpleKind] = useState<SimpleTransactionKind>("expense");
  const [expenseAction, setExpenseAction] = useState<ExpenseAction>("expense");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [revenueAccountId, setRevenueAccountId] = useState("");
  const [receiptAccountId, setReceiptAccountId] = useState("");
  const [settlementType, setSettlementType] = useState<SettlementAction>("receivable_collection");
  const [settlementCashAccountId, setSettlementCashAccountId] = useState("");
  const [settlementAccountId, setSettlementAccountId] = useState("");
  const [simpleAmount, setSimpleAmount] = useState("");
  const [simpleMemo, setSimpleMemo] = useState("");
  const [simpleTaxCodeId, setSimpleTaxCodeId] = useState("");
  const [lines, setLines] = useState<EditableLine[]>(initialLines);
  const [templates, setTemplates] = useState<JournalTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateMessage, setTemplateMessage] = useState<JournalMessage | null>(null);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [message, setMessage] = useState<JournalMessage | null>(null);
  const [saveOperation, setSaveOperation] = useState<SaveOperation>("idle");
  const [savedSubmission, setSavedSubmission] = useState<SavedSubmission | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const saveLockRef = useRef(false);

  useEffect(() => {
    listAccounts(bookId)
      .then((nextAccounts) => {
        setAccounts(nextAccounts);
        setPaymentAccountId((current) => current || nextAccounts.find((account) => account.id === "account-bank")?.id || nextAccounts.find((account) => account.id === "account-cash")?.id || "");
        setRevenueAccountId((current) => current || nextAccounts.find((account) => account.id === "account-sales")?.id || "");
        setSettlementCashAccountId((current) => current || nextAccounts.find((account) => account.id === "account-bank")?.id || nextAccounts.find((account) => account.id === "account-cash")?.id || "");
        setSettlementAccountId((current) => current || nextAccounts.find((account) => account.id === "account-receivable")?.id || "");
      })
      .catch(() => setAccounts([]));
  }, [bookId]);
  useEffect(() => {
    let active = true;
    listJournalTemplates(bookId)
      .then((nextTemplates) => { if (active) setTemplates(nextTemplates); })
      .catch(() => { if (active) setTemplates([]); });
    return () => { active = false; };
  }, [bookId]);
  useEffect(() => {
    if (consumptionTaxStatus === "exempt" || !isLocalDate(transactionDate)) {
      return;
    }
    let active = true;
    listTaxCodes(transactionDate, locale)
      .then((codes) => { if (active) setTaxCodes(codes); })
      .catch(() => { if (active) setTaxCodes([]); });
    return () => { active = false; };
  }, [consumptionTaxStatus, locale, transactionDate]);
  const showTaxCodeInputs = consumptionTaxStatus === "taxable";
  const effectiveTaxCodes = showTaxCodeInputs && isLocalDate(transactionDate) ? taxCodes : [];
  const purchaseTaxCodes = effectiveTaxCodes.filter((code) => code.direction === "purchase" || code.direction === "both");
  const salesTaxCodes = effectiveTaxCodes.filter((code) => code.direction === "sales" || code.direction === "both");
  const expenseAccounts = accounts.filter((account) => account.accountType === "expense");
  const paymentAccounts = accounts.filter((account) => ["account-cash", "account-bank", "account-other-payable"].includes(account.id));
  const revenueAccounts = accounts.filter((account) => account.accountType === "revenue");
  const receiptAccounts = accounts.filter((account) => ["account-cash", "account-bank", "account-receivable"].includes(account.id));
  const cashAccounts = accounts.filter((account) => ["account-cash", "account-bank"].includes(account.id));
  const assetSettlementAccounts = accounts.filter((account) => account.accountType === "asset" && !["account-cash", "account-bank"].includes(account.id));
  const liabilitySettlementAccounts = accounts.filter((account) => account.accountType === "liability");

  const totals = useMemo(() => lines.reduce(
    (result, line) => ({ ...result, [line.side]: result[line.side] + amountOrZero(line.amount) }),
    { debit: 0, credit: 0 }
  ), [lines]);
  const difference = Math.abs(totals.debit - totals.credit);
  const formFingerprint = JSON.stringify({
    bookId,
    transactionDate,
    description,
    mode,
    simpleKind,
    expenseAction,
    expenseAccountId,
    paymentAccountId,
    revenueAccountId,
    receiptAccountId,
    settlementType,
    settlementCashAccountId,
    settlementAccountId,
    simpleAmount,
    simpleMemo,
    simpleTaxCodeId,
    lines
  });
  const currentSubmission = savedSubmission?.fingerprint === formFingerprint ? savedSubmission : null;
  const saving = saveOperation !== "idle";
  const visibleMessage = message?.kind === "success" && savedSubmission && !currentSubmission ? null : message;

  function updateLine(id: number, patch: Partial<EditableLine>) {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  }

  function addLine(side: JournalSide) {
    setLines((current) => {
      const id = Math.max(...current.map((line) => line.id)) + 1;
      window.setTimeout(() => document.getElementById(`journal-account-${id}`)?.focus(), 0);
      return [...current, { id, side, accountId: "", amount: "", memo: "", taxCodeId: "" }];
    });
  }

  function removeLine(id: number) {
    setLines((current) => current.filter((line) => line.id !== id));
  }

  function applyTemplate(template: JournalTemplate) {
    const appliedAt = new Date();
    setDescription(expandJournalTemplate(template.descriptionTemplate, transactionDate, appliedAt));
    setLines(template.lines.map((line, index) => ({
      id: index + 1,
      side: line.side,
      accountId: line.accountId,
      amount: String(line.amountMinor),
      memo: expandJournalTemplate(line.memoTemplate ?? "", transactionDate, appliedAt),
      taxCodeId: line.taxCodeId ?? ""
    })));
    setMessage(null);
    setSavedSubmission(null);
    setTemplateMessage({ kind: "success", key: "journal.template.applied", params: { name: template.name } });
  }

  async function handleSaveTemplate() {
    setTemplateMessage(null);
    if (!templateName.trim()) { setTemplateMessage({ kind: "error", key: "journal.template.validation_name" }); return; }
    if (!description.trim()) { setTemplateMessage({ kind: "error", key: "journal.validation_description" }); return; }
    if (difference !== 0 || totals.debit === 0) { setTemplateMessage({ kind: "error", key: "journal.validation_balance" }); return; }
    if (lines.some((line) => !line.accountId)) { setTemplateMessage({ kind: "error", key: "journal.validation_account" }); return; }

    setTemplateBusy(true);
    try {
      const id = await saveJournalTemplate(bookId, {
        name: templateName.trim(),
        descriptionTemplate: description,
        lines: lines.map((line) => ({
          accountId: line.accountId,
          side: line.side,
          amountMinor: parseYenInput(line.amount),
          memoTemplate: line.memo || null,
          taxCodeId: line.taxCodeId || null
        }))
      });
      const nextTemplates = await listJournalTemplates(bookId);
      setTemplates(nextTemplates);
      setTemplateName("");
      setTemplateMessage({ kind: "success", key: "journal.template.saved", params: { id: id.slice(0, 8) } });
    } catch (reason) {
      setTemplateMessage({ kind: "error", raw: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      setTemplateBusy(false);
    }
  }

  async function handleDeleteTemplate(template: JournalTemplate) {
    if (!window.confirm(t("journal.template.delete_confirm", { name: template.name }))) return;
    setTemplateBusy(true);
    setTemplateMessage(null);
    try {
      await deleteJournalTemplate(bookId, template.id);
      setTemplates((current) => current.filter((candidate) => candidate.id !== template.id));
      setTemplateMessage({ kind: "success", key: "journal.template.deleted" });
    } catch (reason) {
      setTemplateMessage({ kind: "error", raw: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      setTemplateBusy(false);
    }
  }

  function clearEntry() {
    setTransactionDate(todayLocalDate());
    setDescription("");
    setExpenseAccountId("");
    setReceiptAccountId("");
    setSimpleAmount("");
    setSimpleMemo("");
    setSimpleTaxCodeId("");
    setLines(initialLines);
    setMessage(null);
    setSavedSubmission(null);
    dateInputRef.current?.focus();
  }

  async function handleSave(finalize = false) {
    if (saveLockRef.current || (currentSubmission?.status === "posted") || (!finalize && currentSubmission?.status === "draft")) return;
    setMessage(null);
    if (!isLocalDate(transactionDate)) { setMessage({ kind: "error", key: "journal.validation_date" }); return; }
    if (!description.trim()) { setMessage({ kind: "error", key: "journal.validation_description" }); return; }
    if (mode === "simple") {
      if (simpleKind === "expense" && expenseAction === "expense" && (!expenseAccountId || !paymentAccountId)) { setMessage({ kind: "error", key: "journal.simple.expense.validation_accounts" }); return; }
      if (simpleKind === "expense" && expenseAction === "card_payment" && (!settlementCashAccountId || !accounts.some((account) => account.id === "account-other-payable"))) { setMessage({ kind: "error", key: "journal.simple.expense.validation_card_payment" }); return; }
      if (simpleKind === "sale" && (!revenueAccountId || !receiptAccountId)) { setMessage({ kind: "error", key: "journal.simple.sale.validation_accounts" }); return; }
      if (simpleKind === "settlement" && (!settlementCashAccountId || (settlementType !== "card_payment" && !settlementAccountId) || (settlementType === "card_payment" && !accounts.some((account) => account.id === "account-other-payable")))) { setMessage({ kind: "error", key: "journal.simple.settlement.validation_account" }); return; }
      if (amountOrZero(simpleAmount) <= 0) { setMessage({ kind: "error", key: "journal.simple.validation_amount" }); return; }
    } else {
      if (difference !== 0 || totals.debit === 0) { setMessage({ kind: "error", key: "journal.validation_balance" }); return; }
      if (lines.some((line) => !line.accountId)) { setMessage({ kind: "error", key: "journal.validation_account" }); return; }
    }

    saveLockRef.current = true;
    setSaveOperation(finalize && currentSubmission?.status === "draft" ? "posting" : finalize ? "saving-for-post" : "saving-draft");
    try {
      let entryId: string;
      if (finalize && currentSubmission?.status === "draft") {
        entryId = currentSubmission.entryId;
      } else if (mode !== "simple") {
        entryId = await saveDraftEntry(bookId, {
            transactionDate,
            description,
            lines: lines.map((line) => ({ accountId: line.accountId, side: line.side, amountMinor: parseYenInput(line.amount), memo: line.memo || null, taxCodeId: showTaxCodeInputs ? line.taxCodeId || null : null }))
          });
      } else if (simpleKind === "expense" && expenseAction === "expense") {
        entryId = await saveSimpleExpenseDraft(bookId, {
            transactionDate,
            description,
            expenseAccountId,
            paymentAccountId,
            amountMinor: parseYenInput(simpleAmount),
            memo: simpleMemo || null,
            taxCodeId: showTaxCodeInputs ? simpleTaxCodeId || null : null
          });
      } else if (simpleKind === "expense") {
        entryId = await saveSimpleSettlementDraft(bookId, {
          transactionDate,
          description,
          settlementType: "payable_payment",
          cashAccountId: settlementCashAccountId,
          settlementAccountId: "account-other-payable",
          amountMinor: parseYenInput(simpleAmount),
          memo: simpleMemo || null
        });
      } else if (simpleKind === "sale") {
        entryId = await saveSimpleSaleDraft(bookId, {
            transactionDate,
            description,
            revenueAccountId,
            receiptAccountId,
            amountMinor: parseYenInput(simpleAmount),
            memo: simpleMemo || null,
            taxCodeId: showTaxCodeInputs ? simpleTaxCodeId || null : null
          });
      } else {
        entryId = await saveSimpleSettlementDraft(bookId, {
            transactionDate,
            description,
            settlementType: settlementType === "card_payment" ? "payable_payment" : settlementType,
            cashAccountId: settlementCashAccountId,
            settlementAccountId: settlementType === "card_payment" ? "account-other-payable" : settlementAccountId,
            amountMinor: parseYenInput(simpleAmount),
            memo: simpleMemo || null
          });
      }
      setSavedSubmission({ entryId, fingerprint: formFingerprint, status: "draft" });
      if (finalize) {
        setSaveOperation("posting");
        await postJournalEntry(bookId, entryId);
        setSavedSubmission({ entryId, fingerprint: formFingerprint, status: "posted" });
        setMessage({ kind: "success", key: "journal.posted", params: { id: entryId.slice(0, 8) } });
      } else {
        setMessage({ kind: "success", key: "journal.saved", params: { id: entryId.slice(0, 8) } });
      }
    } catch (reason) {
      setMessage({ kind: "error", raw: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      saveLockRef.current = false;
      setSaveOperation("idle");
    }
  }

  function handleEditorKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "s" || event.key === "Enter")) {
      event.preventDefault();
      void handleSave(false);
      return;
    }
    if (mode !== "simple" && event.altKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      addLine("debit");
    }
    if (mode !== "simple" && event.altKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      addLine("credit");
    }
  }

  function selectSimpleKind(kind: SimpleTransactionKind) {
    setSimpleKind(kind);
    setSimpleTaxCodeId("");
    setMessage(null);
  }

  function selectSettlementType(type: SettlementAction) {
    setSettlementType(type);
    setSettlementAccountId(type === "receivable_collection"
      ? "account-receivable"
      : type === "loan_disbursement"
        ? "account-loans-receivable"
        : type === "borrowing_receipt"
          ? "account-loans-payable"
          : type === "payable_payment"
            ? "account-payable"
            : "account-other-payable");
    setMessage(null);
  }

  const accountName = (accountId: string, fallbackKey: string) => accounts.find((account) => account.id === accountId)?.name ?? t(fallbackKey);
  const preview = simpleKind === "expense" && expenseAction === "expense"
    ? {
        debit: accountName(expenseAccountId, "journal.simple.expense.expense_account"),
        credit: accountName(paymentAccountId, "journal.simple.expense.payment_account"),
        note: "journal.simple.expense.preview_note"
      }
    : simpleKind === "expense"
      ? {
          debit: accountName("account-other-payable", "journal.simple.settlement.card_account"),
          credit: accountName(settlementCashAccountId, "journal.simple.settlement.cash_account"),
          note: "journal.simple.settlement.card_payment_note"
        }
    : simpleKind === "sale"
      ? {
          debit: accountName(receiptAccountId, "journal.simple.sale.receipt_account"),
          credit: accountName(revenueAccountId, "journal.simple.sale.revenue_account"),
          note: "journal.simple.sale.preview_note"
        }
      : settlementType === "receivable_collection"
        ? {
            debit: accountName(settlementCashAccountId, "journal.simple.settlement.cash_account"),
            credit: accountName(settlementAccountId, "journal.simple.settlement.balance_account"),
            note: "journal.simple.settlement.receivable_note"
          }
        : settlementType === "borrowing_receipt"
          ? {
              debit: accountName(settlementCashAccountId, "journal.simple.settlement.cash_account"),
              credit: accountName(settlementAccountId, "journal.simple.settlement.balance_account"),
              note: "journal.simple.settlement.borrowing_note"
            }
        : settlementType === "card_payment"
          ? {
              debit: accountName("account-other-payable", "journal.simple.settlement.card_account"),
              credit: accountName(settlementCashAccountId, "journal.simple.settlement.cash_account"),
              note: "journal.simple.settlement.card_payment_note"
            }
        : {
            debit: accountName(settlementAccountId, "journal.simple.settlement.balance_account"),
            credit: accountName(settlementCashAccountId, "journal.simple.settlement.cash_account"),
            note: settlementType === "loan_disbursement" ? "journal.simple.settlement.lending_note" : "journal.simple.settlement.payable_note"
          };

  return (
    <section className="page" aria-labelledby="journal-title">
      <div className="page-heading compact-heading">
        <div><p className="kicker">{t("journal.kicker")}</p><h1 id="journal-title">{t("journal.title")}</h1><p>{t("journal.subtitle")}</p></div>
        <div className={mode === "simple" || (difference === 0 && totals.debit > 0) ? "balance-chip balanced" : "balance-chip"} aria-live="polite">
          <span className="status-dot" aria-hidden="true" />
          {mode === "simple" ? t("journal.simple.auto_balanced") : difference === 0 && totals.debit > 0 ? t("journal.balanced") : t("journal.difference", { amount: formatYen(difference) })}
        </div>
      </div>

      <div className="entry-mode-switch" role="tablist" aria-label={t("journal.mode_label")}>
        <button type="button" role="tab" aria-selected={mode === "simple"} className={mode === "simple" ? "active" : ""} onClick={() => { setMode("simple"); setMessage(null); }}><strong>{t("journal.modes.simple")}</strong><span>{t("journal.modes.simple_description")}</span></button>
        <button type="button" role="tab" aria-selected={mode === "template"} className={mode === "template" ? "active" : ""} onClick={() => { setMode("template"); setMessage(null); }}><strong>{t("journal.modes.template")}</strong><span>{t("journal.modes.template_description")}</span></button>
        <button type="button" role="tab" aria-selected={mode === "compound"} className={mode === "compound" ? "active" : ""} onClick={() => { setMode("compound"); setMessage(null); }}><strong>{t("journal.modes.compound")}</strong><span>{t("journal.modes.compound_description")}</span></button>
      </div>

      <div className="entry-card" role="form" aria-label={t("journal.editor_aria_label")} onKeyDown={handleEditorKeyDown}>
        {mode === "simple" ? <div className="simple-kind-section">
          <div className="simple-kind-heading"><p className="kicker">{t("journal.simple.kind_kicker")}</p><h2>{t("journal.simple.kind_title")}</h2></div>
          <div className="simple-kind-grid" role="radiogroup" aria-label={t("journal.simple.kind_title")}>
            {(["expense", "sale", "settlement"] as const).map((kind) => <button key={kind} type="button" role="radio" aria-checked={simpleKind === kind} className={`simple-kind-button ${kind}${simpleKind === kind ? " active" : ""}`} onClick={() => selectSimpleKind(kind)}><span className="simple-kind-glyph" aria-hidden="true">{t(`journal.simple.kinds.${kind}.glyph`)}</span><span><strong>{t(`journal.simple.kinds.${kind}.title`)}</strong><small>{t(`journal.simple.kinds.${kind}.description`)}</small></span><span className="simple-kind-check" aria-hidden="true">{simpleKind === kind ? "✓" : "›"}</span></button>)}
          </div>
        </div> : null}
        {mode === "template" ? <section className="template-section" aria-labelledby="journal-template-title">
          <div className="template-heading">
            <div><p className="kicker">REUSABLE ENTRY</p><h2 id="journal-template-title">{t("journal.template.title")}</h2><p>{t("journal.template.description")}</p></div>
            <div className="template-token-list" aria-label={t("journal.template.available_tokens")}>
              {["{YYYY}", "{YY}", "{M}", "{MM-1}", "{DD}", "{hh}", "{mm}", "{ss}"].map((token) => <code key={token}>{token}</code>)}
            </div>
          </div>
          {templates.length > 0 ? <div className="template-list" aria-label={t("journal.template.list_label")}>
            {templates.map((template) => <article className="template-card" key={template.id}>
              <button className="template-apply-button" type="button" disabled={templateBusy} onClick={() => applyTemplate(template)}>
                <strong>{template.name}</strong>
                <span className="template-source">{template.descriptionTemplate}</span>
                <span className="template-preview">{t("journal.template.preview", { value: expandJournalTemplate(template.descriptionTemplate, transactionDate) })}</span>
              </button>
              <button className="template-delete-button" type="button" disabled={templateBusy} aria-label={t("journal.template.delete", { name: template.name })} onClick={() => void handleDeleteTemplate(template)}>×</button>
            </article>)}
          </div> : <p className="template-empty">{t("journal.template.empty")}</p>}
          <div className="template-save-row">
            <label><span>{t("journal.template.name")}</span><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder={t("journal.template.name_placeholder")} /></label>
            <div><small>{t("journal.template.save_help")}</small><button className="secondary-button" type="button" disabled={templateBusy} onClick={() => void handleSaveTemplate()}>{templateBusy ? t("journal.template.processing") : t("journal.template.save")}</button></div>
          </div>
          {templateMessage ? <p className={`template-message ${templateMessage.kind}`} role={templateMessage.kind === "error" ? "alert" : "status"}>{"raw" in templateMessage ? templateMessage.raw : t(templateMessage.key, templateMessage.params)}</p> : null}
        </section> : null}
        <div className="entry-header-fields">
          <label><span>{t("journal.transaction_date")}</span><input ref={dateInputRef} type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} /></label>
          <label className="description-field"><span>{t(mode === "template" ? "journal.template.description_template" : "journal.description")}</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t(mode === "template" ? "journal.template.description_placeholder" : "journal.description_placeholder")} /></label>
        </div>

        {mode === "simple" ? (
          <div className="simple-expense-editor" aria-label={t("journal.simple.aria_label")}>
            <div className="simple-expense-fields">
              {simpleKind === "expense" ? <>
                <fieldset className="settlement-type-field"><legend>{t("journal.simple.expense.action")}</legend><div>
                  <button className={expenseAction === "expense" ? "active" : ""} type="button" aria-pressed={expenseAction === "expense"} onClick={() => { setExpenseAction("expense"); setMessage(null); }}><strong>{t("journal.simple.expense.expense_payment")}</strong><small>{t("journal.simple.expense.expense_payment_description")}</small></button>
                  <button className={expenseAction === "card_payment" ? "active" : ""} type="button" aria-pressed={expenseAction === "card_payment"} onClick={() => { setExpenseAction("card_payment"); setSimpleTaxCodeId(""); setMessage(null); }}><strong>{t("journal.simple.expense.card_payment")}</strong><small>{t("journal.simple.expense.card_payment_description")}</small></button>
                </div></fieldset>
                {expenseAction === "expense" ? <>
                  <label><span>{t("journal.simple.expense.expense_account")}</span><select aria-label={t("journal.simple.expense.expense_account")} value={expenseAccountId} onChange={(event) => setExpenseAccountId(event.target.value)}><option value="">{t("journal.simple.expense.select_expense")}</option>{expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}</select></label>
                  <label><span>{t("journal.simple.expense.payment_account")}</span><select aria-label={t("journal.simple.expense.payment_account")} value={paymentAccountId} onChange={(event) => setPaymentAccountId(event.target.value)}><option value="">{t("journal.simple.expense.select_payment")}</option>{paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}{account.id === "account-other-payable" ? t("journal.simple.expense.credit_card_suffix") : ""}</option>)}</select></label>
                </> : <label><span>{t("journal.simple.expense.card_withdrawal_account")}</span><select aria-label={t("journal.simple.expense.card_withdrawal_account")} value={settlementCashAccountId} onChange={(event) => setSettlementCashAccountId(event.target.value)}><option value="">{t("journal.simple.settlement.select_cash")}</option>{cashAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}</select></label>}
              </> : null}
              {simpleKind === "sale" ? <>
                <label><span>{t("journal.simple.sale.revenue_account")}</span><select aria-label={t("journal.simple.sale.revenue_account")} value={revenueAccountId} onChange={(event) => setRevenueAccountId(event.target.value)}><option value="">{t("journal.simple.sale.select_revenue")}</option>{revenueAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}</select></label>
                <label><span>{t("journal.simple.sale.receipt_account")}</span><select aria-label={t("journal.simple.sale.receipt_account")} value={receiptAccountId} onChange={(event) => setReceiptAccountId(event.target.value)}><option value="">{t("journal.simple.sale.select_receipt")}</option>{receiptAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}</select></label>
              </> : null}
              {simpleKind === "settlement" ? <>
                <fieldset className="settlement-type-field expanded"><legend>{t("journal.simple.settlement.type")}</legend><div>{(["receivable_collection", "payable_payment", "loan_disbursement", "borrowing_receipt", "card_payment"] as const).map((type) => <button key={type} className={settlementType === type ? "active" : ""} type="button" aria-pressed={settlementType === type} onClick={() => selectSettlementType(type)}><strong>{t(`journal.simple.settlement.${type}`)}</strong><small>{t(`journal.simple.settlement.${type}_description`)}</small></button>)}</div></fieldset>
                {settlementType !== "card_payment" ? <label><span>{t("journal.simple.settlement.balance_account")}</span><select aria-label={t("journal.simple.settlement.balance_account")} value={settlementAccountId} onChange={(event) => setSettlementAccountId(event.target.value)}><option value="">{t("journal.simple.settlement.select_balance_account")}</option>{(settlementType === "receivable_collection" || settlementType === "loan_disbursement" ? assetSettlementAccounts : liabilitySettlementAccounts).map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}{account.id === "account-other-payable" ? t("journal.simple.expense.credit_card_suffix") : ""}</option>)}</select></label> : <div className="fixed-account-field"><span>{t("journal.simple.settlement.balance_account")}</span><strong>{accountName("account-other-payable", "journal.simple.settlement.card_account")}</strong></div>}
                <label><span>{t(settlementType === "receivable_collection" || settlementType === "borrowing_receipt" ? "journal.simple.settlement.deposit_account" : "journal.simple.settlement.payment_account")}</span><select aria-label={t(settlementType === "receivable_collection" || settlementType === "borrowing_receipt" ? "journal.simple.settlement.deposit_account" : "journal.simple.settlement.payment_account")} value={settlementCashAccountId} onChange={(event) => setSettlementCashAccountId(event.target.value)}><option value="">{t("journal.simple.settlement.select_cash")}</option>{cashAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}</select></label>
              </> : null}
              <label className="simple-amount-field"><span>{t("journal.amount")}</span><div><input aria-label={t("journal.amount")} type="text" inputMode="numeric" value={simpleAmount} onChange={(event) => setSimpleAmount(event.target.value)} placeholder="0" /><small>{t("common.currency_unit")}</small></div></label>
              {showTaxCodeInputs && (simpleKind === "sale" || (simpleKind === "expense" && expenseAction === "expense")) ? <label><span>{t("journal.tax_code")}</span><select aria-label={t("journal.tax_code")} value={simpleTaxCodeId} onChange={(event) => setSimpleTaxCodeId(event.target.value)}><option value="">{t("journal.no_tax_code")}</option>{(simpleKind === "expense" ? purchaseTaxCodes : salesTaxCodes).map((code) => <option key={code.id} value={code.id}>{code.code} · {code.name}</option>)}</select></label> : null}
              <label className="simple-memo-field"><span>{t("journal.memo")}</span><input aria-label={t("journal.memo")} value={simpleMemo} onChange={(event) => setSimpleMemo(event.target.value)} placeholder={t("journal.memo_placeholder")} /></label>
            </div>
            <section className="simple-entry-preview" aria-labelledby="simple-preview-title">
              <div><p className="kicker">{t("journal.simple.preview_kicker")}</p><h2 id="simple-preview-title">{t("journal.simple.preview_title")}</h2></div>
              <div className="simple-preview-lines">
                <div><span className="preview-side debit">{t("common.debit_glyph")}</span><span>{preview.debit}</span><strong>{formatYen(amountOrZero(simpleAmount))}<small>{t("common.currency_unit")}</small></strong></div>
                <div><span className="preview-side credit">{t("common.credit_glyph")}</span><span>{preview.credit}</span><strong>{formatYen(amountOrZero(simpleAmount))}<small>{t("common.currency_unit")}</small></strong></div>
              </div>
              <p>{t(preview.note)}</p>
            </section>
          </div>
        ) : <div className="entry-columns" aria-label={t("journal.lines_aria_label")}>
          {(["debit", "credit"] as const).map((side) => (
            <section className={`entry-side ${side}`} key={side} aria-labelledby={`${side}-title`}>
              <div className="side-title"><span>{t(side === "debit" ? "common.debit_glyph" : "common.credit_glyph")}</span><div><p>{t(side === "debit" ? "journal.debit_kicker" : "journal.credit_kicker")}</p><h2 id={`${side}-title`}>{t(side === "debit" ? "common.debit" : "common.credit")}</h2></div></div>
              <div className="line-list">
                {lines.filter((line) => line.side === side).map((line, index) => (
                  <div className="journal-line" key={line.id}>
                    <span className="line-number">{String(index + 1).padStart(2, "0")}</span>
                    <label><span className="sr-only">{t("journal.account")}</span><select id={`journal-account-${line.id}`} aria-label={t("journal.account")} value={line.accountId} onChange={(event) => updateLine(line.id, { accountId: event.target.value })}><option value="">{t("journal.select_account")}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}</select></label>
                    <label className="amount-field"><span className="sr-only">{t("journal.amount")}</span><input aria-label={t("journal.amount")} type="text" inputMode="numeric" value={line.amount} onChange={(event) => updateLine(line.id, { amount: event.target.value })} placeholder="0" /><span>{t("common.currency_unit")}</span></label>
                    <label className="memo-field"><span className="sr-only">{t("journal.memo")}</span><input aria-label={t("journal.memo")} value={line.memo} onChange={(event) => updateLine(line.id, { memo: event.target.value })} placeholder={t("journal.memo_placeholder")} /></label>
                    {showTaxCodeInputs ? <label className="tax-code-field"><span className="sr-only">{t("journal.tax_code")}</span><select aria-label={t("journal.tax_code")} value={line.taxCodeId} onChange={(event) => updateLine(line.id, { taxCodeId: event.target.value })}><option value="">{t("journal.no_tax_code")}</option>{effectiveTaxCodes.map((code) => <option key={code.id} value={code.id}>{code.code} · {code.name}</option>)}</select></label> : null}
                    {lines.filter((candidate) => candidate.side === side).length > 1 ? <button className="remove-line-button" type="button" aria-label={t("journal.remove_line", { number: index + 1, side: t(side === "debit" ? "common.debit" : "common.credit") })} onClick={() => removeLine(line.id)}>×</button> : null}
                  </div>
                ))}
              </div>
              <button className="add-line-button" type="button" onClick={() => addLine(side)}>{t("journal.add_line", { side: t(side === "debit" ? "common.debit" : "common.credit") })}</button>
              <div className="side-total"><span>{t("journal.total", { side: t(side === "debit" ? "common.debit" : "common.credit") })}</span><strong>{formatYen(totals[side])}<small>{t("common.currency_unit")}</small></strong></div>
            </section>
          ))}
        </div>}

        <footer className="entry-footer">
          <p
            className={`entry-message${saving ? " processing" : visibleMessage ? ` ${visibleMessage.kind}` : ""}`}
            role={visibleMessage?.kind === "error" ? "alert" : "status"}
            aria-live={visibleMessage?.kind === "error" ? "assertive" : "polite"}
            aria-atomic="true"
          >
            {saveOperation === "saving-draft" ? t("journal.saving_draft_status")
              : saveOperation === "saving-for-post" ? t("journal.saving_before_post_status")
                : saveOperation === "posting" ? t("journal.posting_status")
                  : visibleMessage ? ("raw" in visibleMessage ? visibleMessage.raw : t(visibleMessage.key, visibleMessage.params))
                    : t(mode === "simple" ? "journal.simple.hint" : "journal.draft_hint")}
          </p>
          <div>
            <button className="secondary-button" type="button" disabled={saving} onClick={clearEntry}>{t(currentSubmission ? "journal.new_entry" : "journal.clear")}</button>
            <button className="secondary-button" type="button" disabled={saving || Boolean(currentSubmission)} onClick={() => void handleSave(false)}>
              {saveOperation === "saving-draft" ? t("journal.saving_draft") : currentSubmission ? t(currentSubmission.status === "posted" ? "journal.posted_button" : "journal.draft_saved") : t("journal.save_draft")}
              <span className="shortcut">{t("journal.save_shortcut")}</span>
            </button>
            <button className="primary-button" type="button" disabled={saving || currentSubmission?.status === "posted"} onClick={() => void handleSave(true)}>
              {saveOperation === "saving-for-post" ? t("journal.saving_before_post") : saveOperation === "posting" ? t("journal.posting") : currentSubmission?.status === "draft" ? t("journal.post_saved_draft") : currentSubmission?.status === "posted" ? t("journal.posted_button") : t("journal.save_and_post")}
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}
