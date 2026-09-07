import { runAutomaticBackup } from "./tauri";
import type { AutomaticBackupRunResult } from "../types/settings";

const POLL_INTERVAL_MS = 60_000;

export function startAutomaticBackupScheduler(
  run: () => Promise<AutomaticBackupRunResult> = runAutomaticBackup
): () => void {
  let running = false;
  const check = async () => {
    if (running) return;
    running = true;
    try {
      await run();
    } catch {
      // The Rust command records backup failures for the settings screen.
    } finally {
      running = false;
    }
  };

  void check();
  const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS);
  return () => window.clearInterval(timer);
}
