import { describe, expect, it } from "vitest";
import { groupIssues, importFileProblem, importTotals, issuesToCsv, type ImportIssue } from "./imports";
import { DEMO_DRY_RUN_ISSUES, DEMO_DRY_RUN_SHEETS } from "./mock-imports";

describe("import file checks", () => {
  it("accepts the template formats only", () => {
    expect(importFileProblem({ name: "GRAL.xlsx", size: 10 })).toBeNull();
    expect(importFileProblem({ name: "gral.CSV", size: 10 })).toBeNull();
    expect(importFileProblem({ name: "gral.xls", size: 10 })).toMatch(/xlsx/);
    expect(importFileProblem({ name: "gral.xlsx", size: 0 })).toMatch(/empty/);
    expect(importFileProblem({ name: "gral.xlsx", size: 26 * 1024 * 1024 })).toMatch(/25 MB/);
  });
});

describe("dry run counts", () => {
  it("adds the sheets together", () => {
    expect(importTotals({ sheets: DEMO_DRY_RUN_SHEETS })).toEqual({ rows: 168, ready: 153, flagged: 10, blocked: 5 });
  });

  it("demo sheets reconcile with their rows and issues", () => {
    for (const s of DEMO_DRY_RUN_SHEETS) {
      expect(s.ready + s.flagged + s.blocked).toBe(s.rows);
      const issues = DEMO_DRY_RUN_ISSUES.filter((i) => i.sourceSheet === s.sheet);
      expect(issues.filter((i) => i.blocking).length).toBe(s.blocked);
      expect(issues.filter((i) => !i.blocking).length).toBe(s.flagged);
    }
  });
});

describe("error list", () => {
  const issue = (over: Partial<ImportIssue>): ImportIssue => ({
    sourceSheet: "Policies",
    sourceRow: 6,
    field: "Policy Number",
    code: "X",
    severity: "ERROR",
    blocking: true,
    message: "Missing",
    ...over,
  });

  it("quotes commas and quotes", () => {
    const csv = issuesToCsv([issue({ message: 'Says "no", twice' })]);
    expect(csv.split("\r\n")[1]).toBe('Policies,6,Policy Number,,"Says ""no"", twice",Blocked');
  });

  it("stops spreadsheet cells running as formulas", () => {
    const csv = issuesToCsv([issue({ normalizedValue: "=HYPERLINK(1)", blocking: false })]);
    expect(csv.split("\r\n")[1]).toContain("'=HYPERLINK(1)");
    expect(csv.split("\r\n")[1]).toContain("Flagged");
  });
});

describe("errors and flags across files", () => {
  it("counts each problem once, blocking problems first", () => {
    const groups = groupIssues(DEMO_DRY_RUN_ISSUES);
    expect(groups[0]!.blocking).toBe(true);
    expect(groups.find((g) => g.code === "MISSING_CONTACT")).toMatchObject({ count: 3, sheets: ["Clients"], blocking: false });
    expect(groups.reduce((s, g) => s + g.count, 0)).toBe(DEMO_DRY_RUN_ISSUES.length);
    const firstFlagged = groups.findIndex((g) => !g.blocking);
    expect(groups.slice(firstFlagged).every((g) => !g.blocking)).toBe(true);
  });
});
