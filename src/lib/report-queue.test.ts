import { describe, expect, it } from "vitest";
import { oneReportAtATime, retryDelayMs } from "./report-queue";

describe("report queue", () => {
  it("runs report requests one after another, even when one fails", async () => {
    const log: string[] = [];
    const slow = oneReportAtATime(async () => {
      log.push("a start");
      await new Promise((r) => setTimeout(r, 20));
      log.push("a end");
      throw new Error("busy");
    });
    const fast = oneReportAtATime(async () => {
      log.push("b start");
      return "b";
    });
    await expect(slow).rejects.toThrow("busy");
    await expect(fast).resolves.toBe("b");
    expect(log).toEqual(["a start", "a end", "b start"]);
  });

  it("waits for Retry-After, capped at 10 seconds", () => {
    const after = (value: string | null) => new Response(null, { status: 429, headers: value ? { "Retry-After": value } : {} });
    expect(retryDelayMs(after("3"))).toBeGreaterThanOrEqual(3000);
    expect(retryDelayMs(after("3"))).toBeLessThan(3500);
    expect(retryDelayMs(after("120"))).toBeLessThan(10_500);
    expect(retryDelayMs(after(null))).toBeGreaterThanOrEqual(2000);
  });
});
