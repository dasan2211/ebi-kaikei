import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportExportButton } from "./ReportExportButton";

vi.mock("../i18n/context", () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key
  })
}));

describe("ReportExportButton", () => {
  it("disables the button while exporting and reports the exported file", async () => {
    let resolveExport: ((value: { path: string; fileName: string; rowCount: number }) => void) | undefined;
    const onExport = vi.fn(() => new Promise<{ path: string; fileName: string; rowCount: number }>((resolve) => {
      resolveExport = resolve;
    }));
    const user = userEvent.setup();
    render(<ReportExportButton onExport={onExport} />);

    const button = screen.getByRole("button", { name: /reports.export.button/ });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(screen.getByRole("button", { name: /reports.export.exporting/ })).toBeDisabled();

    resolveExport?.({ path: "C:\\Exports\\journal.csv", fileName: "journal.csv", rowCount: 12 });
    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("title", "C:\\Exports\\journal.csv");
    expect(status).toHaveTextContent("journal.csv");
    expect(button).toBeEnabled();
  });

  it("reports Error and non-Error rejections and clears an earlier error", async () => {
    const onExport = vi.fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockRejectedValueOnce("permission denied")
      .mockResolvedValueOnce({ path: "/tmp/report.csv", fileName: "report.csv", rowCount: 1 });
    const user = userEvent.setup();
    render(<ReportExportButton onExport={onExport} />);
    const button = screen.getByRole("button", { name: /reports.export.button/ });

    await user.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("disk full");
    await user.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("permission denied");
    await user.click(button);
    await screen.findByRole("status");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("honors the disabled property", () => {
    render(<ReportExportButton disabled onExport={vi.fn()} />);
    expect(screen.getByRole("button", { name: /reports.export.button/ })).toBeDisabled();
  });
});
