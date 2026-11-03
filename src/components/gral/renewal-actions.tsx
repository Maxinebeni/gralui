"use client";

// Actions on a renewal case that lives on GRAL's backend. Each milestone row
// shows the actions the server allows right now (lib/renewal-actions.ts),
// the reasons the server gives when the case is stuck, and one form per action.

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { renewalChoices, runRenewalAction } from "@/lib/api";
import { blockerText } from "@/lib/onboarding";
import {
  buildRenewalInput,
  checkRenewalValues,
  renewalActionsFor,
  unknownRenewalActions,
  type FieldSpec,
  type RenewalActionSpec,
  type Values,
} from "@/lib/renewal-actions";
import { RENEWAL_MILESTONES } from "@/lib/renewals";
import type { RenewalCase, RenewalMilestoneCode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FilePickButton } from "./documents";
import { NavyButton, OutlineButton } from "./ui";

const INPUT =
  "w-full rounded-xl border border-input bg-card px-3 py-2 text-xs outline-none focus:border-sky focus:ring-2 focus:ring-sky/30";

type Choices = Awaited<ReturnType<typeof renewalChoices>>;

/** Why the server says the case cannot move on, and any risks it flags. */
export function RenewalBlockers({ renewal }: { renewal: RenewalCase }) {
  const blockers = renewal.backend?.blockers ?? [];
  const risks = renewal.backend?.risks ?? [];
  if (blockers.length === 0 && risks.length === 0) return null;
  return (
    <div className="mt-4 space-y-2">
      {blockers.length ? (
        <div className="rounded-xl border border-warning/40 bg-warning-soft/40 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <AlertTriangle className="size-3.5 text-warning" /> What is holding this renewal up
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[11px] text-muted-foreground">
            {[...new Set(blockers)].map((b) => (
              <li key={b}>{blockerText(b)}</li>
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
        if (!cancelled) setChoices({ insurers: [], products: [], managers: [] });
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
    return <p className="text-[11px] text-subtle">Nothing for you to record on this milestone right now.</p>;
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

  const set = (key: string, v: Values[string]) => {
    setValues((x) => ({ ...x, [key]: v }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = checkRenewalValues(spec, values);
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      const updated = await runRenewalAction(renewal, buildRenewalInput(renewal, spec, values));
      toast.success(`${spec.label}: saved.`);
      onDone(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 border-t border-border px-3 py-3">
      <p className="text-[11px] text-muted-foreground">{spec.help}</p>
      {spec.fields.map((f) => (
        <FieldInput
          key={f.key}
          field={f}
          value={values[f.key] ?? null}
          error={errors[f.key]}
          onChange={(v) => set(f.key, v)}
          renewal={renewal}
          choices={choices}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <NavyButton type="submit" disabled={saving}>
          {saving ? "Saving…" : spec.fields.length ? "Save" : spec.label}
        </NavyButton>
        <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
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
}: {
  field: FieldSpec;
  value: Values[string];
  error?: string;
  onChange: (v: Values[string]) => void;
  renewal: RenewalCase;
  choices: Choices | null;
}) {
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
          : (f.options ?? []);
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
      const list = f.kind === "insurer" ? choices?.insurers : f.kind === "product" ? choices?.products : choices?.managers;
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
    case "insurers": {
      const chosen = Array.isArray(value) ? value : [];
      input = loading ? (
        <p className="text-[11px] text-subtle">Loading insurers…</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {(choices?.insurers ?? []).map((o) => (
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
    case "quote": {
      const quotes = renewal.backend?.quotes ?? [];
      const insurerName = (insurerId: string) => choices?.insurers.find((i) => i.id === insurerId)?.name ?? "Insurer";
      input = (
        <select id={id} value={text} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">{quotes.length ? "Choose…" : "No quotes recorded yet"}</option>
          {quotes.map((q) => (
            <option key={q.id} value={q.id}>
              {insurerName(q.insurerId)}, RWF {q.premium.toLocaleString("en-US")}
            </option>
          ))}
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