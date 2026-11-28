"use client";

// Premium payments on the policy's current cover period: the instalments, each
// payment with its method, reference number and receipt, and what is still owed.

import { useEffect, useState } from "react";
import { FileText, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { CardHeader, Chip, FloatCard, NavyButton, OutlineButton } from "@/components/gral/ui";
import { useCurrentUser } from "@/lib/auth-context";
import { formatRwf } from "@/lib/format";
import { parseAmount } from "@/lib/amounts";
import { paymentPermissions } from "@/lib/permissions";
import {
  PAYMENT_METHODS,
  getPayments,
  instalmentLines,
  methodLabel,
  paymentTotals,
  recordPayment,
  setInstalments,
  splitPremium,
  type InstalmentStatus,
  type PaymentMethod,
  type PaymentPlan,
  type PeriodRef,
} from "@/lib/policy-payments";
import { formatDate, todayIso } from "@/lib/renewals";
import { cn } from "@/lib/utils";
import { Td, Th } from "./claim-list";
import { AmountInput } from "./amount-input";
import { FilePickButton } from "./documents";

const INPUT =
  "mt-1 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-sky focus:ring-2 focus:ring-sky/30";

const STATUS: Record<InstalmentStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  PAID: { label: "Paid", tone: "success" },
  PART_PAID: { label: "Part paid", tone: "warning" },
  DUE: { label: "Not paid", tone: "neutral" },
  OVERDUE: { label: "Overdue", tone: "danger" },
};

