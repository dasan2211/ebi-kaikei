export type BalanceReconciliationRequest = {
  accountId: string;
  reconciliationDate: string;
  actualBalanceMinor: number;
};

export type BalanceAdjustmentRequest = BalanceReconciliationRequest & {
  adjustmentAccountId: string;
  memo?: string | null;
};

export type BalanceReconciliation = {
  accountId: string;
  accountCode: string;
  accountName: string;
  normalSide: "debit" | "credit";
  reconciliationDate: string;
  ledgerBalanceMinor: number;
  actualBalanceMinor: number;
  differenceMinor: number;
};

export type BalanceAdjustmentResult = {
  journalEntryId: string;
  reconciliation: BalanceReconciliation;
};
