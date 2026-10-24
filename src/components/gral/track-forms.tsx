"use client";

// One policy track (SOP steps 3 to 11) as a full page: the step tracker, the
// chosen step's record and its actions, and the track's details and history.
// The backend decides which actions are allowed (availableActions) and what is
// blocking; this page shows them and builds each action's form.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { onboardingOptions, runTrackAction, type ChoiceOption, type EvidenceInput, type TrackActionInput, type TrackDetail } from "@/lib/api";
import { addWorkingDays } from "@/lib/claims";
import { amountInWords, parseAmount } from "@/lib/amounts";
import { formatRwf } from "@/lib/format";
import {
  ACTION_LABEL,
  KYC_STATUS_LABEL,
  TIER_LABEL,
  TRACK_PHASES,
  TRACK_STAGES,
  TRACK_STATUS_LABEL,
  blockerText,
  commissionTier,
  openMilestone,
  phaseOf,
  stageOf,
  trackHealth,
} from "@/lib/onboarding";
import { todayIso } from "@/lib/renewals";
import type { PolicyTerms, PolicyTrack } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AmountInput } from "./amount-input";
import { PageHeader } from "./shell";
import { ActionForm, Blockers, EvidenceField, HealthChip, HistoryList, Label, ProofList, SelectInput, TextInput, dateOf } from "./onboarding-ui";
import { Chip, FloatCard, OutlineButton } from "./ui";
import { inputClass } from "./client-form";

const PROOF_LABELS: Record<string, string> = {
  RISK_SURVEY: "Risk survey report",
  PROGRAM: "Programme signed by the TD",
  RFQ: "Requests for quotations",
  SINGLE_SOURCE: "Single-source justification",
  RECOMMENDATION: "Recommendation report",
  BOARD_APPROVAL: "Board approval",
  CLIENT_PRESENTATION: "Presentation",
  CLIENT_ACCEPTANCE: "Written acceptance",
  PROPERTY_ASSET_LIST: "Asset list",
  PLACEMENT: "Instruction to the insurer",
  PLACEMENT_CONFIRMATION: "Insurer's confirmation",
  SCHEDULE: "Policy schedule",
  POLICY_TECHNICAL_APPROVAL: "TD's check of the schedule",
  WELCOME_LETTER: "Welcome letter",
  POLICY_DELIVERY: "Policy delivery",
  FILE_CHECKLIST: "Client file checklist",
};

/** Which actions belong to which step's panel. The rest sit under "Other actions". */
export const STAGE_ACTIONS: Record<number, string[]> = {
  3: ["QUALIFY_KYC"],
  4: ["SURVEY", "SURVEY_NOT_APPLICABLE"],
  5: ["PROGRAM"],
  6: ["RFQ"],
  7: ["QUOTE", "RECOMMEND"],
  8: ["REQUEST_APPROVAL", "RECORD_BOARD_EVIDENCE", "PRESENT"],
  9: ["PRESENT", "ACCEPT", "PROPERTY_ASSETS", "PLACE"],
  10: ["CONFIRM_PLACEMENT", "SCHEDULE", "TECHNICAL_VERIFICATION", "VERIFY", "CONVERT"],
  11: ["WELCOME"],
};
const SIDE_ACTIONS = ["LICENSE", "REVISE", "ASSIGN", "ON_HOLD", "RESUME", "CLOSE"];

export type TrackOptions = { products: ChoiceOption[]; insurers: ChoiceOption[]; accountExecutives: ChoiceOption[] };
export type TrackRun = (input: TrackActionInput) => Promise<void>;

type StageState = "done" | "current" | "late" | "upcoming";

