// GRAL claim steps (SOP: six steps, disputes go to the Claims Committee) and
// the helpers the claim screens share. Working days here skip weekends only;
// the backend's Rwanda calendar (WFL-01, with public holidays) becomes the
// source of truth once claims are connected.

import { formatDate, todayIso } from "./renewals";
import type { Claim, ClaimStepCode } from "./types";

export type ClaimStepDef = {
  code: ClaimStepCode;
  n: number;
  name: string;
  /** Time allowed for the step, in working days (0 = same day, 24 hours). */
  slaDays: number;
  slaLabel: string;
};

export const CLAIM_STEP_DEFS: ClaimStepDef[] = [
  { code: "REGISTER", n: 1, name: "Register", slaDays: 1, slaLabel: "24 hours" },
  { code: "DOCUMENTS", n: 2, name: "Documents", slaDays: 3, slaLabel: "3 working days" },
  { code: "SUBMIT", n: 3, name: "Submit", slaDays: 2, slaLabel: "2 working days" },
  { code: "FOLLOW_UP", n: 4, name: "Follow up", slaDays: 10, slaLabel: "every 10 working days" },
  { code: "SETTLEMENT", n: 5, name: "Settlement", slaDays: 2, slaLabel: "2 working days" },
  { code: "CLOSE", n: 6, name: "Close", slaDays: 5, slaLabel: "5 working days" },
];

/** No insurer response for this many working days → escalate (SOP). */
export const NO_RESPONSE_ESCALATION_DAYS = 15;
/** The Claims Committee must decide a dispute within this many working days. */
export const COMMITTEE_DAYS = 5;

export function stepDef(code: ClaimStepCode): ClaimStepDef {
  return CLAIM_STEP_DEFS.find((s) => s.code === code)!;
}

/* ------------------------------- Working days -------------------------------- */

function isWeekend(iso: string) {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function shift(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Add (or subtract, if negative) working days to a date. */
export function addWorkingDays(iso: string, days: number) {
  let date = iso;
  let left = Math.abs(days);
  const dir = days < 0 ? -1 : 1;
  while (left > 0) {
    date = shift(date, dir);
    if (!isWeekend(date)) left--;
  }
  return date;
}

/** Working days from `from` to `to` (negative if `to` is earlier). */
export function workingDaysBetween(from: string, to: string) {
  if (from === to) return 0;
  const forward = from < to;
  let date = from;
  let count = 0;
  while (date !== to) {
    date = shift(date, forward ? 1 : -1);
    if (!isWeekend(date)) count++;
  }
  return forward ? count : -count;
}

/* -------------------------------- Status ------------------------------------- */

export function isClosed(c: Claim) {
  return !!c.closure;
}

export function isDisputed(c: Claim) {
  return !!c.dispute && !c.dispute.decision && !c.closure;
}

/** Date the current step (or committee decision) is due. */
export function dueDate(c: Claim): string | null {
  if (isClosed(c)) return null;
  if (isDisputed(c)) return addWorkingDays(c.dispute!.raisedAt, COMMITTEE_DAYS);
  if (c.step === "FOLLOW_UP") {
    const last = c.followUps.at(-1)?.date ?? c.submission?.submittedAt ?? c.stepStartedAt;
    return addWorkingDays(last, stepDef("FOLLOW_UP").slaDays);
  }
  return addWorkingDays(c.stepStartedAt, stepDef(c.step).slaDays);
}

/** Working days left on the current step (negative = overdue). */
export function workingDaysLeft(c: Claim): number | null {
  const due = dueDate(c);
  return due ? workingDaysBetween(todayIso(), due) : null;
}

export type ClaimSla = "breached" | "approaching" | "ontrack" | "closed";

export function claimSla(c: Claim): ClaimSla {
  const left = workingDaysLeft(c);
  if (left === null) return "closed";
  if (left < 0) return "breached";
  if (left <= 1) return "approaching";
  return "ontrack";
}

export function slaLabel(c: Claim): string | null {
  const left = workingDaysLeft(c);
  if (left === null) return null;
  if (left < 0) return `Overdue ${Math.abs(left)}d`;
  if (left === 0) return "Due today";
  if (left <= 1) return "Due in 1d";
  return null;
}

/**
 * Working days since the insurer last responded (or since submission).
 * Returns null before submission or once settled/closed.
 */
export function daysWithoutInsurerResponse(c: Claim): number | null {
  if (!c.submission || c.step !== "FOLLOW_UP" || isDisputed(c)) return null;
  const lastResponse = [...c.followUps].reverse().find((f) => f.insurerResponded)?.date;
  return workingDaysBetween(lastResponse ?? c.submission.submittedAt, todayIso());
}

export function needsEscalation(c: Claim) {
  const days = daysWithoutInsurerResponse(c);
  return days !== null && days >= NO_RESPONSE_ESCALATION_DAYS;
}

export function missingDocuments(c: Claim) {
  return c.documents.filter((d) => d.required && !d.filedAt);
}

export function daysOpen(c: Claim) {
  return workingDaysBetween(c.dateReported, c.closure?.closedAt ?? todayIso());
}

/** Label for where the claim is, e.g. "4 · Follow up" or "Disputed". */
export function stageLabel(c: Claim) {
  if (isClosed(c)) return c.closure!.outcome === "SETTLED" ? "Closed · settled" : "Closed · rejected";
  if (isDisputed(c)) return "Disputed · Claims Committee";
  const s = stepDef(c.step);
  return `${s.n} · ${s.name}`;
}

/* ------------------------------ Settlement sign-off -------------------------- */
// PROVISIONAL: amount thresholds from the requirements document / design.
// Rachel's data-shapes note lists this as an open question for GRAL (SOP steps
// vs. sign-off at RWF 500,000, 5M and 20M).

export function claimSignOffChain(amount: number): string[] {
  if (amount <= 500_000) return ["DMD"];
  if (amount <= 5_000_000) return ["DMD", "MD"];
  if (amount <= 20_000_000) return ["MD"];
  return ["MD", "Board"];
}

/** The next role that must sign, or null when sign-off is complete. */
export function nextSigner(c: Claim): string | null {
  if (!c.settlement) return null;
  return claimSignOffChain(c.settlement.amount).find((s) => !c.settlement!.signedBy.includes(s)) ?? null;
}

/* --------------------------------- Blockers ---------------------------------- */

/** What stops the claim moving on right now, or null if nothing does. */
export function claimBlocker(c: Claim): string | null {
  if (isClosed(c)) return null;
  if (isDisputed(c)) return "Claims Committee decision";
  switch (c.step) {
    case "DOCUMENTS": {
      const missing = missingDocuments(c);
      return missing.length ? `Missing ${missing.map((d) => d.name.toLowerCase()).join(", ")}` : null;
    }
    case "FOLLOW_UP":
      if (needsEscalation(c)) return `No insurer response for ${daysWithoutInsurerResponse(c)} working days`;
      if ((workingDaysLeft(c) ?? 0) < 0) return "Follow-up overdue";
      return null;
    case "SETTLEMENT": {
      const signer = nextSigner(c);
      if (signer) return `${signer} sign-off`;
      return c.settlement?.paidToClientAt ? null : "Payment to client";
    }
    default:
      return null;
  }
}

export function dueLabel(c: Claim) {
  const due = dueDate(c);
  return due ? formatDate(due) : "Closed";
}
