import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClosingOperationsPage } from "./ClosingOperationsPage";

const mocks = vi.hoisted(() => ({
  createFixedAsset: vi.fn(),
  getAccountReconciliation: vi.fn(),
  getTaxSummary: vi.fn(),
  listAccounts: vi.fn(),
  listFixedAssets: vi.fn(),
  listInventoryCounts: vi.fn(),
  postBalanceAdjustment: vi.fn(),
  postFixedAssetDepreciation: vi.fn(),
  postInventoryAdjustment: vi.fn()
}));

vi.mock("../i18n/context", () => ({
  useI18n: () => ({
    locale: "ja",
    t: (key: string, params?: Record<string, string | number>) => params
      ? Object.entries(params).reduce((value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)), key)
      : key
  })
}));

vi.mock("../lib/tauri", () => mocks);

beforeEach(() => {
  mocks.createFixedAsset.mockReset();
  mocks.getAccountReconciliation.mockReset().mockResolvedValue({
    accountId: "account-cash",
    accountCode: "1000",
    accountName: "現金",
    normalSide: "debit",
    reconciliationDate: "2026-08-26",
    ledgerBalanceMinor: 10_000,
    actualBalanceMinor: 9_500,
    differenceMinor: -500
  });
  mocks.getTaxSummary.mockReset().mockResolvedValue({ rows: [], outputTaxMinor: 0, inputTaxMinor: 0, differenceMinor: 0 });
  mocks.listAccounts.mockReset().mockResolvedValue([
    { id: "account-cash", code: "1000", name: "現金", accountType: "asset", normalSide: "debit", isActive: true },
    { id: "account-equipment", code: "1500", name: "備品", accountType: "asset", normalSide: "debit", isActive: true },
    { id: "account-cash-over-short", code: "6180", name: "現金過不足", accountType: "expense", normalSide: "debit", isActive: true },
    { id: "account-other-income", code: "4100", name: "雑収入", accountType: "revenue", normalSide: "credit", isActive: true }
  ]);
  mocks.listFixedAssets.mockReset().mockResolvedValue([]);
  mocks.listInventoryCounts.mockReset().mockResolvedValue([]);
  mocks.postBalanceAdjustment.mockReset().mockResolvedValue({
    journalEntryId: "entry-adjustment",
    reconciliation: {
      accountId: "account-cash",
      accountCode: "1000",
      accountName: "現金",
      normalSide: "debit",
      reconciliationDate: "2026-08-26",
      ledgerBalanceMinor: 9_500,
      actualBalanceMinor: 9_500,
      differenceMinor: 0
    }
  });
  mocks.postFixedAssetDepreciation.mockReset();
  mocks.postInventoryAdjustment.mockReset();
});

