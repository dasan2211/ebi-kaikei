import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  completeInitialSetup,
  getSetupStatus,
  listAccounts,
  listBooks,
  saveDraftEntry,
  setActiveBook
} from "./tauri";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("Tauri command adapters", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("用途別の勘定科目コマンドを呼び出す", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    await listAccounts("book-business-income");
    expect(invoke).toHaveBeenCalledWith("list_accounts", { bookId: "book-business-income" });
  });

  it("帳簿一覧を取得して選択状態を保存する", async () => {
    vi.mocked(invoke).mockResolvedValue({ books: [], activeBookId: "book-business-income" });
    await listBooks();
    expect(invoke).toHaveBeenCalledWith("list_books");

    await setActiveBook("book-miscellaneous-income");
    expect(invoke).toHaveBeenCalledWith("set_active_book", { bookId: "book-miscellaneous-income" });
  });

  it("初期セットアップ状態を取得する", async () => {
    vi.mocked(invoke).mockResolvedValue({ completed: false, locale: null, defaultAccountCount: 34 });
    await getSetupStatus();
    expect(invoke).toHaveBeenCalledWith("get_setup_status");
  });

  it("選択言語を初期セットアップコマンドへ渡す", async () => {
    vi.mocked(invoke).mockResolvedValue({ completed: true, locale: "en", defaultAccountCount: 34 });
    await completeInitialSetup("en");
    expect(invoke).toHaveBeenCalledWith("complete_initial_setup", { locale: "en" });
  });

  it("仕訳下書きをrequest引数として渡す", async () => {
    vi.mocked(invoke).mockResolvedValue("entry-1");
    const request = {
      transactionDate: "2026-07-16",
      description: "テスト",
      lines: [
        { accountId: "cash", side: "debit" as const, amountMinor: 100 },
        { accountId: "sales", side: "credit" as const, amountMinor: 100 }
      ]
    };
    await expect(saveDraftEntry("book-miscellaneous-income", request)).resolves.toBe("entry-1");
    expect(invoke).toHaveBeenCalledWith("save_draft_entry", {
      bookId: "book-miscellaneous-income",
      request
    });
  });
});
