export type JournalSide = "debit" | "credit";

export type JournalLineInput = {
  accountId: string;
  side: JournalSide;
  amountMinor: number;
  memo?: string | null;
};

export type DraftJournalEntry = {
  transactionDate: string;
  description: string;
  lines: JournalLineInput[];
};
