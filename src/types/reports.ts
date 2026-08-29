export type JournalEntryStatus = "draft" | "posted" | "reversed";

export type ReportPageRequest = {
  startDate?: string;
  endDate?: string;
  status?: JournalEntryStatus;
  query?: string;
  limit?: number;
  offset?: number;
};

export type JournalBookLine = {
  id: string;
  lineNumber: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  side: "debit" | "credit";
  amountMinor: number;
  memo?: string | null;
  taxCodeId?: string | null;
};

export type JournalBookEntry = {
  id: string;
  transactionDate: string;
  description: string;
  status: JournalEntryStatus;
  sourceType: string;
  lines: JournalBookLine[];
};

export type JournalBookPage = {
  items: JournalBookEntry[];
  total: number;
  limit: number;
  offset: number;
};

export type DashboardSummary = {
  draftCount: number;
  lastPostedDate: string | null;
  differenceMinor: number;
};

export type GeneralLedgerRequest = ReportPageRequest & {
  accountId: string;
};

export type LedgerAccount = {
  id: string;
  code: string;
  name: string;
  normalSide: "debit" | "credit";
};

export type GeneralLedgerRow = {
  lineId: string;
  entryId: string;
  transactionDate: string;
  description: string;
  status: JournalEntryStatus;
  lineNumber: number;
  debitAmountMinor: number;
  creditAmountMinor: number;
  balanceMinor: number;
  memo?: string | null;
};

export type GeneralLedgerPage = {
  account: LedgerAccount;
  items: GeneralLedgerRow[];
  total: number;
  limit: number;
  offset: number;
  totalDebitMinor: number;
  totalCreditMinor: number;
  openingBalanceMinor: number;
  closingBalanceMinor: number;
};

export type TrialBalanceRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: "asset" | "liability" | "equity" | "revenue" | "expense";
  openingDebitMinor: number;
  openingCreditMinor: number;
  periodDebitMinor: number;
  periodCreditMinor: number;
  closingDebitMinor: number;
  closingCreditMinor: number;
};

export type TrialBalanceTotals = {
  openingDebitMinor: number;
  openingCreditMinor: number;
  periodDebitMinor: number;
  periodCreditMinor: number;
  closingDebitMinor: number;
  closingCreditMinor: number;
};

export type TrialBalance = {
  items: TrialBalanceRow[];
  totals: TrialBalanceTotals;
  total: number;
  limit: number;
  offset: number;
  differenceMinor: number;
};

export type ExportedFile = {
  path: string;
  fileName: string;
  rowCount: number;
};
