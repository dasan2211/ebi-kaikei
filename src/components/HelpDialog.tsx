import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/context";

type HelpDestination = "journal" | "settings";

type Props = {
  onClose: () => void;
  onNavigate: (page: HelpDestination) => void;
};

export function HelpDialog({ onClose, onNavigate }: Props) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    return () => previousFocus?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? []);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  function navigate(page: HelpDestination) {
    onNavigate(page);
    onClose();
  }

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={handleBackdropClick}>
      <div
        ref={dialogRef}
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
        aria-describedby="help-dialog-description"
        onKeyDown={handleKeyDown}
      >
        <header className="help-dialog-header">
          <div>
            <p className="kicker">{t("help.kicker")}</p>
            <h2 id="help-dialog-title">{t("help.title")}</h2>
          </div>
          <button ref={closeButtonRef} className="dialog-close" type="button" aria-label={t("common.close")} onClick={onClose}>×</button>
        </header>

        <div className="help-dialog-body">
          <p id="help-dialog-description" className="help-introduction">{t("help.introduction")}</p>
          <div className="help-guide-grid">
            <section>
              <span aria-hidden="true">01</span>
              <h3>{t("help.navigation.title")}</h3>
              <p>{t("help.navigation.description")}</p>
            </section>
            <section>
              <span aria-hidden="true">02</span>
              <h3>{t("help.journal.title")}</h3>
              <p>{t("help.journal.description")}</p>
            </section>
            <section>
              <span aria-hidden="true">03</span>
              <h3>{t("help.backup.title")}</h3>
              <p>{t("help.backup.description")}</p>
            </section>
          </div>

          <section className="help-shortcuts" aria-labelledby="help-shortcuts-title">
            <h3 id="help-shortcuts-title">{t("help.shortcuts.title")}</h3>
            <dl>
              <div><dt><kbd>Tab</kbd></dt><dd>{t("help.shortcuts.next")}</dd></div>
              <div><dt><kbd>Shift</kbd> + <kbd>Tab</kbd></dt><dd>{t("help.shortcuts.previous")}</dd></div>
              <div><dt><kbd>Esc</kbd></dt><dd>{t("help.shortcuts.close")}</dd></div>
              <div><dt><kbd>YYYY-MM-DD</kbd></dt><dd>{t("help.shortcuts.date")}</dd></div>
            </dl>
          </section>
        </div>

        <footer className="help-dialog-actions">
          <button className="secondary-button" type="button" onClick={() => navigate("settings")}>{t("help.actions.settings")}</button>
          <button className="primary-button" type="button" onClick={() => navigate("journal")}>{t("help.actions.journal")}</button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
