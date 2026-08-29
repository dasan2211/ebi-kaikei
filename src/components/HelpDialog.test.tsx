import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HelpDialog } from "./HelpDialog";

vi.mock("../i18n/context", () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

describe("HelpDialog", () => {
  it("traps keyboard focus, closes with Escape, and restores the previous focus", () => {
    const previousButton = document.createElement("button");
    document.body.append(previousButton);
    previousButton.focus();
    const onClose = vi.fn();
    const { unmount } = render(<HelpDialog onClose={onClose} onNavigate={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    const closeButton = screen.getByRole("button", { name: "common.close" });
    const settingsButton = screen.getByRole("button", { name: "help.actions.settings" });
    const journalButton = screen.getByRole("button", { name: "help.actions.journal" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(journalButton).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    settingsButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(settingsButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(previousButton).toHaveFocus();
    previousButton.remove();
  });

  it("closes from the backdrop and navigates from both action buttons", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    render(<HelpDialog onClose={onClose} onNavigate={onNavigate} />);

    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.parentElement as HTMLElement;
    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "help.actions.settings" }));
    expect(onNavigate).toHaveBeenLastCalledWith("settings");
    expect(onClose).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "help.actions.journal" }));
    expect(onNavigate).toHaveBeenLastCalledWith("journal");
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
