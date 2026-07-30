const fullWidthDigits = "０１２３４５６７８９";

export function formatYen(amountMinor: number): string {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(amountMinor);
}

export function parseYenInput(value: string): number {
  const normalized = value
    .trim()
    .replaceAll(",", "")
    .replace(/[０-９]/g, (digit) => String(fullWidthDigits.indexOf(digit)));

  if (normalized === "") return 0;
  if (normalized.startsWith("-")) throw new Error("金額は0以上で入力してください");
  if (!/^\d+$/.test(normalized)) throw new Error("金額は1円単位の整数で入力してください");

  const amount = Number(normalized);
  if (!Number.isSafeInteger(amount)) throw new Error("金額が大きすぎます");
  return amount;
}
