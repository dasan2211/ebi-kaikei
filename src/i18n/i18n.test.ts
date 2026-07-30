import { describe, expect, it } from "vitest";
import { getCatalogKeys, normalizeLocale, translate } from "./i18n";

describe("i18n", () => {
  it("日本語と英語のYAMLが同じ翻訳キーを持つ", () => {
    expect(getCatalogKeys("en")).toEqual(getCatalogKeys("ja"));
  });

  it("YAML内のプレースホルダーへ値を埋め込む", () => {
    expect(translate("ja", "accounts.count", { count: 12 })).toBe("12 科目");
    expect(translate("en", "accounts.count", { count: 12 })).toBe("12 accounts");
  });

  it("対応するブラウザー言語だけを正規化し、未対応言語は日本語へ戻す", () => {
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("ja-JP")).toBe("ja");
    expect(normalizeLocale("fr-FR")).toBe("ja");
  });
});
