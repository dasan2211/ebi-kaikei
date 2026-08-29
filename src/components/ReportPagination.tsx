import { useI18n } from "../i18n/context";

type Props = {
  limit: number;
  offset: number;
  total: number;
  onPageChange: (offset: number) => void;
};

export function ReportPagination({ limit, offset, total, onPageChange }: Props) {
  const { t } = useI18n();
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);

  return (
    <nav className="report-pagination" aria-label={t("reports.pagination.aria_label")}>
      <span>{t("reports.pagination.range", { first, last, total })}</span>
      <div>
        <button className="secondary-button" type="button" disabled={offset === 0} onClick={() => onPageChange(Math.max(0, offset - limit))}>
          {t("reports.pagination.previous")}
        </button>
        <button className="secondary-button" type="button" disabled={offset + limit >= total} onClick={() => onPageChange(offset + limit)}>
          {t("reports.pagination.next")}
        </button>
      </div>
    </nav>
  );
}
