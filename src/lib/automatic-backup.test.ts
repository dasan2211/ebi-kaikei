import { afterEach, describe, expect, it, vi } from "vitest";
import { startAutomaticBackupScheduler } from "./automatic-backup";

describe("startAutomaticBackupScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks once at startup and while the application remains open", async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue({ backup: null, error: null });

    const stop = startAutomaticBackupScheduler(run);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
