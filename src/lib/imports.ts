// Data import (IMP-02, IMP-03): a filled template is uploaded, then checked row
// by row in a dry run that writes nothing. Saving the good rows comes later (IMP-05).

import { toCsv } from "./csv";

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

/** The error list GRAL corrects before importing again. */
export function issuesToCsv(issues: ImportIssue[]) {
  const header = ["Sheet", "Row", "Field", "Value", "Problem", "Result"];
  const rows = issues.map((i) => [i.sourceSheet, i.sourceRow, i.field, i.normalizedValue ?? "", i.message, i.blocking ? "Blocked" : "Flagged"]);
  return toCsv([header, ...rows]);
}

/** An issue with the file it came from, for the list across every checked file. */
export type FileIssue = ImportIssue & { batchId: string; fileName: string };

export type IssueGroup = { code: string; message: string; blocking: boolean; count: number; sheets: string[] };

/** The same problem across rows and files counted once, blocking problems first, then the most common. */
export function groupIssues(issues: ImportIssue[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const i of issues) {
    const g = groups.get(i.code) ?? { code: i.code, message: i.message, blocking: i.blocking, count: 0, sheets: [] };
    g.count += 1;
    g.blocking ||= i.blocking;
    if (!g.sheets.includes(i.sourceSheet)) g.sheets.push(i.sourceSheet);
    groups.set(i.code, g);
  }
  return [...groups.values()].sort((a, b) => Number(b.blocking) - Number(a.blocking) || b.count - a.count || a.code.localeCompare(b.code));
}
