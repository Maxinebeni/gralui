"use client";

// Actions on a renewal case that lives on GRAL's backend. Each milestone row
// shows the actions the server allows right now (lib/renewal-actions.ts),
// the reasons the server gives when the case is stuck, and one form per action.

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { listRenewalSpecialists, renewalChoices, runRenewalAction } from "@/lib/api";
import { OnboardingError } from "@/lib/command-attempt";
import { blockerText } from "@/lib/onboarding";
import { latestQuoteRevisions, quoteRevisionKey } from "@/lib/quote-revisions";
import {
  buildRenewalInput,
  checkRenewalValues,
  renewalActionsFor,
  unknownRenewalActions,
  type FieldSpec,
  type RenewalActionSpec,
  type Values,
} from "@/lib/renewal-actions";
import { RENEWAL_MILESTONES, formatDate } from "@/lib/renewals";
import type { RenewalCase, RenewalMilestoneCode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ComparedQuotes } from "./compared-quotes";
import { FilePickButton } from "./documents";
import { Loader, NavyButton, OutlineButton } from "./ui";

const INPUT =
  "w-full rounded-xl border border-input bg-card px-3 py-2 text-xs outline-none focus:border-sky focus:ring-2 focus:ring-sky/30";

type Choices = Awaited<ReturnType<typeof renewalChoices>>;

/** Server codes this screen explains in its own words. */
const RENEWAL_BLOCKERS: Record<string, string> = {
  ASSIGNEE_REQUIRED:
    "Nobody is assigned to the current step. The CRM Manager or the MD assigns someone under More actions.",
  KYC_APPROVAL_REQUIRED: "The client's KYC must be approved before the cover can be placed. Finish the KYC review on the client's file.",
  APPROVAL_RETURNED:
    "The approver returned the terms. Use “Withdraw the terms for revision” under More actions, change the quote or recommendation, then request approval again.",
  APPROVAL_REJECTED:
    "The approver rejected the terms. Use “Withdraw the terms for revision” under More actions to start them again, or record the renewal as lost.",
};
const renewalBlockerText = (code: string) => RENEWAL_BLOCKERS[code] ?? blockerText(code);

