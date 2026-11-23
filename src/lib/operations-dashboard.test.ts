import { afterEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), apiFetch: (...a: unknown[]) => apiFetch(...a) }));

const { getDashboardList, getOperationsDashboard } = await import("./operations-dashboard");

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const SUMMARY = {
  asOf: "2026-11-23T10:00:00Z",
  clients: { active: 12, newThisMonth: 2, byCategory: { CORPORATE: 8, STATE_ENTERPRISE: 3, UNKNOWN: 1 }, withoutActivePolicy: 4, slaExpiring0To30Days: 1, slaExpiring31To60Days: 0, missingSlaDates: 5, topByPremium: [{ id: "a", clientName: "Bralirwa PLC", premium: "1500000.00" }] },
  renewals: { activePolicies: 30, expiring0To30Days: 3, expiring31To60Days: 2, unresolvedExpired: 1, overduePayments: 4, expiringSoon: [], unresolvedExpiries: [] },
  claims: { open: null, byState: {}, openedThisMonth: null, agedOver30Days: null, settledByMonth: { "2026-11": 2 } },
  unavailable: ["CLAIM"],
};

afterEach(() => apiFetch.mockReset());

describe("operations dashboard", () => {
  it("reads the summary in the app's words and keeps hidden figures as null, not zero", async () => {
    apiFetch.mockResolvedValueOnce(json(SUMMARY));
    const d = await getOperationsDashboard();
    expect(d.clients.byCategory).toEqual({ Corporate: 8, "State enterprise": 3, "Not recorded": 1 });
    expect(d.clients.topByPremium[0]!.premium).toBe(1_500_000);
    expect(d.claims.open).toBeNull();
    expect(d.unavailable).toEqual(["CLAIM"]);
  });

  it("sends report requests one at a time", async () => {
    let inFlight = 0;
    let most = 0;
    apiFetch.mockImplementation(async () => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return json({ items: [], hasMore: false });
    });
    await Promise.all([getDashboardList("OPEN_CLAIMS"), getDashboardList("OVERDUE_RENEWALS"), getDashboardList("ACTIVE_CLIENTS")]);
    expect(most).toBe(1);
  });

  it("waits and retries once when the server is busy", async () => {
    vi.useFakeTimers();
    apiFetch.mockResolvedValueOnce(json({}, 429, { "Retry-After": "1" })).mockResolvedValueOnce(json({ items: [{ id: "x" }], hasMore: true, nextCursor: "c2" }));
    const page = getDashboardList("CLAIMS_SETTLED", { month: "2026-11" });
    await vi.runAllTimersAsync();
    expect(await page).toMatchObject({ items: [{ id: "x" }], hasMore: true, nextCursor: "c2" });
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(String(apiFetch.mock.calls[0]![0])).toContain("/lists/CLAIMS_SETTLED?size=20&month=2026-11");
    vi.useRealTimers();
  });
});
