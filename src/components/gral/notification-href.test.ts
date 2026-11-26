import { describe, expect, it } from "vitest";
import { notificationHref } from "./shell";

describe("notificationHref", () => {
  const id = "3f2a9c1e-5b7d-4e2a-9c1f-8d6e5a4b3c2d";

  it("opens the record a notice names", () => {
    expect(notificationHref("BUSINESS_NOTICE_V1", "APPROVAL", id)).toBe(`/approvals?request=${id}`);
    expect(notificationHref("TASK_ASSIGNED_V1", "TASK", id)).toBe(`/my-work?task=${id}`);
    expect(notificationHref("RENEWAL_ALERT_V1", "RENEWAL", id)).toBe("/renewals?case=REN-3F2A9C1E");
    expect(notificationHref("CLIENT_V1", "CLIENT", id)).toBe(`/clients?client=${id}`);
  });

  it("falls back to the section for older notices", () => {
    expect(notificationHref("APPROVAL_REQUESTED_V1")).toBe("/approvals");
    expect(notificationHref("TASK_ASSIGNED_V1", null, null)).toBe("/my-work");
    expect(notificationHref("PASSWORD_CHANGED_V1", "OTHER", id)).toBe("/settings");
  });
});