describe("ClosingOperationsPage balance reconciliation", () => {
  it("選択した科目の実残高を照合して現金過不足の調整仕訳を作成する", async () => {
    const user = userEvent.setup();
    render(<ClosingOperationsPage bookId="book-business-income" fiscalYear={2026} />);

    expect(await screen.findByText("closing.reconciliation.title")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("closing.reconciliation.date"));
    await user.type(screen.getByLabelText("closing.reconciliation.date"), "2026-08-26");
    await user.clear(screen.getByLabelText("closing.reconciliation.actual_balance"));
    await user.type(screen.getByLabelText("closing.reconciliation.actual_balance"), "9500");
    await user.click(screen.getByRole("button", { name: "closing.reconciliation.verify" }));

    await waitFor(() => expect(mocks.getAccountReconciliation).toHaveBeenCalledWith(
      "book-business-income",
      {
        accountId: "account-cash",
        reconciliationDate: "2026-08-26",
        actualBalanceMinor: 9500
      }
    ));
    expect(screen.getByText("10,000")).toBeInTheDocument();
    expect(screen.getByText("-500")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "closing.reconciliation.adjust" }));
    await waitFor(() => expect(mocks.postBalanceAdjustment).toHaveBeenCalledWith(
      "book-business-income",
      expect.objectContaining({
        accountId: "account-cash",
        adjustmentAccountId: "account-cash-over-short",
        reconciliationDate: "2026-08-26",
        actualBalanceMinor: 9500
      })
    ));
    expect(await screen.findByText("closing.reconciliation.adjusted")).toBeInTheDocument();
  });

  it("固定資産、減価償却、棚卸調整を登録して一覧を再読込する", async () => {
    const asset = {
      id: "asset-1",
      name: "パソコン",
      assetAccountId: "account-equipment",
      assetAccountCode: "1500",
      assetAccountName: "備品",
      acquisitionDate: "2026-04-01",
      acquisitionCostMinor: 120_000,
      residualValueMinor: 0,
      usefulLifeYears: 5,
      depreciationMethod: "straight_line" as const,
      status: "active" as const,
      accumulatedDepreciationMinor: 24_000,
      bookValueMinor: 96_000
    };
    mocks.getTaxSummary.mockResolvedValue({
      rows: [
        { taxCodeId: "tax-10", code: "T10", name: "10%", direction: "sales", rateBps: 1000, grossAmountMinor: 11_000, netAmountMinor: 10_000, taxAmountMinor: 1_000 },
        { taxCodeId: "tax-825", code: "T825", name: "8.25%", direction: "purchase", rateBps: 825, grossAmountMinor: 10_825, netAmountMinor: 10_000, taxAmountMinor: 825 }
      ],
      outputTaxMinor: 1_000,
      inputTaxMinor: 825,
      differenceMinor: 175
    });
    mocks.listFixedAssets.mockResolvedValue([asset]);
    mocks.listInventoryCounts.mockResolvedValue([{
      id: "inventory-1",
      fiscalYear: 2026,
      countDate: "2026-12-31",
      beginningInventoryMinor: 20_000,
      endingInventoryMinor: 30_000,
      costOfGoodsSoldMinor: 90_000,
      journalEntryId: "entry-inventory"
    }]);
    mocks.createFixedAsset.mockResolvedValue(asset);
    mocks.postFixedAssetDepreciation.mockResolvedValue({ assetId: asset.id, fiscalYear: 2026, amountMinor: 24_000, journalEntryId: "entry-depreciation" });
    mocks.postInventoryAdjustment.mockResolvedValue({ id: "inventory-2", fiscalYear: 2026, countDate: "2026-12-31", beginningInventoryMinor: 0, endingInventoryMinor: 50_000, costOfGoodsSoldMinor: 70_000, journalEntryId: "entry-inventory-2" });
    const user = userEvent.setup();
    render(<ClosingOperationsPage bookId="book-business-income" fiscalYear={2026} />);

    await screen.findByText("パソコン");
    expect(screen.getAllByText("8.25%")).toHaveLength(2);
    await user.type(screen.getByLabelText("closing.assets.name"), "追加備品");
    await user.clear(screen.getByLabelText("closing.assets.acquisition_date"));
    await user.type(screen.getByLabelText("closing.assets.acquisition_date"), "2026-08-01");
    await user.type(screen.getByLabelText("closing.assets.cost"), "50000");
    await user.clear(screen.getByLabelText("closing.assets.residual"));
    await user.type(screen.getByLabelText("closing.assets.residual"), "1000");
    await user.clear(screen.getByLabelText("closing.assets.life"));
    await user.type(screen.getByLabelText("closing.assets.life"), "4");
    await user.click(screen.getByRole("button", { name: "closing.assets.add" }));

    await waitFor(() => expect(mocks.createFixedAsset).toHaveBeenCalledWith("book-business-income", {
      name: "追加備品",
      assetAccountId: "account-equipment",
      acquisitionDate: "2026-08-01",
      acquisitionCostMinor: 50_000,
      residualValueMinor: 1_000,
      usefulLifeYears: 4
    }));
    await user.click(screen.getByRole("button", { name: "closing.assets.post_depreciation" }));
    expect(await screen.findByText("closing.assets.posted")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("closing.inventory.beginning"));
    await user.type(screen.getByLabelText("closing.inventory.beginning"), "20000");
    await user.type(screen.getByLabelText("closing.inventory.ending"), "30000");
    await user.click(screen.getByRole("button", { name: "closing.inventory.post" }));
    expect(await screen.findByText("closing.inventory.posted")).toBeInTheDocument();
    expect(mocks.postInventoryAdjustment).toHaveBeenCalledWith("book-business-income", {
      fiscalYear: 2026,
      countDate: "2026-12-31",
      beginningInventoryMinor: 20_000,
      endingInventoryMinor: 30_000
    });

    await user.click(screen.getByRole("button", { name: "common.reload" }));
    await waitFor(() => expect(mocks.getTaxSummary).toHaveBeenCalledTimes(2));
  });

  it("残高が一致した場合は調整仕訳を表示しない", async () => {
    mocks.getAccountReconciliation.mockResolvedValue({
      accountId: "account-cash",
      accountCode: "1000",
      accountName: "現金",
      normalSide: "debit",
      reconciliationDate: "2026-08-26",
      ledgerBalanceMinor: 10_000,
      actualBalanceMinor: 10_000,
      differenceMinor: 0
    });
    const user = userEvent.setup();
    render(<ClosingOperationsPage bookId="book-business-income" fiscalYear={2026} />);

    await user.type(await screen.findByLabelText("closing.reconciliation.actual_balance"), "10000");
    await user.click(screen.getByRole("button", { name: "closing.reconciliation.verify" }));

    expect(await screen.findByText("closing.reconciliation.matched")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "closing.reconciliation.adjust" })).not.toBeInTheDocument();
  });

  it("期末処理の各コマンド失敗を画面へ表示する", async () => {
    const asset = {
      id: "asset-error",
      name: "失敗確認用資産",
      assetAccountId: "account-equipment",
      assetAccountCode: "1500",
      assetAccountName: "備品",
      acquisitionDate: "2026-01-01",
      acquisitionCostMinor: 10_000,
      residualValueMinor: 0,
      usefulLifeYears: 5,
      depreciationMethod: "straight_line" as const,
      status: "active" as const,
      accumulatedDepreciationMinor: 0,
      bookValueMinor: 10_000
    };
    mocks.listFixedAssets.mockResolvedValue([asset]);
    mocks.getAccountReconciliation.mockRejectedValueOnce(new Error("照合失敗"));
    mocks.createFixedAsset.mockRejectedValueOnce("資産登録失敗");
    mocks.postFixedAssetDepreciation.mockRejectedValueOnce(new Error("償却失敗"));
    mocks.postInventoryAdjustment.mockRejectedValueOnce(new Error("棚卸失敗"));
    const user = userEvent.setup();
    render(<ClosingOperationsPage bookId="book-business-income" fiscalYear={2026} />);

    await user.type(await screen.findByLabelText("closing.reconciliation.actual_balance"), "10000");
    await user.click(screen.getByRole("button", { name: "closing.reconciliation.verify" }));
    expect(await screen.findByText("照合失敗")).toBeInTheDocument();

    await user.type(screen.getByLabelText("closing.assets.name"), "失敗資産");
    await user.type(screen.getByLabelText("closing.assets.cost"), "10000");
    await user.click(screen.getByRole("button", { name: "closing.assets.add" }));
    expect(await screen.findByText("資産登録失敗")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "closing.assets.post_depreciation" }));
    expect(await screen.findByText("償却失敗")).toBeInTheDocument();

    await user.type(screen.getByLabelText("closing.inventory.ending"), "1000");
    await user.click(screen.getByRole("button", { name: "closing.inventory.post" }));
    expect(await screen.findByText("棚卸失敗")).toBeInTheDocument();
  });

  it("初回読込失敗後に再読込できる", async () => {
    mocks.listAccounts.mockRejectedValueOnce(new Error("読込失敗"));
    const user = userEvent.setup();
    render(<ClosingOperationsPage bookId="book-business-income" fiscalYear={2025} />);

    expect(await screen.findByText("読込失敗")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "common.reload" }));
    expect(await screen.findByText("closing.reconciliation.title")).toBeInTheDocument();
    expect(screen.getByLabelText("closing.reconciliation.date")).toHaveValue("2025-12-31");
  });
});
