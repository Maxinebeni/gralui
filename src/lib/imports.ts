// Data import (IMP-02, IMP-03): a filled template is uploaded, then checked row
// by row in a dry run that writes nothing. Saving the good rows comes later (IMP-05).

export type ImportMode = "HISTORICAL" | "NEW";
export type ImportStatus = "UPLOADED" | "VALIDATING" | "VALIDATED" | "FAILED";

export type ImportSheetSummary = {
  sheet: string;
  rows: number;
  ready: number;
  flagged: number;
  blocked: number;
};

export type ImportBatch = {
  id: string;
  fileName: string;
  mode: ImportMode;
  status: ImportStatus;
  uploadedBy: string;
  uploadedAt: string;
  validatedAt?: string;
  sheets: ImportSheetSummary[];
  /** Why the whole file could not be read, e.g. wrong headers. */
  fileProblems: string[];
};

export type ImportIssue = {
  sourceSheet: string;
  sourceRow: number;
  field: string;
  code: string;
  severity: "ERROR" | "WARNING";
  blocking: boolean;
  normalizedValue?: string;
  message: string;
};

export const IMPORT_MODE_LABEL: Record<ImportMode, string> = {
  HISTORICAL: "Historical records",
  NEW: "New records",
};

export const IMPORT_STATUS_LABEL: Record<ImportStatus, string> = {
  UPLOADED: "Uploaded",
  VALIDATING: "Checking",
  VALIDATED: "Dry run complete",
  FAILED: "Could not read file",
};

/** PROVISIONAL: the backend sets the real limit in IMP-02. GRAL's five registers total about 7,667 rows. */
export const IMPORT_MAX_BYTES = 25 * 1024 * 1024;
export const IMPORT_ACCEPT = ".xlsx,.csv";

export function importFileProblem(file: { name: string; size: number }): string | null {
  if (!/\.(xlsx|csv)$/i.test(file.name)) return "Only .xlsx or .csv files can be imported.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > IMPORT_MAX_BYTES) return "This file is larger than 25 MB.";
  return null;
}

export function importTotals(batch: Pick<ImportBatch, "sheets">) {
  return batch.sheets.reduce(
    (t, s) => ({ rows: t.rows + s.rows, ready: t.ready + s.ready, flagged: t.flagged + s.flagged, blocked: t.blocked + s.blocked }),
    { rows: 0, ready: 0, flagged: 0, blocked: 0 },
  );
}

const csvCell = (value: string | number) => {
  const text = String(value);
  // A leading = + - or @ would run as a formula when the list is opened in Excel.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The error list GRAL corrects before importing again. */
export function issuesToCsv(issues: ImportIssue[]) {
  const header = ["Sheet", "Row", "Field", "Value", "Problem", "Result"];
  const rows = issues.map((i) => [i.sourceSheet, i.sourceRow, i.field, i.normalizedValue ?? "", i.message, i.blocking ? "Blocked" : "Flagged"]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
