import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentsPage } from "./AttachmentsPage";

const mocks = vi.hoisted(() => ({
  addAttachment: vi.fn(),
  addEvidenceLink: vi.fn(),
  deleteAttachment: vi.fn(),
  listAttachments: vi.fn(),
  listJournalBook: vi.fn(),
  openEvidenceLink: vi.fn(),
  revealAttachment: vi.fn()
}));

vi.mock("../i18n/context", () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

vi.mock("../lib/tauri", () => mocks);

beforeEach(() => {
  vi.stubGlobal("confirm", vi.fn(() => true));
  mocks.addAttachment.mockReset().mockResolvedValue({});
  mocks.addEvidenceLink.mockReset().mockResolvedValue({});
  mocks.deleteAttachment.mockReset().mockResolvedValue(undefined);
  mocks.listAttachments.mockReset().mockResolvedValue([]);
  mocks.listJournalBook.mockReset().mockResolvedValue({
    items: [{ id: "entry-1", transactionDate: "2026-08-13", description: "Cloud service" }],
    total: 1,
    limit: 500,
    offset: 0
  });
  mocks.openEvidenceLink.mockReset().mockResolvedValue(undefined);
  mocks.revealAttachment.mockReset().mockResolvedValue(undefined);
});

describe("AttachmentsPage", () => {
  it("registers an HTTPS evidence URL after retention is confirmed", async () => {
    render(<AttachmentsPage bookId="book-business-income" fiscalYear={2026} />);
    fireEvent.click(screen.getByRole("tab", { name: "attachments.url_source" }));

    fireEvent.change(await screen.findByRole("textbox", { name: "attachments.url_title" }), {
      target: { value: "Cloud receipt" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "attachments.url" }), {
      target: { value: "https://documents.example.com/receipt/1" }
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "attachments.retention_confirmation" }));
    fireEvent.click(screen.getByRole("button", { name: "attachments.add_url" }));

    await waitFor(() => expect(mocks.addEvidenceLink).toHaveBeenCalledWith(
      "book-business-income",
      "entry-1",
      "Cloud receipt",
      "https://documents.example.com/receipt/1"
    ));
  });

  it("uploads a local evidence file and refreshes the evidence list", async () => {
    const user = userEvent.setup();
    const file = new File([new Uint8Array([1, 2, 3])], "receipt.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer)
    });
    render(<AttachmentsPage bookId="book-business-income" fiscalYear={2026} />);

    await screen.findByRole("option", { name: /Cloud service/ });
    await user.selectOptions(screen.getByRole("combobox"), "entry-1");
    const fileInput = await screen.findByLabelText("attachments.file");
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.submit(fileInput.closest("form") as HTMLFormElement);

    await waitFor(() => expect(mocks.addAttachment).toHaveBeenCalledWith(
      "book-business-income",
      "entry-1",
      "receipt.pdf",
      [1, 2, 3]
    ));
    expect(await screen.findByText("attachments.uploaded")).toBeInTheDocument();
    expect(mocks.listAttachments).toHaveBeenCalledTimes(2);
  });

  it("shows file sizes and opens or deletes file and URL evidence", async () => {
    mocks.listAttachments.mockResolvedValue([
      { id: "file-b", entryId: "entry-1", transactionDate: "2026-08-01", entryDescription: "Small", sourceType: "file", originalName: "small.pdf", mediaType: "application/pdf", sizeBytes: 100, externalUrl: null, createdAt: "2026-08-01T00:00:00Z" },
      { id: "file-kb", entryId: "entry-1", transactionDate: "2026-08-02", entryDescription: "Medium", sourceType: "file", originalName: "medium.pdf", mediaType: "application/pdf", sizeBytes: 2048, externalUrl: null, createdAt: "2026-08-02T00:00:00Z" },
      { id: "file-mb", entryId: "entry-1", transactionDate: "2026-08-03", entryDescription: "Large", sourceType: "file", originalName: "large.pdf", mediaType: "application/pdf", sizeBytes: 2 * 1024 * 1024, externalUrl: null, createdAt: "2026-08-03T00:00:00Z" },
      { id: "url-good", entryId: "entry-1", transactionDate: "2026-08-04", entryDescription: "Cloud", sourceType: "url", originalName: "Cloud receipt", mediaType: null, sizeBytes: null, externalUrl: "https://docs.example.com/receipt", createdAt: "2026-08-04T00:00:00Z" },
      { id: "url-invalid", entryId: "entry-1", transactionDate: "2026-08-05", entryDescription: "Legacy", sourceType: "url", originalName: "Legacy URL", mediaType: null, sizeBytes: null, externalUrl: "not-a-url", createdAt: "2026-08-05T00:00:00Z" }
    ]);
    const user = userEvent.setup();
    render(<AttachmentsPage bookId="book-business-income" fiscalYear={2026} />);

    expect(await screen.findByText("100 B")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(screen.getByText("2.0 MB")).toBeInTheDocument();
    expect(screen.getByText(/docs\.example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/not-a-url/)).toBeInTheDocument();

    const smallRow = screen.getByText("small.pdf").closest("tr") as HTMLElement;
    await user.click(within(smallRow).getByRole("button", { name: "attachments.show_file" }));
    expect(mocks.revealAttachment).toHaveBeenCalledWith("book-business-income", "file-b");

    const urlRow = screen.getByText("Cloud receipt").closest("tr") as HTMLElement;
    await user.click(within(urlRow).getByRole("button", { name: "attachments.open_url" }));
    expect(mocks.openEvidenceLink).toHaveBeenCalledWith("book-business-income", "url-good");

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await user.click(within(smallRow).getByRole("button", { name: "common.delete" }));
    expect(mocks.deleteAttachment).not.toHaveBeenCalled();
    await user.click(within(smallRow).getByRole("button", { name: "common.delete" }));
    expect(mocks.deleteAttachment).toHaveBeenCalledWith("book-business-income", "file-b");
    expect(await screen.findByText("attachments.deleted")).toBeInTheDocument();
    expect(screen.queryByText("small.pdf")).not.toBeInTheDocument();
  });

  it("validates oversized files and unsafe URLs and reports command errors", async () => {
    const user = userEvent.setup();
    render(<AttachmentsPage bookId="book-business-income" fiscalYear={2026} />);

    await screen.findByRole("option", { name: /Cloud service/ });
    await user.selectOptions(screen.getByRole("combobox"), "entry-1");
    const tooLarge = new File([new Uint8Array([1])], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(tooLarge, "size", { value: 20 * 1024 * 1024 + 1 });
    const fileInput = await screen.findByLabelText("attachments.file");
    fireEvent.change(fileInput, { target: { files: [tooLarge] } });
    fireEvent.submit(fileInput.closest("form") as HTMLFormElement);
    expect(await screen.findByText("attachments.too_large")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "attachments.url_source" }));
    await user.type(screen.getByRole("textbox", { name: "attachments.url_title" }), "Unsafe");
    await user.type(screen.getByRole("textbox", { name: "attachments.url" }), "http://example.com");
    await user.click(screen.getByRole("checkbox", { name: "attachments.retention_confirmation" }));
    await user.click(screen.getByRole("button", { name: "attachments.add_url" }));
    expect(await screen.findByText("attachments.url_validation")).toBeInTheDocument();

    mocks.addEvidenceLink.mockRejectedValueOnce("URL登録失敗");
    await user.clear(screen.getByRole("textbox", { name: "attachments.url" }));
    await user.type(screen.getByRole("textbox", { name: "attachments.url" }), "https://example.com");
    await user.click(screen.getByRole("button", { name: "attachments.add_url" }));
    expect(await screen.findByText("URL登録失敗")).toBeInTheDocument();
  });

  it("reports initial and reload failures and shows the empty-year notice", async () => {
    mocks.listJournalBook.mockRejectedValueOnce(new Error("初回読込失敗"));
    const user = userEvent.setup();
    render(<AttachmentsPage bookId="book-business-income" fiscalYear={2026} />);

    expect(await screen.findByText("初回読込失敗")).toBeInTheDocument();
    mocks.listAttachments.mockRejectedValueOnce("再読込失敗");
    await user.click(screen.getByRole("button", { name: "common.reload" }));
    expect(await screen.findByText("再読込失敗")).toBeInTheDocument();

    mocks.listJournalBook.mockResolvedValue({ items: [], total: 0, limit: 500, offset: 0 });
    await user.click(screen.getByRole("button", { name: "common.reload" }));
    expect(await screen.findByText("attachments.no_entries")).toBeInTheDocument();
  });
});
