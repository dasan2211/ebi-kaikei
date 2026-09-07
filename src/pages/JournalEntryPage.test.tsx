import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JournalEntryPage } from "./JournalEntryPage";

const mocks = vi.hoisted(() => ({
  deleteJournalTemplate: vi.fn(),
  listAccounts: vi.fn(),
  listJournalTemplates: vi.fn(),
  listTaxCodes: vi.fn(),
  postJournalEntry: vi.fn(),
  saveDraftEntry: vi.fn(),
  saveJournalTemplate: vi.fn(),
  saveSimpleExpenseDraft: vi.fn(),
  saveSimpleSaleDraft: vi.fn(),
  saveSimpleSettlementDraft: vi.fn()
}));

vi.mock("../i18n/context", () => ({
  useI18n: () => ({ locale: "en", t: (key: string) => key })
}));

vi.mock("../lib/tauri", () => ({
  deleteJournalTemplate: mocks.deleteJournalTemplate,
  listAccounts: mocks.listAccounts,
  listJournalTemplates: mocks.listJournalTemplates,
  listTaxCodes: mocks.listTaxCodes,
  postJournalEntry: mocks.postJournalEntry,
  saveDraftEntry: mocks.saveDraftEntry,
  saveJournalTemplate: mocks.saveJournalTemplate,
  saveSimpleExpenseDraft: mocks.saveSimpleExpenseDraft,
  saveSimpleSaleDraft: mocks.saveSimpleSaleDraft,
  saveSimpleSettlementDraft: mocks.saveSimpleSettlementDraft
}));

beforeEach(() => {
  mocks.deleteJournalTemplate.mockReset().mockResolvedValue(undefined);
  mocks.listAccounts.mockReset().mockResolvedValue([
    { id: "account-cash", code: "1000", name: "Cash", accountType: "asset", normalSide: "debit", isActive: true },
    { id: "account-bank", code: "1100", name: "Bank", accountType: "asset", normalSide: "debit", isActive: true },
    { id: "account-receivable", code: "1200", name: "Accounts receivable", accountType: "asset", normalSide: "debit", isActive: true },
    { id: "account-loans-receivable", code: "1250", name: "Loans receivable", accountType: "asset", normalSide: "debit", isActive: true },
    { id: "account-payable", code: "2000", name: "Accounts payable", accountType: "liability", normalSide: "credit", isActive: true },
    { id: "account-other-payable", code: "2100", name: "Other payable", accountType: "liability", normalSide: "credit", isActive: true },
    { id: "account-loans-payable", code: "2200", name: "Loans payable", accountType: "liability", normalSide: "credit", isActive: true },
    { id: "account-sales", code: "4000", name: "Sales", accountType: "revenue", normalSide: "credit", isActive: true },
    { id: "account-supplies", code: "6120", name: "Supplies", accountType: "expense", normalSide: "debit", isActive: true }
  ]);
  mocks.saveDraftEntry.mockReset().mockResolvedValue("entry-12345678");
  mocks.listJournalTemplates.mockReset().mockResolvedValue([]);
  mocks.listTaxCodes.mockReset().mockResolvedValue([]);
  mocks.postJournalEntry.mockReset().mockResolvedValue(undefined);
  mocks.saveSimpleExpenseDraft.mockReset().mockResolvedValue("simple-12345678");
  mocks.saveSimpleSaleDraft.mockReset().mockResolvedValue("sale-12345678");
  mocks.saveSimpleSettlementDraft.mockReset().mockResolvedValue("settlement-12345678");
  mocks.saveJournalTemplate.mockReset().mockResolvedValue("template-12345678");
});

