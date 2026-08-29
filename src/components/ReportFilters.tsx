import { useI18n } from "../i18n/context";
import type { JournalEntryStatus } from "../types/reports";

export type ReportFilterValue = {
  startDate: string;
  endDate: string;
  status: "" | JournalEntryStatus;
  query: string;
};

type Props = {
  value: ReportFilterValue;
  onChange: (value: ReportFilterValue) => void;
};

export function ReportFilters({ value, onChange }: Props) {
  const { t } = useI18n();

  return (
    <div className="report-filters">
      <label className="report-search-field">
        <span>{t("reports.filters.search")}</span>
        <input
          type="search"
          value={value.query}
          maxLength={100}
          placeholder={t("reports.filters.search_placeholder")}
          onChange={(event) => onChange({ ...value, query: event.target.value })}
        />
      </label>
      <label>
        <span>{t("reports.filters.start_date")}</span>
        <input type="date" value={value.startDate} onChange={(event) => onChange({ ...value, startDate: event.target.value })} />
      </label>
      <label>
        <span>{t("reports.filters.end_date")}</span>
        <input type="date" value={value.endDate} onChange={(event) => onChange({ ...value, endDate: event.target.value })} />
      </label>
      <label>
        <span>{t("reports.filters.status")}</span>
        <select value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as ReportFilterValue["status"] })}>
          <option value="">{t("reports.status.all")}</option>
          <option value="draft">{t("reports.status.draft")}</option>
          <option value="posted">{t("reports.status.posted")}</option>
          <option value="reversed">{t("reports.status.reversed")}</option>
        </select>
      </label>
    </div>
  );
}
