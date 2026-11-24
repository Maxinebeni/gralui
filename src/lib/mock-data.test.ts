import { afterEach, describe, expect, it, vi } from "vitest";

// vitest.config.mts runs tests with NEXT_PUBLIC_MOCK_AUTH=false (connected to the backend).
describe("sample data", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is empty when the app is connected to the backend", async () => {
    const data = await import("./mock-data");
    for (const rows of [data.CLIENTS, data.CLAIMS, data.APPROVALS, data.MANUAL_TASKS, data.RENEWAL_CASES, data.RENEWAL_MONTHLY, data.POLICIES_BY_INSURER]) {
      expect(rows).toEqual([]);
    }
    expect(data.POLICY_TERMS).toEqual({});
    // Claim step definitions are configuration, not sample records.
    expect(data.CLAIM_STEPS.length).toBeGreaterThan(0);
  });

  it("is available in demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_MOCK_AUTH", "true");
    vi.resetModules();
    const data = await import("./mock-data");
    expect(data.CLAIMS.length).toBeGreaterThan(0);
    expect(data.MANUAL_TASKS.length).toBeGreaterThan(0);
  });
});
