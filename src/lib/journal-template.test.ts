import { describe, expect, it } from "vitest";
import { expandJournalTemplate } from "./journal-template";

describe("expandJournalTemplate", () => {
  it("expands the previous month with zero padding", () => {
    expect(expandJournalTemplate("{MM-1}月授業報酬", "2026-08-13")).toBe("07月授業報酬");
  });

  it("wraps January back to December", () => {
    expect(expandJournalTemplate("{MM-1}月授業報酬", "2026-01-08")).toBe("12月授業報酬");
  });

  it("supports the current month, positive offsets, and repeated tokens", () => {
    expect(expandJournalTemplate("{MM}/{MM+5}/{MM-2}", "2026-10-01")).toBe("10/03/08");
  });

  it("expands year, two-digit year, unpadded month, and day from the transaction date", () => {
    expect(expandJournalTemplate("{YYYY}/{YY}/{M}/{MM}/{DD}", "2026-08-03")).toBe("2026/26/8/08/03");
  });

  it("expands hours, minutes, and seconds from the local application time", () => {
    const appliedAt = new Date(2026, 7, 3, 5, 6, 7);
    expect(expandJournalTemplate("{hh}:{mm}:{ss}", "2026-08-03", appliedAt)).toBe("05:06:07");
  });

  it("leaves unknown and case-sensitive tokens unchanged", () => {
    expect(expandJournalTemplate("{dd} {HH} {unknown}", "2026-08-03")).toBe("{dd} {HH} {unknown}");
  });

  it("leaves text unchanged when the transaction date is invalid", () => {
    expect(expandJournalTemplate("{MM-1}月", "2026-13-01")).toBe("{MM-1}月");
  });
});