describe("JournalEntryPage", () => {
  it("expands a saved template from the transaction month", async () => {
    mocks.listJournalTemplates.mockResolvedValue([{
      id: "template-lessons",
      name: "Monthly lesson fee",
      descriptionTemplate: "{MM-1}月授業報酬",
      lines: [
        { accountId: "account-receivable", side: "debit", amountMinor: 50000, memoTemplate: "{MM-1}月分" },
        { accountId: "account-sales", side: "credit", amountMinor: 50000, memoTemplate: null }
      ]
    }]);
    render(<JournalEntryPage bookId="book-business-income" />);

    fireEvent.change(screen.getByLabelText("journal.transaction_date"), { target: { value: "2026-08-13" } });
    fireEvent.click(screen.getByRole("tab", { name: /journal.modes.template/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Monthly lesson fee/ }));

    expect(screen.getByDisplayValue("07月授業報酬")).toBeInTheDocument();
    expect(screen.getByDisplayValue("07月分")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "journal.amount" })[0]).toHaveValue("50000");
  });

  it("saves the current balanced entry as a reusable template", async () => {
    render(<JournalEntryPage bookId="book-business-income" />);
    fireEvent.click(screen.getByRole("tab", { name: /journal.modes.template/ }));
    const accounts = await screen.findAllByRole("combobox", { name: "journal.account" });
    const amounts = screen.getAllByRole("textbox", { name: "journal.amount" });

    fireEvent.change(screen.getByPlaceholderText("journal.template.name_placeholder"), { target: { value: "Monthly lesson fee" } });
    fireEvent.change(screen.getByPlaceholderText("journal.template.description_placeholder"), { target: { value: "{MM-1}月授業報酬" } });
    fireEvent.change(accounts[0], { target: { value: "account-receivable" } });
    fireEvent.change(accounts[1], { target: { value: "account-sales" } });
    fireEvent.change(amounts[0], { target: { value: "50000" } });
    fireEvent.change(amounts[1], { target: { value: "50000" } });
    fireEvent.click(screen.getByRole("button", { name: "journal.template.save" }));

    await waitFor(() => expect(mocks.saveJournalTemplate).toHaveBeenCalledWith(
      "book-business-income",
      expect.objectContaining({
        name: "Monthly lesson fee",
        descriptionTemplate: "{MM-1}月授業報酬",
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: "account-receivable", amountMinor: 50000 }),
          expect.objectContaining({ accountId: "account-sales", amountMinor: 50000 })
        ])
      })
    ));
  });

  it("hides tax code inputs for a tax-exempt business", async () => {
    render(<JournalEntryPage bookId="book-business-income" consumptionTaxStatus="exempt" />);

    await screen.findByRole("combobox", { name: "journal.simple.expense.expense_account" });
    expect(screen.queryByRole("combobox", { name: "journal.tax_code" })).not.toBeInTheDocument();
    expect(mocks.listTaxCodes).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: /journal.modes.compound/ }));
    expect(screen.queryByRole("combobox", { name: "journal.tax_code" })).not.toBeInTheDocument();
  });

  it("取引日を日付ピッカーから入力できる", async () => {
    render(<JournalEntryPage bookId="book-business-income" />);

    const transactionDate = screen.getByLabelText("journal.transaction_date");
    expect(transactionDate).toHaveAttribute("type", "date");

    fireEvent.change(transactionDate, { target: { value: "2026-08-13" } });
    expect(transactionDate).toHaveValue("2026-08-13");
    await waitFor(() => expect(mocks.listAccounts).toHaveBeenCalledWith("book-business-income"));
  });

  it("saves a balanced entry with the keyboard shortcut", async () => {
    render(<JournalEntryPage bookId="book-business-income" />);
    fireEvent.click(screen.getByRole("tab", { name: /journal.modes.compound/ }));
    const accounts = await screen.findAllByRole("combobox", { name: "journal.account" });
    const amounts = screen.getAllByRole("textbox", { name: "journal.amount" });
    fireEvent.change(accounts[0], { target: { value: "account-cash" } });
    fireEvent.change(accounts[1], { target: { value: "account-sales" } });
    fireEvent.change(screen.getByPlaceholderText("journal.description_placeholder"), { target: { value: "Keyboard sale" } });
    fireEvent.change(amounts[0], { target: { value: "1500" } });
    fireEvent.change(amounts[1], { target: { value: "1500" } });

    fireEvent.keyDown(screen.getByRole("form", { name: "journal.editor_aria_label" }), { key: "s", ctrlKey: true });

    await waitFor(() => expect(mocks.saveDraftEntry).toHaveBeenCalledWith(
      "book-business-income",
      expect.objectContaining({ description: "Keyboard sale" })
    ));
  });

  it("adds and removes journal lines from keyboard-accessible controls", async () => {
    render(<JournalEntryPage bookId="book-business-income" />);
    fireEvent.click(screen.getByRole("tab", { name: /journal.modes.compound/ }));
    await screen.findAllByRole("combobox", { name: "journal.account" });
    const editor = screen.getByRole("form", { name: "journal.editor_aria_label" });

    fireEvent.keyDown(editor, { key: "d", altKey: true });
    expect(screen.getAllByRole("combobox", { name: "journal.account" })).toHaveLength(3);
    fireEvent.click(screen.getAllByRole("button", { name: "journal.remove_line" })[1]);
    expect(screen.getAllByRole("combobox", { name: "journal.account" })).toHaveLength(2);
  });

  it("saves a selected tax code and posts the resulting draft", async () => {
    mocks.listTaxCodes.mockResolvedValue([
      { id: "jp-sales-10", code: "SALES10", name: "Taxable sales 10%", rateBps: 1000, category: "taxable", direction: "sales", isReduced: false, validFrom: "2019-10-01", validTo: null }
    ]);
    render(<JournalEntryPage bookId="book-business-income" />);
    fireEvent.click(screen.getByRole("tab", { name: /journal.modes.compound/ }));
    const accounts = await screen.findAllByRole("combobox", { name: "journal.account" });
    const amounts = screen.getAllByRole("textbox", { name: "journal.amount" });
    const taxCodes = await screen.findAllByRole("combobox", { name: "journal.tax_code" });
    fireEvent.change(accounts[0], { target: { value: "account-cash" } });
    fireEvent.change(accounts[1], { target: { value: "account-sales" } });
    fireEvent.change(amounts[0], { target: { value: "11000" } });
    fireEvent.change(amounts[1], { target: { value: "11000" } });
    fireEvent.change(taxCodes[1], { target: { value: "jp-sales-10" } });
    fireEvent.change(screen.getByPlaceholderText("journal.description_placeholder"), { target: { value: "Taxable sale" } });

    fireEvent.click(screen.getByRole("button", { name: "journal.save_and_post" }));
    await waitFor(() => expect(mocks.postJournalEntry).toHaveBeenCalledWith("book-business-income", "entry-12345678"));
    expect(mocks.saveDraftEntry).toHaveBeenCalledWith(
      "book-business-income",
      expect.objectContaining({ lines: expect.arrayContaining([expect.objectContaining({ taxCodeId: "jp-sales-10" })]) })
    );
  });

  it("locks repeated saves and posts the already-saved draft without creating a duplicate", async () => {
    let resolveSave: (entryId: string) => void = () => undefined;
    mocks.saveSimpleExpenseDraft.mockReturnValue(new Promise<string>((resolve) => { resolveSave = resolve; }));
    render(<JournalEntryPage bookId="book-business-income" />);

    fireEvent.change(await screen.findByRole("combobox", { name: "journal.simple.expense.expense_account" }), { target: { value: "account-supplies" } });
    fireEvent.change(screen.getByRole("combobox", { name: "journal.simple.expense.payment_account" }), { target: { value: "account-cash" } });
    fireEvent.change(screen.getByRole("textbox", { name: "journal.amount" }), { target: { value: "1200" } });
    fireEvent.change(screen.getByPlaceholderText("journal.description_placeholder"), { target: { value: "Printer paper" } });

    const saveButton = screen.getByRole("button", { name: /journal.save_draft/ });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(mocks.saveSimpleExpenseDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /journal.saving_draft/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "journal.clear" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("journal.saving_draft_status");

    await act(async () => { resolveSave("simple-locked-12345678"); });

    const postSavedDraftButton = await screen.findByRole("button", { name: "journal.post_saved_draft" });
    expect(screen.getByRole("button", { name: /journal.draft_saved/ })).toBeDisabled();
    fireEvent.click(postSavedDraftButton);

    await waitFor(() => expect(mocks.postJournalEntry).toHaveBeenCalledWith("book-business-income", "simple-locked-12345678"));
    expect(mocks.saveSimpleExpenseDraft).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "journal.posted_button" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "journal.new_entry" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("journal.posted");
  });

  it("creates a balanced expense draft from the simple form", async () => {
    mocks.listTaxCodes.mockResolvedValue([
      { id: "jp-purchase-10", code: "PURCHASE10", name: "Taxable purchase 10%", rateBps: 1000, category: "taxable", direction: "purchase", isReduced: false, validFrom: "2019-10-01", validTo: null }
    ]);
    render(<JournalEntryPage bookId="book-business-income" />);

    fireEvent.change(await screen.findByRole("combobox", { name: "journal.simple.expense.expense_account" }), { target: { value: "account-supplies" } });
    fireEvent.change(screen.getByRole("combobox", { name: "journal.simple.expense.payment_account" }), { target: { value: "account-cash" } });
    fireEvent.change(screen.getByRole("textbox", { name: "journal.amount" }), { target: { value: "1100" } });
    fireEvent.change(screen.getByRole("combobox", { name: "journal.tax_code" }), { target: { value: "jp-purchase-10" } });
    fireEvent.change(screen.getByPlaceholderText("journal.description_placeholder"), { target: { value: "Office supplies" } });
    fireEvent.change(screen.getByRole("textbox", { name: "journal.memo" }), { target: { value: "Notebook" } });
    fireEvent.click(screen.getByRole("button", { name: "journal.save_and_post" }));

    await waitFor(() => expect(mocks.saveSimpleExpenseDraft).toHaveBeenCalledWith("book-business-income", {
      transactionDate: expect.any(String),
      description: "Office supplies",
      expenseAccountId: "account-supplies",
      paymentAccountId: "account-cash",
      amountMinor: 1100,
      memo: "Notebook",
      taxCodeId: "jp-purchase-10"
    }));
    expect(mocks.postJournalEntry).toHaveBeenCalledWith("book-business-income", "simple-12345678");
  });

  it("shows three large transaction choices and creates a sale", async () => {
    mocks.listTaxCodes.mockResolvedValue([
      { id: "jp-sales-10", code: "SALES10", name: "Taxable sales 10%", rateBps: 1000, category: "taxable", direction: "sales", isReduced: false, validFrom: "2019-10-01", validTo: null }
    ]);
    render(<JournalEntryPage bookId="book-business-income" />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(screen.getByRole("radio", { name: /journal.simple.kinds.sale.title/ }));
    fireEvent.change(await screen.findByRole("combobox", { name: "journal.simple.sale.revenue_account" }), { target: { value: "account-sales" } });
    fireEvent.change(screen.getByRole("combobox", { name: "journal.simple.sale.receipt_account" }), { target: { value: "account-receivable" } });
    fireEvent.change(screen.getByRole("textbox", { name: "journal.amount" }), { target: { value: "55000" } });
    fireEvent.change(screen.getByRole("combobox", { name: "journal.tax_code" }), { target: { value: "jp-sales-10" } });
    fireEvent.change(screen.getByPlaceholderText("journal.description_placeholder"), { target: { value: "August sale" } });
    fireEvent.click(screen.getByRole("button", { name: /journal.save_draft/ }));

    await waitFor(() => expect(mocks.saveSimpleSaleDraft).toHaveBeenCalledWith("book-business-income", expect.objectContaining({
      revenueAccountId: "account-sales",
      receiptAccountId: "account-receivable",
      amountMinor: 55000,
      taxCodeId: "jp-sales-10"
    })));
  });

  it("creates both receivable collection and payable payment settlements", async () => {
    render(<JournalEntryPage bookId="book-business-income" />);
    fireEvent.click(screen.getByRole("radio", { name: /journal.simple.kinds.settlement.title/ }));
    const cashAccount = await screen.findByRole("combobox", { name: "journal.simple.settlement.deposit_account" });
    fireEvent.change(cashAccount, { target: { value: "account-bank" } });
    fireEvent.change(screen.getByRole("textbox", { name: "journal.amount" }), { target: { value: "33000" } });
    fireEvent.change(screen.getByPlaceholderText("journal.description_placeholder"), { target: { value: "Receivable collected" } });
    fireEvent.click(screen.getByRole("button", { name: /journal.save_draft/ }));
    await waitFor(() => expect(mocks.saveSimpleSettlementDraft).toHaveBeenLastCalledWith("book-business-income", expect.objectContaining({
      settlementType: "receivable_collection",
      cashAccountId: "account-bank",
      settlementAccountId: "account-receivable"
    })));

    fireEvent.click(screen.getByRole("button", { name: /journal.simple.settlement.payable_payment/ }));
    fireEvent.click(screen.getByRole("button", { name: /journal.save_draft/ }));
    await waitFor(() => expect(mocks.saveSimpleSettlementDraft).toHaveBeenLastCalledWith("book-business-income", expect.objectContaining({
      settlementType: "payable_payment",
      cashAccountId: "account-bank",
      settlementAccountId: "account-payable"
    })));
  });

  it("records lending and borrowing with the selected balance account", async () => {
    render(<JournalEntryPage bookId="book-business-income" />);
    fireEvent.click(screen.getByRole("radio", { name: /journal.simple.kinds.settlement.title/ }));
    fireEvent.click(screen.getByRole("button", { name: /journal.simple.settlement.loan_disbursement/ }));
    fireEvent.change(await screen.findByRole("combobox", { name: "journal.simple.settlement.payment_account" }), { target: { value: "account-bank" } });
    fireEvent.change(screen.getByRole("textbox", { name: "journal.amount" }), { target: { value: "50000" } });
    fireEvent.change(screen.getByPlaceholderText("journal.description_placeholder"), { target: { value: "Personal loan" } });
    fireEvent.click(screen.getByRole("button", { name: /journal.save_draft/ }));
    await waitFor(() => expect(mocks.saveSimpleSettlementDraft).toHaveBeenLastCalledWith("book-business-income", expect.objectContaining({
      settlementType: "loan_disbursement",
      settlementAccountId: "account-loans-receivable"
    })));

    fireEvent.click(screen.getByRole("button", { name: /journal.simple.settlement.borrowing_receipt/ }));
    fireEvent.click(screen.getByRole("button", { name: /journal.save_draft/ }));
    await waitFor(() => expect(mocks.saveSimpleSettlementDraft).toHaveBeenLastCalledWith("book-business-income", expect.objectContaining({
      settlementType: "borrowing_receipt",
      settlementAccountId: "account-loans-payable"
    })));
  });

  it("records a credit card withdrawal from both payment and settlement routes", async () => {
    render(<JournalEntryPage bookId="book-business-income" />);
    fireEvent.click(await screen.findByRole("button", { name: /journal.simple.expense.card_payment/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "journal.simple.expense.card_withdrawal_account" }), { target: { value: "account-bank" } });
    fireEvent.change(screen.getByRole("textbox", { name: "journal.amount" }), { target: { value: "12000" } });
    fireEvent.change(screen.getByPlaceholderText("journal.description_placeholder"), { target: { value: "Card bill" } });
    fireEvent.click(screen.getByRole("button", { name: /journal.save_draft/ }));
    await waitFor(() => expect(mocks.saveSimpleSettlementDraft).toHaveBeenLastCalledWith("book-business-income", expect.objectContaining({
      settlementType: "payable_payment",
      settlementAccountId: "account-other-payable",
      cashAccountId: "account-bank"
    })));

    fireEvent.click(screen.getByRole("radio", { name: /journal.simple.kinds.settlement.title/ }));
    fireEvent.click(screen.getByRole("button", { name: /journal.simple.settlement.card_payment/ }));
    fireEvent.click(screen.getByRole("button", { name: /journal.save_draft/ }));
    await waitFor(() => expect(mocks.saveSimpleSettlementDraft).toHaveBeenLastCalledWith("book-business-income", expect.objectContaining({
      settlementType: "payable_payment",
      settlementAccountId: "account-other-payable",
      cashAccountId: "account-bank"
    })));
  });
});
