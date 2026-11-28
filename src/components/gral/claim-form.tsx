"use client";

// New claim form (claim step 1, Register), in two short parts: which policy the
// claim is on, then what happened. Saves through lib/api.ts (createClaim).

import { useEffect, useState } from "react";
import { focusFirstError } from "@/lib/focus-error";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { CenteredModal } from "@/components/gral/shell";
import { NavyButton, OutlineButton } from "@/components/gral/ui";
import { createClaim, listClientChoices, listClientPolicies } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { INSURER_GROUPS, PRODUCT_GROUPS, type OptionGroup } from "@/lib/reference-data";
import { displayToIso } from "@/lib/format";
import { formatDate, todayIso } from "@/lib/renewals";
import type { Claim, ClaimPriority, Client, Policy } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Field, describedBy, inputClass } from "./client-form";
import { AmountInput } from "./amount-input";
import { ReviewDialog } from "./review-dialog";
import { claimAmountWarnings, parseAmount } from "@/lib/amounts";
import { businessLine } from "@/lib/reports";

type FormValues = {
  clientId: string;
  policyId: string;
  classOfInsurance: string;
  insurer: string;
  dateOfLoss: string;
  dateReported: string;
  amount: string;
  priority: ClaimPriority;
  handler: string;
  description: string;
  reimbursementNo: string;
};

type Errors = Partial<Record<keyof FormValues, string>>;

const PRIORITIES: { value: ClaimPriority; label: string }[] = [
  { value: "P1", label: "Urgent" },
  { value: "P2", label: "Normal" },
  { value: "P3", label: "Low" },
];

const PARTS = ["Policy", "What happened"] as const;

/** Part 1: the client and the policy the claim is on. */
function validatePolicy(v: FormValues, policyRequired: boolean): Errors {
  const e: Errors = {};
  if (!v.clientId) e.clientId = "Choose the client.";
  if (policyRequired && !v.policyId) e.policyId = "Choose the policy this claim is on.";
  if (!v.classOfInsurance) e.classOfInsurance = "Choose the class of insurance.";
  if (!v.insurer) e.insurer = "Choose the insurer.";
  return e;
}

/** Part 2: the loss itself. */
function validateLoss(v: FormValues, policy?: Policy): Errors {
  const e: Errors = {};
  const today = todayIso();
  if (!v.dateOfLoss) e.dateOfLoss = "Enter the date of loss.";
  else if (v.dateOfLoss > today) e.dateOfLoss = "The date of loss cannot be in the future.";
  else if (policy) {
    // The backend only accepts a loss that happened while the policy was in force.
    const start = displayToIso(policy.start);
    const end = displayToIso(policy.renewal);
    if ((start && v.dateOfLoss < start) || (end && v.dateOfLoss > end)) {
      e.dateOfLoss = `This policy covers ${policy.start} to ${policy.renewal}. The date of loss must fall in that period.`;
    }
  }
  if (!v.dateReported) e.dateReported = "Enter the date the client reported the loss.";
  else if (v.dateReported > today) e.dateReported = "The report date cannot be in the future.";
  else if (v.dateOfLoss && v.dateReported < v.dateOfLoss) e.dateReported = "This is before the date of loss.";
  if (!(parseAmount(v.amount) > 0)) e.amount = "Enter the estimated loss in RWF.";
  if (!v.handler) e.handler = "Choose who handles the claim.";
  if (v.description.trim().length < 10) e.description = "Describe what happened (at least a sentence).";
  return e;
}

export function NewClaimSlideOver({
  open,
  onClose,
  handlers,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Names for the handler dropdown. */
  handlers: string[];
  onCreated: (claim: Claim) => void;
}) {
  return (
    <CenteredModal open={open} onClose={onClose}>
      {open ? <NewClaimForm handlers={handlers} onClose={onClose} onCreated={onCreated} /> : null}
    </CenteredModal>
  );
}

