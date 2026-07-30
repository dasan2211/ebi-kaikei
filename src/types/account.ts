export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type NormalSide = "debit" | "credit";

export type Account = {
  id: string;
  code: string;
  name: string;
  accountType: AccountType;
  normalSide: NormalSide;
  parentId?: string | null;
  isActive: boolean;
};