/** What has been recorded for a step so far. */
export function StageRecord({ track: t, n, insurerName }: { track: PolicyTrack; n: number; insurerName: (id: string) => string }) {
  const proofs = (purposes: string[]) => t.evidence.filter((e) => purposes.includes(e.purpose));
  const block = (children: ReactNode) => <div className="space-y-2 rounded-xl bg-secondary/60 px-4 py-3 text-xs">{children}</div>;

  switch (n) {
    case 3:
      return block(
        <>
          <p>
            Client&apos;s KYC: <span className="font-medium">{KYC_STATUS_LABEL[t.kyc?.status ?? "NOT_STARTED"]}</span>
            {t.kyc?.missingRequirements.length ? ` · missing ${t.kyc.missingRequirements.join(", ")}` : ""}
          </p>
          <Link href={`/clients/kyc/${encodeURIComponent(t.kyc?.caseId ?? t.clientId)}`} className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2">
            Open the client&apos;s KYC review <ExternalLink className="size-3" />
          </Link>
        </>,
      );
    case 4:
      return t.riskGrade
        ? block(
            <>
              <p>
                Grade: <span className="font-medium">{t.riskGrade === "NOT_APPLICABLE" ? "Not applicable" : t.riskGrade}</span>
              </p>
              {t.surveyFindings ? <p className="text-muted-foreground">{t.surveyFindings}</p> : null}
              <ProofList items={proofs(["RISK_SURVEY"])} labels={PROOF_LABELS} />
            </>,
          )
        : null;
    case 5:
      return t.programTerms ? block(<><p>{t.programTerms}</p><ProofList items={proofs(["PROGRAM"])} labels={PROOF_LABELS} /></>) : null;
    case 6:
    case 7:
      return t.invitations.length || t.quotes.length ? (
        <div className="space-y-3">
          {t.invitations.length ? (
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Insurers asked</p>
              <ul className="mt-2 space-y-1.5">
                {t.invitations.map((i) => (
                  <li key={i.insurerId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-xs">
                    <span className="font-medium">{insurerName(i.insurerId)}</span>
                    <span className="text-muted-foreground">
                      {i.response === "QUOTED" ? (
                        <Chip tone="success">Quoted</Chip>
                      ) : i.response === "DECLINED" ? (
                        <Chip>Declined{i.responseDetail ? `: ${i.responseDetail}` : ""}</Chip>
                      ) : i.response === "NO_RESPONSE" ? (
                        <Chip tone="warning">No reply</Chip>
                      ) : (
                        <>Reply due {dateOf(i.responseDue)}</>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2">
                <ProofList items={proofs(["RFQ", "SINGLE_SOURCE"])} labels={PROOF_LABELS} />
              </div>
            </div>
          ) : null}
          {t.quotes.length ? <QuoteTable track={t} insurerName={insurerName} /> : null}
          {t.recommendation ? <RecommendationBox track={t} insurerName={insurerName} /> : null}
        </div>
      ) : null;
    case 8:
      return t.recommendation ? (
        <div className="space-y-2">
          <RecommendationBox track={t} insurerName={insurerName} />
          {t.approvalRequests.RECOMMENDATION ? (
            <p className="text-xs">
              Approval request:{" "}
              <Link href={`/approvals?request=${encodeURIComponent(t.approvalRequests.RECOMMENDATION)}`} className="font-medium text-primary underline underline-offset-2">
                open in Approvals
              </Link>
            </p>
          ) : null}
          {t.boardApproval ? <p className="text-xs">Board approval recorded on {dateOf(t.boardApproval.recordedAt)} (decided {dateOf(t.boardApproval.decisionAt)}).</p> : null}
          <ProofList items={proofs(["RECOMMENDATION", "BOARD_APPROVAL"])} labels={PROOF_LABELS} />
        </div>
      ) : null;
    case 9:
      return proofs(["CLIENT_PRESENTATION", "CLIENT_ACCEPTANCE", "PROPERTY_ASSET_LIST"]).length ? block(<ProofList items={proofs(["CLIENT_PRESENTATION", "CLIENT_ACCEPTANCE", "PROPERTY_ASSET_LIST"])} labels={PROOF_LABELS} />) : null;
    case 10:
      return proofs(["PLACEMENT", "PLACEMENT_CONFIRMATION", "SCHEDULE", "POLICY_TECHNICAL_APPROVAL"]).length || t.observedSchedule ? (
        <div className="space-y-2">
          {block(<ProofList items={proofs(["PLACEMENT", "PLACEMENT_CONFIRMATION", "SCHEDULE", "POLICY_TECHNICAL_APPROVAL"])} labels={PROOF_LABELS} />)}
          {t.observedSchedule ? <TermsSummary title="Terms on the insurer's schedule" terms={t.observedSchedule} insurerName={insurerName} /> : null}
          {t.discrepancies.length ? (
            <ul className="rounded-xl bg-danger-soft/40 px-3.5 py-2.5 text-xs">
              {t.discrepancies.map((d) => (
                <li key={d}>• {d}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null;
    case 11:
      return proofs(["WELCOME_LETTER", "POLICY_DELIVERY", "FILE_CHECKLIST"]).length ? block(<ProofList items={proofs(["WELCOME_LETTER", "POLICY_DELIVERY", "FILE_CHECKLIST"])} labels={PROOF_LABELS} />) : null;
    default:
      return null;
  }
}

function QuoteTable({ track: t, insurerName }: { track: PolicyTrack; insurerName: (id: string) => string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Quotes</p>
      <ul className="mt-2 space-y-1.5">
        {t.quotes.map((q) => (
          <li key={q.id} className={cn("rounded-xl border px-3 py-2 text-xs", t.recommendation?.quoteId === q.id ? "border-sky/40 bg-pale" : "border-border")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{insurerName(q.terms.insurerId)}</span>
              <span className="font-semibold tabular-nums">{formatRwf(q.terms.totalPremium)}</span>
            </div>
            <p className="mt-0.5 text-muted-foreground">
              Net {formatRwf(q.terms.netPremium)} · commission {+(q.terms.commissionRate * 100).toFixed(2)}% · {q.terms.sumsInsured} · deductible {q.terms.deductibles}
            </p>
            {t.recommendation?.quoteId === q.id ? <p className="mt-1 font-medium text-primary">Recommended</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecommendationBox({ track: t, insurerName }: { track: PolicyTrack; insurerName: (id: string) => string }) {
  const r = t.recommendation!;
  const q = t.quotes.find((x) => x.id === r.quoteId);
  return (
    <div className="space-y-1 rounded-xl border border-sky/40 bg-pale px-3.5 py-3 text-xs">
      <p className="font-medium">
        Recommended: {q ? insurerName(q.terms.insurerId) : "a quote"} {q ? `at ${formatRwf(q.terms.totalPremium)}` : ""}
      </p>
      <p>
        Expected annual commission {formatRwf(r.annualCommissionRwf)} ({r.basis})
      </p>
      <p className="text-muted-foreground">{TIER_LABEL[r.tier] ?? r.tier}</p>
      {r.rationale ? <p className="text-muted-foreground">Why: {r.rationale}</p> : null}
    </div>
  );
}

function TermsSummary({ title, terms, insurerName }: { title: string; terms: PolicyTerms; insurerName: (id: string) => string }) {
  return (
    <div className="rounded-xl border border-border px-3.5 py-3 text-xs">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-muted-foreground">
        {insurerName(terms.insurerId)} · {formatRwf(terms.totalPremium)} (net {formatRwf(terms.netPremium)}) · cover {dateOf(terms.effectDate)} to {dateOf(terms.expiryDate)} · {terms.sumsInsured}
      </p>
    </div>
  );
}

/* --------------------------------- Actions ----------------------------------- */

export function ActionPanel({
  action,
  track,
  options,
  insurerName,
  run,
  leadName,
  collapsed,
}: {
  action: string;
  track: PolicyTrack;
  options: TrackOptions;
  insurerName: (id: string) => string;
  run: TrackRun;
  leadName: string;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);
  const label = action === "INSURER_RESPONSE" ? "Record a decline or no reply" : (ACTION_LABEL[action] ?? action);
  if (!open) {
    return <OutlineButton onClick={() => setOpen(true)}>{label}</OutlineButton>;
  }
  return <ActionFormFor action={action} track={track} options={options} insurerName={insurerName} run={run} leadName={leadName} title={label} onCancel={collapsed ? () => setOpen(false) : undefined} />;
}

/** One-document actions: just the proof and when it happened. */
const SIMPLE_PROOF: Record<string, { label: string; dateLabel: string; success: string }> = {
  RECORD_BOARD_EVIDENCE: { label: "The Board's written approval", dateLabel: "Board decided on", success: "Board approval recorded." },
  PRESENT: { label: "Record of the presentation", dateLabel: "Presented on", success: "Presentation recorded." },
  ACCEPT: { label: "The client's written acceptance", dateLabel: "Accepted on", success: "Written acceptance recorded. Placement is due within 2 working days." },
  PROPERTY_ASSETS: { label: "The client's detailed asset list", dateLabel: "Received on", success: "Asset list recorded." },
  PLACE: { label: "The formal instruction to the insurer", dateLabel: "Sent on", success: "Insurer instructed." },
  CONFIRM_PLACEMENT: { label: "The insurer's confirmation", dateLabel: "Confirmed on", success: "Placement confirmed." },
  TECHNICAL_VERIFICATION: { label: "The Technical Director's signed check", dateLabel: "Checked on", success: "Technical check recorded." },
};

function ActionFormFor({
  action,
  track: t,
  options,
  insurerName,
  run,
  leadName,
  title,
  onCancel,
}: {
  action: string;
  track: PolicyTrack;
  options: TrackOptions;
  insurerName: (id: string) => string;
  run: TrackRun;
  leadName: string;
  title: string;
  onCancel?: () => void;
}) {
  const [evidence, setEvidence] = useState<EvidenceInput | null>(null);
  const [reason, setReason] = useState("");
  const destination = (what: string) => `${what} · ${leadName} · ${t.productName}`;

  const simple = SIMPLE_PROOF[action];
  if (simple) {
    return (
      <ActionForm title={title} submitLabel={title} success={simple.success} onCancel={onCancel} onSubmit={() => run({ action, evidence: evidence ? { main: evidence } : undefined })}>
        <EvidenceField label={simple.label} destination={destination(simple.label)} value={evidence} onChange={setEvidence} dateLabel={simple.dateLabel} withNote />
      </ActionForm>
    );
  }

  switch (action) {
    case "QUALIFY_KYC":
      return (
        <ActionForm title={title} submitLabel="Confirm and continue" success="KYC confirmed. The risk survey is next." onCancel={onCancel} onSubmit={() => run({ action })} />
      );
    case "SURVEY":
      return <SurveyForm title={title} run={run} destination={destination("Risk survey report")} onCancel={onCancel} />;
    case "SURVEY_NOT_APPLICABLE":
      return (
        <ActionForm title={title} submitLabel={title} success="Recorded. The programme is next." onCancel={onCancel} onSubmit={() => run({ action, reason })}>
          <TextInput id="sna-reason" label="Reason" value={reason} onChange={setReason} wide placeholder="e.g. Private home and two cars; no site survey needed" />
        </ActionForm>
      );
    case "PROGRAM":
      return <ProgramForm title={title} run={run} destination={destination("Programme signed by the TD")} onCancel={onCancel} />;
    case "RFQ":
      return <RfqForm title={title} track={t} options={options} run={run} destination={destination("Requests for quotations")} onCancel={onCancel} />;
    case "SINGLE_SOURCE":
      return (
        <ActionForm
          title={title}
          submitLabel="Send for approval"
          success="Single-source exception sent for approval."
          onCancel={onCancel}
          onSubmit={() => run({ action, evidence: evidence ? { main: evidence } : undefined })}
        >
          <EvidenceField label="Written justification" destination={destination("Single-source justification")} value={evidence} onChange={setEvidence} withNote />
        </ActionForm>
      );
    case "INSURER_RESPONSE":
      return <InsurerResponseForm title={title} track={t} insurerName={insurerName} run={run} onCancel={onCancel} />;
    case "QUOTE":
      return <QuoteForm title={title} track={t} options={options} run={run} leadName={leadName} destination={destination("Quote")} onCancel={onCancel} />;
    case "RECOMMEND":
      return <RecommendForm title={title} track={t} insurerName={insurerName} run={run} destination={destination("Recommendation report")} onCancel={onCancel} />;
    case "REQUEST_APPROVAL": {
      const tier = t.recommendation?.tier ?? "STANDARD";
      return (
        <ActionForm title={title} intro={TIER_LABEL[tier] ?? tier} submitLabel="Send for approval" success="Sent for internal approval." onCancel={onCancel} onSubmit={() => run({ action })} />
      );
    }
    case "SCHEDULE":
      return <ScheduleForm title={title} track={t} options={options} run={run} leadName={leadName} destination={destination("Policy schedule")} onCancel={onCancel} />;
    case "VERIFY":
      return (
        <ActionForm title={title} submitLabel="Verify the schedule" success="Schedule verified. The track can now be converted into the client's policy." onCancel={onCancel} onSubmit={() => run({ action })} />
      );
    case "CONVERT":
      return <ConvertForm title={title} track={t} run={run} onCancel={onCancel} />;
    case "WELCOME":
      return <WelcomeForm title={title} run={run} destination={destination} onCancel={onCancel} />;
    default:
      return null;
  }
}

function SurveyForm({ title, run, destination, onCancel }: { title: string; run: TrackRun; destination: string; onCancel?: () => void }) {
  const [grade, setGrade] = useState("");
  const [findings, setFindings] = useState("");
  const [evidence, setEvidence] = useState<EvidenceInput | null>(null);
  return (
    <ActionForm
      title={title}
      submitLabel={title}
      success="Risk survey recorded. The programme is due within 3 working days."
      onCancel={onCancel}
      onSubmit={() => {
        if (!grade || !findings.trim()) throw new Error("Choose the grade and write the findings.");
        return run({ action: "SURVEY", fields: { grade, findings: findings.trim() }, evidence: evidence ? { main: evidence } : undefined });
      }}
    >
      <SelectInput id="sv-grade" label="Risk grade" value={grade} onChange={setGrade} placeholder="Select" options={["LOW", "MEDIUM", "HIGH"].map((g) => ({ value: g, label: g.charAt(0) + g.slice(1).toLowerCase() }))} />
      <TextInput id="sv-findings" label="Findings" value={findings} onChange={setFindings} multiline wide placeholder="e.g. Sprinklers working; generator room needs a second extinguisher" />
      <EvidenceField label="Risk survey report" destination={destination} value={evidence} onChange={setEvidence} dateLabel="Surveyed on" />
    </ActionForm>
  );
}

function ProgramForm({ title, run, destination, onCancel }: { title: string; run: TrackRun; destination: string; onCancel?: () => void }) {
  const [terms, setTerms] = useState("");
  const [evidence, setEvidence] = useState<EvidenceInput | null>(null);
  return (
    <ActionForm
      title={title}
      submitLabel={title}
      success="Programme recorded. The requests for quotations are due within 24 hours."
      onCancel={onCancel}
      onSubmit={() => {
        if (!terms.trim()) throw new Error("Describe the recommended covers.");
        return run({ action: "PROGRAM", fields: { terms: terms.trim() }, evidence: evidence ? { main: evidence } : undefined });
      }}
    >
      <TextInput id="pg-terms" label="Recommended covers" value={terms} onChange={setTerms} multiline wide placeholder="e.g. Property all risks RWF 4bn and public liability RWF 500m" />
      <EvidenceField label="Programme signed by the Technical Director" destination={destination} value={evidence} onChange={setEvidence} dateLabel="Signed on" />
    </ActionForm>
  );
}

function RfqForm({ title, track: t, options, run, destination, onCancel }: { title: string; track: PolicyTrack; options: TrackOptions; run: TrackRun; destination: string; onCancel?: () => void }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [responseDue, setResponseDue] = useState(addWorkingDays(todayIso(), 3));
  const [evidence, setEvidence] = useState<EvidenceInput | null>(null);
  const exception = !!t.approvalRequests.SINGLE_SOURCE;
  return (
    <ActionForm
      title={title}
      submitLabel="Record the requests"
      success="Requests for quotations recorded."
      onCancel={onCancel}
      onSubmit={() => {
        if (chosen.length < (exception ? 1 : 3)) throw new Error(exception ? "Choose at least one insurer." : "Choose at least 3 insurers, or ask for a single-source exception.");
        return run({ action: "RFQ", fields: { insurerIds: chosen, responseDue }, evidence: evidence ? { main: evidence } : undefined });
      }}
    >
      <fieldset className="sm:col-span-2">
        <Label>Insurers asked ({chosen.length} chosen)</Label>
        <div className="mt-1.5 grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-border p-2 sm:grid-cols-2">
          {options.insurers.map((i) => (
            <label key={i.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-secondary/60">
              <input type="checkbox" checked={chosen.includes(i.id)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, i.id] : c.filter((x) => x !== i.id)))} />
              {i.name}
            </label>
          ))}
        </div>
      </fieldset>
      <TextInput id="rfq-due" label="Replies due by" type="date" min={todayIso()} value={responseDue} onChange={setResponseDue} />
      <EvidenceField label="Terms of reference sent to the insurers" destination={destination} value={evidence} onChange={setEvidence} dateLabel="Sent on" />
    </ActionForm>
  );
}

function InsurerResponseForm({ title, track: t, insurerName, run, onCancel }: { title: string; track: PolicyTrack; insurerName: (id: string) => string; run: TrackRun; onCancel?: () => void }) {
  const waiting = t.invitations.filter((i) => !i.response);
  const [insurerId, setInsurerId] = useState(waiting[0]?.insurerId ?? "");
  const [outcome, setOutcome] = useState("DECLINED");
  const [detail, setDetail] = useState("");
  return (
    <ActionForm
      title={title}
      submitLabel="Record"
      success="Recorded."
      onCancel={onCancel}
      onSubmit={() => {
        if (!detail.trim()) throw new Error("Add what the insurer said, or how you followed up.");
        return run({ action: "INSURER_RESPONSE", fields: { insurerId, outcome, detail: detail.trim() } });
      }}
    >
      <SelectInput id="ir-ins" label="Insurer" value={insurerId} onChange={setInsurerId} options={waiting.map((i) => ({ value: i.insurerId, label: `${insurerName(i.insurerId)} (due ${dateOf(i.responseDue)})` }))} />
      <SelectInput id="ir-out" label="Outcome" value={outcome} onChange={setOutcome} options={[{ value: "DECLINED", label: "Declined to quote" }, { value: "NO_RESPONSE", label: "No reply by the due date" }]} />
      <TextInput id="ir-detail" label="Details" value={detail} onChange={setDetail} wide placeholder="e.g. Declined: does not write bankers bond" />
    </ActionForm>
  );
}

/** The terms of a quote or schedule: the fields the backend compares to catch mismatches. */
function TermsFields({ value, onChange, options, prefix }: { value: TermsDraft; onChange: (v: TermsDraft) => void; options: TrackOptions; prefix: string }) {
  const set = (k: keyof TermsDraft) => (v: string) => onChange({ ...value, [k]: v });
  return (
    <>
      <SelectInput id={`${prefix}-ins`} label="Insurer" value={value.insurerId} onChange={set("insurerId")} placeholder="Select an insurer" options={options.insurers.map((i) => ({ value: i.id, label: i.name }))} wide />
      <TextInput id={`${prefix}-insured`} label="Insured name" value={value.insuredName} onChange={set("insuredName")} wide />
      <TextInput id={`${prefix}-from`} label="Cover from" type="date" value={value.effectDate} onChange={set("effectDate")} />
      <TextInput id={`${prefix}-to`} label="Cover to" type="date" value={value.expiryDate} onChange={set("expiryDate")} />
      <div>
        <Label htmlFor={`${prefix}-total`}>Total premium (RWF)</Label>
        <AmountInput id={`${prefix}-total`} value={value.totalPremium} onChange={set("totalPremium")} className={inputClass()} />
      </div>
      <div>
        <Label htmlFor={`${prefix}-net`}>Net premium (RWF)</Label>
        <AmountInput id={`${prefix}-net`} value={value.netPremium} onChange={set("netPremium")} className={inputClass()} />
      </div>
      <TextInput id={`${prefix}-rate`} label="Commission rate (%)" value={value.commissionRate} onChange={set("commissionRate")} placeholder="e.g. 15" />
      <TextInput id={`${prefix}-sums`} label="Sums insured" value={value.sumsInsured} onChange={set("sumsInsured")} placeholder="e.g. Buildings RWF 3bn, contents RWF 1bn" />
      <TextInput id={`${prefix}-limits`} label="Limits" value={value.limits} onChange={set("limits")} />
      <TextInput id={`${prefix}-ded`} label="Deductibles" value={value.deductibles} onChange={set("deductibles")} />
      <TextInput id={`${prefix}-excl`} label="Exclusions" value={value.exclusions} onChange={set("exclusions")} wide />
      <TextInput id={`${prefix}-claims`} label="Claims support" value={value.claimsSupport} onChange={set("claimsSupport")} wide />
    </>
  );
}

type TermsDraft = Record<"insurerId" | "insuredName" | "effectDate" | "expiryDate" | "totalPremium" | "netPremium" | "commissionRate" | "sumsInsured" | "limits" | "deductibles" | "exclusions" | "claimsSupport", string>;

function draftFrom(terms: PolicyTerms | undefined, insuredName: string): TermsDraft {
  return {
    insurerId: terms?.insurerId ?? "",
    insuredName: terms?.insuredName ?? insuredName,
    effectDate: terms?.effectDate ?? addWorkingDays(todayIso(), 10),
    expiryDate: terms?.expiryDate ?? "",
    totalPremium: terms ? terms.totalPremium.toLocaleString("en-US") : "",
    netPremium: terms ? terms.netPremium.toLocaleString("en-US") : "",
    commissionRate: terms ? String(+(terms.commissionRate * 100).toFixed(4)) : "15",
    sumsInsured: terms?.sumsInsured ?? "",
    limits: terms?.limits ?? "",
    deductibles: terms?.deductibles ?? "",
    exclusions: terms?.exclusions ?? "",
    claimsSupport: terms?.claimsSupport ?? "",
  };
}

function termsFrom(d: TermsDraft, productId: string): PolicyTerms {
  const total = parseAmount(d.totalPremium);
  const net = parseAmount(d.netPremium);
  const rate = Number(d.commissionRate);
  const missing = (["insurerId", "insuredName", "effectDate", "expiryDate", "sumsInsured", "limits", "deductibles", "exclusions", "claimsSupport"] as const).filter((k) => !d[k].trim());
  if (missing.length) throw new Error("Fill in every term. The backend compares them all with the insurer's schedule later.");
  if (!(total > 0) || !(net > 0)) throw new Error("Enter the total and net premium in RWF.");
  if (net > total) throw new Error("The net premium cannot be more than the total premium.");
  if (!(rate >= 0 && rate <= 100)) throw new Error("Enter the commission rate as a percentage, e.g. 15.");
  if (d.expiryDate <= d.effectDate) throw new Error("The cover end must be after the start.");
  return {
    insurerId: d.insurerId,
    productId,
    insuredName: d.insuredName.trim(),
    effectDate: d.effectDate,
    expiryDate: d.expiryDate,
    netPremium: net,
    totalPremium: total,
    currency: "RWF",
    commissionRate: rate / 100,
    sumsInsured: d.sumsInsured.trim(),
    limits: d.limits.trim(),
    deductibles: d.deductibles.trim(),
    exclusions: d.exclusions.trim(),
    claimsSupport: d.claimsSupport.trim(),
  };
}

function QuoteForm({ title, track: t, options, run, leadName, destination, onCancel }: { title: string; track: PolicyTrack; options: TrackOptions; run: TrackRun; leadName: string; destination: string; onCancel?: () => void }) {
  const invited = new Set(t.invitations.map((i) => i.insurerId));
  const firstWaiting = t.invitations.find((i) => !i.response)?.insurerId ?? "";
  const [draft, setDraft] = useState<TermsDraft>({ ...draftFrom(undefined, leadName), insurerId: firstWaiting });
  const [reference, setReference] = useState("");
  const [evidence, setEvidence] = useState<EvidenceInput | null>(null);
  const narrowed = useMemo(() => ({ ...options, insurers: invited.size ? options.insurers.filter((i) => invited.has(i.id)) : options.insurers }), [options, invited]);
  return (
    <ActionForm
      title={title}
      submitLabel="Record the quote"
      success="Quote recorded."
      onCancel={onCancel}
      onSubmit={() => run({ action: "QUOTE", fields: { terms: termsFrom(draft, t.productId), insurerReference: reference.trim() || undefined }, evidence: evidence ? { main: evidence } : undefined })}
    >
      <TermsFields value={draft} onChange={setDraft} options={narrowed} prefix="q" />
      <TextInput id="q-ref" label="Insurer's quote reference (optional)" value={reference} onChange={setReference} wide />
      <EvidenceField label="The insurer's quote" destination={destination} value={evidence} onChange={setEvidence} dateLabel="Received on" />
    </ActionForm>
  );
}

function RecommendForm({ title, track: t, insurerName, run, destination, onCancel }: { title: string; track: PolicyTrack; insurerName: (id: string) => string; run: TrackRun; destination: string; onCancel?: () => void }) {
  const [quoteId, setQuoteId] = useState(t.quotes[0]?.id ?? "");
  const quote = t.quotes.find((q) => q.id === quoteId);
  const suggested = quote ? Math.round(quote.terms.netPremium * quote.terms.commissionRate) : 0;
  const [commission, setCommission] = useState(suggested ? suggested.toLocaleString("en-US") : "");
  const [basis, setBasis] = useState("");
  const [comparison, setComparison] = useState("");
  const [rationale, setRationale] = useState("");
  const [evidence, setEvidence] = useState<EvidenceInput | null>(null);
  useEffect(() => {
    if (quote) {
      setCommission(suggested.toLocaleString("en-US"));
      setBasis(`${+(quote.terms.commissionRate * 100).toFixed(2)}% of the net premium ${formatRwf(quote.terms.netPremium)}`);
    }
  }, [quoteId]); // eslint-disable-line react-hooks/exhaustive-deps
  const amount = parseAmount(commission);
  const tier = amount > 0 ? commissionTier(amount) : null;
  return (
    <ActionForm
      title={title}
      submitLabel={title}
      success="Recommendation recorded. It now needs internal approval."
      onCancel={onCancel}
      onSubmit={() => {
        if (!quote) throw new Error("Choose the quote to recommend.");
        if (!(amount > 0)) throw new Error("Enter the expected annual commission in RWF.");
        if (!comparison.trim() || !rationale.trim()) throw new Error("Write the comparison and the reason for the choice.");
        return run({
          action: "RECOMMEND",
          fields: { quoteId: quote.id, quoteVersion: quote.version, annualCommissionRwf: amount, commissionBasis: basis.trim(), comparison: comparison.trim(), rationale: rationale.trim() },
          evidence: evidence ? { main: evidence } : undefined,
        });
      }}
    >
      <SelectInput id="rc-quote" label="Quote to recommend" value={quoteId} onChange={setQuoteId} options={t.quotes.map((q) => ({ value: q.id, label: `${insurerName(q.terms.insurerId)} · ${formatRwf(q.terms.totalPremium)}` }))} wide />
      <div>
        <Label htmlFor="rc-comm">Expected annual commission (RWF)</Label>
        <AmountInput id="rc-comm" value={commission} onChange={setCommission} className={inputClass()} />
      </div>
      <TextInput id="rc-basis" label="How it was worked out" value={basis} onChange={setBasis} />
      {tier ? <p className="text-xs text-muted-foreground sm:col-span-2">{TIER_LABEL[tier]}{amount > 0 ? ` (${amountInWords(amount).toLowerCase()} francs)` : ""}.</p> : null}
      <TextInput id="rc-cmp" label="Comparison" value={comparison} onChange={setComparison} multiline wide placeholder="Premium, deductibles, limits, exclusions and claims support of each quote" />
      <TextInput id="rc-why" label="Why this quote" value={rationale} onChange={setRationale} multiline wide />
      <EvidenceField label="Comparison matrix and recommendation report" destination={destination} value={evidence} onChange={setEvidence} dateLabel="Prepared on" />
    </ActionForm>
  );
}

function ScheduleForm({ title, track: t, options, run, leadName, destination, onCancel }: { title: string; track: PolicyTrack; options: TrackOptions; run: TrackRun; leadName: string; destination: string; onCancel?: () => void }) {
  const accepted = t.quotes.find((q) => q.id === t.recommendation?.quoteId)?.terms;
  const [draft, setDraft] = useState<TermsDraft>(draftFrom(t.observedSchedule ?? accepted, leadName));
  const [policyNumber, setPolicyNumber] = useState("");
  const [discrepancies, setDiscrepancies] = useState(t.discrepancies.join("\n"));
  const [evidence, setEvidence] = useState<EvidenceInput | null>(null);
  return (
    <ActionForm
      title={title}
      submitLabel="Record the schedule"
      success="Schedule recorded."
      onCancel={onCancel}
      onSubmit={() =>
        run({
          action: "SCHEDULE",
          fields: { externalPolicyNumber: policyNumber.trim() || undefined, observed: termsFrom(draft, t.productId), discrepancies: discrepancies.split("\n").map((d) => d.trim()).filter(Boolean) },
          evidence: evidence ? { main: evidence } : undefined,
        })
      }
    >
      <TextInput id="sc-num" label="Policy number on the schedule" value={policyNumber} onChange={setPolicyNumber} wide />
      <TermsFields value={draft} onChange={setDraft} options={options} prefix="sc" />
      <TextInput id="sc-disc" label="Differences from the accepted terms, one per line (leave empty if none)" value={discrepancies} onChange={setDiscrepancies} multiline wide />
      <EvidenceField label="The insurer's policy schedule" destination={destination} value={evidence} onChange={setEvidence} dateLabel="Received on" />
    </ActionForm>
  );
}

function ConvertForm({ title, track: t, run, onCancel }: { title: string; track: PolicyTrack; run: TrackRun; onCancel?: () => void }) {
  const [paid, setPaid] = useState("0");
  return (
    <ActionForm
      title={title}
      submitLabel="Convert into the policy"
      success="Converted. The policy is on the client file; the welcome letter is due within 2 working days."
      onCancel={onCancel}
      onSubmit={() => {
        const amount = parseAmount(paid);
        if (!(amount >= 0) || Number.isNaN(amount)) throw new Error("Enter the amount paid so far in RWF (0 if nothing yet).");
        return run({ action: "CONVERT", fields: { amountPaid: amount } });
      }}
    >
      <div>
        <Label htmlFor="cv-paid">Amount paid so far (RWF)</Label>
        <AmountInput id="cv-paid" value={paid} onChange={setPaid} className={inputClass()} />
      </div>
    </ActionForm>
  );
}

function WelcomeForm({ title, run, destination, onCancel }: { title: string; run: TrackRun; destination: (what: string) => string; onCancel?: () => void }) {
  const [letter, setLetter] = useState<EvidenceInput | null>(null);
  const [delivery, setDelivery] = useState<EvidenceInput | null>(null);
  const [checklist, setChecklist] = useState<EvidenceInput | null>(null);
  return (
    <ActionForm
      title={title}
      submitLabel={title}
      success="Welcome and filing complete. This policy track is done."
      onCancel={onCancel}
      onSubmit={() => {
        if (!letter || !delivery || !checklist) throw new Error("Attach all three documents.");
        return run({ action: "WELCOME", evidence: { letter, delivery, fileChecklist: checklist } });
      }}
    >
      <EvidenceField label="Welcome letter" destination={destination("Welcome letter")} value={letter} onChange={setLetter} dateLabel="Sent on" />
      <EvidenceField label="Proof the policy documents were delivered" destination={destination("Policy delivery")} value={delivery} onChange={setDelivery} dateLabel="Delivered on" />
      <EvidenceField label="Client file checklist" destination={destination("File checklist")} value={checklist} onChange={setChecklist} dateLabel="Completed on" />
    </ActionForm>
  );
}

/* Actions not tied to one step */

export function OtherActions({ track: t, options, insurerName, run }: { track: PolicyTrack; options: TrackOptions; insurerName: (id: string) => string; run: TrackRun }) {
  const available = SIDE_ACTIONS.filter((a) => t.availableActions.includes(a));
  const [open, setOpen] = useState<string | null>(null);
  if (!available.length) return null;
  return (
    <FloatCard className="p-5" delay={180}>
      <h2 className="text-base font-semibold tracking-tight">Other actions</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {available.map((a) => (
          <OutlineButton key={a} onClick={() => setOpen(open === a ? null : a)} className={cn(open === a && "bg-secondary")}>
            {ACTION_LABEL[a] ?? a}
          </OutlineButton>
        ))}
      </div>
      {open ? (
        <div className="mt-3">
          <SideForm key={open} action={open} track={t} options={options} insurerName={insurerName} run={async (i) => { await run(i); setOpen(null); }} onCancel={() => setOpen(null)} />
        </div>
      ) : null}
    </FloatCard>
  );
}

function SideForm({ action, track: t, options, run, onCancel }: { action: string; track: PolicyTrack; options: TrackOptions; insurerName: (id: string) => string; run: TrackRun; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [assignee, setAssignee] = useState("");
  const [disposition, setDisposition] = useState("CLOSED_LOST");
  const [insurerId, setInsurerId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [source, setSource] = useState("BNR register of licensed insurers");
  const [evidence, setEvidence] = useState<EvidenceInput | null>(null);

  switch (action) {
    case "LICENSE":
      return (
        <ActionForm title="Insurer licence check" submitLabel="Record the check" success="Licence check recorded." onCancel={onCancel} onSubmit={() => {
          if (!insurerId || !validUntil) throw new Error("Choose the insurer and the licence's end date.");
          return run({ action, fields: { insurerId, validUntil, source: source.trim() }, evidence: evidence ? { main: evidence } : undefined });
        }}>
          <SelectInput id="lc-ins" label="Insurer" value={insurerId} onChange={setInsurerId} placeholder="Select an insurer" options={options.insurers.map((i) => ({ value: i.id, label: i.name }))} wide />
          <TextInput id="lc-valid" label="Licence valid until" type="date" min={todayIso()} value={validUntil} onChange={setValidUntil} />
          <TextInput id="lc-src" label="Source checked" value={source} onChange={setSource} />
          <EvidenceField label="The licence or register extract" destination={`Insurer licence · ${t.productName}`} value={evidence} onChange={setEvidence} dateLabel="Checked on" />
        </ActionForm>
      );
    case "REVISE":
      return (
        <ActionForm title="Revise the recommendation" submitLabel="Revise" success="Recommendation reopened for revision." onCancel={onCancel} onSubmit={() => run({ action, reason })}>
          <TextInput id="rv-reason" label="Reason" value={reason} onChange={setReason} wide />
        </ActionForm>
      );
    case "ASSIGN":
      return (
        <ActionForm title="Change the Accounts Executive" submitLabel="Assign" success="Assignment changed." onCancel={onCancel} onSubmit={() => {
          if (!assignee) throw new Error("Choose the person.");
          return run({ action, fields: { responsibility: "OWNER", assigneeId: assignee } });
        }}>
          <SelectInput id="as-person" label="Accounts Executive" value={assignee} onChange={setAssignee} placeholder="Select a person" options={options.accountExecutives.map((p) => ({ value: p.id, label: p.name }))} wide />
        </ActionForm>
      );
    case "ON_HOLD":
      return (
        <ActionForm title="Put on hold" submitLabel="Put on hold" success="Put on hold." onCancel={onCancel} onSubmit={() => run({ action, reason })}>
          <TextInput id="oh-reason" label="Reason" value={reason} onChange={setReason} wide />
        </ActionForm>
      );
    case "RESUME":
      return <ActionForm title="Resume" submitLabel="Resume" success="Resumed." onCancel={onCancel} onSubmit={() => run({ action, reason: reason || "Resumed" })} />;
    case "CLOSE":
      return (
        <ActionForm title="Close this track" submitLabel="Close the track" success="Track closed." onCancel={onCancel} onSubmit={() => run({ action, reason, fields: { disposition } })}>
          <SelectInput id="ct-disp" label="Outcome" value={disposition} onChange={setDisposition} options={[{ value: "CLOSED_LOST", label: "Lost: the client declined or went elsewhere" }, { value: "CANCELLED", label: "Cancelled: started by mistake" }]} wide />
          <TextInput id="ct-reason" label="Reason" value={reason} onChange={setReason} wide />
        </ActionForm>
      );
    default:
      return null;
  }
}