function NewClaimForm({
  handlers,
  onClose,
  onCreated,
}: {
  handlers: string[];
  onClose: () => void;
  onCreated: (claim: Claim) => void;
}) {
  const { user } = useCurrentUser();
  const [part, setPart] = useState(0);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsError, setClientsError] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [values, setValues] = useState<FormValues>({
    clientId: "",
    policyId: "",
    classOfInsurance: "",
    insurer: "",
    dateOfLoss: "",
    dateReported: todayIso(),
    amount: "",
    priority: "P2",
    handler: handlers.includes(user.name) ? user.name : "",
    description: "",
    reimbursementNo: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  // Set once the form is valid: the figures to check before registering.
  const [review, setReview] = useState<string[] | null>(null);

  useEffect(() => {
    listClientChoices()
      .then(setClients)
      .catch(() => setClientsError(true))
      .finally(() => setLoadingClients(false));
  }, []);

  const client = clients.find((c) => c.id === values.clientId);
  // Backend clients: the claim must sit on one of the client's policies.
  const policyRequired = !!client?.uuid;

  // Load the chosen client's policies (from the backend for backend clients).
  useEffect(() => {
    let cancelled = false;
    setPolicies(client?.policies ?? []);
    if (!client?.uuid) return;
    setLoadingPolicies(true);
    listClientPolicies(client.id)
      .then((list) => {
        if (!cancelled) setPolicies(list);
      })
      .catch(() => {
        if (!cancelled) setPolicies([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPolicies(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const policy = policies.find((p) => p.id === values.policyId);
  // Life and Medical claims carry the insurer's reimbursement number.
  const lifeOrMedical = !!values.classOfInsurance && businessLine(values.classOfInsurance) !== "Non-life";
  const handlerOptions = handlers.includes(user.name) ? handlers : [user.name, ...handlers];

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function chooseClient(clientId: string) {
    setValues((v) => ({ ...v, clientId, policyId: "", classOfInsurance: "", insurer: "" }));
    setErrors({});
  }

  /** Choosing a policy fills in its class and insurer; "not known yet" clears them. */
  function choosePolicy(policyId: string) {
    const chosen = policies.find((p) => p.id === policyId);
    setValues((v) => ({
      ...v,
      policyId,
      classOfInsurance: chosen?.classOfInsurance ?? "",
      insurer: chosen?.insurer ?? "",
    }));
    setErrors((e) => ({ ...e, policyId: undefined, classOfInsurance: undefined, insurer: undefined }));
  }

  function next(form: HTMLFormElement) {
    const found = validatePolicy(values, policyRequired);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError(form, Object.keys(found));
      return;
    }
    setPart(1);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (part === 0) {
      next(e.currentTarget);
      return;
    }
    const found = validateLoss(values, policy);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError(e.currentTarget, Object.keys(found));
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setReview(claimAmountWarnings(parseAmount(values.amount), client?.policies.find((p) => p.id === values.policyId)));
  }

  async function save() {
    setSaving(true);
    try {
      const created = await createClaim(
        {
          clientId: values.clientId,
          client: client?.name ?? "",
          policyId: values.policyId || undefined,
          classOfInsurance: values.classOfInsurance,
          insurer: values.insurer,
          dateOfLoss: values.dateOfLoss,
          dateReported: values.dateReported,
          amount: parseAmount(values.amount),
          priority: values.priority,
          handler: values.handler,
          description: values.description.trim(),
          policyPeriodId: policy?.periodId,
          reimbursementNo: lifeOrMedical ? values.reimbursementNo.trim() || undefined : undefined,
        },
        user.name,
      );
      toast.success(`Claim ${created.id} registered.`);
      setReview(null);
      onCreated(created);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Could not register the claim.");
    } finally {
      setSaving(false);
    }
  }

  const clientPlaceholder = clientsError
    ? "Could not load clients. Close the form and try again."
    : loadingClients
      ? "Loading clients…"
      : clients.length === 0
        ? "No clients you can see"
        : "Select a client";

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-full flex-col">
      <div className="border-b border-border px-6 py-5 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">New claim</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <ol className="mt-4 flex items-center gap-2 text-xs">
          {PARTS.map((name, i) => (
            <li key={name} className="flex items-center gap-2">
              {i > 0 ? <span aria-hidden className={cn("h-0.5 w-8 rounded-full", part >= i ? "bg-primary" : "bg-border")} /> : null}
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-[11px] font-semibold",
                  part > i ? "bg-primary text-primary-foreground" : part === i ? "bg-card text-primary ring-2 ring-sky" : "bg-secondary text-subtle",
                )}
              >
                {part > i ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn(part === i ? "font-medium text-foreground" : "text-muted-foreground")} aria-current={part === i ? "step" : undefined}>
                {name}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex-1 px-6 py-6 sm:px-8">
        {part === 0 ? (
          <div className="space-y-5">
            <Field id="clientId" label="Client" error={errors.clientId}>
              <select
                id="clientId"
                value={values.clientId}
                onChange={(e) => chooseClient(e.target.value)}
                className={inputClass(errors.clientId)}
                {...describedBy("clientId", errors.clientId)}
              >
                <option value="">{clientPlaceholder}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
            </Field>

            {client ? (
              <fieldset id="policyId" tabIndex={-1} {...describedBy("policyId", errors.policyId)} className="outline-none">
                <legend className="text-xs font-medium text-muted-foreground">Policy</legend>
                {loadingPolicies ? (
                  <p className="mt-2 text-sm text-muted-foreground">Loading policies…</p>
                ) : (
                  <div className="mt-1.5 grid gap-2">
                    {policies.map((p) => (
                      <PolicyChoice key={p.id} selected={values.policyId === p.id} onSelect={() => choosePolicy(p.id)}>
                        <span className="block text-sm font-medium">{p.id}</span>
                        <span className="block text-xs text-muted-foreground">
                          {p.classOfInsurance} · {p.insurer}
                        </span>
                        <span className="block text-[11px] text-subtle">
                          {p.start} to {p.renewal}
                          {p.status !== "Active" ? ` · ${p.status}` : ""}
                        </span>
                      </PolicyChoice>
                    ))}
                    {policies.length === 0 && policyRequired ? (
                      <p className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                        This client has no policies on file, so a claim cannot be registered yet.
                      </p>
                    ) : null}
                    {!policyRequired ? (
                      <PolicyChoice selected={values.policyId === ""} onSelect={() => choosePolicy("")}>
                        <span className="block text-sm font-medium">Not known yet</span>
                        <span className="block text-xs text-muted-foreground">Choose the class and insurer instead</span>
                      </PolicyChoice>
                    ) : null}
                  </div>
                )}
                {errors.policyId ? (
                  <p id="policyId-error" role="alert" className="mt-1.5 text-xs font-medium text-danger">
                    {errors.policyId}
                  </p>
                ) : null}
              </fieldset>
            ) : null}

            {client && !policyRequired && !values.policyId ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="classOfInsurance" label="Class of insurance" error={errors.classOfInsurance}>
                  <GroupedSelect
                    id="classOfInsurance"
                    value={values.classOfInsurance}
                    onChange={(v) => set("classOfInsurance", v)}
                    groups={PRODUCT_GROUPS}
                    placeholder="Select a class"
                    error={errors.classOfInsurance}
                  />
                </Field>
                <Field id="insurer" label="Insurer" error={errors.insurer}>
                  <GroupedSelect
                    id="insurer"
                    value={values.insurer}
                    onChange={(v) => set("insurer", v)}
                    groups={INSURER_GROUPS}
                    placeholder="Select an insurer"
                    error={errors.insurer}
                  />
                </Field>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-5">
            {client ? (
              <p className="rounded-xl bg-pale px-4 py-3 text-xs">
                <span className="font-medium">{client.name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {values.policyId || "Policy not known yet"} · {values.classOfInsurance} · {values.insurer}
                </span>
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="dateOfLoss" label="Date of loss" error={errors.dateOfLoss}>
                <input
                  id="dateOfLoss"
                  type="date"
                  max={todayIso()}
                  value={values.dateOfLoss}
                  onChange={(e) => set("dateOfLoss", e.target.value)}
                  className={inputClass(errors.dateOfLoss)}
                  {...describedBy("dateOfLoss", errors.dateOfLoss)}
                />
              </Field>
              <Field id="dateReported" label="Reported by the client on" error={errors.dateReported}>
                <input
                  id="dateReported"
                  type="date"
                  max={todayIso()}
                  value={values.dateReported}
                  onChange={(e) => set("dateReported", e.target.value)}
                  className={inputClass(errors.dateReported)}
                  {...describedBy("dateReported", errors.dateReported)}
                />
              </Field>
              <Field id="amount" label="Estimated loss (RWF)" error={errors.amount}>
                <AmountInput
                  id="amount"
                  value={values.amount}
                  onChange={(v) => set("amount", v)}
                  className={inputClass(errors.amount)}
                  {...describedBy("amount", errors.amount)}
                />
              </Field>
              <div>
                <p id="priority-label" className="text-xs font-medium text-muted-foreground">
                  Priority
                </p>
                <div role="radiogroup" aria-labelledby="priority-label" className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      role="radio"
                      aria-checked={values.priority === p.value}
                      onClick={() => set("priority", p.value)}
                      className={cn(
                        "rounded-lg px-2 py-1.5 text-sm transition-colors",
                        values.priority === p.value ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Field id="description" label="What happened" error={errors.description}>
              <textarea
                id="description"
                rows={3}
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                className={inputClass(errors.description)}
                {...describedBy("description", errors.description)}
              />
            </Field>

            {lifeOrMedical ? (
              <Field id="reimbursementNo" label="Reimbursement number (if the insurer gave one)">
                <input
                  id="reimbursementNo"
                  maxLength={60}
                  value={values.reimbursementNo}
                  onChange={(e) => set("reimbursementNo", e.target.value)}
                  className={inputClass()}
                />
              </Field>
            ) : null}

            <Field id="handler" label="Claims handler" error={errors.handler}>
              <select
                id="handler"
                value={values.handler}
                onChange={(e) => set("handler", e.target.value)}
                className={inputClass(errors.handler)}
                {...describedBy("handler", errors.handler)}
              >
                <option value="">Select a handler</option>
                {handlerOptions.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 flex justify-between gap-2 border-t border-border bg-card px-6 py-4 sm:px-8">
        {part === 0 ? (
          <OutlineButton onClick={onClose} className="px-4 py-2 text-sm">
            Cancel
          </OutlineButton>
        ) : (
          <OutlineButton onClick={() => setPart(0)} className="px-4 py-2 text-sm">
            Back
          </OutlineButton>
        )}
        <NavyButton type="submit" disabled={saving || (part === 0 && policyRequired && !loadingPolicies && policies.length === 0)} className="px-4 py-2 text-sm">
          {part === 0 ? "Next" : "Review and register"}
        </NavyButton>
      </div>

      <ReviewDialog
        open={review !== null}
        title={`Check the claim for ${client?.name ?? "the client"}`}
        rows={[
          { label: "Estimated loss", amount: parseAmount(values.amount) },
          { label: "Policy", value: values.policyId || "Not known yet" },
          { label: "Class and insurer", value: `${values.classOfInsurance} · ${values.insurer}` },
          { label: "Date of loss", value: values.dateOfLoss ? formatDate(values.dateOfLoss) : "" },
          { label: "Priority", value: PRIORITIES.find((p) => p.value === values.priority)?.label ?? values.priority },
          ...(lifeOrMedical && values.reimbursementNo.trim() ? [{ label: "Reimbursement number", value: values.reimbursementNo.trim() }] : []),
          { label: "Handler", value: values.handler },
        ]}
        warnings={review ?? []}
        confirmLabel="Register claim"
        saving={saving}
        onConfirm={save}
        onBack={() => setReview(null)}
      />
    </form>
  );
}

/** One policy to pick, as a card with a radio mark. */
function PolicyChoice({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
        selected ? "border-sky bg-pale" : "border-border bg-card hover:border-sky/50",
      )}
    >
      <span
        aria-hidden
        className={cn("mt-0.5 flex size-4 items-center justify-center rounded-full border", selected ? "border-primary" : "border-input")}
      >
        {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
      </span>
      <span className="min-w-0">{children}</span>
    </button>
  );
}

function GroupedSelect({
  id,
  value,
  onChange,
  groups,
  placeholder,
  error,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  groups: OptionGroup[];
  placeholder: string;
  error?: string;
}) {
  // A policy can carry an older name that is not in the official list; keep it selectable.
  const known = groups.some((g) => g.options.includes(value));
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass(error)} {...describedBy(id, error)}>
      <option value="">{placeholder}</option>
      {value && !known ? <option value={value}>{value}</option> : null}
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
