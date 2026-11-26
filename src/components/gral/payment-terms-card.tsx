"use client";

// Payment terms for the policy's current cover period: when the premium is
// due, whether it is paid, and whether it is overdue. The due date follows the
// kind of client (a number of days after cover starts) unless someone set a
// date. People who may change the policy figures can change the terms; every
// change is kept on GRAL's system with its reason.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Chip, FloatCard, NavyButton, OutlineButton } from "@/components/gral/ui";
import { colleagueName, getPaymentTerms, updatePaymentTerms, type PaymentCategory, type PaymentTerms } from "@/lib/api";
import { formatRwf } from "@/lib/format";
import { formatDate, kigaliDate } from "@/lib/renewals";

const CATEGORY_LABEL: Record<PaymentCategory, string> = {
  CORPORATE: "Company",
  GOVERNMENT: "Government body",
  INDIVIDUAL: "Individual",
};

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "sky" }> = {
  PAID: { label: "Paid in full", tone: "success" },
  PARTIALLY_PAID: { label: "Partly paid", tone: "warning" },
  UNPAID: { label: "Not paid", tone: "warning" },
  OVERPAID: { label: "Overpaid", tone: "sky" },
  UNKNOWN: { label: "Not known yet", tone: "neutral" },
  ANOMALOUS: { label: "Figures need checking", tone: "danger" },
};

const INPUT =
  "mt-1 w-full rounded-xl border border-input bg-card px-3 py-2 text-xs outline-none focus:border-sky focus:ring-2 focus:ring-sky/30";

export function PaymentTermsCard({ periodId, canEdit }: { periodId: string; canEdit: boolean }) {
  const [terms, setTerms] = useState<PaymentTerms | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [by, setBy] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPaymentTerms(periodId)
      .then((t) => !cancelled && setTerms(t))
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the payment terms.");
        setTerms(null);
      });
    return () => {
      cancelled = true;
    };
  }, [periodId]);

  useEffect(() => {
    let cancelled = false;
    void colleagueName(terms?.terms?.recordedBy).then((name) => !cancelled && setBy(name));
    return () => {
      cancelled = true;
    };
  }, [terms?.terms?.recordedBy]);

  // Not available to this person, or demo mode: nothing to show.
  if (terms === null && !error) return null;

  const status = terms ? (STATUS[terms.paymentStatus] ?? { label: terms.paymentStatus, tone: "neutral" as const }) : null;
  const t = terms?.terms;

  return (
    <FloatCard className="p-5" delay={200}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">Payment terms</h2>
        {terms?.overdue ? <Chip tone="danger">Overdue</Chip> : status ? <Chip tone={status.tone}>{status.label}</Chip> : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      ) : terms === undefined ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading…</p>
      ) : editing && terms ? (
        <EditTerms
          terms={terms}
          periodId={periodId}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            setTerms(next);
            setEditing(false);
            toast.success("Payment terms saved.");
          }}
        />
      ) : (
        <>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Premium due</dt>
              <dd className={terms?.overdue ? "font-semibold text-danger" : "font-medium"}>{t ? formatDate(t.dueDate) : "Not set"}</dd>
            </div>
            {t ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">How it was set</dt>
                <dd className="text-right font-medium">
                  {t.overridden
                    ? "A specific date was set"
                    : `${CATEGORY_LABEL[t.category]}: ${t.allowanceDays} days after cover starts`}
                </dd>
              </div>
            ) : null}
            {terms && terms.balance !== null && terms.balance > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Still to pay</dt>
                <dd className="font-medium">{formatRwf(Number(terms.balance))}</dd>
              </div>
            ) : null}
          </dl>
          {t ? (
            <p className="mt-3 text-[11px] text-subtle">
              Last set {formatDate(kigaliDate(t.recordedAt))}
              {by ? ` by ${by}` : ""}
              {t.reason ? ` · ${t.reason}` : ""}
            </p>
          ) : null}
          {canEdit && terms ? (
            <OutlineButton className="mt-3" onClick={() => setEditing(true)}>
              Change payment terms
            </OutlineButton>
          ) : null}
        </>
      )}
    </FloatCard>
  );
}

function EditTerms({
  terms,
  periodId,
  onCancel,
  onSaved,
}: {
  terms: PaymentTerms;
  periodId: string;
  onCancel: () => void;
  onSaved: (terms: PaymentTerms) => void;
}) {
  const [category, setCategory] = useState<PaymentCategory>(terms.terms?.category ?? "CORPORATE");
  const [useDate, setUseDate] = useState(!!terms.terms?.overridden);
  const [dueDate, setDueDate] = useState(terms.terms?.overridden ? terms.terms.dueDate : "");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (useDate && !dueDate) return setProblem("Choose the date the premium is due.");
    if (reason.trim().length < 5) return setProblem("Say why the payment terms are changing.");
    setProblem(null);
    setSaving(true);
    try {
      onSaved(
        await updatePaymentTerms(periodId, {
          expectedVersion: terms.version,
          category,
          dueDateOverride: useDate ? dueDate : undefined,
          reason,
        }),
      );
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save the payment terms.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-3 space-y-3 text-xs" noValidate>
      <label className="block text-muted-foreground">
        Kind of client
        <select className={INPUT} value={category} onChange={(e) => setCategory(e.target.value as PaymentCategory)}>
          {(Object.keys(CATEGORY_LABEL) as PaymentCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={useDate} onChange={(e) => setUseDate(e.target.checked)} />
        Use a specific due date instead
      </label>
      {useDate ? (
        <label className="block text-muted-foreground">
          Premium due on
          <input type="date" className={INPUT} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      ) : null}
      <label className="block text-muted-foreground">
        Reason
        <textarea
          className={INPUT}
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Client is a government body; insurer agreed 60 days"
        />
      </label>
      {problem ? (
        <p role="alert" className="text-danger">
          {problem}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <OutlineButton type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </OutlineButton>
        <NavyButton type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </NavyButton>
      </div>
    </form>
  );
}
