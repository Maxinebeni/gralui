"use client";

// New Claim form (claim step 1, Register). Opens on its own slide-over panel
// from the Claims Queue. Saves through lib/api.ts (createClaim), so it keeps
// working once the claims API (CLM-01) is connected.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { SlideOver } from "@/components/gral/shell";
import { NavyButton, OutlineButton } from "@/components/gral/ui";
import { createClaim, listClientChoices, listClientPolicies } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { INSURER_GROUPS, PRODUCT_GROUPS, type OptionGroup } from "@/lib/reference-data";
import { displayToIso } from "@/lib/format";
import { todayIso } from "@/lib/renewals";
import type { Claim, ClaimPriority, Client, Policy } from "@/lib/types";
import { Field, Section, describedBy, inputClass } from "./client-form";

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
};

type Errors = Partial<Record<keyof FormValues, string>>;

const PRIORITIES: { value: ClaimPriority; label: string }[] = [
  { value: "P1", label: "P1 · Urgent" },
  { value: "P2", label: "P2 · Normal" },
  { value: "P3", label: "P3 · Low" },
];

function validate(v: FormValues): Errors {
  const e: Errors = {};
  const today = todayIso();
  if (!v.clientId) e.clientId = "Choose the client.";
  if (!v.classOfInsurance) e.classOfInsurance = "Choose the class of insurance.";
  if (!v.insurer) e.insurer = "Choose the insurer.";
  if (!v.dateOfLoss) e.dateOfLoss = "Enter the date of loss.";
  else if (v.dateOfLoss > today) e.dateOfLoss = "The date of loss cannot be in the future.";
  if (!v.dateReported) e.dateReported = "Enter the date the client reported the loss.";
  else if (v.dateReported > today) e.dateReported = "The report date cannot be in the future.";
  else if (v.dateOfLoss && v.dateReported < v.dateOfLoss) e.dateReported = "This is before the date of loss.";
  if (!(Number(v.amount.replace(/[^\d]/g, "")) > 0)) e.amount = "Enter the estimated loss in RWF.";
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
    <SlideOver open={open} onClose={onClose} wide>
      {open ? <NewClaimForm handlers={handlers} onClose={onClose} onCreated={onCreated} /> : null}
    </SlideOver>
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
  });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);

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
  const handlerOptions = handlers.includes(user.name) ? handlers : [user.name, ...handlers];

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  /** Choosing a policy fills in its class and insurer. */
  function choosePolicy(policyId: string) {
    const policy = policies.find((p) => p.id === policyId);
    setValues((v) => ({
      ...v,
      policyId,
      classOfInsurance: policy?.classOfInsurance ?? v.classOfInsurance,
      insurer: policy?.insurer ?? v.insurer,
    }));
    setErrors((e) => ({ ...e, classOfInsurance: undefined, insurer: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate(values);
    if (policyRequired && !values.policyId) found.policyId = "Choose the policy this claim is on.";
    // The backend only accepts a loss that happened while the policy was in force.
    if (policy && values.dateOfLoss && !found.dateOfLoss) {
      const start = displayToIso(policy.start);
      const end = displayToIso(policy.renewal);
      if ((start && values.dateOfLoss < start) || (end && values.dateOfLoss > end)) {
        found.dateOfLoss = `This policy covers ${policy.start} to ${policy.renewal}. The date of loss must fall in that period.`;
      }
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
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
          amount: Number(values.amount.replace(/[^\d]/g, "")),
          priority: values.priority,
          handler: values.handler,
          description: values.description.trim(),
          policyPeriodId: policy?.periodId,
        },
        user.name,
      );
      toast.success(`Claim ${created.id} registered.`);
      onCreated(created);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Could not register the claim.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-full flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">New Claim</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Step 1 of the claims process: register within 24 hours of the client reporting the loss. The claim
            number is created automatically. The policy can be linked later if it is not known yet.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-6 px-6 py-5">
        <Section title="Client and policy">
          <Field id="clientId" label="Client" error={errors.clientId} wide>
            <select
              id="clientId"
              value={values.clientId}
              onChange={(e) => {
                set("clientId", e.target.value);
                set("policyId", "");
              }}
              className={inputClass(errors.clientId)}
              {...describedBy("clientId", errors.clientId)}
            >
              <option value="">
                {clientsError
                  ? "Could not load clients. Close the form and try again."
                  : loadingClients
                    ? "Loading clients…"
                    : clients.length === 0
                      ? "No clients you can see"
                      : "Select a client"}
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </Field>
          <Field id="policyId" label={policyRequired ? "Policy" : "Policy (optional)"} error={errors.policyId} wide>
            <select
              id="policyId"
              value={values.policyId}
              onChange={(e) => choosePolicy(e.target.value)}
              disabled={!client || loadingPolicies}
              className={inputClass(errors.policyId)}
              {...describedBy("policyId", errors.policyId)}
            >
              <option value="">
                {loadingPolicies
                  ? "Loading policies…"
                  : client && policies.length === 0
                    ? "No policies on file"
                    : policyRequired
                      ? "Select a policy"
                      : "Not known yet"}
              </option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} · {p.classOfInsurance} · {p.insurer}
                </option>
              ))}
            </select>
          </Field>
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
        </Section>

        <Section title="The loss">
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
            <input
              id="amount"
              inputMode="numeric"
              value={values.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="e.g. 4,200,000"
              className={inputClass(errors.amount)}
              {...describedBy("amount", errors.amount)}
            />
          </Field>
          <Field id="priority" label="Priority">
            <select
              id="priority"
              value={values.priority}
              onChange={(e) => set("priority", e.target.value as ClaimPriority)}
              className={inputClass()}
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="description" label="What happened" error={errors.description} wide>
            <textarea
              id="description"
              rows={3}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="e.g. Fire in the rolling mill damaged the main conveyor and control panel."
              className={inputClass(errors.description)}
              {...describedBy("description", errors.description)}
            />
          </Field>
        </Section>

        <Section title="Handling">
          <Field id="handler" label="Claims handler" error={errors.handler} wide>
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
        </Section>
      </div>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card px-6 py-4">
        <OutlineButton onClick={onClose} className="px-4 py-2 text-sm">
          Cancel
        </OutlineButton>
        <NavyButton type="submit" disabled={saving} className="px-4 py-2 text-sm">
          {saving ? "Saving…" : "Register Claim"}
        </NavyButton>
      </div>
    </form>
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
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass(error)}
      {...describedBy(id, error)}
    >
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