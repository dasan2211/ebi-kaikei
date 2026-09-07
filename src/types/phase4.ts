export type TaxCode = {
  id: string;
  code: string;
  name: string;
  rateBps: number;
  category: "taxable" | "exempt" | "non_taxable" | "out_of_scope";
  direction: "sales" | "purchase" | "both";
  isReduced: boolean;
  validFrom: string;
  validTo?: string | null;
};

export type TaxSummaryRow = {
  taxCodeId: string;
  code: string;
  name: string;
  direction: "sales" | "purchase" | "both";
  rateBps: number;
  grossAmountMinor: number;
  netAmountMinor: number;
  taxAmountMinor: number;
};

export type TaxSummary = {
  rows: TaxSummaryRow[];
  outputTaxMinor: number;
  inputTaxMinor: number;
  differenceMinor: number;
};

export type CreateFixedAssetRequest = {
  name: string;
  assetAccountId: string;
  acquisitionDate: string;
  acquisitionCostMinor: number;
  residualValueMinor: number;
  usefulLifeYears: number;
};

export type FixedAsset = CreateFixedAssetRequest & {
  id: string;
  assetAccountCode: string;
  assetAccountName: string;
  depreciationMethod: "straight_line";
  status: "active" | "disposed";
  accumulatedDepreciationMinor: number;
  bookValueMinor: number;
};

export type DepreciationResult = {
  assetId: string;
  fiscalYear: number;
  amountMinor: number;
  journalEntryId: string;
};

export type InventoryAdjustmentRequest = {
  fiscalYear: number;
  countDate: string;
  beginningInventoryMinor: number;
  endingInventoryMinor: number;
};

export type InventoryCount = InventoryAdjustmentRequest & {
  id: string;
  costOfGoodsSoldMinor: number;
  journalEntryId: string;
};

export type Attachment = {
  id: string;
  entryId: string;
  transactionDate: string;
  entryDescription: string;
  sourceType: "file" | "url";
  originalName: string;
  mediaType: string | null;
  sizeBytes: number | null;
  externalUrl: string | null;
  createdAt: string;
};
