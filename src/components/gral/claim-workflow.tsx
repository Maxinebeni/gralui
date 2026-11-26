"use client";

// The claim lifecycle for claims on GRAL's backend: where the claim is now,
// what is missing before submission, the steps the signed-in user can record
// from here (lib/claim-workflow.ts), and the server's history of the claim.

import { useEffect, useRef, useState } from "react";
import { focusFirstError } from "@/lib/focus-error";
import { ChevronDown, FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { getClaimHistory, getClaimReadiness, openEvidenceDocument, runClaimAction, type ClaimHistoryEvent, type ClaimReadiness } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import {
  CLAIM_ACTIONS,
  CLAIM_STATE_LABEL,
  claimActionsFor,
  claimEventLabel,
  type ClaimActionSpec,
  type ClaimFieldSpec,
} from "@/lib/claim-workflow";
import { CommandAttempt } from "@/lib/command-attempt";
import { formatRwf } from "@/lib/format";
import { formatDate, kigaliDate } from "@/lib/renewals";
import type { Claim } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FilePickButton } from "./documents";
import { Loader, NavyButton, OutlineButton } from "./ui";

const INPUT =
  "w-full rounded-xl border border-input bg-card px-3 py-2 text-xs outline-none focus:border-sky focus:ring-2 focus:ring-sky/30";

const today = () => new Date().toISOString().slice(0, 10);

/** Steps recorded once per claim. */
const ONE_TIME_STEPS = ["INSURER_ACKNOWLEDGED", "SETTLEMENT_ACKNOWLEDGED"];

/** Fired on window when a claim's documents checklist changes; detail is the claim UUID. */
export const CLAIM_CHECKLIST_CHANGED = "gral:claim-checklist-changed";