/** Why the server says the case cannot move on, and any risks it flags. */
export function RenewalBlockers({ renewal }: { renewal: RenewalCase }) {
  const blockers = renewal.backend?.blockers ?? [];
  const risks = renewal.backend?.risks ?? [];
  const late = renewal.backend?.lateDate;
  const recovery = renewal.backend?.recoveryDueDate;
  if (blockers.length === 0 && risks.length === 0 && !late && !recovery) return null;
  return (
    <div className="mt-4 space-y-2">
      {late || recovery ? (
        <p className="text-[11px] text-muted-foreground">
          {late ? <>Counts as late from {formatDate(late)}.</> : null}
          {late && recovery ? " " : null}
          {recovery ? <>Recovery plan due {formatDate(recovery)}.</> : null}
        </p>
      ) : null}
      {blockers.length ? (
        <div className="rounded-xl border border-warning/40 bg-warning-soft/40 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <AlertTriangle className="size-3.5 text-warning" /> What is holding this renewal up
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[11px] text-muted-foreground">
            {[...new Set(blockers)].map((b) => (
              <li key={b}>{renewalBlockerText(b)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {risks.length ? (
        <p className="text-[11px] text-muted-foreground">
          Flagged by the system: {[...new Set(risks)].map((r) => blockerText(r).replace(/\.$/, "")).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

/** The actions for one milestone, or the "More actions" list when step is null. */
export function RenewalActions({
  renewal,
  step,
  onChanged,
}: {
  renewal: RenewalCase;
  step: RenewalMilestoneCode | null;
  onChanged: (updated: RenewalCase) => void;
}) {
  const actions = renewalActionsFor(renewal, step);
  const [open, setOpen] = useState<string | null>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const needsChoices = actions.length > 0;

  useEffect(() => {
    if (!needsChoices) return;
    let cancelled = false;
    renewalChoices()
      .then((x) => {
        if (!cancelled) setChoices(x);
      })
      .catch(() => {
        if (!cancelled) setChoices({ insurers: [], products: [], managers: [], insurerProducts: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [needsChoices]);

  if (actions.length === 0) {
    if (step === null) {
      const unknown = unknownRenewalActions(renewal);
      return unknown.length ? (
        <p className="text-[11px] text-subtle">Also allowed on the server, not on this screen yet: {unknown.join(", ")}.</p>
      ) : null;
    }
    const blockers = renewal.backend?.blockers ?? [];
    return (
      <p className="text-[11px] text-subtle">
        {blockers.includes("ASSIGNEE_REQUIRED")
          ? "Waiting for the CRM Manager or the MD to assign someone to this step."
          : blockers.includes("KYC_APPROVAL_REQUIRED")
            ? "Waiting for the client's KYC to be approved."
            : "Nothing for you to record on this milestone right now. Another role records the next step."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {step === null ? (
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">More actions</p>
      ) : null}
      {actions.map((a) => (
        <div key={a.key} className="rounded-xl border border-border bg-card">
          <button
            type="button"
            onClick={() => setOpen(open === a.key ? null : a.key)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-medium"
            aria-expanded={open === a.key}
          >
            {a.label}
            <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open === a.key && "rotate-180")} />
          </button>
          {open === a.key ? (
            <ActionForm
              renewal={renewal}
              spec={a}
              choices={choices}
              onCancel={() => setOpen(null)}
              onDone={(updated) => {
                setOpen(null);
                onChanged(updated);
              }}
            />
          ) : null}
        </div>
      ))}
      {step === null && unknownRenewalActions(renewal).length ? (
        <p className="text-[11px] text-subtle">
          Also allowed on the server, not on this screen yet: {unknownRenewalActions(renewal).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

function ActionForm({
  renewal,
  spec,
  choices,
  onCancel,
  onDone,
}: {
  renewal: RenewalCase;
  spec: RenewalActionSpec;
  choices: Choices | null;
  onCancel: () => void;
  onDone: (updated: RenewalCase) => void;
}) {
  const [values, setValues] = useState<Values>(() => {
    const start: Values = { ...(spec.prefill?.(renewal) ?? {}) };
    for (const f of spec.fields) {
      if (f.key === "occurredAt") start[f.key] = new Date().toISOString().slice(0, 10);
      if (f.kind === "insurers" && !start[f.key]) start[f.key] = [];
    }
    return start;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Kept on the form: a toast is gone after a few seconds and the form stays open.
  const [formError, setFormError] = useState<string | null>(null);

  // Annual commission the chosen quote implies: net premium × commission rate.
  const commissionFor = (quoteId: unknown) => {
    const q = renewal.backend?.quotes.find((x) => quoteRevisionKey(x) === quoteId);
    return q?.financials ? Math.round(q.financials.netPremium * q.financials.commissionRate) : undefined;
  };
  const set = (key: string, v: Values[string]) => {
    setValues((x) => {
      const next = { ...x, [key]: v };
      // Choosing a quote fills the commission (and how it was worked out) when the quote has the figures.
      const expected = key === "quoteId" ? commissionFor(v) : undefined;
      const q = renewal.backend?.quotes.find((y) => quoteRevisionKey(y) === v);
      if (key === "quoteId" && Array.isArray(next.comparedQuotes)) next.comparedQuotes = next.comparedQuotes.filter((quote) => quote !== v);
      if (expected !== undefined && spec.fields.some((f) => f.key === "annualCommissionRwf")) {
        next.annualCommissionRwf = String(expected);
        if (q?.financials && !x.commissionBasis)
          next.commissionBasis = `${+(q.financials.commissionRate * 100).toFixed(2)}% of the net premium RWF ${q.financials.netPremium.toLocaleString("en-US")}`;
      }
      return next;
    });
    setErrors((e) => ({ ...e, [key]: "" }));
  };
  const expectedCommission = commissionFor(values.quoteId);
  const enteredCommission = Number(String(values.annualCommissionRwf ?? "").replace(/[,\s]/g, ""));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = checkRenewalValues(spec, values, renewal);
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      const first = spec.fields.find((f) => found[f.key]);
      if (first) document.getElementById(`ren-${first.key}`)?.focus();
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      const updated = await runRenewalAction(renewal, buildRenewalInput(renewal, spec, values));
      setFormError(null);
      toast.success(`${spec.label}: saved.`);
      onDone(updated);
    } catch (err) {
      const message = err instanceof OnboardingError && err.code === "COMPARISON_QUOTES_REQUIRED"
        ? "Under More actions, choose Withdraw the terms for revision. Record the quotes used in the comparison, then request approval again."
        : err instanceof Error ? err.message : "Could not save. Please try again.";
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 border-t border-border px-3 py-3">
      <p className="text-[11px] text-muted-foreground">{typeof spec.help === "function" ? spec.help(renewal) : spec.help}</p>
      {spec.fields.map((f) => (
        <FieldInput
          key={f.key}
          field={f}
          value={values[f.key] ?? null}
          error={errors[f.key]}
          onChange={(v) => {
            set(f.key, v);
            // A different role needs a different person.
            if (f.key === "target") set("assigneeId", "");
          }}
          renewal={renewal}
          choices={choices}
          target={typeof values.target === "string" ? values.target : ""}
          values={values}
        />
      ))}
      {expectedCommission !== undefined && enteredCommission > 0 && Math.abs(enteredCommission - expectedCommission) > Math.max(1, expectedCommission * 0.01) ? (
        <p role="status" className="rounded-lg bg-warning-soft px-3 py-2 text-[11px] text-foreground">
          This differs from the quote&apos;s net premium × commission rate (RWF {expectedCommission.toLocaleString("en-US")}). The approval route
          follows the figure you enter, so check it and explain the difference.
        </p>
      ) : null}
      {formError ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[11px] text-danger">
          {formError}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-between gap-2">
        <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
        <NavyButton type="submit" disabled={saving}>
          {saving ? "Saving…" : spec.fields.length ? "Save" : spec.label}
        </NavyButton>
      </div>
    </form>
  );
}

function FieldInput({
  field: f,
  value,
  error,
  onChange,
  renewal,
  choices,
  target,
  values,
}: {
  field: FieldSpec;
  value: Values[string];
  error?: string;
  onChange: (v: Values[string]) => void;
  renewal: RenewalCase;
  choices: Choices | null;
  /** The role chosen on the assign form, which decides who can be picked. */
  target: string;
  /** The whole form, so one field can narrow another (an insurer's classes). */
  values: Values;
}) {
  // Classes the chosen insurer offers, and insurers that offer this renewal's class.
  const offered = (insurerId: string) => choices?.insurerProducts[insurerId];
  const chosenInsurer = typeof values.insurerId === "string" ? values.insurerId : "";
  const productFor = (typeof values.productId === "string" && values.productId) || renewal.backend?.productId || "";
  const offersProduct = (insurerId: string) => !productFor || !offered(insurerId) || offered(insurerId)!.includes(productFor);
  const id = `ren-${f.key}`;
  const text = typeof value === "string" ? value : "";
  const cls = cn(INPUT, error && "border-danger");
  const loading = choices === null;

  let input: React.ReactNode;
  switch (f.kind) {
    case "textarea":
    case "lines":
      input = (
        <textarea id={id} rows={f.kind === "lines" ? 3 : 2} value={text} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} className={cls} />
      );
      break;
    case "date":
      input = <input id={id} type="date" value={text} onChange={(e) => onChange(e.target.value)} className={cls} />;
      break;
    case "number":
    case "percent":
      input = (
        <input
          id={id}
          inputMode="decimal"
          value={text}
          placeholder={f.kind === "percent" ? "e.g. 15" : f.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      );
      break;
    case "select":
    case "milestone": {
      const options =
        f.kind === "milestone"
          ? (renewal.backend?.milestones ?? []).map((m) => ({
              value: m.serverCode,
              label: RENEWAL_MILESTONES.find((d) => d.code === m.code)?.name ?? m.serverCode,
            }))
          : (f.optionsFor?.(renewal) ?? f.options ?? []);
      input = (
        <select id={id} value={text} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">Choose…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    }
    case "insurer":
    case "product":
    case "owner": {
      const list =
        f.kind === "insurer"
          ? choices?.insurers.filter((o) => o.id === text || offersProduct(o.id))
          : f.kind === "product"
            ? choices?.products.filter((o) => o.id === text || !chosenInsurer || !offered(chosenInsurer) || offered(chosenInsurer)!.includes(o.id))
            : choices?.managers;
      input = (
        <select id={id} value={text} onChange={(e) => onChange(e.target.value)} className={cls} disabled={loading}>
          <option value="">{loading ? "Loading…" : "Choose…"}</option>
          {(list ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      );
      break;
    }
    case "assignee":
      input = <AssigneeSelect id={id} renewal={renewal} target={target} managers={choices?.managers} value={text} onChange={onChange} className={cls} />;
      break;
    case "insurers": {
      const chosen = Array.isArray(value) ? value : [];
      input = loading ? (
        <Loader size="sm" label="Loading insurers" className="justify-start" />
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {(choices?.insurers ?? []).filter((o) => chosen.includes(o.id) || offersProduct(o.id)).map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={chosen.includes(o.id)}
                onChange={(e) => onChange(e.target.checked ? [...chosen, o.id] : chosen.filter((x) => x !== o.id))}
              />
              {o.name}
            </label>
          ))}
        </div>
      );
      break;
    }
    case "quote":
    case "comparedQuotes": {
      const quotes = latestQuoteRevisions(renewal.backend?.quotes ?? []);
      const insurerName = (insurerId: string) => choices?.insurers.find((i) => i.id === insurerId)?.name ?? "Insurer";
      const options = quotes.map((quote) => ({
        id: quoteRevisionKey(quote), name: `${insurerName(quote.insurerId)}, RWF ${quote.premium.toLocaleString("en-US")} · revision ${quote.version}`,
      }));
      if (f.kind === "comparedQuotes") {
        const selected = Array.isArray(value) ? value : [];
        return (
          <div id={id} tabIndex={-1}>
            <ComparedQuotes options={options.filter((option) => option.id !== values.quoteId)} selected={selected} onChange={onChange} />
            {error ? <p role="alert" className="mt-1 text-[11px] text-danger">{error}</p> : null}
          </div>
        );
      }
      input = (
        <select id={id} value={options.some((option) => option.id === text) ? text : ""} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">{quotes.length ? "Choose…" : "No quotes recorded yet"}</option>
          {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      );
      break;
    }
    case "file": {
      const file = value instanceof File ? value : null;
      input = (
        <div className="flex flex-wrap items-center gap-2">
          <FilePickButton onFile={(picked) => onChange(picked)} destination={`${f.label} · renewal ${renewal.id}`}>
            <Paperclip className="size-3.5" /> {file ? "Choose another file" : "Attach file"}
          </FilePickButton>
          {file ? (
            <span className="flex items-center gap-1 text-[11px] text-primary">
              <FileText className="size-3" /> {file.name}
            </span>
          ) : null}
        </div>
      );
      break;
    }
    default:
      input = <input id={id} value={text} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} className={cls} />;
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11px] font-medium text-muted-foreground">
        {f.label}
        {f.required ? null : <span className="font-normal text-subtle"> (optional)</span>}
      </label>
      {input}
      {f.hint ? <p className="mt-1 text-[11px] text-subtle">{f.hint}</p> : null}
      {error ? <p className="mt-1 text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}

/** People the server allows for the chosen role: specialists from the renewal, owners from the managers list. */
function AssigneeSelect({
  id,
  renewal,
  target,
  managers,
  value,
  onChange,
  className,
}: {
  id: string;
  renewal: RenewalCase;
  target: string;
  managers?: { id: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
  className: string;
}) {
  // A step is done by the roles the server lists for it: Accounts Executives come from
  // the managers list, underwriters and Technical Directors from the renewal's specialists.
  const step = renewal.backend?.milestones.find((m) => m.serverCode === target);
  const roles = step?.responsibleRoles ?? [];
  const wantsUnderwriter = target === "UNDERWRITER" || roles.some((r) => /UNDERWRITING/.test(r));
  const wantsDirector = target === "TECHNICAL_DIRECTOR" || roles.includes("TECHNICAL_DIRECTOR");
  // When a step can go to an underwriter, the server has refused Accounts Executives (8 Nov test), so only underwriters are offered.
  const wantsManagers = target === "OWNER" || (roles.includes("ACCOUNTS_EXECUTIVE") && !roles.some((r) => /UNDERWRITING/.test(r)));
  const specialist = wantsUnderwriter || wantsDirector;
  const [people, setPeople] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!specialist) return;
    let cancelled = false;
    setPeople(null);
    setError(null);
    Promise.all([
      wantsUnderwriter ? listRenewalSpecialists(renewal, "UNDERWRITER") : Promise.resolve([]),
      wantsDirector ? listRenewalSpecialists(renewal, "TECHNICAL_DIRECTOR") : Promise.resolve([]),
    ])
      .then(([a, b]) => {
        if (!cancelled) setPeople([...a, ...b]);
      })
      .catch((err) => {
        if (!cancelled) {
          setPeople([]);
          setError(err instanceof Error ? err.message : "Could not load the eligible staff.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [renewal, specialist, wantsUnderwriter, wantsDirector]);

  const list = (() => {
    if (specialist && people === null) return null;
    if (wantsManagers && !managers) return null;
    const all = [...(wantsManagers ? (managers ?? []) : []), ...(people ?? [])];
    return all.filter((p, i) => all.findIndex((x) => x.id === p.id) === i);
  })();
  const loading = list === null;
  return (
    <>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className} disabled={loading || !target}>
        <option value="">{!target ? "Choose the role first" : loading ? "Loading…" : list.length ? "Choose…" : "Nobody eligible"}</option>
        {(list ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-[11px] text-danger">{error}</p> : null}
    </>
  );
}
