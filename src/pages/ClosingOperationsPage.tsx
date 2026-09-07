import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/context";
import { fiscalYearTranslationParams } from "../lib/fiscal-year";
import { todayLocalDate } from "../lib/local-date";
import { formatYen, parseYenInput } from "../lib/money";
import {
  createFixedAsset,
  getAccountReconciliation,
  getTaxSummary,
  listAccounts,
  listFixedAssets,
  listInventoryCounts,
  postBalanceAdjustment,
  postFixedAssetDepreciation,
  postInventoryAdjustment
} from "../lib/tauri";
import type { Account } from "../types/account";
import type { FixedAsset, InventoryCount, TaxSummary } from "../types/phase4";
import type { BalanceReconciliation } from "../types/reconciliation";

type Message = { kind: "success" | "error"; text: string } | null;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reconciliationDateForFiscalYear(fiscalYear: number): string {
  const today = todayLocalDate();
  return today.startsWith(`${fiscalYear}-`) ? today : `${fiscalYear}-12-31`;
}

export function ClosingOperationsPage({ bookId, fiscalYear }: { bookId: string; fiscalYear: number }) {
  const { locale, t } = useI18n();
  const fiscalYearParams = fiscalYearTranslationParams(fiscalYear);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [inventoryCounts, setInventoryCounts] = useState<InventoryCount[]>([]);
  const [taxSummary, setTaxSummary] = useState<TaxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [assetName, setAssetName] = useState("");
  const [assetAccountId, setAssetAccountId] = useState("account-equipment");
  const [acquisitionDate, setAcquisitionDate] = useState(`${fiscalYear}-01-01`);
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [residualValue, setResidualValue] = useState("0");
  const [usefulLife, setUsefulLife] = useState("5");
  const [countDate, setCountDate] = useState(`${fiscalYear}-12-31`);
  const [beginningInventory, setBeginningInventory] = useState("0");
  const [endingInventory, setEndingInventory] = useState("");
  const [reconciliationAccountId, setReconciliationAccountId] = useState("account-cash");
  const [reconciliationDate, setReconciliationDate] = useState(reconciliationDateForFiscalYear(fiscalYear));
  const [actualBalance, setActualBalance] = useState("");
  const [adjustmentAccountId, setAdjustmentAccountId] = useState("account-cash-over-short");
  const [adjustmentMemo, setAdjustmentMemo] = useState("");
  const [reconciliation, setReconciliation] = useState<BalanceReconciliation | null>(null);

  const requestData = useCallback(() => Promise.all([
    listAccounts(bookId),
    listFixedAssets(bookId),
    listInventoryCounts(bookId),
    getTaxSummary(bookId, `${fiscalYear}-01-01`, `${fiscalYear}-12-31`, locale)
  ]), [bookId, fiscalYear, locale]);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const [nextAccounts, nextAssets, nextCounts, nextTaxSummary] = await requestData();
      setAccounts(nextAccounts);
      setAssets(nextAssets);
      setInventoryCounts(nextCounts);
      setTaxSummary(nextTaxSummary);
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    requestData()
      .then(([nextAccounts, nextAssets, nextCounts, nextTaxSummary]) => {
        if (!active) return;
        setAccounts(nextAccounts);
        setAssets(nextAssets);
        setInventoryCounts(nextCounts);
        setTaxSummary(nextTaxSummary);
      })
      .catch((error: unknown) => { if (active) setMessage({ kind: "error", text: errorText(error) }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestData]);
  const assetAccounts = useMemo(() => accounts.filter((account) => account.id === "account-equipment"), [accounts]);
  const reconciliationAccounts = useMemo(
    () => accounts.filter((account) => ["asset", "liability", "equity"].includes(account.accountType)),
    [accounts]
  );
  const adjustmentAccounts = useMemo(
    () => accounts.filter((account) => ["expense", "revenue"].includes(account.accountType)),
    [accounts]
  );
  const selectedReconciliationAccountId = reconciliationAccounts.some((account) => account.id === reconciliationAccountId)
    ? reconciliationAccountId
    : reconciliationAccounts[0]?.id ?? "";
  const selectedAdjustmentAccountId = adjustmentAccounts.some((account) => account.id === adjustmentAccountId)
    ? adjustmentAccountId
    : adjustmentAccounts[0]?.id ?? "";

  function clearReconciliation() {
    setReconciliation(null);
    setMessage(null);
  }

  async function handleReconciliation(event: React.FormEvent) {
    event.preventDefault();
    setBusyKey("reconciliation");
    setMessage(null);
    try {
      const result = await getAccountReconciliation(bookId, {
        accountId: selectedReconciliationAccountId,
        reconciliationDate,
        actualBalanceMinor: parseYenInput(actualBalance)
      });
      setReconciliation(result);
    } catch (error) {
      setReconciliation(null);
      setMessage({ kind: "error", text: errorText(error) });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleBalanceAdjustment(event: React.FormEvent) {
    event.preventDefault();
    if (!reconciliation || reconciliation.differenceMinor === 0) return;
    setBusyKey("balance-adjustment");
    setMessage(null);
    try {
      const result = await postBalanceAdjustment(bookId, {
        accountId: reconciliation.accountId,
        adjustmentAccountId: selectedAdjustmentAccountId,
        reconciliationDate: reconciliation.reconciliationDate,
        actualBalanceMinor: reconciliation.actualBalanceMinor,
        memo: adjustmentMemo.trim() || null
      });
      setReconciliation(result.reconciliation);
      setMessage({ kind: "success", text: t("closing.reconciliation.adjusted") });
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCreateAsset(event: React.FormEvent) {
    event.preventDefault();
    setBusyKey("create-asset");
    setMessage(null);
    try {
      await createFixedAsset(bookId, {
        name: assetName,
        assetAccountId,
        acquisitionDate,
        acquisitionCostMinor: parseYenInput(acquisitionCost),
        residualValueMinor: parseYenInput(residualValue),
        usefulLifeYears: Number(usefulLife)
      });
      setAssetName("");
      setAcquisitionCost("");
      setResidualValue("0");
      setMessage({ kind: "success", text: t("closing.assets.created") });
      setAssets(await listFixedAssets(bookId));
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDepreciation(asset: FixedAsset) {
    setBusyKey(asset.id);
    setMessage(null);
    try {
      const result = await postFixedAssetDepreciation(bookId, asset.id, fiscalYear);
      setMessage({ kind: "success", text: t("closing.assets.posted", { amount: formatYen(result.amountMinor) }) });
      setAssets(await listFixedAssets(bookId));
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleInventory(event: React.FormEvent) {
    event.preventDefault();
    setBusyKey("inventory");
    setMessage(null);
    try {
      const result = await postInventoryAdjustment(bookId, {
        fiscalYear,
        countDate,
        beginningInventoryMinor: parseYenInput(beginningInventory),
        endingInventoryMinor: parseYenInput(endingInventory)
      });
      setMessage({ kind: "success", text: t("closing.inventory.posted", { amount: formatYen(result.costOfGoodsSoldMinor) }) });
      setInventoryCounts(await listInventoryCounts(bookId));
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="page closing-page" aria-labelledby="closing-title">
      <div className="page-heading compact-heading">
        <div><p className="kicker">{t("closing.kicker")}</p><h1 id="closing-title">{t("closing.title")}</h1><p>{t("closing.subtitle", fiscalYearParams)}</p></div>
        <button className="secondary-button" type="button" disabled={loading} onClick={() => void load()}>{t("common.reload")}</button>
      </div>

      {message ? <p className={`operation-message ${message.kind}`} role="status">{message.text}</p> : null}
      {loading ? <p role="status">{t("common.loading")}</p> : null}

      {!loading ? <div className="closing-sections">
        <section className="feature-card" aria-labelledby="reconciliation-title">
          <div className="feature-card-heading">
            <div>
              <p className="kicker">{t("closing.reconciliation.kicker")}</p>
              <h2 id="reconciliation-title">{t("closing.reconciliation.title")}</h2>
              <p>{t("closing.reconciliation.description")}</p>
            </div>
          </div>
          <form className="compact-form reconciliation-form" onSubmit={handleReconciliation}>
            <label>
              <span>{t("closing.reconciliation.account")}</span>
              <select
                required
                value={selectedReconciliationAccountId}
                onChange={(event) => { setReconciliationAccountId(event.target.value); clearReconciliation(); }}
              >
                {reconciliationAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
              </select>
            </label>
            <label>
              <span>{t("closing.reconciliation.date")}</span>
              <input required type="date" value={reconciliationDate} onChange={(event) => { setReconciliationDate(event.target.value); clearReconciliation(); }} />
            </label>
            <label>
              <span>{t("closing.reconciliation.actual_balance")}</span>
              <input required inputMode="numeric" value={actualBalance} onChange={(event) => { setActualBalance(event.target.value); clearReconciliation(); }} />
            </label>
            <button className="primary-button" disabled={busyKey !== null || !selectedReconciliationAccountId} type="submit">
              {busyKey === "reconciliation" ? t("common.processing") : t("closing.reconciliation.verify")}
            </button>
          </form>
          {reconciliation ? <>
            <div className="summary-metrics reconciliation-metrics" aria-live="polite">
              <div><span>{t("closing.reconciliation.ledger_balance")}</span><strong>{formatYen(reconciliation.ledgerBalanceMinor)}</strong></div>
              <div><span>{t("closing.reconciliation.actual_balance")}</span><strong>{formatYen(reconciliation.actualBalanceMinor)}</strong></div>
              <div className={reconciliation.differenceMinor === 0 ? "matched" : "mismatched"}><span>{t("closing.reconciliation.difference")}</span><strong>{formatYen(reconciliation.differenceMinor)}</strong></div>
            </div>
            <p className={reconciliation.differenceMinor === 0 ? "reconciliation-status matched" : "reconciliation-status mismatched"} role="status">
              {t(reconciliation.differenceMinor === 0 ? "closing.reconciliation.matched" : "closing.reconciliation.mismatched")}
            </p>
            {reconciliation.differenceMinor !== 0 ? <form className="compact-form adjustment-form" onSubmit={handleBalanceAdjustment}>
              <label>
                <span>{t("closing.reconciliation.adjustment_account")}</span>
                <select required value={selectedAdjustmentAccountId} onChange={(event) => setAdjustmentAccountId(event.target.value)}>
                  {adjustmentAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
                </select>
              </label>
              <label>
                <span>{t("closing.reconciliation.memo")}</span>
                <input maxLength={500} value={adjustmentMemo} onChange={(event) => setAdjustmentMemo(event.target.value)} placeholder={t("closing.reconciliation.memo_placeholder")} />
              </label>
              <button className="primary-button" disabled={busyKey !== null || !selectedAdjustmentAccountId} type="submit">
                {busyKey === "balance-adjustment" ? t("common.processing") : t("closing.reconciliation.adjust")}
              </button>
            </form> : null}
          </> : null}
          <p className="feature-note">{t("closing.reconciliation.note")}</p>
        </section>

        <section className="feature-card" aria-labelledby="tax-summary-title">
          <div className="feature-card-heading"><div><p className="kicker">{t("closing.tax.kicker")}</p><h2 id="tax-summary-title">{t("closing.tax.title")}</h2></div></div>
          <div className="summary-metrics">
            <div><span>{t("closing.tax.output_tax")}</span><strong>{formatYen(taxSummary?.outputTaxMinor ?? 0)}</strong></div>
            <div><span>{t("closing.tax.input_tax")}</span><strong>{formatYen(taxSummary?.inputTaxMinor ?? 0)}</strong></div>
            <div><span>{t("closing.tax.difference")}</span><strong>{formatYen(taxSummary?.differenceMinor ?? 0)}</strong></div>
          </div>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>{t("closing.tax.code")}</th><th>{t("closing.tax.name")}</th><th>{t("closing.tax.rate")}</th><th>{t("closing.tax.gross")}</th><th>{t("closing.tax.net")}</th><th>{t("closing.tax.tax")}</th></tr></thead><tbody>
            {taxSummary?.rows.length ? taxSummary.rows.map((row) => <tr key={row.taxCodeId}><td>{row.code}</td><td>{row.name}</td><td className="numeric-cell">{(row.rateBps / 100).toFixed(row.rateBps % 100 ? 2 : 0)}%</td><td className="numeric-cell">{formatYen(row.grossAmountMinor)}</td><td className="numeric-cell">{formatYen(row.netAmountMinor)}</td><td className="numeric-cell">{formatYen(row.taxAmountMinor)}</td></tr>) : <tr><td colSpan={6} className="empty-cell">{t("closing.tax.empty")}</td></tr>}
          </tbody></table></div>
          <p className="feature-note">{t("closing.tax.note")}</p>
        </section>

        <section className="feature-card" aria-labelledby="fixed-assets-title">
          <div className="feature-card-heading"><div><p className="kicker">{t("closing.assets.kicker")}</p><h2 id="fixed-assets-title">{t("closing.assets.title")}</h2></div></div>
          <form className="compact-form" onSubmit={handleCreateAsset}>
            <label><span>{t("closing.assets.name")}</span><input required maxLength={200} value={assetName} onChange={(event) => setAssetName(event.target.value)} /></label>
            <label><span>{t("closing.assets.account")}</span><select required value={assetAccountId} onChange={(event) => setAssetAccountId(event.target.value)}>{assetAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}</select></label>
            <label><span>{t("closing.assets.acquisition_date")}</span><input required type="date" value={acquisitionDate} onChange={(event) => setAcquisitionDate(event.target.value)} /></label>
            <label><span>{t("closing.assets.cost")}</span><input required inputMode="numeric" value={acquisitionCost} onChange={(event) => setAcquisitionCost(event.target.value)} /></label>
            <label><span>{t("closing.assets.residual")}</span><input required inputMode="numeric" value={residualValue} onChange={(event) => setResidualValue(event.target.value)} /></label>
            <label><span>{t("closing.assets.life")}</span><input required type="number" min="1" max="100" value={usefulLife} onChange={(event) => setUsefulLife(event.target.value)} /></label>
            <button className="primary-button" disabled={busyKey !== null} type="submit">{t("closing.assets.add")}</button>
          </form>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>{t("closing.assets.name")}</th><th>{t("closing.assets.acquisition_date")}</th><th>{t("closing.assets.cost")}</th><th>{t("closing.assets.accumulated")}</th><th>{t("closing.assets.book_value")}</th><th>{t("common.actions")}</th></tr></thead><tbody>
            {assets.length ? assets.map((asset) => <tr key={asset.id}><td><strong>{asset.name}</strong><small className="table-subtext">{asset.assetAccountCode} {asset.assetAccountName}</small></td><td>{asset.acquisitionDate}</td><td className="numeric-cell">{formatYen(asset.acquisitionCostMinor)}</td><td className="numeric-cell">{formatYen(asset.accumulatedDepreciationMinor)}</td><td className="numeric-cell">{formatYen(asset.bookValueMinor)}</td><td><button className="table-action" type="button" disabled={busyKey !== null} onClick={() => void handleDepreciation(asset)}>{busyKey === asset.id ? t("common.processing") : t("closing.assets.post_depreciation", fiscalYearParams)}</button></td></tr>) : <tr><td colSpan={6} className="empty-cell">{t("closing.assets.empty")}</td></tr>}
          </tbody></table></div>
        </section>

        <section className="feature-card" aria-labelledby="inventory-title">
          <div className="feature-card-heading"><div><p className="kicker">{t("closing.inventory.kicker")}</p><h2 id="inventory-title">{t("closing.inventory.title")}</h2></div></div>
          <form className="compact-form inventory-form" onSubmit={handleInventory}>
            <label><span>{t("closing.inventory.count_date")}</span><input required type="date" value={countDate} onChange={(event) => setCountDate(event.target.value)} /></label>
            <label><span>{t("closing.inventory.beginning")}</span><input required inputMode="numeric" value={beginningInventory} onChange={(event) => setBeginningInventory(event.target.value)} /></label>
            <label><span>{t("closing.inventory.ending")}</span><input required inputMode="numeric" value={endingInventory} onChange={(event) => setEndingInventory(event.target.value)} /></label>
            <button className="primary-button" disabled={busyKey !== null} type="submit">{t("closing.inventory.post")}</button>
          </form>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>{t("closing.inventory.year")}</th><th>{t("closing.inventory.count_date")}</th><th>{t("closing.inventory.beginning")}</th><th>{t("closing.inventory.ending")}</th><th>{t("closing.inventory.cogs")}</th></tr></thead><tbody>
            {inventoryCounts.length ? inventoryCounts.map((count) => <tr key={count.id}><td>{t("topbar.fiscal_year", fiscalYearTranslationParams(count.fiscalYear))}</td><td>{count.countDate}</td><td className="numeric-cell">{formatYen(count.beginningInventoryMinor)}</td><td className="numeric-cell">{formatYen(count.endingInventoryMinor)}</td><td className="numeric-cell"><strong>{formatYen(count.costOfGoodsSoldMinor)}</strong></td></tr>) : <tr><td colSpan={5} className="empty-cell">{t("closing.inventory.empty")}</td></tr>}
          </tbody></table></div>
          <p className="feature-note">{t("closing.inventory.note")}</p>
        </section>
      </div> : null}
    </section>
  );
}
