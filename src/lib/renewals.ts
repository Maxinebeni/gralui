// GRAL renewal milestones (SOP, backlog section E07) and small helpers the
// renewal screens share. Due dates here use plain calendar days; the backend
// will own the official dates once it applies the Rwanda working-day
// calendar (WFL-01) and GRAL confirms the counting rule (decision G03).

import type { RenewalCase, RenewalMilestoneCode } from "./types";

export type MilestoneDef = {
  code: RenewalMilestoneCode;
  name: string;
  /** Days relative to policy expiry (negative = before). */
  offset: number;
  owner: string;
  output: string;
};

export const RENEWAL_MILESTONES: MilestoneDef[] = [
  { code: "BRIEF", name: "Extract & Brief", offset: -120, owner: "Accounts Executive", output: "Case opened, owner and risk flags set" },
  { code: "VISIT", name: "Strategic Visit", offset: -100, owner: "Accounts Executive / CRM Manager", output: "Visit report" },
  { code: "NOTICE", name: "Formal Notice", offset: -90, owner: "Accounts Executive", output: "Renewal notice sent to client" },
  { code: "RFQ", name: "Request for Quotes", offset: -75, owner: "GI Underwriting Manager", output: "RFQ sent to insurers" },
  { code: "QUOTES", name: "Quotes & Comparison", offset: -60, owner: "GI Underwriting Manager", output: "Quotes compared, option recommended" },
  { code: "APPROVAL", name: "Approval & Presentation", offset: -45, owner: "Technical Director / MD", output: "Internal approval, options presented" },
  { code: "ACCEPTANCE", name: "Acceptance & Placement", offset: -30, owner: "Accounts Executive / GI Underwriting", output: "Written client acceptance, cover placed" },
  { code: "SCHEDULE", name: "Schedule Verification", offset: -15, owner: "GI Underwriting Manager", output: "Policy schedule received and checked" },
  { code: "DELIVERY", name: "Delivery to Client", offset: -7, owner: "Servicing staff", output: "Verified schedule delivered" },
  { code: "COMPLETION", name: "Completion", offset: 0, owner: "Accounts Executive", output: "Next policy period recorded" },
];

const DAY = 24 * 60 * 60 * 1000;

/** Today's business date in Rwanda (Africa/Kigali), as YYYY-MM-DD. */
export function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kigali" });
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round(
    (new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / DAY,
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-06" → "06 Oct 2026", matching the dates used across the design. */
export function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function milestoneDue(c: RenewalCase, m: MilestoneDef) {
  return addDays(c.expiryDate, m.offset);
}

/** Days from today until the policy expires (negative once expired). */
export function daysToExpiry(c: RenewalCase) {
  return daysBetween(todayIso(), c.expiryDate);
}

/** The next milestone to complete, or null when the case is finished. */
export function currentMilestone(c: RenewalCase): MilestoneDef | null {
  return RENEWAL_MILESTONES[c.completed.length] ?? null;
}

/** Days the current milestone is overdue (0 when on time or finished). */
export function daysOverdue(c: RenewalCase) {
  const m = currentMilestone(c);
  if (!m) return 0;
  return Math.max(0, daysBetween(milestoneDue(c, m), todayIso()));
}

export type RenewalHealth = "overdue" | "due-soon" | "on-track" | "completed";

export function renewalHealth(c: RenewalCase): RenewalHealth {
  if (!currentMilestone(c)) return "completed";
  if (daysOverdue(c) > 0) return "overdue";
  return daysToExpiry(c) <= 30 ? "due-soon" : "on-track";
}

/**
 * Why the current milestone can't be completed yet, or null if it can.
 * Mirrors the backlog's hard rules: quotes need a recommendation, and
 * placement needs written client acceptance.
 */
export function completionBlocker(c: RenewalCase): string | null {
  const m = currentMilestone(c);
  if (!m) return "This renewal is already completed.";
  if (m.code === "QUOTES") {
    if (c.quotes.length === 0) return "Add at least one insurer quote first.";
    if (!c.quotes.some((q) => q.recommended)) return "Mark one quote as recommended first.";
  }
  if (m.code === "ACCEPTANCE" && !c.acceptance) {
    return "Record the client's written acceptance first.";
  }
  return null;
}
