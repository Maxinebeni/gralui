// Historical data import (IMP-02 to IMP-05), on the backend's
// /api/v1/admin/import-batches. The workbook made by tools/gral-import/clean_gral.py
// is uploaded and staged; every client and policy row is checked; the
// Administrator fixes rows (each fix needs a reason and keeps the original
// value); then the ready rows are saved as real clients and policies.

import { toCsv } from "./csv";

export type ImportBatchStatus = "STAGED" | "PARTIAL" | "VALIDATED" | "COMMITTED" | "FAILED";
export type ImportRecordType = "CLIENT" | "POLICY" | "SOURCE_ROW";
export type ImportRowStatus = "PRESERVED" | "READY" | "REVIEW" | "ERROR" | "COMMITTED" | "IGNORED";

export type ImportBatch = {
  id: string;
  parentBatchId?: string | null;
  fileName: string;
  status: ImportBatchStatus | string;
  version: number;
  mappingVersion: string;
  sourceRows: number;
  clients: number;
  policies: number;
  ready: number;
  review: number;
  errors: number;
  committed: number;
  uploadedAt: string;
  validatedAt?: string | null;
  committedAt?: string | null;
};

export type ImportIssue = { severity: "ERROR" | "REVIEW" | "WARNING" | string; code: string; field: string; message: string };

export type ImportRow = {
  id: string;
  recordType: ImportRecordType;
  sourceFile: string;
  sourceSheet: string;
  sourceYear?: number | null;
  sourceRow?: number | null;
  status: ImportRowStatus | string;
  entityId?: string | null;
  version: number;
  /** The register row exactly as GRAL typed it. Never changes. */
  original: Record<string, unknown>;
  /** The cleaned values that will be saved, including any fixes. */
  values: Record<string, unknown>;
  issues: ImportIssue[];
};

export type ImportInsurerChoice = { id: string; code: string; name: string; productIds: string[] };
export type ImportLookups = {
  insurers: ImportInsurerChoice[];
  products: { id: string; code: string; name: string }[];
  managers: { id: string; name: string }[];
};

export const IMPORT_STATUS_LABEL: Record<string, string> = {
  STAGED: "Not checked yet",
  PARTIAL: "Needs fixes",
  VALIDATED: "Ready to import",
  COMMITTED: "Imported",
  FAILED: "Failed",
};

export function importStatusTone(status: string): "neutral" | "success" | "warning" | "danger" | "sky" {
  if (status === "COMMITTED" || status === "VALIDATED") return "success";
  if (status === "PARTIAL") return "warning";
  if (status === "FAILED") return "danger";
  return "sky";
}

export const ROW_STATUS_LABEL: Record<string, string> = {
  READY: "Ready",
  REVIEW: "Needs a decision",
  ERROR: "Blocked",
  COMMITTED: "Imported",
  PRESERVED: "Kept as source",
  IGNORED: "Ignored",
};

export function rowStatusTone(status: string): "neutral" | "success" | "warning" | "danger" | "sky" {
  if (status === "READY" || status === "COMMITTED") return "success";
  if (status === "REVIEW") return "warning";
  if (status === "ERROR") return "danger";
  return "neutral";
}

export const SEVERITY_LABEL: Record<string, string> = { ERROR: "Blocked", REVIEW: "Needs a decision", WARNING: "Note" };

export function severityTone(severity: string): "neutral" | "warning" | "danger" {
  return severity === "ERROR" ? "danger" : severity === "REVIEW" ? "warning" : "neutral";
}

/** The backend's limit (IMPORT_MAX_WORKBOOK_BYTES, 50 MiB by default). */
export const IMPORT_MAX_BYTES = 50 * 1024 * 1024;
export const IMPORT_ACCEPT = ".xlsx";

export function importFileProblem(file: { name: string; size: number }): string | null {
  if (!/\.xlsx$/i.test(file.name)) return "Only the .xlsx workbook made by the cleaning script can be imported.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > IMPORT_MAX_BYTES) return "This file is larger than 50 MB.";
  return null;
}

/** A value from a row as display text. */
export function valueText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** A short name for a row: the client, or the policy and the client it belongs to. */
export function rowTitle(row: Pick<ImportRow, "recordType" | "values">): string {
  const v = row.values;
  if (row.recordType === "CLIENT") return [valueText(v["Client ID"]), valueText(v["Client name"])].filter(Boolean).join(" · ") || "Client with no name";
  if (row.recordType === "POLICY") {
    const number = valueText(v["Policy number"]) || "no policy number";
    return `Policy ${number} · ${valueText(v["Client ID"]) || "no client"}`;
  }
  return "Source row";
}

