import { describe, expect, it } from "vitest";
import { loginHref, safeReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it("keeps paths on this site, with their query", () => {
    expect(safeReturnPath("/clients?client=CL00001")).toBe("/clients?client=CL00001");
    expect(safeReturnPath("/my-work")).toBe("/my-work");
  });

  it("refuses other sites and odd values", () => {
    for (const value of ["//evil.example", "/\\evil.example", "https://evil.example/x", "javascript:alert(1)", "clients", "", null, undefined, "/x\n"]) {
      expect(safeReturnPath(value)).toBe("/");
    }
  });

  it("never sends people back to a sign-in page", () => {
    expect(safeReturnPath("/login?next=/x")).toBe("/");
    expect(safeReturnPath("/reset-password")).toBe("/");
  });
});

describe("loginHref", () => {
  it("adds next only when there is somewhere to return to", () => {
    expect(loginHref("/")).toBe("/login");
    expect(loginHref("/clients?client=CL1")).toBe("/login?next=%2Fclients%3Fclient%3DCL1");
  });
});
