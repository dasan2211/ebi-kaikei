import type { FontFamily } from "../types/settings";

export const FONT_FAMILY_STORAGE_KEY = "ebi-kaikei.font-family";

export function normalizeFontFamily(value: string | null | undefined): FontFamily {
  return value === "mincho" ? "mincho" : "gothic";
}

export function getStoredFontFamily(storage: Storage = window.localStorage): FontFamily {
  return normalizeFontFamily(storage.getItem(FONT_FAMILY_STORAGE_KEY));
}

export function applyFontFamily(fontFamily: FontFamily, root: HTMLElement = document.documentElement): void {
  root.dataset.fontFamily = fontFamily;
}

export function saveFontFamily(fontFamily: FontFamily, storage: Storage = window.localStorage): void {
  storage.setItem(FONT_FAMILY_STORAGE_KEY, fontFamily);
  applyFontFamily(fontFamily);
}