/** Where the row came from in GRAL's registers. */
export function rowSource(row: Pick<ImportRow, "sourceFile" | "sourceYear" | "sourceRow">): string {
  return [row.sourceYear ? `Register ${row.sourceYear}` : row.sourceFile, row.sourceRow ? `Excel row ${row.sourceRow}` : null].filter(Boolean).join(" · ");
}

/* ---------------------------------- Fixing rows ---------------------------------- */

export type FieldKind = "manager" | "insurer" | "product" | "clientType" | "duplicate" | "movement" | "date" | "money" | "text";

export const CLIENT_FIELDS = [
  "Account Manager",
  "Client type",
  "Duplicate review",
  "Client name",
  "Client ID",
  "Sector",
  "Physical address",
  "Contact name",
  "Contact job title",
  "Contact email",
  "Contact phone",
  "Remarks",
] as const;

export const POLICY_FIELDS = [
  "Insurer ID",
  "Product ID",
  "Proposed movement",
  "Policy number",
  "Client ID",
  "Date of effect",
  "Date of expiry",
  "Net Premium (RWF)",
  "Total Premium (RWF)",
  "Amount Paid (RWF)",
  "Commission rate",
  "Currency",
  "Proposed plate",
  "Proposed UPI",
  "Insurer booking note",
  "Remarks",
] as const;

export function fieldsFor(recordType: ImportRecordType): readonly string[] {
  return recordType === "CLIENT" ? CLIENT_FIELDS : recordType === "POLICY" ? POLICY_FIELDS : [];
}

/** Friendlier names for the fields that hold system IDs. */
export const FIELD_LABEL: Record<string, string> = {
  "Account Manager": "Account manager",
  "Insurer ID": "Insurer",
  "Product ID": "Product",
  "Proposed movement": "Movement",
  "Duplicate review": "Duplicate decision",
};
export const fieldLabel = (field: string) => FIELD_LABEL[field] ?? field;

export function fieldKind(field: string): FieldKind {
  switch (field) {
    case "Account Manager":
      return "manager";
    case "Insurer ID":
      return "insurer";
    case "Product ID":
      return "product";
    case "Client type":
      return "clientType";
    case "Duplicate review":
      return "duplicate";
    case "Proposed movement":
      return "movement";
    case "Date of effect":
    case "Date of expiry":
      return "date";
    case "Net Premium (RWF)":
    case "Total Premium (RWF)":
    case "Amount Paid (RWF)":
    case "Commission rate":
      return "money";
    default:
      return "text";
  }
}

/** The client types the backend accepts. */
export const IMPORT_CLIENT_TYPES = [
  { value: "CORPORATE", label: "Corporate" },
  { value: "STATE_ENTERPRISE", label: "State enterprise" },
  { value: "NGO", label: "NGO" },
  { value: "FINANCIAL_INSTITUTION", label: "Financial institution" },
  { value: "SME", label: "SME" },
  { value: "INDIVIDUAL", label: "Individual" },
];

/** Only these movements can be saved as a policy today; the others wait for a GRAL rule. */
export const IMPORT_MOVEMENTS = [
  { value: "NEW", label: "New business" },
  { value: "REN", label: "Renewal" },
];

// Problems the cleaning script found are filed under the register's column
// name; fixing the matching field clears them (the backend's issueFieldsForCorrection).
const ISSUE_FIELD_TO_FIX: Record<string, string> = {
  Insurer: "Insurer ID",
  INSURER: "Insurer ID",
  "Source insurer": "Insurer ID",
  "Proposed insurer": "Insurer ID",
  "Type of insurance": "Product ID",
  "TYPE OF INSURANCE": "Product ID",
  "Source type of insurance": "Product ID",
  "Proposed type of insurance": "Product ID",
  Movement: "Proposed movement",
  MOVEMENT: "Proposed movement",
  "Amount paid": "Amount Paid (RWF)",
  "AMOUNT PAID": "Amount Paid (RWF)",
  Rate: "Commission rate",
  UPI: "Proposed UPI",
  Plate: "Proposed plate",
  Client: "Client name",
  CLIENT: "Client name",
  "POLICY NO": "Policy number",
  "DATE OF EFFECT": "Date of effect",
  "DATE OF EXPIRY": "Date of expiry",
  "NET PREM": "Net Premium (RWF)",
  "Source net premium": "Net Premium (RWF)",
  "TOTAL PREMIUM": "Total Premium (RWF)",
  "Source total premium": "Total Premium (RWF)",
  "PHONE NUMBER": "Contact phone",
  "ACC. MANAG": "Account Manager",
};

/** The field to change to clear a problem, or null when no single field fixes it. */
export function fixFieldFor(issueField: string, recordType: ImportRecordType): string | null {
  const field = ISSUE_FIELD_TO_FIX[issueField] ?? issueField;
  return fieldsFor(recordType).includes(field) ? field : null;
}

