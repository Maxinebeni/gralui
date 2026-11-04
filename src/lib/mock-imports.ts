// Demo data for the import screen. The issues follow GRAL's import template
// rules; the demo does not read the file, so every dry run shows this result.

import type { ImportBatch, ImportIssue, ImportMode } from "./imports";

const blocked = (sourceSheet: string, sourceRow: number, field: string, code: string, message: string, normalizedValue?: string): ImportIssue => ({
  sourceSheet,
  sourceRow,
  field,
  code,
  severity: "ERROR",
  blocking: true,
  normalizedValue,
  message,
});

const flagged = (sourceSheet: string, sourceRow: number, field: string, code: string, message: string, normalizedValue?: string): ImportIssue => ({
  sourceSheet,
  sourceRow,
  field,
  code,
  severity: "WARNING",
  blocking: false,
  normalizedValue,
  message,
});

export const DEMO_DRY_RUN_SHEETS = [
  { sheet: "Clients", rows: 48, ready: 41, flagged: 6, blocked: 1 },
  { sheet: "Policies", rows: 120, ready: 112, flagged: 4, blocked: 4 },
];

/** One issue per affected row, so the counts above match this list. */
export const DEMO_DRY_RUN_ISSUES: ImportIssue[] = [
  blocked("Clients", 17, "Account Manager", "UNKNOWN_MANAGER", "Account manager is not on GRAL's list.", "P. NKUSI"),
  flagged("Clients", 4, "Sector", "MISSING_SECTOR", "Historical record with no sector. Imported with a flag."),
  flagged("Clients", 9, "Client Type", "MISSING_CLIENT_TYPE", "Historical record with no client type. Imported with a flag."),
  flagged("Clients", 12, "Physical Address", "MISSING_ADDRESS", "Historical record with no address. Imported with a flag."),
  flagged("Clients", 21, "Contact Name", "MISSING_CONTACT", "Historical record with no contact name. Imported with a flag."),
  flagged("Clients", 30, "Contact Email", "MISSING_CONTACT", "Historical record with no contact email. Imported with a flag."),
  flagged("Clients", 44, "Contact Phone", "MISSING_CONTACT", "Historical record with no contact phone. Imported with a flag."),
  blocked("Policies", 6, "Policy Number", "MISSING_POLICY_NUMBER", "Policy number is missing."),
  blocked("Policies", 23, "Client ID", "UNRESOLVED_CLIENT", "This Client ID does not match an imported client.", "CL00913"),
  blocked("Policies", 58, "Date of Expiry", "INVALID_DATE_ORDER", "Expiry must be after the date of effect.", "2023-01-01"),
  blocked("Policies", 91, "Type of Insurance", "UNKNOWN_PRODUCT", "This type of insurance is not on GRAL's product list.", "Motor Comm."),
  flagged("Policies", 14, "Amount Paid (RWF)", "IMPUTED_PAID_ZERO", "Historical blank imported as zero; confirmation required.", "0"),
  flagged("Policies", 37, "Amount Paid (RWF)", "IMPUTED_PAID_ZERO", "Historical blank imported as zero; confirmation required.", "0"),
  flagged("Policies", 62, "Commission Rate", "MISSING_RATE", "Historical record with no commission rate. Imported with a flag."),
  flagged("Policies", 103, "Commission Rate", "MISSING_RATE", "Historical record with no commission rate. Imported with a flag."),
];

export const DEMO_IMPORTS: ImportBatch[] = [
  {
    id: "IMP-2026-002",
    fileName: "GRAL_Import_Template_2024.xlsx",
    mode: "HISTORICAL",
    status: "VALIDATED",
    uploadedBy: "CRM Manager",
    uploadedAt: "2026-11-02T09:12:00Z",
    validatedAt: "2026-11-02T09:13:00Z",
    sheets: DEMO_DRY_RUN_SHEETS,
    fileProblems: [],
  },
  {
    id: "IMP-2026-001",
    fileName: "Register_2023_raw.xlsx",
    mode: "HISTORICAL",
    status: "FAILED",
    uploadedBy: "CRM Manager",
    uploadedAt: "2026-10-30T14:40:00Z",
    sheets: [],
    fileProblems: ["The Clients sheet is missing.", "The Policies sheet has unexpected columns: POLICY NO, PERIOD, BALANCE."],
  },
];

export function nextDemoImportId() {
  const highest = DEMO_IMPORTS.reduce((max, b) => Math.max(max, Number(b.id.split("-").at(-1)) || 0), 0);
  return `IMP-${new Date().getFullYear()}-${String(highest + 1).padStart(3, "0")}`;
}

export function newDemoImport(fileName: string, mode: ImportMode, uploadedBy: string): ImportBatch {
  const batch: ImportBatch = {
    id: nextDemoImportId(),
    fileName,
    mode,
    status: "UPLOADED",
    uploadedBy,
    uploadedAt: new Date().toISOString(),
    sheets: [],
    fileProblems: [],
  };
  DEMO_IMPORTS.unshift(batch);
  return batch;
}
