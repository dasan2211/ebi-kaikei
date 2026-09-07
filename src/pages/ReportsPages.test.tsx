import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeneralLedgerPage } from "./GeneralLedgerPage";
import { JournalBookPage } from "./JournalBookPage";
import { TrialBalancePage } from "./TrialBalancePage";

const mocks = vi.hoisted(() => ({
  exportGeneralLedgerCsv: vi.fn(),
  exportJournalBookCsv: vi.fn(),
  exportTrialBalanceCsv: vi.fn(),
  getTrialBalance: vi.fn(),
  listAccounts: vi.fn(),
  listGeneralLedger: vi.fn(),
  listJournalBook: vi.fn(),
  reviseJournalEntry: vi.fn(),
  reverseJournalEntry: vi.fn()
}));

vi.mock("../i18n/context", () => ({
  useI18n: () => ({
    locale: "ja",
    t: (key: string, params?: Record<string, string | number>) => params
      ? Object.entries(params).reduce((value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)), key)
      : key
  })
}));

vi.mock("../lib/tauri", () => ({
  exportGeneralLedgerCsv: mocks.exportGeneralLedgerCsv,
  exportJournalBookCsv: mocks.exportJournalBookCsv,
  exportTrialBalanceCsv: mocks.exportTrialBalanceCsv,
  getTrialBalance: mocks.getTrialBalance,
  listAccounts: mocks.listAccounts,
  listGeneralLedger: mocks.listGeneralLedger,
  listJournalBook: mocks.listJournalBook,
  reviseJournalEntry: mocks.reviseJournalEntry,
  reverseJournalEntry: mocks.reverseJournalEntry
}));

const journalPage = {
  items: [{
    id: "entry-12345678",
    transactionDate: "2026-08-13",
    description: "現金売上",
    status: "posted",
    sourceType: "manual",
    lines: [
      { id: "line-1", lineNumber: 1, accountId: "cash", accountCode: "1000", accountName: "現金", side: "debit", amountMinor: 1000, memo: "店頭" },
      { id: "line-2", lineNumber: 2, accountId: "sales", accountCode: "4000", accountName: "売上高", side: "credit", amountMinor: 1000, memo: null }
    ]
  }],
  total: 1,
  limit: 100,
  offset: 0
} as const;

const ledgerPage = {
  account: { id: "cash", code: "1000", name: "現金", normalSide: "debit" },
  items: [{
    lineId: "line-1",
    entryId: "entry-1",
    transactionDate: "2026-08-13",
    description: "現金売上",
    status: "draft",
    lineNumber: 1,
    debitAmountMinor: 1000,
    creditAmountMinor: 0,
    balanceMinor: 1000,
    memo: "店頭"
  }],
  total: 1,
  limit: 100,
  offset: 0,
  totalDebitMinor: 1000,
  totalCreditMinor: 0,
  openingBalanceMinor: 0,
  closingBalanceMinor: 1000
} as const;

const trialBalance = {
  items: [
    {
      accountId: "cash", accountCode: "1000", accountName: "現金", accountType: "asset",
      openingDebitMinor: 1000, openingCreditMinor: 0,
      periodDebitMinor: 0, periodCreditMinor: 300,
      closingDebitMinor: 700, closingCreditMinor: 0
    },
    {
      accountId: "sales", accountCode: "4000", accountName: "売上高", accountType: "revenue",
      openingDebitMinor: 0, openingCreditMinor: 1000,
      periodDebitMinor: 300, periodCreditMinor: 0,
      closingDebitMinor: 0, closingCreditMinor: 700
    }
  ],
  totals: {
    openingDebitMinor: 1000, openingCreditMinor: 1000,
    periodDebitMinor: 300, periodCreditMinor: 300,
    closingDebitMinor: 700, closingCreditMinor: 700
  },
  total: 2,
  limit: 100,
  offset: 0,
  differenceMinor: 0
} as const;

beforeEach(() => {
  const exportedFile = { path: "C:\\Downloads\\report.csv", fileName: "report.csv", rowCount: 1 };
  mocks.exportGeneralLedgerCsv.mockReset().mockResolvedValue(exportedFile);
  mocks.exportJournalBookCsv.mockReset().mockResolvedValue(exportedFile);
  mocks.exportTrialBalanceCsv.mockReset().mockResolvedValue(exportedFile);
  mocks.getTrialBalance.mockReset().mockResolvedValue(trialBalance);
  mocks.listAccounts.mockReset().mockResolvedValue([
    { id: "cash", code: "1000", name: "現金", accountType: "asset", normalSide: "debit", isActive: true }
  ]);
  mocks.listJournalBook.mockReset().mockResolvedValue(journalPage);
  mocks.listGeneralLedger.mockReset().mockResolvedValue(ledgerPage);
  mocks.reviseJournalEntry.mockReset().mockResolvedValue({ reversalEntryId: "reversal-1", replacementEntryId: "replacement-1" });
  mocks.reverseJournalEntry.mockReset().mockResolvedValue({ reversalEntryId: "reversal-1", replacementEntryId: null });
});

