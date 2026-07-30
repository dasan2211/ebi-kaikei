import { useI18n } from "../i18n/context";

const pageKeys = {
  "journal-book": "journal_book",
  ledger: "ledger",
  "trial-balance": "trial_balance",
  settings: "settings"
} as const;

type Props = { page: keyof typeof pageKeys };

export function ComingSoonPage({ page }: Props) {
  const { t } = useI18n();
  const pageKey = pageKeys[page];
  return <section className="page"><div className="page-heading"><div><p className="kicker">{t(`coming_soon.${pageKey}.kicker`)}</p><h1>{t(`coming_soon.${pageKey}.title`)}</h1><p>{t("coming_soon.subtitle")}</p></div></div><div className="empty-state"><span aria-hidden="true">{t("coming_soon.symbol")}</span><h2>{t("coming_soon.empty_title")}</h2><p>{t("coming_soon.empty_description")}</p></div></section>;
}
