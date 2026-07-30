import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const mocks = vi.hoisted(() => ({
  completeInitialSetup: vi.fn(),
  getSetupStatus: vi.fn(),
  listBooks: vi.fn(),
  listAccounts: vi.fn(),
  saveDraftEntry: vi.fn(),
  setActiveBook: vi.fn()
}));

vi.mock("./lib/tauri", () => ({
  completeInitialSetup: mocks.completeInitialSetup,
  getSetupStatus: mocks.getSetupStatus,
  listBooks: mocks.listBooks,
  listAccounts: mocks.listAccounts,
  saveDraftEntry: mocks.saveDraftEntry,
  setActiveBook: mocks.setActiveBook
}));

const books = [
  { id: "book-business-income", incomeType: "business" },
  { id: "book-miscellaneous-income", incomeType: "miscellaneous" }
] as const;

const accounts = [
  { id: "cash", code: "1000", name: "普通預金", accountType: "asset", normalSide: "debit", isActive: true },
  { id: "sales", code: "4000", name: "売上高", accountType: "revenue", normalSide: "credit", isActive: true }
] as const;

beforeEach(() => {
  window.localStorage.clear();
  mocks.getSetupStatus.mockReset().mockResolvedValue({ completed: true, locale: "ja", defaultAccountCount: 34 });
  mocks.completeInitialSetup.mockReset().mockResolvedValue({ completed: true, locale: "ja", defaultAccountCount: 34 });
  mocks.listBooks.mockReset().mockResolvedValue({ books, activeBookId: "book-business-income" });
  mocks.listAccounts.mockReset().mockResolvedValue(accounts);
  mocks.saveDraftEntry.mockReset().mockResolvedValue("draft-12345678");
  mocks.setActiveBook.mockReset().mockImplementation((bookId: string) => Promise.resolve({ books, activeBookId: bookId }));
});