/** Where the claim is, what is missing, and the steps this user can record now. */
export function BackendClaimWorkflow({ claim, onChanged }: { claim: Claim; onChanged: () => void }) {
  const { user } = useCurrentUser();
  const state = claim.serverState ?? "REGISTERED";
  // The server's record of the claim: the settlement and payment amounts, and steps already done.
  const [history, setHistory] = useState<ClaimHistoryEvent[]>([]);
  useEffect(() => {
    let cancelled = false;
    getClaimHistory(claim)
      .then((list) => {
        if (!cancelled) setHistory(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [claim]);
  const done = new Set(history.map((e) => e.action));
  // Recorded once; the server still allows them again, which only adds a duplicate line.
  const once = (a: ClaimActionSpec) => !(ONE_TIME_STEPS.includes(a.code) && done.has(a.code));
  const mine = claimActionsFor(user, state).filter(once);
  const others = CLAIM_ACTIONS.filter((a) => a.states.includes(state as never) && !mine.includes(a) && once(a));
  const latest = (action: string) => history.filter((e) => e.action === action).sort((a, b) => b.sequence - a.sequence)[0];
  const advised = latest("SETTLEMENT_ADVISED");
  const paid = latest("SETTLEMENT_RECORDED");
  const closed = latest("CLOSED");
  const submitted = latest("INSURER_SUBMITTED");
  const [open, setOpen] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ClaimReadiness | null>(null);
  const [checklistChanges, setChecklistChanges] = useState(0);
  const preparing = state === "REGISTERED" || state === "DOCUMENTS_PENDING";

  // Reload the readiness when a document is attached in the Documents tab.
  useEffect(() => {
    const onChange = (e: Event) => {
      if ((e as CustomEvent<string | undefined>).detail === claim.uuid) setChecklistChanges((n) => n + 1);
    };
    window.addEventListener(CLAIM_CHECKLIST_CHANGED, onChange);
    return () => window.removeEventListener(CLAIM_CHECKLIST_CHANGED, onChange);
  }, [claim.uuid]);

  useEffect(() => {
    if (!preparing) return;
    let cancelled = false;
    getClaimReadiness(claim)
      .then((r) => {
        if (!cancelled) setReadiness(r);
      })
      .catch(() => {
        if (!cancelled) setReadiness(null);
      });
    return () => {
      cancelled = true;
    };
  }, [claim, preparing, checklistChanges]);

  return (
    <div className={cn("rounded-2xl px-4 py-4", state === "CLOSED" ? "bg-success-soft/50" : "bg-sky-soft/60")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{CLAIM_STATE_LABEL[state] ?? state}</p>
        <span className="text-[11px] text-muted-foreground">Updated {formatDate(claim.stepStartedAt)}</span>
      </div>

      {state === "CLOSED" && closed ? (
        <p className="mt-2 text-[11px] text-foreground">
          {[
            closed.outcome ? `Outcome: ${closed.outcome.toLowerCase().replace(/_/g, " ")}` : null,
            advised?.amount != null ? `insurer offered ${formatRwf(Number(advised.amount))}` : null,
            paid?.amount != null ? `${formatRwf(Number(paid.amount))} paid on ${formatDate(kigaliDate(paid.occurredAt))}` : null,
            submitted?.externalReference ? `insurer's claim ref ${submitted.externalReference}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          {closed.summary ? <span className="block text-muted-foreground">{closed.summary}</span> : null}
        </p>
      ) : submitted?.externalReference && !preparing ? (
        <p className="mt-1 text-[11px] text-muted-foreground">Insurer&apos;s claim reference: {submitted.externalReference}</p>
      ) : null}

      {preparing && readiness ? (
        <p className={cn("mt-2 text-[11px]", readiness.ready ? "text-success" : "text-muted-foreground")}>
          {readiness.ready
            ? "All required documents are in. The pack can be marked ready."
            : `Still missing before submission: ${readiness.missing.map((m) => m.toLowerCase().replace(/_/g, " ")).join(", ")}. Add them in the Documents tab below.`}
        </p>
      ) : null}

      {state === "CLOSED" ? null : (
        <div className="mt-3 space-y-2">
          {mine.length === 0 ? (
            <p className="text-[11px] text-subtle">
              Nothing for you to record at this stage. Another role records the next step.
              {others.length ? ` Others can: ${others.map((a) => a.label.toLowerCase()).join("; ")}.` : ""}
            </p>
          ) : (
            mine.map((a) => (
              <div key={a.path} className="rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setOpen(open === a.path ? null : a.path)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-medium"
                  aria-expanded={open === a.path}
                >
                  {a.label}
                  <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open === a.path && "rotate-180")} />
                </button>
                {open === a.path ? (
                  <ClaimActionForm
                    claim={claim}
                    spec={a}
                    advisedAmount={advised?.amount != null ? Number(advised.amount) : undefined}
                    onCancel={() => setOpen(null)}
                    onDone={() => {
                      setOpen(null);
                      onChanged();
                    }}
                  />
                ) : null}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

type Values = Partial<Record<ClaimFieldSpec["key"], string | File | null>>;

/** A warning, not a block: a settlement can legitimately differ from the first estimate. */
function AmountCheck({ claim, code, text, advised }: { claim: Claim; code?: string; text: string; advised?: number }) {
  const amount = Number(text.replace(/,/g, ""));
  if (!text.trim() || !(amount > 0)) return null;
  let warning: string | null = null;
  if (code === "SETTLEMENT_ADVISED" && claim.amount > 0 && amount > claim.amount) {
    warning = `This is more than the estimated loss (${formatRwf(claim.amount)}). Check the insurer's letter before saving.`;
  } else if (code === "SETTLEMENT_RECORDED" && (advised ?? claim.settlement?.amount ?? 0) > 0 && amount > (advised ?? claim.settlement!.amount)) {
    warning = `This is more than the settlement the insurer offered (${formatRwf(advised ?? claim.settlement!.amount)}). Check the proof of payment before saving.`;
  }
  return warning ? (
    <p role="status" className="mt-1 rounded-md bg-warning-soft px-2 py-1 text-[11px] text-foreground">
      {warning}
    </p>
  ) : null;
}

function ClaimActionForm({
  claim,
  spec,
  advisedAmount,
  onCancel,
  onDone,
}: {
  claim: Claim;
  spec: ClaimActionSpec;
  /** The settlement the insurer offered, from the claim's history. */
  advisedAmount?: number;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [values, setValues] = useState<Values>({ occurredAt: today() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // A document attached since the last try may have fixed the problem: drop the old message.
  useEffect(() => {
    const clear = () => setFormError(null);
    window.addEventListener(CLAIM_CHECKLIST_CHANGED, clear);
    return () => window.removeEventListener(CLAIM_CHECKLIST_CHANGED, clear);
  }, []);
  const attempt = useRef(new CommandAttempt());
  const fields: ClaimFieldSpec[] = spec.evidence
    ? [...spec.fields, { key: "file", label: spec.evidence.label, kind: "file", required: spec.evidence.required }]
    : spec.fields;

  const set = (key: ClaimFieldSpec["key"], v: string | File | null) => {
    setValues((x) => ({ ...x, [key]: v }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.key];
      if (f.required && (v === undefined || v === null || (typeof v === "string" && !v.trim()))) found[f.key] = "Required.";
      if (f.kind === "money" && typeof v === "string" && v.trim() && !(Number(v.replace(/,/g, "")) >= 0)) found[f.key] = "Enter a number.";
      if (f.kind === "date" && typeof v === "string" && v > today()) found[f.key] = "Cannot be in the future.";
    }
    setErrors(found);
    if (Object.keys(found).length) {
      focusFirstError(e.currentTarget as HTMLFormElement, Object.keys(found));
      toast.error("Please fix the highlighted fields.");
      return;
    }
    const text = (k: ClaimFieldSpec["key"]) => (typeof values[k] === "string" ? (values[k] as string) : undefined);
    setSaving(true);
    try {
      await runClaimAction(
        claim,
        spec,
        {
          occurredAt: text("occurredAt") ?? today(),
          summary: text("summary"),
          externalReference: text("externalReference"),
          amount: text("amount")?.trim() ? Number(text("amount")!.replace(/,/g, "")) : undefined,
          outcome: text("outcome"),
          file: values.file instanceof File ? values.file : undefined,
        },
        attempt.current,
      );
      attempt.current.clear();
      setFormError(null);
      toast.success(`${spec.label}: saved.`);
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save. Please try again.";
      // Kept on the form as well: a toast disappears after a few seconds.
      setFormError(message);
      toast.error(message);
      if (!attempt.current.uncertain) attempt.current.clear();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 border-t border-border px-3 py-3">
      {spec.help ? <p className="text-[11px] text-muted-foreground">{spec.help}</p> : null}
      {fields.map((f) => {
        const id = `clm-${spec.path}-${f.key}`;
        const v = values[f.key];
        const text = typeof v === "string" ? v : "";
        const cls = cn(INPUT, errors[f.key] && "border-danger");
        let input: React.ReactNode;
        if (f.kind === "textarea") input = <textarea id={id} rows={2} value={text} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} className={cls} />;
        else if (f.kind === "date") input = <input id={id} type="date" max={today()} value={text} onChange={(e) => set(f.key, e.target.value)} className={cls} />;
        else if (f.kind === "select")
          input = (
            <select id={id} value={text} onChange={(e) => set(f.key, e.target.value)} className={cls}>
              <option value="">Choose…</option>
              {(f.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        else if (f.kind === "file") {
          const file = v instanceof File ? v : null;
          input = (
            <div className="flex flex-wrap items-center gap-2">
              <FilePickButton onFile={(picked) => set("file", picked)} destination={`${f.label} · claim ${claim.id}`}>
                <Paperclip className="size-3.5" /> {file ? "Choose another file" : "Attach file"}
              </FilePickButton>
              {file ? (
                <span className="flex items-center gap-1 text-[11px] text-primary">
                  <FileText className="size-3" /> {file.name}
                </span>
              ) : null}
            </div>
          );
        } else input = <input id={id} inputMode={f.kind === "money" ? "decimal" : undefined} value={text} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} className={cls} />;
        return (
          <div key={f.key}>
            <label htmlFor={id} className="mb-1 block text-[11px] font-medium text-muted-foreground">
              {f.label}
              {f.required ? null : <span className="font-normal text-subtle"> (optional)</span>}
            </label>
            {input}
            {f.hint ? <p className="mt-1 text-[11px] text-subtle">{f.hint}</p> : null}
            {f.kind === "money" ? <AmountCheck claim={claim} code={spec.code} text={text} advised={advisedAmount} /> : null}
            {errors[f.key] ? <p className="mt-1 text-[11px] text-danger">{errors[f.key]}</p> : null}
          </div>
        );
      })}
      {formError ? (
        <p role="alert" className="text-[11px] text-danger">
          {formError}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-between gap-2">
        <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
        <NavyButton type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </NavyButton>
      </div>
    </form>
  );
}

/** The server's record of everything done on the claim, newest first. */
export function ClaimHistoryList({ claim, only }: { claim: Claim; only?: string[] }) {
  const [events, setEvents] = useState<ClaimHistoryEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getClaimHistory(claim)
      .then((list) => {
        if (!cancelled) setEvents(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the claim history.");
      });
    return () => {
      cancelled = true;
    };
  }, [claim]);

  if (error) return <p className="mt-4 text-xs text-danger">{error}</p>;
  if (events === null) return <p className="mt-4 text-xs text-muted-foreground"><Loader label="Loading" /></p>;
  const shown = only ? events.filter((e) => only.includes(e.action)) : events;
  if (shown.length === 0) return <p className="mt-4 text-xs text-muted-foreground">Nothing recorded yet.</p>;

  return (
    <ul className="mt-4 space-y-2">
      {shown.map((e) => (
        <li key={e.id} className="rounded-xl border border-border px-3 py-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{claimEventLabel(e.action)}</span>
            <span className="text-[11px] text-muted-foreground">{formatDate(kigaliDate(e.occurredAt))}</span>
          </div>
          {e.summary ? <p className="mt-1 text-muted-foreground">{e.summary}</p> : null}
          <p className="mt-1 text-[11px] text-subtle">
            {[
              e.outcome ? `Outcome: ${e.outcome.toLowerCase().replace(/_/g, " ")}` : null,
              e.externalReference ? `Ref ${e.externalReference}` : null,
              e.amount !== null && e.amount !== undefined ? formatRwf(Number(e.amount)) : null,
              e.nextDueDate ? `Next due ${formatDate(e.nextDueDate)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {e.evidenceDocumentId && claim.uuid ? (
              <>
                {" · "}
                <button
                  type="button"
                  className="text-primary underline underline-offset-2 hover:opacity-70"
                  onClick={() =>
                    openEvidenceDocument(
                      { type: "CLAIM", id: claim.uuid! },
                      e.evidenceDocumentId!,
                      e.evidenceDocumentVersion ?? 1,
                      CLAIM_ACTIONS.find((a) => a.code === e.action)?.evidence?.purpose ?? "CLAIM_EVIDENCE",
                    ).catch((err) => toast.error(err instanceof Error ? err.message : "Could not open the file."))
                  }
                >
                  Open document
                </button>
              </>
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
}