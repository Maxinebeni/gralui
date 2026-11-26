// Demo data for the import screen, shaped like the backend's import batches.
// All names are synthetic. The demo does not read the uploaded file: every
// upload gets a copy of the rows below.

import type { ImportBatch, ImportIssue, ImportLookups, ImportRow } from "./imports";

const issue = (severity: string, code: string, field: string, message: string): ImportIssue => ({ severity, code, field, message });

const MANAGER_A = "a0000000-0000-4000-8000-000000000001";
const INSURER_A = "b0000000-0000-4000-8000-000000000001";
const PRODUCT_MOTOR = "c0000000-0000-4000-8000-000000000001";
const PRODUCT_FIRE = "c0000000-0000-4000-8000-000000000002";

export const DEMO_IMPORT_LOOKUPS: ImportLookups = {
  insurers: [
    { id: INSURER_A, code: "SYN-A", name: "Synthetic Insurance Rwanda Ltd", productIds: [PRODUCT_MOTOR, PRODUCT_FIRE] },
    { id: "b0000000-0000-4000-8000-000000000002", code: "SYN-B", name: "Example General Insurance Plc", productIds: [PRODUCT_MOTOR] },
  ],
  products: [
    { id: PRODUCT_MOTOR, code: "MOTOR", name: "Motor Comprehensive" },
    { id: PRODUCT_FIRE, code: "FIRE", name: "Fire and Allied Perils" },
  ],
  managers: [
    { id: MANAGER_A, name: "Synthetic Accounts Executive 01" },
    { id: "a0000000-0000-4000-8000-000000000002", name: "Synthetic Accounts Executive 02" },
  ],
};

function client(n: number, name: string, manager: string, type: string, issues: ImportIssue[], status: string): Omit<ImportRow, "id"> {
  const ref = `CL${String(n).padStart(5, "0")}`;
  return {
    recordType: "CLIENT",
    sourceFile: "Synthetic Register 2024.xlsx",
    sourceSheet: "Clients",
    sourceYear: 2024,
    sourceRow: n + 1,
    status,
    version: 0,
    original: { CLIENT: name.toUpperCase(), "ACC. MANAG": manager },
    values: { "Client ID": ref, "Client Name": name, "Client Type": type, "Account Manager": manager },
    issues,
  };
}

function policy(n: number, clientRef: string, insurer: string, product: string, issues: ImportIssue[], status: string): Omit<ImportRow, "id"> {
  return {
    recordType: "POLICY",
    sourceFile: "Synthetic Register 2024.xlsx",
    sourceSheet: "Policies",
    sourceYear: 2024,
    sourceRow: n + 1,
    status,
    version: 0,
    original: { "POLICY NO": `SYN/${n}`, INSURER: insurer.toUpperCase(), "TYPE OF INSURANCE": product },
    values: {
      "Client ID": clientRef,
      "Policy Number": `SYN/${n}`,
      "Proposed Insurer": insurer,
      "Proposed Type of Insurance": product,
      "Insurer ID": "",
      "Product ID": "",
      "Proposed Movement": "NEW",
      "Date of Effect": "2024-01-01",
      "Date of Expiry": "2024-12-31",
      "Total Premium (RWF)": "450000",
    },
    issues,
  };
}

const MAP_MANAGER = issue("ERROR", "VALIDATION_ACCOUNT_MANAGER_MAPPING_REQUIRED", "Account Manager", "Replace the register name with the active Accounts Executive user ID");
const MAP_INSURER = issue("ERROR", "VALIDATION_INSURER_MAPPING_REQUIRED", "Insurer ID", "Select the matching active insurer from the system catalog");
const MAP_PRODUCT = issue("ERROR", "VALIDATION_PRODUCT_MAPPING_REQUIRED", "Product ID", "Select the matching active product from the system catalog");

const DEMO_ROW_TEMPLATE: Omit<ImportRow, "id">[] = [
  client(1, "Synthetic Client 01 Ltd", "S. EXECUTIVE", "Corporate", [MAP_MANAGER], "ERROR"),
  client(2, "Synthetic Client 02 Ltd", "S. EXECUTIVE", "Corporate", [MAP_MANAGER], "ERROR"),
  client(3, "Synthetic Client 03", "S. EXECUTIVE", "", [MAP_MANAGER, issue("REVIEW", "VALIDATION_CLIENT_TYPE_REQUIRED", "Client Type", "Choose a confirmed client type before importing")], "ERROR"),
  client(4, "Synthetic Client 04 Ltd", MANAGER_A, "Corporate", [], "READY"),
  policy(1, "CL00001", "Synthetic Insurance", "Motor Comp.", [MAP_INSURER, MAP_PRODUCT], "ERROR"),
  policy(2, "CL00002", "Synthetic Insurance", "Motor Comp.", [MAP_INSURER, MAP_PRODUCT], "ERROR"),
  policy(3, "CL00003", "Synthetic Insurance", "Fire", [MAP_INSURER, MAP_PRODUCT], "ERROR"),
  policy(4, "CL00004", "Example General", "Motor Comp.", [MAP_INSURER, MAP_PRODUCT, issue("WARNING", "VALIDATION_COMMISSION_RATE_UNKNOWN", "Commission Rate", "No commission rate was supplied; this historical rate remains unknown and commission amount cannot be calculated")], "ERROR"),
];

