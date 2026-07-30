import { useEffect, useState } from "react";
import { useI18n } from "../i18n/context";
import { listAccounts } from "../lib/tauri";
import type { Account } from "../types/account";

export function AccountsPage({ bookId }: { bookId: string }) {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listAccounts(bookId)
      .then((items) => active && setAccounts(items))
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : String(reason)));
    return () => { active = false; };
  }, [bookId]);

  return (
    <section className="page" aria-labelledby="accounts-title">
      <div className="page-heading">
        <div><p className="kicker">{t("accounts.kicker")}</p><h1 id="accounts-title">{t("accounts.title")}</h1><p>{t("accounts.subtitle")}</p></div>
        <button className="primary-button" type="button" disabled><span aria-hidden="true">＋</span> {t("accounts.add")}</button>
      </div>

      <div className="table-card">
        <div className="table-toolbar">
          <label className="search-field"><span aria-hidden="true">⌕</span><span className="sr-only">{t("accounts.search_label")}</span><input placeholder={t("accounts.search_placeholder")} /></label>
          <span className="row-count">{t("accounts.count", { count: accounts.length })}</span>
        </div>
        {error ? <p className="error-banner" role="alert">{t("accounts.load_error", { error })}</p> : null}
        <div className="table-scroll">
          <table>
            <thead><tr><th>{t("accounts.columns.code")}</th><th>{t("accounts.columns.name")}</th><th>{t("accounts.columns.type")}</th><th>{t("accounts.columns.normal_side")}</th><th>{t("accounts.columns.status")}</th></tr></thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td className="account-code">{account.code}</td>
                  <td className="account-name">{account.name}</td>
                  <td>{t(`account_types.${account.accountType}`)}</td>
                  <td>{t(account.normalSide === "debit" ? "common.debit" : "common.credit")}</td>
                  <td><span className={account.isActive ? "state active-state" : "state"}>{t(account.isActive ? "accounts.status.active" : "accounts.status.inactive")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
