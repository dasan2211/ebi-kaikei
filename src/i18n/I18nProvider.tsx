import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nContext, LOCALE_STORAGE_KEY } from "./context";
import { normalizeLocale, translate, type Locale, type TranslationParams } from "./i18n";

function getInitialLocale(): Locale {
  const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return storedLocale ? normalizeLocale(storedLocale) : "ja";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((nextLocale: Locale) => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    setLocaleState(nextLocale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, "meta.app_name");
    document.querySelector('meta[name="description"]')?.setAttribute("content", translate(locale, "meta.description"));
  }, [locale]);

  const t = useCallback((key: string, params?: TranslationParams) => translate(locale, key, params), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
