import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/I18nProvider";
import type { Book } from "../types/book";
import { AppShell } from "./AppShell";

const book: Book = {
  id: "book-business-income",
  name: "事業所得",
  consumptionTaxStatus: "taxable"
};

function renderAppShell(onNavigate = vi.fn(), fiscalYear = 2026) {
  render(
    <I18nProvider>
      <AppShell
        activeBook={book}
        activePage="dashboard"
        books={[book]}
        bookError={null}
        fiscalYear={fiscalYear}
        isSwitchingBook={false}
        onBookChange={vi.fn()}
        onFiscalYearChange={vi.fn()}
        onNavigate={onNavigate}
      >
        <p>page content</p>
      </AppShell>
    </I18nProvider>
  );
  return onNavigate;
}

it("今年度を選択していると年度表示を強調する", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 14));

  try {
    renderAppShell();

    expect(screen.getByText("今年度")).toBeInTheDocument();
    expect(screen.getByText("2026年度（令和8年度）")).toHaveAttribute("aria-current", "date");
  } finally {
    vi.useRealTimers();
  }
});

it("右上のヘルプボタンからガイドを開いて主要画面へ移動できる", async () => {
  const user = userEvent.setup();
  const onNavigate = renderAppShell();

  const helpButton = screen.getByRole("button", { name: "ヘルプ" });
  await user.click(helpButton);

  const dialog = screen.getByRole("dialog", { name: "EBI会計の使い方" });
  expect(within(dialog).getByText("キーボード操作")).toBeInTheDocument();
  expect(helpButton).toHaveAttribute("aria-expanded", "true");

  await user.click(within(dialog).getByRole("button", { name: "仕訳入力へ" }));

  expect(onNavigate).toHaveBeenCalledWith("journal");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(helpButton).toHaveFocus();
});

it("ヘルプはEscキーで閉じられる", async () => {
  const user = userEvent.setup();
  renderAppShell();

  const helpButton = screen.getByRole("button", { name: "ヘルプ" });
  await user.click(helpButton);
  await user.keyboard("{Escape}");

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(helpButton).toHaveFocus();
});
