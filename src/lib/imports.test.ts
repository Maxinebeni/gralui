import { describe, expect, it } from "vitest";
import {
  CLIENT_FIELDS,
  POLICY_FIELDS,
  clientTypeCode,
  hasSuggestionNote,
  withoutSuggestionNote,
  duplicateCandidates,
  fieldLabel,
  fieldsToFix,
  fixFieldFor,
  groupIssues,
  importFileProblem,
  issuesToCsv,
  matchValue,
  mergeIssues,
  rowTitle,
  sameCaseRows,
  type ImportRow,
} from "./imports";
import { DEMO_IMPORT_LOOKUPS, DEMO_IMPORT_ROWS, commitDemoImport, correctDemoRow, newDemoImport, validateDemoImport } from "./mock-imports";

const row = (over: Partial<ImportRow>): ImportRow => ({
  id: "r1",
  recordType: "POLICY",
  sourceFile: "Register 2024.xlsx",
  sourceSheet: "Policies",
  sourceYear: 2024,
  sourceRow: 12,
  status: "ERROR",
  version: 0,
  original: {},
  values: {},
  issues: [],
  ...over,
});

describe("import file checks", () => {
  it("accepts the cleaned .xlsx workbook only", () => {
    expect(importFileProblem({ name: "GRAL_Cleaned.xlsx", size: 10 })).toBeNull();
    expect(importFileProblem({ name: "gral.csv", size: 10 })).toMatch(/xlsx/);
    expect(importFileProblem({ name: "gral.xlsx", size: 0 })).toMatch(/empty/);
    expect(importFileProblem({ name: "gral.xlsx", size: 51 * 1024 * 1024 })).toMatch(/50 MB/);
  });
});

describe("fixing rows", () => {
  it("points register column problems at the field that clears them", () => {
    expect(fixFieldFor("INSURER", "POLICY")).toBe("Insurer ID");
    expect(fixFieldFor("TYPE OF INSURANCE", "POLICY")).toBe("Product ID");
    expect(fixFieldFor("ACC. MANAG", "CLIENT")).toBe("Account Manager");
    expect(fixFieldFor("Insurer ID", "CLIENT")).toBeNull();
  });

  it("lists blocking fields first and skips notes", () => {
    const r = row({
      issues: [
        { severity: "WARNING", code: "VALIDATION_COMMISSION_RATE_UNKNOWN", field: "Commission Rate", message: "" },
        { severity: "REVIEW", code: "VALIDATION_MOVEMENT_RULE_UNCONFIRMED", field: "Proposed Movement", message: "" },
        { severity: "ERROR", code: "VALIDATION_INSURER_MAPPING_REQUIRED", field: "Insurer ID", message: "" },
      ],
    });
    expect(fieldsToFix(r)).toEqual(["Insurer ID", "Proposed Movement"]);
  });

  it("matches the same insurer by what the register says, since the ID is still blank", () => {
    const a = row({ id: "a", values: { "Proposed Insurer": "Synthetic Insurance", "Insurer ID": "" } });
    const b = row({ id: "b", values: { "Proposed Insurer": "Synthetic Insurance", "Insurer ID": "" } });
    const c = row({ id: "c", values: { "Proposed Insurer": "Other Insurer" } });
    const done = row({ id: "d", status: "COMMITTED", values: { "Proposed Insurer": "Synthetic Insurance" } });
    expect(matchValue(a, "Insurer ID")).toBe("Synthetic Insurance");
    expect(sameCaseRows([a, b, c, done], a, "Insurer ID").map((r) => r.id)).toEqual(["b"]);
  });

  it("reads the suggested existing clients from the backend's message", () => {
    const r = row({
      recordType: "CLIENT",
      issues: [
        {
          severity: "REVIEW",
          code: "VALIDATION_EXISTING_CLIENT_MATCH",
          field: "Duplicate Review",
          message:
            "Possible existing client matches: CL00012 (Synthetic Client 12 Ltd, 0f8fad5b-d9cb-469f-a165-70867728950e). Set Duplicate Review to LINK:<client UUID> or CREATE_NEW after review.",
        },
      ],
    });
    expect(duplicateCandidates(r)).toEqual([{ reference: "CL00012", name: "Synthetic Client 12 Ltd", id: "0f8fad5b-d9cb-469f-a165-70867728950e" }]);
  });

  it("names rows by client or policy", () => {
    expect(rowTitle(row({ recordType: "CLIENT", values: { "Client ID": "CL00001", "Client Name": "Synthetic Ltd" } }))).toBe("CL00001 · Synthetic Ltd");
    expect(rowTitle(row({ values: { "Policy Number": "SYN/1", "Client ID": "CL00001" } }))).toBe("Policy SYN/1 · CL00001");
  });
});

describe("merging repeated problems", () => {
  it("shows the same note once with a count, blocking first", () => {
    const note = { severity: "REVIEW", code: "CLEANER_ISSUE", field: "Sector", message: "Historical source does not provide this value" };
    const block = { severity: "ERROR", code: "E", field: "Account Manager", message: "Map it" };
    const merged = mergeIssues([note, note, block, note]);
    expect(merged.map((m) => [m.field, m.count])).toEqual([
      ["Account Manager", 1],
      ["Sector", 3],
    ]);
  });
});

