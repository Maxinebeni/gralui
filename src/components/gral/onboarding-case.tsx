"use client";

// One prospect's onboarding (SOP section 3): the 11 steps with their owner,
// deadline and record, and the action for the current step.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Circle, Clock, FileText, Lock, Paperclip, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRwf } from "@/lib/format";
import {
  addOnboardingQuote,
  completeOnboardingStep,
  completeQuotation,
  completeWelcome,
  getApproval,
  receiveKycDocument,
  recommendOnboardingQuote,
  recordKycScreening,
  recordPlacement,
  requestNewBusinessApproval,
  setKycExpiry,
  submitKycForApproval,
  uploadDocument,
} from "@/lib/api";
import { statusLabel } from "@/lib/approvals";
import { useCurrentUser } from "@/lib/auth-context";
import {
  ONBOARDING_STEPS,
  ONBOARDING_TARGET_DAYS,
  currentStep,
  isComplete,
  kycSubmitBlocker,
  onboardingAge,
  onboardingHealth,
  stepDue,
  type OnboardingStepDef,
} from "@/lib/onboarding";
import { onboardingPermissions } from "@/lib/permissions";
import { INSURER_GROUPS, PRODUCT_GROUPS, type OptionGroup } from "@/lib/reference-data";
import { formatDate, todayIso } from "@/lib/renewals";
import type { ApprovalRequest, OnboardingCase } from "@/lib/types";
import { FilePickButton } from "./documents";
import { Chip, NavyButton, OutlineButton, Person } from "./ui";

const INPUT =
  "w-full rounded-xl border border-input bg-card px-3 py-2 text-xs outline-none focus:border-sky focus:ring-2 focus:ring-sky/30";

type Run = (action: () => Promise<OnboardingCase>, success: string) => Promise<boolean>;

export function OnboardingHealthChip({ value }: { value: OnboardingCase }) {
  const health = onboardingHealth(value);
  if (health === "complete") return <Chip tone="success">Onboarded</Chip>;
  if (health === "overdue") return <Chip tone="danger">Step overdue</Chip>;
  if (health === "due-soon") return <Chip tone="warning">Due soon</Chip>;
  return <Chip tone="sky">On track</Chip>;
}

