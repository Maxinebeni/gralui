"use client";

// Add / Edit Policy form (task 18). Shown inside the Policies tab of the
// client file. Fields follow the requirements document, section 4, Section B.
// The insurer and class dropdowns use GRAL's official list (lib/reference-data.ts).

import { useState } from "react";
import { toast } from "sonner";
import { NavyButton, OutlineButton } from "./ui";
import { Field, Section, describedBy, inputClass } from "./client-form";
import { createPolicy, updatePolicy, type PolicyInput } from "@/lib/api";
import { CLASSES_OF_INSURANCE, INSURERS, INSURER_GROUPS, PRODUCT_GROUPS, type OptionGroup } from "@/lib/reference-data";
import { POLICY_STATUSES, type Client, type Policy, type PolicyStatus } from "@/lib/types";

type FormValues = {
  id: string;
  classOfInsurance: string;
  insurer: string;
  sumInsured: string;
  premium: string;
  start: string;
  renewal: string;
  status: PolicyStatus | "";
};

type Errors = Partial<Record<keyof FormValues, string>>;

const EMPTY: FormValues = {
  id: "",
  classOfInsurance: "",
  insurer: "",
  sumInsured: "",
  premium: "",
  start: "",
  renewal: "",
  status: "Active",
};

/** "12 Mar 2026" style text to the yyyy-mm-dd a date box needs. Empty if it cannot be read. */
function toInputDate(text: string): string {
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** yyyy-mm-dd from a date box to the "12 Mar 2026" style used across the app. */
function toDisplayDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fromPolicy(p: Policy): FormValues {
  return {
    id: p.id,
    classOfInsurance: p.classOfInsurance,
    insurer: p.insurer,
    sumInsured: String(p.sumInsured),
    premium: String(p.premium),
    start: toInputDate(p.start),
    renewal: toInputDate(p.renewal),
    status: p.status,
  };
}

/** Turns "1,500,000" or "1500000" into a number. NaN if it is not a number. */
function toAmount(text: string): number {
  const cleaned = text.replace(/[,\s]/g, "");
  return cleaned === "" ? Number.NaN : Number(cleaned);
}

function validate(v: FormValues, allowed: { classes: string[]; insurers: string[] }): Errors {
  const e: Errors = {};
  if (!v.id.trim()) e.id = "Enter the policy number issued by the insurer.";
  if (!v.classOfInsurance) e.classOfInsurance = "Choose the class of insurance.";
  else if (!allowed.classes.includes(v.classOfInsurance)) {
    e.classOfInsurance = "Choose a class from GRAL's list.";
  }
  if (!v.insurer) e.insurer = "Choose the insurer.";
  else if (!allowed.insurers.includes(v.insurer)) e.insurer = "Choose an insurer from GRAL's list.";

  const sum = toAmount(v.sumInsured);
  const premium = toAmount(v.premium);
  if (!Number.isFinite(sum) || sum <= 0) e.sumInsured = "Enter the sum insured in RWF, numbers only.";
  if (!Number.isFinite(premium) || premium <= 0) e.premium = "Enter the annual premium in RWF, numbers only.";
  if (!e.sumInsured && !e.premium && premium > sum) {
    e.premium = "The premium cannot be more than the sum insured.";
  }

  if (!v.start) e.start = "Choose the start date.";
  if (!v.renewal) e.renewal = "Choose the renewal date.";
  if (v.start && v.renewal && v.renewal <= v.start) e.renewal = "The renewal date must be after the start date.";

  if (!v.status) e.status = "Choose the status.";
  return e;
}

/** Adds a "Current value" group when an older record uses a name that is not on GRAL's list. */
function withCurrentValue(groups: OptionGroup[], flat: string[], current?: string): OptionGroup[] {
  if (!current || flat.includes(current)) return groups;
  return [{ label: "Current value (older name)", options: [current] }, ...groups];
}

export function PolicyForm({
  client,
  policy,
  onCancel,
  onSaved,
}: {
  client: Client;
  /** Pass a policy to edit it. Leave empty to add a new one. */
  policy: Policy | null;
  onCancel: () => void;
  onSaved: (updatedClient: Client) => void;
}) {
  const editing = policy !== null;
  const [values, setValues] = useState<FormValues>(policy ? fromPolicy(policy) : EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const classGroups = withCurrentValue(PRODUCT_GROUPS, CLASSES_OF_INSURANCE, policy?.classOfInsurance);
  const insurerGroups = withCurrentValue(INSURER_GROUPS, INSURERS, policy?.insurer);
  const allowed = {
    classes: classGroups.flatMap((g) => g.options),
    insurers: insurerGroups.flatMap((g) => g.options),
  };

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate(values, allowed);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Please fix the highlighted fields.");
      return;
    }

    const input: PolicyInput = {
      id: values.id.trim().toUpperCase(),
      classOfInsurance: values.classOfInsurance,
      insurer: values.insurer,
      sumInsured: toAmount(values.sumInsured),
      premium: toAmount(values.premium),
      start: toDisplayDate(values.start),
      renewal: toDisplayDate(values.renewal),
      status: values.status as PolicyStatus,
    };

    setSaving(true);
    try {
      const updated = policy
        ? await updatePolicy(client.id, policy.id, input)
        : await createPolicy(client.id, input);
      toast.success(policy ? `Policy ${input.id} updated.` : `Policy ${input.id} added to ${client.name}.`);
      onSaved(updated);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message ? err.message : "Could not save the policy. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-4 rounded-2xl border border-border p-5">
      <h3 className="text-base font-semibold tracking-tight">
        {editing ? `Edit Policy ${policy?.id}` : `Add Policy for ${client.name}`}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">All fields are required. Amounts are in RWF.</p>

      <div className="mt-4 space-y-6">
        <Section title="Policy details">
          <Field id="policyId" label="Policy number" error={errors.id} wide>
            <input
              id="policyId"
              value={values.id}
              onChange={(e) => set("id", e.target.value)}
              placeholder="As issued by the insurer, e.g. POL/2026/0001"
              className={inputClass(errors.id)}
              {...describedBy("policyId", errors.id)}
            />
          </Field>
          <Field id="classOfInsurance" label="Class of insurance" error={errors.classOfInsurance} wide>
            <GroupedSelect
              id="classOfInsurance"
              value={values.classOfInsurance}
              onChange={(v) => set("classOfInsurance", v)}
              placeholder="Select a class"
              groups={classGroups}
              error={errors.classOfInsurance}
            />
          </Field>
          <Field id="insurer" label="Insurer" error={errors.insurer} wide>
            <GroupedSelect
              id="insurer"
              value={values.insurer}
              onChange={(v) => set("insurer", v)}
              placeholder="Select an insurer"
              groups={insurerGroups}
              error={errors.insurer}
            />
          </Field>
        </Section>

        <Section title="Cover and premium">
          <Field id="sumInsured" label="Sum insured (RWF)" error={errors.sumInsured}>
            <input
              id="sumInsured"
              inputMode="numeric"
              value={values.sumInsured}
              onChange={(e) => set("sumInsured", e.target.value)}
              placeholder="e.g. 250000000"
              className={inputClass(errors.sumInsured)}
              {...describedBy("sumInsured", errors.sumInsured)}
            />
          </Field>
          <Field id="premium" label="Annual premium (RWF)" error={errors.premium}>
            <input
              id="premium"
              inputMode="numeric"
              value={values.premium}
              onChange={(e) => set("premium", e.target.value)}
              placeholder="e.g. 1500000"
              className={inputClass(errors.premium)}
              {...describedBy("premium", errors.premium)}
            />
          </Field>
        </Section>

        <Section title="Dates and status">
          <Field id="start" label="Start date" error={errors.start}>
            <input
              id="start"
              type="date"
              value={values.start}
              onChange={(e) => set("start", e.target.value)}
              className={inputClass(errors.start)}
              {...describedBy("start", errors.start)}
            />
          </Field>
          <Field id="renewal" label="Renewal date" error={errors.renewal}>
            <input
              id="renewal"
              type="date"
              value={values.renewal}
              onChange={(e) => set("renewal", e.target.value)}
              className={inputClass(errors.renewal)}
              {...describedBy("renewal", errors.renewal)}
            />
          </Field>
          <Field id="status" label="Status" error={errors.status} wide>
            <select
              id="status"
              value={values.status}
              onChange={(e) => set("status", e.target.value as PolicyStatus | "")}
              className={inputClass(errors.status)}
              {...describedBy("status", errors.status)}
            >
              {POLICY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </Section>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <OutlineButton onClick={onCancel} className="px-4 py-2 text-sm">
          Cancel
        </OutlineButton>
        <NavyButton type="submit" disabled={saving} className="px-4 py-2 text-sm">
          {saving ? "Saving…" : editing ? "Save Policy" : "Add Policy"}
        </NavyButton>
      </div>
    </form>
  );
}

/** A dropdown with headings, for example "General (Non-Life) Insurance" and "Life Insurance". */
function GroupedSelect({
  id,
  value,
  onChange,
  placeholder,
  groups,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  groups: OptionGroup[];
  error?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass(error)}
      {...describedBy(id, error)}
    >
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
  )
}