export function PolicyPaymentsCard({ period }: { period: PeriodRef }) {
  const { user } = useCurrentUser();
  const { canRecordPayments } = paymentPermissions(user);
  const [plan, setPlan] = useState<PaymentPlan | null | undefined>(undefined);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "pay" | "plan">("view");

  useEffect(() => {
    let cancelled = false;
    getPayments(period)
      .then((state) => {
        if (cancelled) return;
        if (state.available) setPlan(state.plan);
        else {
          setUnavailable(true);
          setPlan(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the payments.");
        setPlan(null);
      });
    return () => {
      cancelled = true;
    };
    // The period is identified by its key; the other fields only seed demo data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.key]);

  const totals = plan ? paymentTotals(plan, period.totalPremium) : null;
  const lines = plan ? instalmentLines(plan) : [];

  return (
    <FloatCard className="overflow-hidden" delay={150}>
      <CardHeader
        title="Payments"
        right={
          totals ? (
            totals.owed === 0 && totals.due > 0 ? (
              <Chip tone="success">Paid in full</Chip>
            ) : totals.owed > 0 ? (
              <Chip tone="warning">{formatRwf(totals.owed)} still to pay</Chip>
            ) : null
          ) : null
        }
      />

      <div className="px-4 pt-4 pb-5 sm:px-5">
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : plan === undefined ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : unavailable || !plan || !totals ? (
          <p className="text-xs text-muted-foreground">
            Instalments and payments are not on the live system yet. Invoices, contracts and receipts can already be uploaded under Invoice and payment documents.
          </p>
        ) : (
          <div className="space-y-5">
            <dl className="grid grid-cols-3 gap-3 text-xs">
              <Figure label="Premium" value={formatRwf(totals.due)} />
              <Figure label="Paid" value={formatRwf(totals.paid)} />
              <Figure label="Still to pay" value={formatRwf(totals.owed)} strong={totals.owed > 0} />
            </dl>

            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Instalments</h3>
                {canRecordPayments && mode === "view" && period.totalPremium ? (
                  <OutlineButton onClick={() => setMode("plan")}>Change instalments</OutlineButton>
                ) : null}
              </div>
              {mode === "plan" ? (
                <InstalmentForm
                  period={period}
                  current={plan}
                  onCancel={() => setMode("view")}
                  onSaved={(p) => {
                    setPlan(p);
                    setMode("view");
                  }}
                />
              ) : lines.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No instalments set.</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="stack-table w-full min-w-[420px] border-separate border-spacing-0 text-left">
                    <thead>
                      <tr className="bg-pale text-[11px] text-muted-foreground">
                        <Th className="rounded-l-xl">Instalment</Th>
                        <Th>Due</Th>
                        <Th>Amount</Th>
                        <Th>Paid</Th>
                        <Th className="rounded-r-xl">Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.number}>
                          <Td className="text-sm">
                            {l.number} of {lines.length}
                          </Td>
                          <Td label="Due" className="text-sm whitespace-nowrap">{formatDate(l.dueDate)}</Td>
                          <Td label="Amount" className="text-sm whitespace-nowrap">{formatRwf(l.amount)}</Td>
                          <Td label="Paid" className="text-sm whitespace-nowrap">{formatRwf(l.paid)}</Td>
                          <Td label="Status" className="text-sm">
                            <Chip tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Chip>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Payments received</h3>
                {canRecordPayments && mode === "view" ? (
                  <NavyButton onClick={() => setMode("pay")}>
                    <Plus className="size-3.5" /> Record a payment
                  </NavyButton>
                ) : null}
              </div>
              {mode === "pay" ? (
                <PaymentForm
                  period={period}
                  instalments={lines.filter((l) => l.status !== "PAID").map((l) => ({ number: l.number, label: `${l.number} of ${lines.length} · due ${formatDate(l.dueDate)}` }))}
                  owed={totals.owed}
                  userName={user.name}
                  onCancel={() => setMode("view")}
                  onSaved={(p) => {
                    setPlan(p);
                    setMode("view");
                  }}
                />
              ) : null}
              {plan.payments.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No payments recorded.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border">
                  {[...plan.payments].reverse().map((p) => (
                    <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-2.5">
                      <div className="min-w-0 text-xs">
                        <p className="font-medium">
                          {formatDate(p.paidOn)} · {methodLabel(p.method)}
                        </p>
                        <p className="text-muted-foreground">
                          Reference {p.reference}
                          {p.instalmentNumber ? ` · instalment ${p.instalmentNumber}` : ""}
                        </p>
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-primary">
                          <FileText className="size-3" /> {p.receipt.fileName}
                        </p>
                      </div>
                      <p className="text-sm font-medium whitespace-nowrap">{formatRwf(p.amount)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </FloatCard>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-pale px-3 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 truncate font-medium", strong && "text-warning")}>{value}</dd>
    </div>
  );
}

function PaymentForm({
  period,
  instalments,
  owed,
  userName,
  onCancel,
  onSaved,
}: {
  period: PeriodRef;
  instalments: { number: number; label: string }[];
  owed: number;
  userName: string;
  onCancel: () => void;
  onSaved: (plan: PaymentPlan) => void;
}) {
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [reference, setReference] = useState("");
  const [instalment, setInstalment] = useState(instalments[0] ? String(instalments[0].number) : "");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const value = parseAmount(amount);
    const missing = [
      !(value > 0) && "the amount",
      !paidOn && "the date paid",
      !method && "the payment method",
      !reference.trim() && "the reference number",
      !receipt && "the receipt",
    ].filter(Boolean);
    if (missing.length) {
      toast.error(`Add ${missing.join(", ")}.`);
      return;
    }
    if (paidOn > todayIso()) {
      toast.error("The payment date cannot be in the future.");
      return;
    }
    setSaving(true);
    try {
      const plan = await recordPayment(
        period,
        { amount: value, paidOn, method: method as PaymentMethod, reference, instalmentNumber: instalment ? Number(instalment) : undefined, receipt: receipt! },
        userName,
      );
      toast.success("Payment recorded.");
      onSaved(plan);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record the payment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Amount (RWF)
          <AmountInput value={amount} onChange={setAmount} aria-label="Amount paid" className={INPUT} />
          {owed > 0 && parseAmount(amount) > owed ? <span className="mt-1 block text-[11px] text-warning">More than the {formatRwf(owed)} still to pay.</span> : null}
        </label>
        <label className="text-xs text-muted-foreground">
          Paid on
          <input type="date" max={todayIso()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={INPUT} />
        </label>
        <label className="text-xs text-muted-foreground">
          Payment method
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={INPUT}>
            <option value="">Select a method</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Reference number
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. bank or mobile money reference" className={INPUT} />
        </label>
        {instalments.length > 0 ? (
          <label className="text-xs text-muted-foreground sm:col-span-2">
            Instalment
            <select value={instalment} onChange={(e) => setInstalment(e.target.value)} className={INPUT}>
              {instalments.map((i) => (
                <option key={i.number} value={i.number}>
                  {i.label}
                </option>
              ))}
              <option value="">Not for one instalment</option>
            </select>
          </label>
        ) : null}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Receipt (proof of payment)</p>
        {receipt ? (
          <p className="mt-1 flex items-center gap-2 text-xs">
            <FileText className="size-3.5 text-primary" /> {receipt.name}
            <button type="button" aria-label="Remove receipt" onClick={() => setReceipt(null)} className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </p>
        ) : (
          <div className="mt-1">
            <FilePickButton onFile={setReceipt} destination="This payment">
              Attach receipt
            </FilePickButton>
          </div>
        )}
      </div>
      <div className="flex justify-between gap-2 pt-1">
        <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
        <NavyButton onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Record payment"}
        </NavyButton>
      </div>
    </div>
  );
}

function InstalmentForm({
  period,
  current,
  onCancel,
  onSaved,
}: {
  period: PeriodRef;
  current: PaymentPlan;
  onCancel: () => void;
  onSaved: (plan: PaymentPlan) => void;
}) {
  const total = period.totalPremium ?? 0;
  const [rows, setRows] = useState(() =>
    (current.instalments.length ? current.instalments : splitPremium(total, 1, period.startDate ?? todayIso())).map((x) => ({
      dueDate: x.dueDate,
      amount: String(x.amount),
    })),
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const sum = rows.reduce((s, r) => s + parseAmount(r.amount), 0);

  function split(count: number) {
    const first = rows[0]?.dueDate || period.startDate || todayIso();
    setRows(splitPremium(total, count, first).map((x) => ({ dueDate: x.dueDate, amount: String(x.amount) })));
  }

  async function save() {
    if (rows.some((r) => !r.dueDate || !(parseAmount(r.amount) > 0))) {
      toast.error("Give every instalment a due date and an amount.");
      return;
    }
    if (sum !== total) {
      toast.error(`The instalments add up to ${formatRwf(sum)}, not the premium of ${formatRwf(total)}.`);
      return;
    }
    if (!reason.trim()) {
      toast.error("Say why the instalments are set this way.");
      return;
    }
    setSaving(true);
    try {
      const plan = await setInstalments(
        period,
        rows.map((r) => ({ dueDate: r.dueDate, amount: parseAmount(r.amount) })),
        reason,
      );
      toast.success("Instalments saved.");
      onSaved(plan);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the instalments.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border p-4">
      <label className="block text-xs text-muted-foreground">
        Number of instalments
        <select value={rows.length} onChange={(e) => split(Number(e.target.value))} className={cn(INPUT, "sm:w-40")}>
          {[1, 2, 3, 4, 6, 12].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <ol className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-end gap-2">
            <span className="pb-2.5 text-xs text-muted-foreground">{i + 1}.</span>
            <label className="text-xs text-muted-foreground">
              Due
              <input
                type="date"
                value={r.dueDate}
                onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))}
                className={INPUT}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Amount (RWF)
              <AmountInput value={r.amount} onChange={(v) => setRows((all) => all.map((x, j) => (j === i ? { ...x, amount: v } : x)))} aria-label={`Instalment ${i + 1} amount`} className={INPUT} />
            </label>
          </li>
        ))}
      </ol>
      <p className={cn("text-xs", sum === total ? "text-muted-foreground" : "font-medium text-warning")}>
        Adds up to {formatRwf(sum)} of {formatRwf(total)}
      </p>
      <label className="block text-xs text-muted-foreground">
        Reason
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Agreed with the client in the renewal meeting" className={INPUT} />
      </label>
      <div className="flex justify-between gap-2 pt-1">
        <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
        <NavyButton onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save instalments"}
        </NavyButton>
      </div>
    </div>
  );
}
