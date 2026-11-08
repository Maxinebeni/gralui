"use client";

// Exit Register (REN-07): the renewals GRAL lost in a month, the premium at
// stake, and why the client left. CRM and MD can add or correct the reason and
// where it came from; the premium and loss date stay as captured.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { NoAccess, PageHeader } from "@/components/gral/shell";
import { Chip, FloatCard, NavyButton, OutlineButton, StatTile } from "@/components/gral/ui";
import {
  enrichRenewalExit,
  listRenewalExits,
  type RenewalExit,
  type RenewalExitCategory,
  type RenewalExitInput,
} from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { CommandAttempt } from "@/lib/command-attempt";
import { formatRwf } from "@/lib/format";
import { hasPermission, usesBackendPermissions } from "@/lib/permissions";
import { formatDate } from "@/lib/renewals";
import { cn } from "@/lib/utils";

const INPUT =
  "w-full rounded-xl border border-input bg-card px-3 py-2 text-xs outline-none focus:border-sky focus:ring-2 focus:ring-sky/30";

const CATEGORIES: { value: RenewalExitCategory; label: string }[] = [
  { value: "PRICE", label: "Price" },
  { value: "SERVICE", label: "Service" },
  { value: "COMPETITOR", label: "Went to a competitor" },
  { value: "OTHER", label: "Other" },
];
const categoryLabel = (c?: string | null) => CATEGORIES.find((x) => x.value === c)?.label ?? "Not recorded";
const thisMonth = () => new Date().toISOString().slice(0, 7);

export function ExitRegisterView() {
  const { user } = useCurrentUser();
  const backend = usesBackendPermissions(user);
  const canRead = !backend || hasPermission(user, "RENEWAL_EXIT_READ");
  const canEdit = !backend || hasPermission(user, "RENEWAL_EXIT_UPDATE");
  const [month, setMonth] = useState(thisMonth());
  const [category, setCategory] = useState("");
  const [exits, setExits] = useState<RenewalExit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setExits(null);
    setError(null);
    try {
      setExits(await listRenewalExits(month, category || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the Exit Register.");
      setExits([]);
    }
  }, [month, category]);

  useEffect(() => {
    if (canRead) void load();
  }, [load, canRead]);

  if (!canRead) return <NoAccess />;

  const list = exits ?? [];
  const lostPremium = list.reduce((sum, e) => sum + (Number(e.premium) || 0), 0);
  const needDetails = list.filter((e) => e.enrichmentRequired).length;

  return (
    <>
      <Link href="/renewals" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-3.5" /> Renewals
      </Link>
      <PageHeader
        title="Exit Register"
        subtitle="Renewals lost each month, and why"
        extraPills={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs shadow-sm">
              Month
              <input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value || thisMonth())} className="bg-transparent outline-none" />
            </label>
            <label className="flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs shadow-sm">
              Reason
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-transparent outline-none">
                <option value="">All</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <StatTile label="Renewals Lost" value={exits === null ? "…" : String(list.length)} />
        <StatTile label="Premium Lost (RWF)" value={exits === null ? "…" : lostPremium.toLocaleString("en-US")} delay={60} />
        <StatTile label="Need Details" value={exits === null ? "…" : String(needDetails)} delay={120} />
      </div>

      <FloatCard className="mt-4 space-y-2 p-5" delay={160}>
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}{" "}
            <button type="button" onClick={() => void load()} className="text-primary underline underline-offset-2">
              Try again
            </button>
          </p>
        ) : exits === null ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-muted-foreground">No renewals were lost in this month{category ? " for this reason" : ""}.</p>
        ) : (
          list.map((e) => (
            <div key={e.renewalId} className="rounded-xl border border-border px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{e.clientName}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Lost {formatDate(e.lostAt.slice(0, 10))}
                    {e.premium !== null && e.premium !== undefined ? ` · ${formatRwf(Number(e.premium))}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={e.category ? undefined : "warning"}>{categoryLabel(e.category)}</Chip>
                  {e.historical ? <Chip>Imported</Chip> : null}
                  {e.enrichmentRequired ? <Chip tone="warning">Needs details</Chip> : null}
                  {canEdit ? (
                    <OutlineButton onClick={() => setEditing(editing === e.renewalId ? null : e.renewalId)}>
                      {editing === e.renewalId ? "Cancel" : "Edit details"}
                    </OutlineButton>
                  ) : null}
                </div>
              </div>
              {e.detail ? <p className="mt-2 text-xs">{e.detail}</p> : null}
              {e.intelligenceSource ? <p className="mt-1 text-[11px] text-subtle">Source: {e.intelligenceSource}</p> : null}
              {editing === e.renewalId ? (
                <ExitForm
                  entry={e}
                  onSaved={(saved) => {
                    setExits((all) => (all ?? []).map((x) => (x.renewalId === saved.renewalId ? { ...x, ...saved } : x)));
                    setEditing(null);
                  }}
                />
              ) : null}
            </div>
          ))
        )}
      </FloatCard>
    </>
  );
}

function ExitForm({ entry, onSaved }: { entry: RenewalExit; onSaved: (saved: RenewalExit) => void }) {
  const [values, setValues] = useState<RenewalExitInput>({
    clientName: entry.clientName ?? "",
    category: (CATEGORIES.find((c) => c.value === entry.category)?.value ?? "") as RenewalExitCategory,
    detail: entry.detail ?? "",
    intelligenceSource: entry.intelligenceSource ?? "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);
  const attempt = useRef(new CommandAttempt());
  const set = (k: keyof RenewalExitInput) => (v: string) => setValues((x) => ({ ...x, [k]: v }));
  const missing = (Object.keys(values) as (keyof RenewalExitInput)[]).filter((k) => !String(values[k]).trim());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length) {
      toast.error("Please fill in every field.");
      return;
    }
    setSaving(true);
    try {
      const saved = await enrichRenewalExit(entry, values, attempt.current);
      attempt.current.clear();
      toast.success("Exit details saved.");
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the exit details.");
      if (!attempt.current.uncertain) attempt.current.clear();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
      <Field label="Client name">
        <input value={values.clientName} onChange={(e) => set("clientName")(e.target.value)} className={INPUT} />
      </Field>
      <Field label="Why the client left">
        <select value={values.category} onChange={(e) => set("category")(e.target.value)} className={INPUT}>
          <option value="">Choose…</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What happened" wide>
        <textarea rows={2} value={values.detail} onChange={(e) => set("detail")(e.target.value)} className={INPUT} />
      </Field>
      <Field label="Where this came from">
        <input value={values.intelligenceSource} placeholder="e.g. Client email" onChange={(e) => set("intelligenceSource")(e.target.value)} className={INPUT} />
      </Field>
      <Field label="Reason for this change">
        <input value={values.reason} placeholder="e.g. Details confirmed with the client" onChange={(e) => set("reason")(e.target.value)} className={INPUT} />
      </Field>
      <div className="sm:col-span-2">
        <NavyButton type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save details"}
        </NavyButton>
      </div>
    </form>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("block text-[11px] font-medium text-muted-foreground", wide && "sm:col-span-2")}>
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}