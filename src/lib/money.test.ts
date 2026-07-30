import { describe, expect, it } from "vitest";
import { formatYen, parseYenInput } from "./money";

describe("money", () => {
  it("整数の円を桁区切りで表示する", () => {
    expect(formatYen(1234567)).toBe("1,234,567");
  });

  it("空欄は0円として解釈する", () => {
    expect(parseYenInput("")).toBe(0);
  });

  it("桁区切りと全角数字を整数へ変換する", () => {
    expect(parseYenInput("１,２３４")).toBe(1234);
  });

  it("小数や負数を拒否する", () => {
    expect(() => parseYenInput("12.5")).toThrow("1円単位");
    expect(() => parseYenInput("-100")).toThrow("0以上");
  });
});
