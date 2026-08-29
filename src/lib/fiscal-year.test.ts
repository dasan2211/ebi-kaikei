import { describe, expect, it } from "vitest";
import { fiscalYearTranslationParams, japaneseEraForFiscalYear } from "./fiscal-year";

describe("fiscal year", () => {
  it.each([
    [2026, "令和8"],
    [2019, "令和元"],
    [1989, "平成元"],
    [1926, "昭和元"],
    [1912, "大正元"],
    [1900, "明治33"]
  ])("西暦%d年度に対応する和暦を返す", (year, expected) => {
    expect(japaneseEraForFiscalYear(year)).toBe(expected);
  });

  it("翻訳へ西暦と和暦の両方を渡す", () => {
    expect(fiscalYearTranslationParams(2026)).toEqual({ year: 2026, era: "令和8" });
  });

  it("対応範囲外の年度を拒否する", () => {
    expect(() => japaneseEraForFiscalYear(1867)).toThrow(RangeError);
  });
});