export function OnboardingCasePanel({
  value: c,
  onClose,
  onChanged,
}: {
  value: OnboardingCase;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user } = useCurrentUser();
  const { canUpdate } = onboardingPermissions(user.role);
  const current = currentStep(c);
  const age = onboardingAge(c);
  // Which finished step is opened to show its record.
  const [expanded, setExpanded] = useState<string | null>(null);

  async function run(action: () => Promise<OnboardingCase>, success: string) {
    try {
      await action();
      toast.success(success);
      onChanged();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">{c.prospect.name}</span>
            <OnboardingHealthChip value={c} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {c.id} · {c.prospect.type} · {c.prospect.sector} · {c.prospect.referralSource}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {[
              [c.prospect.contact.name, c.prospect.contact.title].filter(Boolean).join(", "),
              c.prospect.contact.email,
              c.prospect.contact.phone,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className={cn("mt-1 text-xs", age > ONBOARDING_TARGET_DAYS ? "font-medium text-danger" : "text-muted-foreground")}>
            {isComplete(c) ? "Onboarded in" : "Working day"} {age} of {ONBOARDING_TARGET_DAYS} (SOP: 10 to 15 working days)
          </p>
          <div className="mt-2">
            <Person name={c.accountExecutive} />
          </div>
        </div>
        <button
          type="button"
          aria-label="Close onboarding case"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="px-4 py-5 sm:px-6">
        {isComplete(c) && c.clientId ? (
          <div className="mb-4 rounded-2xl bg-success-soft/50 p-4 text-sm">
            <p className="font-semibold">Onboarding complete</p>
            <p className="mt-1 text-xs text-muted-foreground">The client file is open with the new policy.</p>
            <Link
              href={`/clients?client=${encodeURIComponent(c.clientId)}`}
              className="mt-2 inline-block text-xs font-medium text-primary underline underline-offset-2"
            >
              Open client file {c.clientId}
            </Link>
          </div>
        ) : null}
        {!canUpdate ? (
          <p className="mb-3 text-[11px] text-subtle">View only. Your role can follow this onboarding but not update it.</p>
        ) : null}

        <ol className="space-y-1.5">
          {ONBOARDING_STEPS.map((step) => {
            const record = c.completed.find((r) => r.code === step.code);
            const isCurrent = current?.code === step.code;
            const due = stepDue(c, step);
            const late = isCurrent && due < todayIso();

            // Finished: one line; click to see what was recorded.
            if (record) {
              const open = expanded === step.code;
              return (
                <li key={step.code} className="rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : step.code)}
                    aria-expanded={open}
                    className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2 text-left"
                  >
                    <Check className="size-4 text-success" />
                    <span className="truncate text-xs">
                      {step.n}. {step.name}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] whitespace-nowrap text-subtle">
                      {formatDate(record.completedAt)}
                      <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                      <p>{record.note}</p>
                      <p className="mt-1">
                        {record.completedBy} · {step.owner}
                        {record.evidence ? (
                          <span className="ml-1 inline-flex items-center gap-1 text-primary">
                            · <FileText className="size-3" /> {record.evidence}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            }

            // Not started yet: a quiet single line.
            if (!isCurrent) {
              return (
                <li key={step.code} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-1.5">
                  <Circle className="size-4 text-subtle" />
                  <span className="truncate text-xs text-muted-foreground">
                    {step.n}. {step.name}
                  </span>
                  <span className="text-[11px] whitespace-nowrap text-subtle">{step.owner}</span>
                </li>
              );
            }

            // The current step: open, with what to do.
            return (
              <li
                key={step.code}
                className={cn("rounded-xl border px-3 py-3", late ? "border-danger/40 bg-danger-soft/40" : "border-sky/40 bg-pale")}
              >
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5">
                  {late ? <Clock className="mt-0.5 size-4 text-danger" /> : <Circle className="mt-0.5 size-4 text-sky" />}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {step.n}. {step.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {step.owner} · {step.deadlineLabel}
                    </p>
                  </div>
                  <p className={cn("text-[11px] whitespace-nowrap", late ? "font-medium text-danger" : "text-muted-foreground")}>
                    Due {formatDate(due)}
                  </p>
                </div>
                <div className="mt-3 space-y-3 border-t border-border pt-3">
                  <p className="text-[11px] text-muted-foreground">{step.task}</p>
                  <StepAction value={c} step={step} canUpdate={canUpdate} userName={user.name} run={run} />
                </div>
              </li>
            );
          })}
        </ol>

        <section className="mt-6">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">History</h3>
          <ol className="mt-3 space-y-3">
            {[...c.history].reverse().map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky" />
                <div>
                  <p className="text-xs">{e.text}</p>
                  <p className="text-[11px] text-subtle">
                    {formatDate(e.at)} · {e.by}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function StepAction({
  value: c,
  step,
  canUpdate,
  userName,
  run,
}: {
  value: OnboardingCase;
  step: OnboardingStepDef;
  canUpdate: boolean;
  userName: string;
  run: Run;
}) {
  switch (step.code) {
    case "KYC":
      return <KycSection value={c} canUpdate={canUpdate} userName={userName} run={run} />;
    case "QUOTES":
      return <QuotesSection value={c} canUpdate={canUpdate} userName={userName} run={run} />;
    case "APPROVAL":
      return <ApprovalSection value={c} canUpdate={canUpdate} userName={userName} run={run} />;
    case "PLACEMENT":
      return canUpdate ? <PlacementForm value={c} userName={userName} run={run} /> : null;
    case "WELCOME":
      return canUpdate ? <WelcomeForm value={c} userName={userName} run={run} /> : null;
    default:
      return canUpdate ? <GenericStepForm value={c} step={step} userName={userName} run={run} /> : null;
  }
}

/** Attach a record: the file is kept with the case's documents and its name is recorded. */
function AttachRecord({
  caseId,
  label,
  fileName,
  onFile,
}: {
  caseId: string;
  label: string;
  fileName: string;
  onFile: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilePickButton
        onFile={async (file) => {
          try {
            await uploadDocument({ type: "ONBOARDING", id: caseId }, file, { classification: "CORRESPONDENCE", purpose: "ONBOARDING_RECORD" });
            onFile(file.name);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not attach the file.");
          }
        }}
      >
        <Paperclip className="size-3.5" /> {fileName ? "Replace file" : label}
      </FilePickButton>
      {fileName ? (
        <span className="flex items-center gap-1 text-[11px] text-primary">
          <FileText className="size-3" /> {fileName}
        </span>
      ) : null}
    </div>
  );
}

function GenericStepForm({ value: c, step, userName, run }: { value: OnboardingCase; step: OnboardingStepDef; userName: string; run: Run }) {
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [grade, setGrade] = useState<"" | "Low" | "Medium" | "High">("");
  const placeholders: Partial<Record<OnboardingStepDef["code"], string>> = {
    MEETING: "e.g. 2 hotels, 140 staff; property and liability cover wanted",
    RISK_SURVEY: "e.g. Sprinklers working, fire exits clear; generator room needs a second extinguisher",
    DESIGN: "e.g. Property all risks, public liability and group medical",
    COMPARISON: "e.g. Recommend Radiant: lowest premium with the full limit",
    ACCEPTANCE: "e.g. Client accepted Radiant's quote by email on 16 Oct",
  };

  return (
    <div className="space-y-2">
      {step.code === "COMPARISON" ? <QuoteList value={c} canRecommend userName={userName} run={run} /> : null}
      {step.code === "RISK_SURVEY" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Risk grade</span>
          {(["Low", "Medium", "High"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrade(g)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                grade === g ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary",
              )}
            >
              {g}
            </button>
          ))}
        </div>
      ) : null}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={placeholders[step.code] ?? "What was done?"}
        aria-label={`${step.name} note`}
        className={INPUT}
      />
      {step.evidenceHint ? (
        <>
          <AttachRecord caseId={c.id} label="Attach the record" fileName={evidence} onFile={setEvidence} />
          <p className="text-[11px] text-subtle">{step.evidenceHint}</p>
        </>
      ) : null}
      <NavyButton
        onClick={() =>
          run(
            () => completeOnboardingStep(c.id, { note, evidence, riskGrade: grade || undefined }, userName),
            `${step.name} completed.`,
          )
        }
      >
        <Check className="size-3.5" /> Mark {step.name.toLowerCase()} complete
      </NavyButton>
    </div>
  );
}

/* KYC (step 3) */

function useApproval(id?: string) {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  useEffect(() => {
    if (id) getApproval(id).then(setRequest);
    else setRequest(null);
  }, [id]);
  return request;
}

function ApprovalStatus({ request, waitingFor }: { request: ApprovalRequest; waitingFor: string }) {
  const comment = [...request.steps].reverse().find((s) => s.comment)?.comment;
  return (
    <div className={cn("rounded-xl px-3 py-2.5 text-xs", request.status === "PENDING" ? "bg-warning-soft/50" : "bg-danger-soft/40")}>
      <p className="font-medium">
        {request.status === "PENDING" ? `Waiting for ${waitingFor}` : statusLabel(request)} ·{" "}
        <Link href={`/approvals?request=${encodeURIComponent(request.id)}`} className="text-primary underline underline-offset-2">
          {request.id}
        </Link>
      </p>
      {request.status === "RETURNED" || request.status === "REJECTED" ? (
        <p className="mt-1 text-muted-foreground">
          {comment ? `“${comment}” ` : ""}
          {request.status === "RETURNED" ? "Fix what was asked, then send it again from the request." : ""}
        </p>
      ) : null}
    </div>
  );
}

function KycSection({ value: c, canUpdate, userName, run }: { value: OnboardingCase; canUpdate: boolean; userName: string; run: Run }) {
  const request = useApproval(c.kyc.approvalId);
  const waiting = request?.status === "PENDING";
  const editable = canUpdate && !waiting;
  const [result, setResult] = useState<"CLEAR" | "POSSIBLE_MATCH">("CLEAR");
  const [note, setNote] = useState("");
  const blocker = kycSubmitBlocker(c);

  return (
    <div className="space-y-3">
      <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <ShieldCheck className="size-3.5 text-primary" /> KYC checklist · {c.prospect.type}
        </p>
        <div className="mt-2 space-y-1.5">
          {c.kyc.items.map((item) => (
            <div key={item.name} className="rounded-xl border border-border bg-card px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-xs">
                  {item.receivedAt ? <Check className="size-4 shrink-0 text-success" /> : <Clock className="size-4 shrink-0 text-danger" />}
                  <span className="min-w-0">
                    {item.name}
                    {!item.required ? <span className="text-subtle"> (optional)</span> : null}
                  </span>
                </span>
                {item.receivedAt ? (
                  <Chip tone="success">Received {formatDate(item.receivedAt)}</Chip>
                ) : editable ? (
                  <FilePickButton onFile={(file) => run(() => receiveKycDocument(c.id, item.name, file, userName), `${item.name} received.`)}>
                    Upload
                  </FilePickButton>
                ) : (
                  <Chip tone="danger">Missing</Chip>
                )}
              </div>
              {item.receivedAt && item.hasExpiry ? (
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  Expires
                  {editable ? (
                    <input
                      type="date"
                      min={todayIso()}
                      value={item.expiry ?? ""}
                      onChange={(e) => e.target.value && run(() => setKycExpiry(c.id, item.name, e.target.value, userName), "Expiry date saved.")}
                      aria-label={`${item.name} expiry date`}
                      className="rounded-lg border border-input bg-card px-2 py-1 text-[11px]"
                    />
                  ) : (
                    <span>{item.expiry ? formatDate(item.expiry) : "not recorded"}</span>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-subtle">Checklist per client type is provisional; GRAL to confirm.</p>
      </div>

      <div>
        <p className="text-xs font-semibold">Sanctions and watchlist screening</p>
        {c.kyc.screening ? (
          <p className="mt-1 text-xs text-muted-foreground">
            <Chip tone={c.kyc.screening.result === "CLEAR" ? "success" : "warning"}>
              {c.kyc.screening.result === "CLEAR" ? "Clear" : "Possible match"}
            </Chip>{" "}
            {c.kyc.screening.note} · {formatDate(c.kyc.screening.at)} by {c.kyc.screening.by}
          </p>
        ) : editable ? (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["CLEAR", "Clear: no matches"],
                  ["POSSIBLE_MATCH", "Possible match"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setResult(v)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    result === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Lists checked and result, e.g. UN and OFAC lists, no matches"
              aria-label="Screening note"
              className={INPUT}
            />
            {result === "POSSIBLE_MATCH" ? (
              <p className="text-[11px] text-warning">
                A possible match (for example a politically exposed person) needs enhanced due diligence before approval.
              </p>
            ) : null}
            <OutlineButton onClick={() => run(() => recordKycScreening(c.id, { result, note }, userName), "Screening recorded.")}>
              Record screening
            </OutlineButton>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Not done yet.</p>
        )}
      </div>

      {request ? <ApprovalStatus request={request} waitingFor="the Risk & Compliance Manager" /> : null}
      {canUpdate && !waiting && request?.status !== "RETURNED" ? (
        <div className="space-y-1.5">
          {blocker ? <p className="text-[11px] text-warning">{blocker}</p> : null}
          <NavyButton disabled={!!blocker} onClick={() => run(() => submitKycForApproval(c.id, userName), "KYC sent to the Risk & Compliance Manager.")}>
            Send for KYC approval
          </NavyButton>
          <p className="text-[11px] text-subtle">
            The Risk & Compliance Manager signs the KYC Approval Form in Approvals. No quotation until it is signed.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* Quotes (steps 6 and 7) */

function QuoteList({ value: c, canRecommend, userName, run }: { value: OnboardingCase; canRecommend: boolean; userName: string; run: Run }) {
  if (c.quotes.length === 0) {
    return <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">No quotes yet.</p>;
  }
  return (
    <div className="space-y-1.5">
      {c.quotes.map((q) => (
        <div
          key={q.id}
          className={cn(
            "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 py-2",
            q.recommended ? "border-sky/40 bg-card" : "border-border bg-card",
          )}
        >
          <div className="min-w-0">
            <p className="text-xs font-medium">
              {q.insurer} · {formatRwf(q.premium)}
            </p>
            <p className="text-[11px] text-muted-foreground">{q.terms}</p>
          </div>
          {q.recommended ? (
            <Chip tone="sky">Recommended</Chip>
          ) : canRecommend ? (
            <OutlineButton onClick={() => run(() => recommendOnboardingQuote(c.id, q.id, userName), `${q.insurer} recommended.`)}>
              Recommend
            </OutlineButton>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function GroupedSelect({ value, onChange, groups, placeholder, label }: { value: string; onChange: (v: string) => void; groups: OptionGroup[]; placeholder: string; label: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={INPUT}>
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function QuotesSection({ value: c, canUpdate, userName, run }: { value: OnboardingCase; canUpdate: boolean; userName: string; run: Run }) {
  const [insurer, setInsurer] = useState("");
  const [premium, setPremium] = useState("");
  const [terms, setTerms] = useState("");
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-[11px] text-success">
        <Lock className="size-3" /> KYC Approval Form signed, so quotations can be requested.
      </p>
      <QuoteList value={c} canRecommend={false} userName={userName} run={run} />
      {canUpdate ? (
        <>
          <div className="space-y-2 rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-semibold">Record a quote</p>
            <GroupedSelect value={insurer} onChange={setInsurer} groups={INSURER_GROUPS} placeholder="Select an insurer" label="Insurer" />
            <input value={premium} onChange={(e) => setPremium(e.target.value)} inputMode="numeric" placeholder="Premium in RWF, e.g. 12500000" aria-label="Premium" className={INPUT} />
            <input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Main terms, e.g. Limit RWF 500m, deductible RWF 2m" aria-label="Terms" className={INPUT} />
            <OutlineButton
              onClick={async () => {
                const ok = await run(
                  () => addOnboardingQuote(c.id, { insurer, premium: Number(premium.replace(/[^\d]/g, "")), terms: terms.trim() || "Standard terms" }, userName),
                  `Quote from ${insurer} recorded.`,
                );
                if (ok) {
                  setInsurer("");
                  setPremium("");
                  setTerms("");
                }
              }}
            >
              Add quote
            </OutlineButton>
          </div>
          {c.quotes.length > 0 && c.quotes.length < 3 ? (
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Fewer than 3 quotes: give the written reason (the MD must approve)"
              aria-label="Reason for fewer than 3 quotes"
              className={INPUT}
            />
          ) : null}
          <NavyButton onClick={() => run(() => completeQuotation(c.id, { singleSourceReason: reason }, userName), "Quotation step completed.")}>
            <Check className="size-3.5" /> Quotes complete
          </NavyButton>
        </>
      ) : null}
    </div>
  );
}

/* Internal approval (step 8) */

function ApprovalSection({ value: c, canUpdate, userName, run }: { value: OnboardingCase; canUpdate: boolean; userName: string; run: Run }) {
  const request = useApproval(c.approvalId);
  const [rate, setRate] = useState("15");
  const quote = c.quotes.find((q) => q.recommended);
  const commission = quote ? Math.round(quote.premium * (Number(rate) / 100 || 0)) : 0;
  const approver = commission < 1_000_000 ? "the Technical Director" : commission <= 10_000_000 ? "the MD" : "the MD, with the Board informed";

  return (
    <div className="space-y-2">
      {quote ? (
        <p className="text-xs">
          Recommended: <span className="font-medium">{quote.insurer}</span> at {formatRwf(quote.premium)}
        </p>
      ) : null}
      {request ? <ApprovalStatus request={request} waitingFor={request.steps.find((s) => s.status === "PENDING")?.role ?? "approval"} /> : null}
      {canUpdate && (!request || request.status === "REJECTED") ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Expected commission rate (%)
            <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" aria-label="Commission rate" className="w-20 rounded-lg border border-input bg-card px-2 py-1 text-xs" />
          </label>
          <p className="text-[11px] text-muted-foreground">
            Annual commission about {formatRwf(commission)}, so it goes to {approver}
            {c.singleSourceReason ? " (and the MD, because fewer than 3 insurers quoted)" : ""}.
          </p>
          <NavyButton onClick={() => run(() => requestNewBusinessApproval(c.id, Number(rate) / 100, userName), "Approval requested.")}>
            Request approval
          </NavyButton>
        </div>
      ) : null}
    </div>
  );
}

/* Placement and welcome (steps 10 and 11) */

function PlacementForm({ value: c, userName, run }: { value: OnboardingCase; userName: string; run: Run }) {
  const quote = c.quotes.find((q) => q.recommended);
  const [policyNumber, setPolicyNumber] = useState("");
  const [classOfInsurance, setClass] = useState("");
  const [start, setStart] = useState(todayIso());
  const [expiry, setExpiry] = useState("");
  const [evidence, setEvidence] = useState("");
  return (
    <div className="space-y-2">
      {quote ? (
        <p className="text-xs">
          Placing with <span className="font-medium">{quote.insurer}</span> at {formatRwf(quote.premium)}
        </p>
      ) : null}
      <input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="Policy number issued by the insurer" aria-label="Policy number" className={INPUT} />
      <GroupedSelect value={classOfInsurance} onChange={setClass} groups={PRODUCT_GROUPS} placeholder="Class of insurance" label="Class of insurance" />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] text-muted-foreground">
          Cover starts
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={cn(INPUT, "mt-1")} />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Cover ends
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={cn(INPUT, "mt-1")} />
        </label>
      </div>
      <AttachRecord caseId={c.id} label="Attach the verified policy schedule" fileName={evidence} onFile={setEvidence} />
      <NavyButton onClick={() => run(() => recordPlacement(c.id, { policyNumber, classOfInsurance, start, expiry, evidence }, userName), "Placement recorded.")}>
        <Check className="size-3.5" /> Record placement
      </NavyButton>
    </div>
  );
}

function WelcomeForm({ value: c, userName, run }: { value: OnboardingCase; userName: string; run: Run }) {
  const [evidence, setEvidence] = useState("");
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Use GRAL&apos;s Welcome Letter template: policy details, key contacts, how to report a claim and the renewal date
        {c.placement ? ` (${formatDate(c.placement.expiry)})` : ""}. Completing this opens the client file with the policy and
        adds it to the renewal tracker.
      </p>
      <AttachRecord caseId={c.id} label="Attach the welcome letter" fileName={evidence} onFile={setEvidence} />
      <NavyButton onClick={() => run(() => completeWelcome(c.id, evidence, userName), "Client file opened. Onboarding complete.")}>
        <Check className="size-3.5" /> Send welcome and open client file
      </NavyButton>
    </div>
  );
}
