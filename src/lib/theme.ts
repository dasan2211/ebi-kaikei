import type { ThemePreference } from "../types/settings";

export const THEME_STORAGE_KEY = "ebi-kaikei.theme";

type ThemeMediaQuery = Pick<MediaQueryList, "matches" | "addEventListener" | "removeEventListener">;
type MatchMedia = (query: string) => ThemeMediaQuery;

let stopWatchingSystemTheme: (() => void) | null = null;

export function normalizeThemePreference(value: string | null | undefined): ThemePreference {
  return value === "dark" || value === "light" ? value : "system";
}

export function getStoredThemePreference(storage: Storage = window.localStorage): ThemePreference {
  return normalizeThemePreference(storage.getItem(THEME_STORAGE_KEY));
}

function browserMatchMedia(): MatchMedia | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
  return window.matchMedia.bind(window);
}

export function applyThemePreference(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
  matchMedia: MatchMedia | undefined = browserMatchMedia(),
): void {
  stopWatchingSystemTheme?.();
  stopWatchingSystemTheme = null;

  root.dataset.themePreference = preference;

  if (preference !== "system") {
    root.dataset.theme = preference;
    return;
  }

  const systemTheme = matchMedia?.("(prefers-color-scheme: dark)");
  const updateTheme = () => {
    root.dataset.theme = systemTheme?.matches ? "dark" : "light";
  };

  updateTheme();
  systemTheme?.addEventListener("change", updateTheme);
  if (systemTheme) {
    stopWatchingSystemTheme = () => systemTheme.removeEventListener("change", updateTheme);
  }
}

export function saveThemePreference(
  preference: ThemePreference,
  storage: Storage = window.localStorage,
): void {
  storage.setItem(THEME_STORAGE_KEY, preference);
  applyThemePreference(preference);
}
