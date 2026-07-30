import { useState, type FormEvent } from "react";
import { useI18n } from "../i18n/context";
import type { Locale } from "../i18n/i18n";

type Props = {
  accountCount: number;
  error: string | null;
  isSaving: boolean;
  onComplete: (locale: Locale) => Promise<void>;
};

export function InitialSetupPage({ accountCount, error, isSaving, onComplete }: Props) {
  const { setLocale, t } = useI18n();
  const [selectedLocale, setSelectedLocale] = useState<Locale | null>(null);

  const selectLocale = (locale: Locale) => {
    setSelectedLocale(locale);
    setLocale(locale);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (selectedLocale) void onComplete(selectedLocale);
  };

  return (
    <main className="setup-page">
      <section className="setup-card" aria-labelledby="setup-title">
        <div className="setup-brand" aria-hidden="true">
          <span className="setup-brand-mark">{t("meta.brand_mark")}</span>
          <span>{t("meta.app_name")}</span>
        </div>

        <p className="kicker">{t("setup.kicker")}</p>
        <h1 id="setup-title">{t("setup.title")}</h1>
        <p className="setup-description">{t("setup.description")}</p>

        <form onSubmit={handleSubmit}>
          <fieldset className="language-options">
            <legend>{t("setup.language_legend")}</legend>
            <button
              aria-pressed={selectedLocale === "ja"}
              className={selectedLocale === "ja" ? "language-option selected" : "language-option"}
              onClick={() => selectLocale("ja")}
              type="button"
            >
              <span className="language-code" aria-hidden="true">JA</span>
              <span>
                <strong lang="ja">日本語</strong>
                <small>{t("setup.ja_description")}</small>
              </span>
              <span className="selection-mark" aria-hidden="true">{selectedLocale === "ja" ? "✓" : ""}</span>
            </button>
            <button
              aria-pressed={selectedLocale === "en"}
              className={selectedLocale === "en" ? "language-option selected" : "language-option"}
              onClick={() => selectLocale("en")}
              type="button"
            >
              <span className="language-code" aria-hidden="true">EN</span>
              <span>
                <strong lang="en">English</strong>
                <small>{t("setup.en_description")}</small>
              </span>
              <span className="selection-mark" aria-hidden="true">{selectedLocale === "en" ? "✓" : ""}</span>
            </button>
          </fieldset>

          <div className="setup-note">
            <span aria-hidden="true">帳</span>
            <p>
              <strong>{t("setup.accounts_title", { count: accountCount })}</strong>
              <small>{t("setup.accounts_description")}</small>
            </p>
          </div>

          {error ? <p className="setup-error" role="alert">{t("setup.error", { error })}</p> : null}

          <button className="primary-button setup-submit" disabled={!selectedLocale || isSaving} type="submit">
            {isSaving ? t("setup.saving") : t("setup.continue")}
            <span aria-hidden="true">→</span>
          </button>
        </form>
      </section>
      <p className="setup-local-note">{t("setup.local_note")}</p>
    </main>
  );
}
