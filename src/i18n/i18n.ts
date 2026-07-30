import { parse } from "yaml";
import enYaml from "../locales/en.yaml?raw";
import jaYaml from "../locales/ja.yaml?raw";

export const supportedLocales = ["ja", "en"] as const;
export type Locale = (typeof supportedLocales)[number];
export type TranslationParams = Record<string, string | number>;

type Catalog = Record<string, unknown>;

const catalogs: Record<Locale, Catalog> = {
  ja: parse(jaYaml) as Catalog,
  en: parse(enYaml) as Catalog
};

function findTranslation(catalog: Catalog, key: string): string | undefined {
  const value = key.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Catalog)[segment];
  }, catalog);

  return typeof value === "string" ? value : undefined;
}

function collectKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  return Object.entries(value as Catalog).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "string" ? [path] : collectKeys(child, path);
  });
}

export function normalizeLocale(candidate: string | null | undefined): Locale {
  const language = candidate?.toLowerCase().split("-")[0];
  return language === "en" ? "en" : "ja";
}

export function getCatalogKeys(locale: Locale): string[] {
  return collectKeys(catalogs[locale]).sort();
}

export function translate(locale: Locale, key: string, params: TranslationParams = {}): string {
  const template = findTranslation(catalogs[locale], key);
  if (!template) throw new Error(`Missing translation key: ${locale}.${key}`);

  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}