describe("problem list", () => {
  it("groups the same problem across rows, blocking first", () => {
    const rows = [
      row({ issues: [{ severity: "WARNING", code: "W", field: "Commission Rate", message: "w" }] }),
      row({ issues: [{ severity: "ERROR", code: "E", field: "Insurer ID", message: "e" }] }),
      row({ issues: [{ severity: "ERROR", code: "E", field: "Insurer ID", message: "e" }] }),
    ];
    expect(groupIssues(rows).map((g) => [g.code, g.count])).toEqual([
      ["E", 2],
      ["W", 1],
    ]);
  });

  it("writes one CSV line per problem", () => {
    const csv = issuesToCsv([row({ values: { "Policy Number": "SYN/1" }, issues: [{ severity: "ERROR", code: "E", field: "INSURER", message: "Pick an insurer" }] })]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Pick an insurer");
    expect(lines[1]).toContain("Blocked");
  });
});

describe("demo import", () => {
  it("goes from uploaded to fixed to imported", () => {
    const batch = newDemoImport("synthetic.xlsx");
    expect(batch.status).toBe("STAGED");
    let view = validateDemoImport(batch.id);
    expect(view.status).toBe("PARTIAL");
    expect(view.ready).toBe(1);

    for (const r of DEMO_IMPORT_ROWS.get(batch.id)!) {
      if (r.recordType === "CLIENT") {
        correctDemoRow(batch.id, r.id, r.version, "Account Manager", DEMO_IMPORT_LOOKUPS.managers[0]!.id);
        if (!r.values["Client Type"]) correctDemoRow(batch.id, r.id, r.version, "Client Type", "CORPORATE");
      } else {
        correctDemoRow(batch.id, r.id, r.version, "Insurer ID", DEMO_IMPORT_LOOKUPS.insurers[0]!.id);
        correctDemoRow(batch.id, r.id, r.version, "Product ID", DEMO_IMPORT_LOOKUPS.products[0]!.id);
      }
    }
    view = validateDemoImport(batch.id);
    expect(view.status).toBe("VALIDATED");
    view = commitDemoImport(batch.id);
    expect(view.status).toBe("COMMITTED");
    expect(view.committed).toBe(view.clients + view.policies);
  });

  it("refuses a change made on an old copy of the row", () => {
    const batch = newDemoImport("synthetic.xlsx");
    const r = DEMO_IMPORT_ROWS.get(batch.id)![0]!;
    correctDemoRow(batch.id, r.id, 0, "Client Type", "CORPORATE");
    expect(() => correctDemoRow(batch.id, r.id, 0, "Client Type", "SME")).toThrow(/changed/);
  });
});

describe("backend field names", () => {
  // ImportWorkspaceService.MUTABLE_FIELDS: a fix naming any other key is refused (INVALID_CORRECTION).
  const BACKEND_MUTABLE = new Set(["Client ID", "Client Name", "Client Type", "Sector", "Physical Address", "Contact Name", "Contact Job Title",
    "Contact Email", "Contact Phone", "Account Manager", "Policy Number", "Insurer ID", "Product ID", "Source Insurer", "Proposed Insurer",
    "Source Type of Insurance", "Proposed Type of Insurance", "Movement", "Proposed Movement", "Date of Effect", "Date of Expiry",
    "Net Premium (RWF)", "Total Premium (RWF)", "Amount Paid (RWF)", "Commission Rate", "Currency", "Remarks", "Source Plate/UPI",
    "Proposed Plate", "Proposed UPI", "Insurer Booking Note", "Duplicate Review"]);

  it("only offers fields the backend accepts, spelled as the backend spells them", () => {
    for (const field of [...CLIENT_FIELDS, ...POLICY_FIELDS]) expect(BACKEND_MUTABLE.has(field), field).toBe(true);
  });

  it("shows the keys in sentence case without changing them", () => {
    expect(fieldLabel("Client Name")).toBe("Client name");
    expect(fieldLabel("Net Premium (RWF)")).toBe("Net premium (RWF)");
    expect(fieldLabel("Proposed UPI")).toBe("Proposed UPI");
    expect(fieldLabel("Duplicate Review")).toBe("Duplicate decision");
  });

  it("reads the register's client type", () => {
    expect(clientTypeCode("Corporate")).toBe("CORPORATE");
    expect(clientTypeCode("State enterprise")).toBe("STATE_ENTERPRISE");
    expect(clientTypeCode("Bank")).toBe("FINANCIAL_INSTITUTION");
    expect(clientTypeCode("Unknown")).toBe("");
  });
});

describe("client-type suggestion note", () => {
  const note = "Client Type is a name-based suggestion; confirm before promotion";
  it("finds and removes only the note", () => {
    expect(hasSuggestionNote(note)).toBe(true);
    expect(withoutSuggestionNote(note)).toBe("");
    expect(withoutSuggestionNote(`Key account; ${note}`)).toBe("Key account");
    expect(withoutSuggestionNote(`${note}. Pays quarterly`)).toBe("Pays quarterly");
    expect(withoutSuggestionNote("Pays quarterly")).toBe("Pays quarterly");
    expect(hasSuggestionNote("Pays quarterly")).toBe(false);
  });
});