describe("report pages", () => {
  it("仕訳帳に複合仕訳の借方・貸方明細をまとめて表示する", async () => {
    render(<JournalBookPage bookId="book-business-income" fiscalYear={2026} />);

    expect(await screen.findByText("現金売上")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("現金")).toBeInTheDocument();
    expect(within(table).getByText("売上高")).toBeInTheDocument();
    expect(within(table).getAllByText("1,000")).toHaveLength(2);
    expect(mocks.listJournalBook).toHaveBeenCalledWith("book-business-income", expect.objectContaining({ limit: 100, offset: 0 }));
  });

  it("仕訳帳の状態フィルターをRustコマンドへ渡す", async () => {
    const user = userEvent.setup();
    render(<JournalBookPage bookId="book-business-income" fiscalYear={2026} />);
    await screen.findByText("現金売上");

    await user.selectOptions(screen.getByLabelText("reports.filters.status"), "posted");

    await waitFor(() => expect(mocks.listJournalBook).toHaveBeenLastCalledWith(
      "book-business-income",
      expect.objectContaining({ status: "posted", offset: 0 })
    ));
  });

  it("選択科目の総勘定元帳と累計残高を表示する", async () => {
    render(<GeneralLedgerPage bookId="book-business-income" fiscalYear={2026} />);

    expect(await screen.findByText("現金売上")).toBeInTheDocument();
    expect(screen.getByLabelText("general_ledger.account")).toHaveValue("cash");
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("1,000")).toHaveLength(2);
    expect(mocks.listGeneralLedger).toHaveBeenCalledWith("book-business-income", expect.objectContaining({ accountId: "cash", limit: 100, offset: 0 }));
  });

  it("合計残高試算表に繰越・期間・期末の貸借を表示する", async () => {
    render(<TrialBalancePage bookId="book-business-income" fiscalYear={2026} />);

    expect(await screen.findByText("現金")).toBeInTheDocument();
    const cashRow = screen.getByText("現金").closest("tr");
    expect(cashRow).not.toBeNull();
    expect(within(cashRow!).getByText("1,000")).toBeInTheDocument();
    expect(within(cashRow!).getByText("300")).toBeInTheDocument();
    expect(within(cashRow!).getByText("700")).toBeInTheDocument();
    expect(screen.getByText("trial_balance.balanced")).toBeInTheDocument();
    expect(mocks.getTrialBalance).toHaveBeenCalledWith("book-business-income", expect.objectContaining({
      startDate: "2026-01-01", endDate: "2026-12-31", limit: 100, offset: 0
    }));
  });

  it("searches and exports the journal book with the active filters", async () => {
    const user = userEvent.setup();
    render(<JournalBookPage bookId="book-business-income" fiscalYear={2026} />);
    await screen.findByRole("table");

    await user.type(screen.getByLabelText("reports.filters.search"), "sales");
    await waitFor(() => expect(mocks.listJournalBook).toHaveBeenLastCalledWith(
      "book-business-income",
      expect.objectContaining({ query: "sales", offset: 0 })
    ));

    await user.click(screen.getByRole("button", { name: /reports.export.button/ }));
    expect(mocks.exportJournalBookCsv).toHaveBeenCalledWith(
      "book-business-income",
      expect.objectContaining({ query: "sales", startDate: "2026-01-01", endDate: "2026-12-31" })
    );
    expect(await screen.findByText(/reports.export.success/)).toBeInTheDocument();
  });

  it("edits a posted entry by inserting a reversal and corrected entry", async () => {
    const user = userEvent.setup();
    render(<JournalBookPage bookId="book-business-income" fiscalYear={2026} />);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "journal_book.actions.edit" }));
    const dialog = screen.getByRole("dialog", { name: "journal_book.edit.title" });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    const description = within(dialog).getByLabelText("journal_book.edit.description");
    await user.clear(description);
    await user.type(description, "Corrected sale");
    const amounts = within(dialog).getAllByLabelText(/journal_book.edit.amount/);
    await user.clear(amounts[0]);
    await user.type(amounts[0], "1500");
    await user.clear(amounts[1]);
    await user.type(amounts[1], "1500");
    await user.click(within(dialog).getByRole("button", { name: "journal_book.edit.save" }));

    await waitFor(() => expect(mocks.reviseJournalEntry).toHaveBeenCalledWith(
      "book-business-income",
      "entry-12345678",
      "ja",
      {
        transactionDate: "2026-08-13",
        description: "Corrected sale",
        lines: [
          { accountId: "cash", side: "debit", amountMinor: 1500, memo: "店頭", taxCodeId: null },
          { accountId: "sales", side: "credit", amountMinor: 1500, memo: null, taxCodeId: null }
        ]
      }
    ));
    await waitFor(() => expect(mocks.listJournalBook).toHaveBeenCalledTimes(2));
  });

  it("deletes a posted entry by confirming and inserting a reversal", async () => {
    const user = userEvent.setup();
    render(<JournalBookPage bookId="book-business-income" fiscalYear={2026} />);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "journal_book.actions.delete" }));
    const dialog = screen.getByRole("alertdialog", { name: "journal_book.delete.title" });
    await user.click(within(dialog).getByRole("button", { name: "journal_book.delete.confirm" }));

    await waitFor(() => expect(mocks.reverseJournalEntry).toHaveBeenCalledWith(
      "book-business-income",
      "entry-12345678",
      "ja"
    ));
    await waitFor(() => expect(mocks.listJournalBook).toHaveBeenCalledTimes(2));
  });

  it("warns instead of reversing a reversal entry again", async () => {
    const user = userEvent.setup();
    mocks.listJournalBook.mockResolvedValue({
      ...journalPage,
      items: [{
        ...journalPage.items[0],
        id: "reversal-12345678",
        description: "取消：現金売上",
        sourceType: "correction_reversal"
      }]
    });
    render(<JournalBookPage bookId="book-business-income" fiscalYear={2026} />);
    await screen.findByText("取消：現金売上");

    await user.click(screen.getByRole("button", { name: "journal_book.actions.delete" }));

    const dialog = screen.getByRole("alertdialog", { name: "journal_book.reversal_warning.title" });
    expect(within(dialog).getByText("journal_book.reversal_warning.notice")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "journal_book.delete.confirm" })).not.toBeInTheDocument();
    expect(mocks.reverseJournalEntry).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "common.close" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