export const DEMO_IMPORTS: ImportBatch[] = [];
export const DEMO_IMPORT_ROWS = new Map<string, ImportRow[]>();

/** Counts worked out from the rows, as the backend does. */
export function demoBatchView(batch: ImportBatch): ImportBatch {
  const rows = DEMO_IMPORT_ROWS.get(batch.id) ?? [];
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return {
    ...batch,
    clients: rows.filter((r) => r.recordType === "CLIENT").length,
    policies: rows.filter((r) => r.recordType === "POLICY").length,
    sourceRows: rows.filter((r) => r.recordType === "POLICY").length,
    ready: count("READY"),
    review: count("REVIEW"),
    errors: count("ERROR"),
    committed: count("COMMITTED"),
  };
}

export function newDemoImport(fileName: string): ImportBatch {
  const id = crypto.randomUUID();
  const batch: ImportBatch = {
    id,
    fileName,
    status: "STAGED",
    version: 0,
    mappingVersion: "demo",
    sourceRows: 0,
    clients: 0,
    policies: 0,
    ready: 0,
    review: 0,
    errors: 0,
    committed: 0,
    uploadedAt: new Date().toISOString(),
  };
  DEMO_IMPORT_ROWS.set(
    id,
    DEMO_ROW_TEMPLATE.map((r) => ({ ...structuredClone(r), id: crypto.randomUUID() })),
  );
  DEMO_IMPORTS.unshift(batch);
  return demoBatchView(batch);
}

/** The demo's check: a row is ready once its mapping fields hold system IDs. */
export function validateDemoImport(id: string): ImportBatch {
  const batch = DEMO_IMPORTS.find((b) => b.id === id);
  if (!batch) throw new Error("This import could not be found.");
  const isId = (v: unknown) => /^[0-9a-f-]{36}$/.test(String(v ?? ""));
  for (const row of DEMO_IMPORT_ROWS.get(id) ?? []) {
    if (row.status === "COMMITTED") continue;
    const issues: ImportIssue[] = [];
    if (row.recordType === "CLIENT") {
      if (!isId(row.values["Account Manager"])) issues.push(MAP_MANAGER);
      if (!row.values["Client Type"]) issues.push(issue("REVIEW", "VALIDATION_CLIENT_TYPE_REQUIRED", "Client Type", "Choose a confirmed client type before importing"));
    } else {
      if (!isId(row.values["Insurer ID"])) issues.push(MAP_INSURER);
      if (!isId(row.values["Product ID"])) issues.push(MAP_PRODUCT);
    }
    row.issues = issues;
    row.status = issues.some((i) => i.severity === "ERROR") ? "ERROR" : issues.some((i) => i.severity === "REVIEW") ? "REVIEW" : "READY";
  }
  const view = demoBatchView(batch);
  batch.status = view.errors + view.review > 0 ? "PARTIAL" : "VALIDATED";
  batch.validatedAt = new Date().toISOString();
  return demoBatchView(batch);
}

export function commitDemoImport(id: string): ImportBatch {
  const batch = DEMO_IMPORTS.find((b) => b.id === id);
  if (!batch) throw new Error("This import could not be found.");
  if (batch.status !== "VALIDATED" && batch.status !== "PARTIAL") throw new Error("Check the file again before importing.");
  for (const row of DEMO_IMPORT_ROWS.get(id) ?? []) if (row.status === "READY") row.status = "COMMITTED";
  const view = demoBatchView(batch);
  batch.status = view.ready + view.review + view.errors === 0 ? "COMMITTED" : "PARTIAL";
  if (batch.status === "COMMITTED") batch.committedAt = new Date().toISOString();
  return demoBatchView(batch);
}

export function correctDemoRow(batchId: string, rowId: string, expectedVersion: number, changes: Record<string, unknown>): ImportRow;
export function correctDemoRow(batchId: string, rowId: string, expectedVersion: number, field: string, value: unknown): ImportRow;
export function correctDemoRow(batchId: string, rowId: string, expectedVersion: number, changesOrField: Record<string, unknown> | string, value?: unknown): ImportRow {
  const batch = DEMO_IMPORTS.find((b) => b.id === batchId);
  const row = DEMO_IMPORT_ROWS.get(batchId)?.find((r) => r.id === rowId);
  if (!batch || !row) throw new Error("This row could not be found.");
  if (row.version !== expectedVersion) throw new Error("Someone else changed this row. Reload it and try again.");
  const changes = typeof changesOrField === "string" ? { [changesOrField]: value } : changesOrField;
  row.values = { ...row.values, ...changes };
  row.version += 1;
  row.status = "REVIEW";
  row.issues = [];
  batch.status = "STAGED";
  return structuredClone(row);
}
