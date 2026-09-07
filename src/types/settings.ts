export type DatabaseInfo = {
  path: string;
  fileName: string;
  sizeBytes: number;
};

export type BackupFile = {
  fileName: string;
  createdAt: string;
  sizeBytes: number;
};

export type RestoreResult = {
  restoredFileName: string;
  safetyBackupFileName: string;
};

export type AutomaticBackupSettings = {
  enabled: boolean;
  intervalMinutes: number;
  retentionCount: number;
  destinationDirectory: string;
  lastBackupAt: string | null;
  lastError: string | null;
};

export type AutomaticBackupSettingsInput = Pick<
  AutomaticBackupSettings,
  "enabled" | "intervalMinutes" | "retentionCount" | "destinationDirectory"
>;

export type AutomaticBackupRunResult = {
  backup: BackupFile | null;
  error: string | null;
};

export type CsvImportPreview = {
  entryCount: number;
  lineCount: number;
  totalDebitMinor: number;
  totalCreditMinor: number;
};

export type CsvImportResult = {
  importedEntryCount: number;
  importedLineCount: number;
};

export type JournalDeletionScope = "current_month" | "fiscal_year" | "all";

export type JournalDeletionResult = {
  deletedEntryCount: number;
  deletedAttachmentCount: number;
  failedAttachmentFileCount: number;
};

export type FontFamily = "gothic" | "mincho";

export type ThemePreference = "system" | "dark" | "light";