/** Fields this row's blocking or open problems point at, most important first. */
export function fieldsToFix(row: Pick<ImportRow, "recordType" | "issues">): string[] {
  const order = (s: string) => (s === "ERROR" ? 0 : s === "REVIEW" ? 1 : 2);
  const fields: string[] = [];
  for (const issue of [...row.issues].sort((a, b) => order(a.severity) - order(b.severity))) {
    if (issue.severity === "WARNING") continue;
    const f = fixFieldFor(issue.field, row.recordType);
    if (f && !fields.includes(f)) fields.push(f);
  }
  return fields;
}

/**
 * The value that identifies "the same case" for a fix applied to many rows.
 * Insurer and product are blank until mapped, so rows are matched on the
 * insurer or type of insurance written in the register instead.
 */
export function matchField(field: string): string {
  if (field === "Insurer ID") return "Proposed insurer";
  if (field === "Product ID") return "Proposed type of insurance";
  return field;
}

export function matchValue(row: Pick<ImportRow, "values">, field: string): string {
  const key = matchField(field);
  const v = valueText(row.values[key]);
  if (v || key === field) return v;
  // Older workbooks may only carry the register's own column.
  return valueText(row.values[field === "Insurer ID" ? "Source insurer" : "Source type of insurance"]);
}

/** Rows in the list that would take the same fix as this one (same record type, same register value, not yet imported). */
export function sameCaseRows(rows: ImportRow[], row: ImportRow, field: string): ImportRow[] {
  const key = matchValue(row, field);
  if (!key) return [];
  return rows.filter((r) => r.id !== row.id && r.recordType === row.recordType && r.status !== "COMMITTED" && matchValue(r, field) === key);
}

export type DuplicateCandidate = { reference: string; name: string; id: string };

/** Existing clients the backend suggests in its EXISTING_CLIENT_MATCH message: "CL00012 (Name, uuid); ...". */
export function duplicateCandidates(row: Pick<ImportRow, "issues">): DuplicateCandidate[] {
  const found: DuplicateCandidate[] = [];
  for (const issue of row.issues) {
    if (!issue.code.endsWith("EXISTING_CLIENT_MATCH")) continue;
    const re = /(\S+) \((.+?), ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;
    for (const m of issue.message.matchAll(re)) found.push({ reference: m[1]!, name: m[2]!, id: m[3]! });
  }
  return found;
}

/**
 * The same problem said once. A client appears in many register rows, so the
 * cleaning script repeats the same note for each of them.
 */
export function mergeIssues(issues: ImportIssue[]): (ImportIssue & { count: number })[] {
  const order = (s: string) => (s === "ERROR" ? 0 : s === "REVIEW" ? 1 : 2);
  const merged = new Map<string, ImportIssue & { count: number }>();
  for (const i of issues) {
    const key = `${i.severity}|${i.field}|${i.message}`;
    const m = merged.get(key);
    if (m) m.count += 1;
    else merged.set(key, { ...i, count: 1 });
  }
  return [...merged.values()].sort((a, b) => order(a.severity) - order(b.severity));
}

/* ---------------------------------- Problem list ---------------------------------- */

export type IssueGroup = { code: string; field: string; message: string; severity: string; count: number };

/** The same problem across rows counted once, blocking problems first, then the most common. */
export function groupIssues(rows: Pick<ImportRow, "issues">[]): IssueGroup[] {
  const order = (s: string) => (s === "ERROR" ? 0 : s === "REVIEW" ? 1 : 2);
  const groups = new Map<string, IssueGroup>();
  for (const r of rows)
    for (const i of r.issues) {
      const key = `${i.code}|${i.field}`;
      const g = groups.get(key) ?? { code: i.code, field: i.field, message: i.message, severity: i.severity, count: 0 };
      g.count += 1;
      if (order(i.severity) < order(g.severity)) g.severity = i.severity;
      groups.set(key, g);
    }
  return [...groups.values()].sort((a, b) => order(a.severity) - order(b.severity) || b.count - a.count || a.code.localeCompare(b.code));
}

/** The problem list GRAL works through, one line per problem. Holds client data: keep it off GitHub and group chats. */
export function issuesToCsv(rows: ImportRow[]) {
  const header = ["Record", "Register", "Excel row", "Row", "Status", "Field", "Value", "Problem", "Result"];
  const lines = rows.flatMap((r) =>
    r.issues.map((i) => [
      r.recordType === "CLIENT" ? "Client" : "Policy",
      r.sourceYear ?? r.sourceFile,
      r.sourceRow ?? "",
      rowTitle(r),
      ROW_STATUS_LABEL[r.status] ?? r.status,
      i.field,
      valueText(r.values[fixFieldFor(i.field, r.recordType) ?? i.field]),
      i.message,
      SEVERITY_LABEL[i.severity] ?? i.severity,
    ]),
  );
  return toCsv([header, ...lines]);
}
