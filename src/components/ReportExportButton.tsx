import { useState } from "react";
import { useI18n } from "../i18n/context";
import type { ExportedFile } from "../types/reports";

type Props = {
  disabled?: boolean;
  onExport: () => Promise<ExportedFile>;
};

export function ReportExportButton({ disabled = false, onExport }: Props) {
  const { t } = useI18n();
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ExportedFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setResult(null);
    setError(null);
    try {
      setResult(await onExport());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="report-export-action">
      <button className="secondary-button export-button" type="button" disabled={disabled || exporting} onClick={handleExport}>
        <span aria-hidden="true">↓</span>
        {exporting ? t("reports.export.exporting") : t("reports.export.button")}
      </button>
      {result ? (
        <span className="export-result" role="status" title={result.path}>
          {t("reports.export.success", { fileName: result.fileName, count: result.rowCount })}
        </span>
      ) : null}
      {error ? <span className="export-error" role="alert">{t("reports.export.error", { error })}</span> : null}
    </div>
  );
}
