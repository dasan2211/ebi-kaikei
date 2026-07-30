import { describe, expect, it } from "vitest";
import { isLocalDate, todayLocalDate } from "./local-date";

describe("local-date", () => {
  it("実在するYYYY-MM-DDだけを受け付ける", () => {
    expect(isLocalDate("2026-02-28")).toBe(true);
    expect(isLocalDate("2026-02-30")).toBe(false);
    expect(isLocalDate("2026/02/28")).toBe(false);
  });

  it("ローカル暦日をYYYY-MM-DDで返す", () => {
    expect(todayLocalDate(new Date(2026, 6, 16, 23, 30))).toBe("2026-07-16");
  });
});
