import { beforeEach, describe, expect, it } from "vitest";
import {
  FONT_FAMILY_STORAGE_KEY,
  applyFontFamily,
  getStoredFontFamily,
  normalizeFontFamily
} from "./font-family";

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.fontFamily;
});

describe("font family preference", () => {
  it("defaults unknown and missing values to gothic", () => {
    expect(normalizeFontFamily(undefined)).toBe("gothic");
    expect(normalizeFontFamily("unknown")).toBe("gothic");
    expect(getStoredFontFamily()).toBe("gothic");
  });

  it("restores and applies a saved mincho preference", () => {
    window.localStorage.setItem(FONT_FAMILY_STORAGE_KEY, "mincho");

    const fontFamily = getStoredFontFamily();
    applyFontFamily(fontFamily);

    expect(fontFamily).toBe("mincho");
    expect(document.documentElement).toHaveAttribute("data-font-family", "mincho");
  });
});
