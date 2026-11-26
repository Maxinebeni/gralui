import { describe, expect, it } from "vitest";
import { kigaliDate } from "./renewals";

describe("kigaliDate", () => {
  it("uses the Kigali day, not the UTC day", () => {
    // 23:30 UTC on 25 Nov is 01:30 on 26 Nov in Kigali (UTC+2).
    expect(kigaliDate("2026-11-25T23:30:00Z")).toBe("2026-11-26");
    expect(kigaliDate("2026-11-25T21:59:59.999Z")).toBe("2026-11-25");
  });

  it("passes plain dates through and handles missing values", () => {
    expect(kigaliDate("2026-11-25")).toBe("2026-11-25");
    expect(kigaliDate(undefined)).toBeUndefined();
    expect(kigaliDate(null)).toBeUndefined();
  });
});
