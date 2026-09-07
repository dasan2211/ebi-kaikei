import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/context";
import { fiscalYearTranslationParams } from "../lib/fiscal-year";
import { addAttachment, addEvidenceLink, deleteAttachment, listAttachments, listJournalBook, openEvidenceLink, revealAttachment } from "../lib/tauri";
import type { Attachment } from "../types/phase4";
import type { JournalBookEntry } from "../types/reports";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function urlHost(value: string | null): string {
  if (!value) return "";
  try { return new URL(value).hostname; } catch { return value; }
}

export function AttachmentsPage({ bookId, fiscalYear }: { bookId: string; fiscalYear: number }) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<JournalBookEntry[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [entryId, setEntryId] = useState("");
  const [sourceType, setSourceType] = useState<"file" | "url">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [linkTitle, setLinkTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [retentionConfirmed, setRetentionConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const requestData = useCallback(() => Promise.all([
    listJournalBook(bookId, { startDate: `${fiscalYear}-01-01`, endDate: `${fiscalYear}-12-31`, limit: 500, offset: 0 }),
    listAttachments(bookId)
  ]), [bookId, fiscalYear]);

  async function load() {
    setLoading(true);
    try {
      const [journal, files] = await requestData();
      setEntries(journal.items);
      setAttachments(files);
      setEntryId((current) => current || journal.items[0]?.id || "");
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    requestData()
      .then(([journal, files]) => {
        if (!active) return;
        setEntries(journal.items);
        setAttachments(files);
        setEntryId((current) => current || journal.items[0]?.id || "");
      })
      .catch((error: unknown) => { if (active) setMessage({ kind: "error", text: errorText(error) }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestData]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!entryId) return;
    if (sourceType === "file" && !selectedFile) return;
    if (sourceType === "file" && selectedFile && selectedFile.size > MAX_FILE_BYTES) {
      setMessage({ kind: "error", text: t("attachments.too_large") });
      return;
    }
    if (sourceType === "url" && (!externalUrl.trim().startsWith("https://") || !linkTitle.trim() || !retentionConfirmed)) {
      setMessage({ kind: "error", text: t("attachments.url_validation") });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (sourceType === "file" && selectedFile) {
        const data = Array.from(new Uint8Array(await selectedFile.arrayBuffer()));
        await addAttachment(bookId, entryId, selectedFile.name, data);
      } else {
        await addEvidenceLink(bookId, entryId, linkTitle, externalUrl);
      }
      setAttachments(await listAttachments(bookId));
      setSelectedFile(null);
      setLinkTitle("");
      setExternalUrl("");
      setRetentionConfirmed(false);
      if (fileRef.current) fileRef.current.value = "";
      setMessage({ kind: "success", text: t(sourceType === "file" ? "attachments.uploaded" : "attachments.url_added") });
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen(attachment: Attachment) {
    setMessage(null);
    try {
      if (attachment.sourceType === "url") {
        await openEvidenceLink(bookId, attachment.id);
      } else {
        await revealAttachment(bookId, attachment.id);
      }
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
    }
  }

  async function handleDelete(attachment: Attachment) {
    if (!window.confirm(t("attachments.confirm_delete", { name: attachment.originalName }))) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteAttachment(bookId, attachment.id);
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      setMessage({ kind: "success", text: t("attachments.deleted") });
    } catch (error) {
      setMessage({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page attachments-page" aria-labelledby="attachments-title">
      <div className="page-heading compact-heading"><div><p className="kicker">{t("attachments.kicker")}</p><h1 id="attachments-title">{t("attachments.title")}</h1><p>{t("attachments.subtitle")}</p></div></div>
      {message ? <p className={`operation-message ${message.kind}`} role="status">{message.text}</p> : null}

      <section className="feature-card" aria-labelledby="attachment-upload-title">
        <div className="feature-card-heading"><div><h2 id="attachment-upload-title">{t("attachments.upload_title")}</h2><p>{t("attachments.formats")}</p></div></div>
        <div className="attachment-source-switch" role="tablist" aria-label={t("attachments.source_type")}><button type="button" role="tab" aria-selected={sourceType === "file"} className={sourceType === "file" ? "active" : ""} onClick={() => { setSourceType("file"); setMessage(null); }}>{t("attachments.file_source")}</button><button type="button" role="tab" aria-selected={sourceType === "url"} className={sourceType === "url" ? "active" : ""} onClick={() => { setSourceType("url"); setMessage(null); }}>{t("attachments.url_source")}</button></div>
        <form className={`attachment-form ${sourceType === "url" ? "url-form" : ""}`} onSubmit={handleAdd}>
          <label><span>{t("attachments.journal_entry")}</span><select required value={entryId} onChange={(event) => setEntryId(event.target.value)}><option value="">{t("attachments.select_entry")}</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.transactionDate} · {entry.description}</option>)}</select></label>
          {sourceType === "file" ? <label><span>{t("attachments.file")}</span><input ref={fileRef} required type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} /></label> : <><label><span>{t("attachments.url_title")}</span><input required maxLength={255} value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder={t("attachments.url_title_placeholder")} /></label><label className="evidence-url-field"><span>{t("attachments.url")}</span><input required type="url" maxLength={2048} value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://" /></label><div className="external-evidence-notice"><strong>{t("attachments.legal_notice_title")}</strong><p>{t("attachments.legal_notice")}</p><label><input type="checkbox" checked={retentionConfirmed} onChange={(event) => setRetentionConfirmed(event.target.checked)} /> <span>{t("attachments.retention_confirmation")}</span></label></div></>}
          <button className="primary-button" type="submit" disabled={busy || !entryId || (sourceType === "file" ? !selectedFile : !linkTitle.trim() || !externalUrl.trim() || !retentionConfirmed)}>{busy ? t("common.processing") : t(sourceType === "file" ? "attachments.upload" : "attachments.add_url")}</button>
        </form>
        {!loading && entries.length === 0 ? <p className="feature-note">{t("attachments.no_entries", fiscalYearTranslationParams(fiscalYear))}</p> : null}
      </section>

      <section className="feature-card" aria-labelledby="attachment-list-title">
        <div className="feature-card-heading"><div><h2 id="attachment-list-title">{t("attachments.list_title")}</h2><p>{t("attachments.storage_note")}</p></div><button className="secondary-button" type="button" disabled={loading} onClick={() => void load()}>{t("common.reload")}</button></div>
        {loading ? <p role="status">{t("common.loading")}</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>{t("attachments.file")}</th><th>{t("attachments.journal_entry")}</th><th>{t("attachments.size")}</th><th>{t("attachments.added_at")}</th><th>{t("common.actions")}</th></tr></thead><tbody>
          {attachments.length ? attachments.map((attachment) => <tr key={attachment.id}><td><strong>{attachment.originalName}</strong><small className="table-subtext">{attachment.sourceType === "url" ? `${t("attachments.external_url")} · ${urlHost(attachment.externalUrl)}` : attachment.mediaType}</small></td><td>{attachment.transactionDate}<small className="table-subtext">{attachment.entryDescription}</small></td><td>{attachment.sizeBytes == null ? "—" : fileSize(attachment.sizeBytes)}</td><td>{attachment.createdAt.slice(0, 10)}</td><td><div className="table-actions"><button className="table-action" type="button" onClick={() => void handleOpen(attachment)}>{t(attachment.sourceType === "url" ? "attachments.open_url" : "attachments.show_file")}</button><button className="table-action danger" type="button" disabled={busy} onClick={() => void handleDelete(attachment)}>{t("common.delete")}</button></div></td></tr>) : <tr><td colSpan={5} className="empty-cell">{t("attachments.empty")}</td></tr>}
        </tbody></table></div>}
      </section>
    </section>
  );
}
