import { invoke } from "@tauri-apps/api/core";
import type { Account } from "../types/account";
import type { BookState } from "../types/book";
import type { DraftJournalEntry } from "../types/journal";

export type SetupStatus = {
  completed: boolean;
  locale: "ja" | "en" | null;
  defaultAccountCount: number;
};

function isInitialSetupPreview(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "initial-setup";
}

export function getSetupStatus(): Promise<SetupStatus> {
  if (isInitialSetupPreview()) {
    return Promise.resolve({ completed: false, locale: null, defaultAccountCount: 34 });
  }
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "dashboard") {
    return Promise.resolve({ completed: true, locale: "ja", defaultAccountCount: 34 });
  }
  return invoke<SetupStatus>("get_setup_status");
}

export function completeInitialSetup(locale: "ja" | "en"): Promise<SetupStatus> {
  if (isInitialSetupPreview()) {
    return Promise.resolve({ completed: true, locale, defaultAccountCount: 34 });
  }
  return invoke<SetupStatus>("complete_initial_setup", { locale });
}

const previewBookState: BookState = {
  books: [
    { id: "book-business-income", incomeType: "business" },
    { id: "book-miscellaneous-income", incomeType: "miscellaneous" }
  ],
  activeBookId: "book-business-income"
};

export function listBooks(): Promise<BookState> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview")) {
    return Promise.resolve(previewBookState);
  }
  return invoke<BookState>("list_books");
}

export function setActiveBook(bookId: string): Promise<BookState> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview")) {
    return Promise.resolve({ ...previewBookState, activeBookId: bookId });
  }
  return invoke<BookState>("set_active_book", { bookId });
}

export function listAccounts(bookId: string): Promise<Account[]> {
  return invoke<Account[]>("list_accounts", { bookId });
}

export function saveDraftEntry(bookId: string, request: DraftJournalEntry): Promise<string> {
  return invoke<string>("save_draft_entry", { bookId, request });
}
