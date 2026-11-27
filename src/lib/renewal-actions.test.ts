import { describe, expect, it } from "vitest";
import { buildRenewalInput, checkRenewalValues, renewalActionsFor } from "./renewal-actions";
import type { RenewalCase } from "./types";

const quote = { id: "selected", version: 1, insurerId: "insurer-1", productId: "product", effectDate: "2027-01-01", expiryDate: "2027-12-31", premium: 1500, terms: "Cover" };
const renewal: RenewalCase = {
  id: "renewal", policyId: "policy", clientId: "client", client: "Example", owner: "Account Executive",
  classOfInsurance: "Property", insurer: "Insurer", premium: 1500, expiryDate: "2026-12-31", completed: [], quotes: [],
  backend: {
    id: "renewal", version: 1, state: "QUOTES_READY", availableActions: ["RECOMMEND"], blockers: [], risks: [], milestones: [],
    policyUuid: "policy", periodId: "period", clientUuid: "client",
    quotes: [quote, { ...quote, version: 2 }, { ...quote, id: "alternative", version: 3, insurerId: "insurer-2" }],
  },
};
const spec = renewalActionsFor(renewal, "QUOTES")[0]!;
const values = {
  quoteId: "selected:2", comparison: "Compared property cover", rationale: "Best fit", annualCommissionRwf: "100", commissionBasis: "Agreed commission",
  file: new File(["report"], "report.pdf", { type: "application/pdf" }),
};
const helpers = {
  command: () => ({ commandId: "command", expectedVersion: 1 }),
  proof: () => ({ documentId: "report", documentVersion: 4, occurredAt: "2026-11-27T09:00:00Z" }),
};

describe("renewal recommendation comparison", () => {
  it("sends only the selected alternative quote revisions", () => {
    const input = buildRenewalInput(renewal, spec, { ...values, comparedQuotes: ["alternative:3"] });
    expect(input.body(helpers)).toMatchObject({ quoteId: "selected", quoteVersion: 2, comparedQuotes: [{ quoteId: "alternative", quoteVersion: 3 }] });
  });

  it("sends an explicit empty list when no alternatives were used", () => {
    expect(buildRenewalInput(renewal, spec, values).body(helpers)).toHaveProperty("comparedQuotes", []);
  });

  it("rejects superseded and selected quote versions in the alternatives before upload", () => {
    expect(checkRenewalValues(spec, { ...values, comparedQuotes: ["alternative:2"] }, renewal)).toHaveProperty("comparedQuotes");
    expect(checkRenewalValues(spec, { ...values, comparedQuotes: ["selected:2"] }, renewal)).toHaveProperty("comparedQuotes");
    expect(checkRenewalValues(spec, { ...values, quoteId: "selected:1" }, renewal)).toHaveProperty("quoteId");
  });
});
