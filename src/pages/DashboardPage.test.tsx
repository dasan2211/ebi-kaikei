import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/I18nProvider";
import { DashboardPage } from "./DashboardPage";

const mocks = vi.hoisted(() => ({
  getDashboardSummary: vi.fn()
}));

vi.mock("../lib/tauri", () => ({
  getDashboardSummary: mocks.getDashboardSummary
}));

beforeEach(() => {
  window.localStorage.clear();
  mocks.getDashboardSummary.mockReset().mockResolvedValue({
    draftCount: 3,
    lastPostedDate: "2026-11-02",
    differenceMinor: 250
  });
});

it("選択中の帳簿と年度の集計をホームに表示する", async () => {
  render(
    <I18nProvider>
      <DashboardPage bookId="book-business-income" fiscalYear={2026} onStartJournal={vi.fn()} />
    </I18nProvider>
  );

  expect(await screen.findByText("集計済み")).toBeInTheDocument();
  expect(screen.getByText("3件")).toBeInTheDocument();
  expect(screen.getByText("2026-11-02")).toBeInTheDocument();
  expect(screen.getByText("250円")).toBeInTheDocument();
  expect(mocks.getDashboardSummary).toHaveBeenCalledWith(
    "book-business-income",
    "2026-01-01",
    "2026-12-31"
  );
});

it("集計の取得に失敗したとき再読込できる", async () => {
  const user = userEvent.setup();
  mocks.getDashboardSummary
    .mockRejectedValueOnce(new Error("database unavailable"))
    .mockResolvedValueOnce({ draftCount: 0, lastPostedDate: null, differenceMinor: 0 });
  render(
    <I18nProvider>
      <DashboardPage bookId="book-business-income" fiscalYear={2026} onStartJournal={vi.fn()} />
    </I18nProvider>
  );

  expect(await screen.findByRole("alert")).toHaveTextContent("database unavailable");
  await user.click(screen.getByRole("button", { name: "再読込" }));

  await waitFor(() => expect(mocks.getDashboardSummary).toHaveBeenCalledTimes(2));
  expect(await screen.findByText("集計済み")).toBeInTheDocument();
  expect(screen.getByText("0件")).toBeInTheDocument();
});
