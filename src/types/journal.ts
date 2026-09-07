export type JournalSide = "debit" | "credit";

export type JournalLineInput = {
  accountId: string;
  side: JournalSide;
  amountMinor: number;
  memo?: string | null;
  taxCodeId?: string | null;
};

export type DraftJournalEntry = {
  transactionDate: string;
  description: string;
  lines: JournalLineInput[];
};

export type JournalCorrectionResult = {
  reversalEntryId: string;
  replacementEntryId?: string | null;
};

export type SimpleExpenseRequest = {
  transactionDate: string;
  description: string;
  expenseAccountId: string;
  paymentAccountId: string;
  amountMinor: number;
  memo?: string | null;
  taxCodeId?: string | null;
};

export type SimpleSaleRequest = {
  transactionDate: string;
  description: string;
  revenueAccountId: string;
  receiptAccountId: string;
  amountMinor: number;
  memo?: string | null;
  taxCodeId?: string | null;
};

export type SimpleSettlementType =
  | "receivable_collection"
  | "payable_payment"
  | "loan_disbursement"
  | "borrowing_receipt";

export type SimpleSettlementRequest = {
  transactionDate: string;
  description: string;
  settlementType: SimpleSettlementType;
  cashAccountId: string;
  settlementAccountId: string;
  amountMinor: number;
  memo?: string | null;
};

export type JournalTemplateLine = {
  accountId: string;
  side: JournalSide;
  amountMinor: number;
  memoTemplate?: string | null;
  taxCodeId?: string | null;
};

export type JournalTemplate = {
  id: string;
  name: string;
  descriptionTemplate: string;
  lines: JournalTemplateLine[];
};

export type SaveJournalTemplateRequest = {
  id?: string | null;
  name: string;
  descriptionTemplate: string;
  lines: JournalTemplateLine[];
};
