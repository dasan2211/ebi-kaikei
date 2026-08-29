import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  applyThemePreference,
  getStoredThemePreference,
  normalizeThemePreference,
  saveThemePreference,
} from "./theme";

beforeEach(() => {
  window.localStorage.clear();
  applyThemePreference("light");
  delete document.documentElement.dataset.themePreference;
});

describe("theme preference", () => {
  it("defaults unknown and missing values to the system theme", () => {
    expect(normalizeThemePreference(undefined)).toBe("system");
    expect(normalizeThemePreference("unknown")).toBe("system");
    expect(getStoredThemePreference()).toBe("system");
  });

  it("saves and immediately applies an explicit theme", () => {
    saveThemePreference("dark");

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement).toHaveAttribute("data-theme-preference", "dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("follows system theme changes while the system option is selected", () => {
    let onChange: (() => void) | undefined;
    const mediaQuery = {
      matches: true,
      addEventListener: vi.fn((_event: string, listener: () => void) => { onChange = listener; }),
      removeEventListener: vi.fn(),
    };

    applyThemePreference("system", document.documentElement, () => mediaQuery);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    mediaQuery.matches = false;
    onChange?.();
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
});