describe("App", () => {
  it("初回セットアップでは言語選択を必須にする", async () => {
    mocks.getSetupStatus.mockResolvedValueOnce({ completed: false, locale: null, defaultAccountCount: 34 });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "はじめに、言語を選択" })).toBeInTheDocument();
    const continueButton = screen.getByRole("button", { name: /この言語で始める/ });
    expect(continueButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /日本語/ }));
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);

    expect(mocks.completeInitialSetup).toHaveBeenCalledWith("ja");
    expect(await screen.findByRole("heading", { name: "今日の会計" })).toBeInTheDocument();
  });

  it("英語でセットアップすると表示言語と保存言語を英語にする", async () => {
    mocks.getSetupStatus.mockResolvedValueOnce({ completed: false, locale: null, defaultAccountCount: 34 });
    mocks.completeInitialSetup.mockResolvedValueOnce({ completed: true, locale: "en", defaultAccountCount: 34 });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /English/ }));
    await user.click(screen.getByRole("button", { name: /Start in this language/ }));

    expect(mocks.completeInitialSetup).toHaveBeenCalledWith("en");
    expect(await screen.findByRole("heading", { name: "Today's accounting" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem("ebi-kaikei.locale")).toBe("en");
  });

  it("保存済みのセットアップ言語を起動時に復元する", async () => {
    mocks.getSetupStatus.mockResolvedValueOnce({ completed: true, locale: "en", defaultAccountCount: 34 });
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Today's accounting" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("en");
  });

  it("会計作業の現在地と主要画面を表示する", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "今日の会計" })).toBeInTheDocument();
    expect(screen.getByLabelText("EBI Kaikei")).toBeInTheDocument();
    expect(document.title).toBe("EBI Kaikei");
    const navigation = screen.getByRole("navigation", { name: "主要メニュー" });
    expect(within(navigation).getByRole("button", { name: "仕訳を入力" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "帳簿" })).toHaveValue("book-business-income");
  });

  it("事業所得と雑所得の帳簿を切り替える", async () => {
    const user = userEvent.setup();
    render(<App />);

    const bookSelect = await screen.findByRole("combobox", { name: "帳簿" });
    await user.selectOptions(bookSelect, "book-miscellaneous-income");

    expect(mocks.setActiveBook).toHaveBeenCalledWith("book-miscellaneous-income");
    expect(bookSelect).toHaveValue("book-miscellaneous-income");

    const navigation = screen.getByRole("navigation", { name: "主要メニュー" });
    await user.click(within(navigation).getByRole("button", { name: "勘定科目" }));
    expect(mocks.listAccounts).toHaveBeenLastCalledWith("book-miscellaneous-income");
  });

  it("サイドバーから勘定科目一覧へ移動できる", async () => {
    const user = userEvent.setup();
    render(<App />);

    const navigation = await screen.findByRole("navigation", { name: "主要メニュー" });
    await user.click(within(navigation).getByRole("button", { name: "勘定科目" }));

    expect(await screen.findByRole("heading", { name: "勘定科目" })).toBeInTheDocument();
    expect(await screen.findByText("普通預金")).toBeInTheDocument();
    expect(screen.getByText("売上高")).toBeInTheDocument();
  });

  it("仕訳入力で貸借差額を即時に表示する", async () => {
    const user = userEvent.setup();
    render(<App />);

    const navigation = await screen.findByRole("navigation", { name: "主要メニュー" });
    await user.click(within(navigation).getByRole("button", { name: "仕訳を入力" }));
    const amountInputs = await screen.findAllByRole("textbox", { name: "金額" });
    await user.type(amountInputs[0], "1200");

    expect(screen.getByText("差額 1,200円")).toBeInTheDocument();
    await user.type(amountInputs[1], "1200");
    expect(screen.getByText("貸借一致")).toBeInTheDocument();
  });

  it("貸借一致した仕訳をRustコマンドへ渡して保存する", async () => {
    const user = userEvent.setup();
    render(<App />);
    const navigation = await screen.findByRole("navigation", { name: "主要メニュー" });
    await user.click(within(navigation).getByRole("button", { name: "仕訳を入力" }));

    const accountInputs = await screen.findAllByRole("combobox", { name: "勘定科目" });
    const amountInputs = screen.getAllByRole("textbox", { name: "金額" });
    await user.selectOptions(accountInputs[0], "cash");
    await user.selectOptions(accountInputs[1], "sales");
    await user.type(screen.getByPlaceholderText("取引の内容を入力"), "売上入金");
    await user.type(amountInputs[0], "5000");
    await user.type(amountInputs[1], "5000");
    await user.click(screen.getByRole("button", { name: /下書きを保存/ }));

    expect(mocks.saveDraftEntry).toHaveBeenCalledWith("book-business-income", expect.objectContaining({
      description: "売上入金",
      lines: expect.arrayContaining([
        expect.objectContaining({ accountId: "cash", side: "debit", amountMinor: 5000 }),
        expect.objectContaining({ accountId: "sales", side: "credit", amountMinor: 5000 })
      ])
    }));
    expect(await screen.findByText("下書きを保存しました（draft-12）")).toBeInTheDocument();
  });

  it("勘定科目の読込失敗を画面上で通知する", async () => {
    mocks.listAccounts.mockRejectedValueOnce(new Error("DB unavailable"));
    const user = userEvent.setup();
    render(<App />);
    const navigation = await screen.findByRole("navigation", { name: "主要メニュー" });
    await user.click(within(navigation).getByRole("button", { name: "勘定科目" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("DB unavailable");
  });

  it("通常画面の言語切替を端末内へ保存する", async () => {
    const user = userEvent.setup();
    render(<App />);

    const languageSelect = await screen.findByRole("combobox", { name: "言語" });
    await user.selectOptions(languageSelect, "en");

    expect(await screen.findByRole("heading", { name: "Today's accounting" })).toBeInTheDocument();
    expect(window.localStorage.getItem("ebi-kaikei.locale")).toBe("en");
  });
});
