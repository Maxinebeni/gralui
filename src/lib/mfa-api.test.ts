import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Api from "./api";
import { groupSecret } from "@/components/gral/authenticator-setup";

let api: typeof Api;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn<typeof fetch>();
const me = { id: "u1", email: "md@example.com", fullName: "Synthetic MD", status: "ACTIVE", profileCategory: "BUSINESS", roles: ["MD"], permissions: [] };

function mockHttp(handler: (path: string, init?: RequestInit) => Response) {
  fetchMock.mockImplementation(async (input, init) => {
    const path = String(input);
    if (path === "/api/v1/auth/csrf") return json({ token: "test-csrf", headerName: "X-CSRF-TOKEN" });
    return handler(path, init);
  });
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_MOCK_AUTH", "false");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  api = await import("./api");
});

describe("two-step sign-in", () => {
  it("signs straight in when the account has no two-step login", async () => {
    mockHttp(() => json(me));
    const result = await api.signIn("md@example.com", "secret");
    expect(result.kind).toBe("signed-in");
  });

  it("asks for a code when the server answers 202 with a challenge", async () => {
    mockHttp(() => json({ challengeId: "c1", expiresInSeconds: 300 }, 202));
    const result = await api.signIn("md@example.com", "secret");
    expect(result).toMatchObject({ kind: "code-needed", challengeId: "c1" });
  });

  it("explains when the role needs two-step login that is not set up", async () => {
    mockHttp(() => json({ code: "MFA_ENROLLMENT_REQUIRED" }, 403));
    await expect(api.signIn("md@example.com", "secret")).rejects.toThrow(/needs two-step login/);
  });

  it("finishes sign-in with the code and sends the challenge with it", async () => {
    mockHttp((path, init) => {
      expect(path).toBe("/api/v1/auth/login/mfa");
      expect(JSON.parse(String(init?.body))).toEqual({ challengeId: "c1", code: "123456" });
      return json(me);
    });
    await expect(api.verifySignInCode("c1", " 123456 ")).resolves.toMatchObject({ email: "md@example.com" });
  });

  it("says plainly when the code is wrong, without ending the session", async () => {
    mockHttp(() => json({ code: "MFA_VERIFICATION_FAILED" }, 401));
    const expired = vi.fn();
    window.addEventListener("gral:session-expired", expired);
    await expect(api.verifySignInCode("c1", "000000")).rejects.toThrow(/did not work/);
    expect(expired).not.toHaveBeenCalled();
    window.removeEventListener("gral:session-expired", expired);
  });
});

describe("set-up during sign-in (ADR-036)", () => {
  it("goes straight to set-up when the server labels the challenge", async () => {
    mockHttp(() => json({ challengeId: "c2", expiresInSeconds: 300, enrollmentRequired: true }, 202));
    await expect(api.signIn("ae@example.com", "secret")).resolves.toMatchObject({ kind: "code-needed", setupFirst: true });
    mockHttp(() => json({ challengeId: "c3", expiresInSeconds: 300 }, 202));
    await expect(api.signIn("ae@example.com", "secret")).resolves.toMatchObject({ setupFirst: false });
  });

  it("starts set-up with the challenge, then signs in with the first code", async () => {
    mockHttp((path, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.challengeId).toBe("c2");
      if (path.endsWith("/pre-login/enrollment")) return json({ secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/GRAL?secret=JBSWY3DPEHPK3PXP" });
      expect(path).toBe("/api/v1/auth/mfa/pre-login/confirm");
      expect(body.code).toBe("123456");
      return json({ user: me, recoveryCodes: ["aaaa-bbbb"] });
    });
    await expect(api.startSignInSetup("c2")).resolves.toMatchObject({ secret: "JBSWY3DPEHPK3PXP" });
    const done = await api.confirmSignInSetup("c2", "123456");
    expect(done.user.email).toBe("md@example.com");
    expect(done.recoveryCodes).toEqual(["aaaa-bbbb"]);
  });

  it("explains when the account already has an app or the sign-in timed out", async () => {
    mockHttp(() => json({ code: "MFA_CHALLENGE_INVALID" }, 401));
    await expect(api.startSignInSetup("c3")).rejects.toThrow(/already has two-step login set up, or this sign-in has timed out/);
  });
});

describe("setting up two-step login", () => {
  it("returns the secret, then the recovery codes", async () => {
    mockHttp((path) =>
      path.endsWith("/enrollment")
        ? json({ secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/GRAL:md?secret=JBSWY3DPEHPK3PXP", algorithm: "SHA1", digits: 6, periodSeconds: 30 })
        : json({ recoveryCodes: ["aaaa-bbbb", "cccc-dddd"] }),
    );
    await expect(api.startMfaEnrollment("secret")).resolves.toMatchObject({ secret: "JBSWY3DPEHPK3PXP" });
    await expect(api.confirmMfaEnrollment("123456")).resolves.toEqual(["aaaa-bbbb", "cccc-dddd"]);
  });

  it("explains a wrong password or an account that already has it", async () => {
    mockHttp(() => json({ code: "INVALID_CREDENTIALS" }, 403));
    await expect(api.startMfaEnrollment("wrong")).rejects.toThrow(/password/);
    mockHttp(() => json({ code: "MFA_ALREADY_ENROLLED" }, 409));
    await expect(api.startMfaEnrollment("secret")).rejects.toThrow(/already set up/);
  });

  it("groups the key in fours for typing by hand", () => {
    expect(groupSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
  });
});
