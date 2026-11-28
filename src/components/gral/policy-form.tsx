"use client";
 
// Add / Edit Policy form (task 18). Shown inside the Policies tab of the
// client file. Fields follow the requirements document, section 4, Section B.
// The insurer and class dropdowns come from the backend catalog when it is
// available, otherwise from GRAL's official list (lib/reference-data.ts). Once
// an insurer is chosen, the class list shows only the products it offers.
 
import { useEffect, useState } from "react";
import { focusFirstError } from "@/lib/focus-error";
import { toast } from "sonner";
import { NavyButton, OutlineButton } from "./ui";
import { Field, Section, describedBy, inputClass } from "./client-form";
import { AmountInput } from "./amount-input";
import { ReviewDialog } from "./review-dialog";
import { groupDigits, policyAmountWarnings } from "@/lib/amounts";
import { formatRwf } from "@/lib/format";
import { createPolicy, getPolicyCatalog, policyTrackCatalog, productsForInsurer, updatePolicy, type PolicyCatalog, type PolicyInput, type PolicyTrackCatalog } from "@/lib/api";
import { INSURER_GROUPS, PRODUCT_GROUPS, type OptionGroup } from "@/lib/reference-data";
import { EDITABLE_POLICY_STATUSES, type Client, type Policy, type PolicyStatus } from "@/lib/types";
 
type FormValues = {
  id: string;
  classOfInsurance: string;
  insurer: string;
  sumInsured: string;
  premium: string;
  netPremium: string;
  amountPaid: string;
  commissionRate: string;
  start: string;
  renewal: string;
  status: PolicyStatus | "";
  /** Why a saved policy's figures are changing (kept with the change on GRAL's system). */
  reason: string;
  /** The insurer's endorsement number, when the change comes from an endorsement. Saved at the start of the reason. */
  endorsementNo: string;
};

/** The reason as saved: the endorsement number first, when there is one. */
const changeReason = (v: Pick<FormValues, "reason" | "endorsementNo">) =>
  [v.endorsementNo.trim() ? `Endorsement ${v.endorsementNo.trim()}` : "", v.reason.trim()].filter(Boolean).join(": ");
 
type Errors = Partial<Record<keyof FormValues, string>>;
 
const EMPTY: FormValues = {
  id: "",
  classOfInsurance: "",
  insurer: "",
  sumInsured: "",
  premium: "",
  netPremium: "",
  amountPaid: "",
  commissionRate: "",
  start: "",
  renewal: "",
  status: "Active",
  reason: "",
  endorsementNo: "",
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
    // 0 means "not recorded yet", so start with an empty box.
    sumInsured: p.sumInsured ? groupDigits(String(p.sumInsured)) : "",
    premium: p.premium ? groupDigits(String(p.premium)) : "",
    netPremium: p.netPremium === undefined ? "" : groupDigits(String(p.netPremium)),
    amountPaid: p.amountPaid === undefined ? "" : groupDigits(String(p.amountPaid)),
    commissionRate: p.commissionRate === undefined ? "" : String(+(p.commissionRate * 100).toFixed(2)),
    start: toInputDate(p.start),
    renewal: toInputDate(p.renewal),
    status: p.status,
    reason: "",
    endorsementNo: "",
  };
}
 
/** Turns "1,500,000" or "1500000" into a number. NaN if it is not a number. */
function toAmount(text: string): number {
  const cleaned = text.replace(/[,\s]/g, "");
  return cleaned === "" ? Number.NaN : Number(cleaned);
}
 
function validate(
  v: FormValues,
  allowed: { classes: string[]; insurers: string[] },
  numberGenerated = false,
  /** On GRAL's system: sum insured and status are not stored, and edits need a reason. */
  server: { saved: boolean; editing: boolean } = { saved: false, editing: false },
): Errors {
  const e: Errors = {};
  if (!numberGenerated && !v.id.trim()) e.id = "Enter the policy number issued by the insurer.";
  if (!v.classOfInsurance) e.classOfInsurance = "Choose the class of insurance.";
  else if (!allowed.classes.includes(v.classOfInsurance)) {
    e.classOfInsurance = "Choose a class from GRAL's list.";
  }
  if (!v.insurer) e.insurer = "Choose the insurer.";
  else if (!allowed.insurers.includes(v.insurer)) e.insurer = "Choose an insurer from GRAL's list.";
 
  const sum = toAmount(v.sumInsured);
  const premium = toAmount(v.premium);
  if (!server.saved && (!Number.isFinite(sum) || sum <= 0)) e.sumInsured = "Enter the sum insured in RWF, numbers only.";
  if (!Number.isFinite(premium) || premium <= 0) e.premium = "Enter the total premium in RWF, numbers only.";
  if (!server.saved && !e.sumInsured && !e.premium && premium > sum) {
    e.premium = "The premium cannot be more than the sum insured.";
  }
 
  const net = toAmount(v.netPremium);
  const paid = toAmount(v.amountPaid);
  const rate = toAmount(v.commissionRate);
  if (!Number.isFinite(net) || net <= 0) e.netPremium = "Enter the net premium in RWF, numbers only.";
  else if (!e.premium && net > premium) e.netPremium = "The net premium cannot be more than the total premium.";
  if (!Number.isFinite(paid) || paid < 0) e.amountPaid = "Enter the amount paid so far in RWF (0 if nothing yet).";
  else if (!e.premium && Number.isFinite(premium) && premium > 0 && paid > premium) e.amountPaid = "The amount paid cannot be more than the total premium.";
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) e.commissionRate = "Enter the commission rate as a percentage, e.g. 15.";
 
  if (!v.start) e.start = "Choose the start date.";
  if (!v.renewal) e.renewal = "Choose the renewal date.";
  if (v.start && v.renewal && v.renewal <= v.start) e.renewal = "The renewal date must be after the start date.";
 
  if (!server.saved && !v.status) e.status = "Choose the status.";
  if (server.saved && server.editing && v.reason.trim().length < 5)
    e.reason = "Say why the figures are changing, e.g. \"Insurer endorsement 02: two vehicles added\".";
  return e;
}
 
/** Adds a "Current value" group when an older record uses a name that is not on the list. */
function withCurrentValue(groups: OptionGroup[], current?: string): OptionGroup[] {
  if (!current || groups.some((g) => g.options.includes(current))) return groups;
  return [{ label: "Current value (older name)", options: [current] }, ...groups];
}
 
/** Keeps only the products the chosen insurer offers. null means "show all". */
function onlyOffered(groups: OptionGroup[], offered: string[] | null): OptionGroup[] {
  if (!offered) return groups;
  return groups
    .map((g) => ({ ...g, options: g.options.filter((o) => offered.includes(o)) }))
    .filter((g) => g.options.length > 0);
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
 
  const [catalog, setCatalog] = useState<PolicyCatalog>({
    insurerGroups: INSURER_GROUPS,
    productGroups: PRODUCT_GROUPS,
    fromBackend: false,
  });
  const [selectionCatalog, setSelectionCatalog] = useState<PolicyTrackCatalog | null>(null);
  const [selectionCatalogError, setSelectionCatalogError] = useState("");
  const [insuranceType, setInsuranceType] = useState<"LIFE" | "NON_LIFE">("NON_LIFE");
  const [selectedInsurerId, setSelectedInsurerId] = useState("");
  // Products the chosen insurer offers. null: not known, so every product is shown.
  const [offered, setOffered] = useState<string[] | null>(null);
 
  useEffect(() => {
    let cancelled = false;
    getPolicyCatalog().then((c) => {
      if (!cancelled) setCatalog(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    policyTrackCatalog(insuranceType).then((c) => {
      if (!cancelled) { setSelectionCatalog(c); setSelectionCatalogError(""); }
    }).catch((error) => {
      if (!cancelled) setSelectionCatalogError(error instanceof Error ? error.message : "Could not load insurers and products.");
    });
    return () => { cancelled = true; };
  }, [editing, insuranceType]);
 
  useEffect(() => {
    let cancelled = false;
    setOffered(null);
    if (!values.insurer) return;
    productsForInsurer(values.insurer).then((list) => {
      if (!cancelled) setOffered(list);
    });
    return () => {
      cancelled = true;
    };
  }, [values.insurer]);
 
  const insurerGroups = withCurrentValue(catalog.insurerGroups, policy?.insurer);
  const classGroups = withCurrentValue(onlyOffered(catalog.productGroups, offered), policy?.classOfInsurance);
  const noProductsForInsurer = offered !== null && offered.length === 0;
  const selectableInsurers = selectionCatalog?.insurers.filter((insurer) => insurer.coverageTypes.includes(insuranceType)) ?? [];
  const selectedInsurer = selectableInsurers.find((insurer) => insurer.id === selectedInsurerId);
  const selectableProducts = selectionCatalog?.products.filter((product) =>
    selectionCatalog.productIdsByInsurer[selectedInsurerId]?.includes(product.id) &&
    (!product.coverageTypes.length || product.coverageTypes.includes(insuranceType)),
  ) ?? [];
  // For new policies on GRAL's system, the backend generates the policy number.
  const numberGenerated = catalog.fromBackend && !policy;
  // On GRAL's system the server keeps the policy: its number, insurer, class and
  // dates are fixed once saved, and it does not store sum insured or status
  // (status follows the cover dates).
  const onServer = catalog.fromBackend || !!policy?.uuid;
  const locked = editing && onServer;
  // Set once the form is valid: the figures to check before saving.
  const [review, setReview] = useState<{ input: PolicyInput; warnings: string[] } | null>(null);
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
    const found = validate(values, allowed, numberGenerated, { saved: onServer, editing });
    if (Object.keys(found).length === 0 && locked && policy && changedFigures(policy, values).length === 0) {
      toast.error("Nothing has changed. Change a figure, or cancel.");
      return;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError(e.currentTarget as HTMLFormElement, Object.keys(found));
      toast.error("Please fix the highlighted fields.");
      return;
    }
 
    const input: PolicyInput = {
      id: values.id.trim().toUpperCase(),
      classOfInsurance: values.classOfInsurance,
      insurer: values.insurer,
      sumInsured: onServer ? (policy?.sumInsured ?? 0) : toAmount(values.sumInsured),
      premium: toAmount(values.premium),
      netPremium: toAmount(values.netPremium),
      amountPaid: toAmount(values.amountPaid),
      commissionRate: toAmount(values.commissionRate) / 100,
      start: toDisplayDate(values.start),
      renewal: toDisplayDate(values.renewal),
      status: onServer ? (policy?.status ?? "Active") : (values.status as PolicyStatus),
    };
    const warnings = policyAmountWarnings(
      {
        sumInsured: onServer ? Number.NaN : toAmount(values.sumInsured),
        premium: toAmount(values.premium),
        netPremium: toAmount(values.netPremium),
        amountPaid: toAmount(values.amountPaid),
        commissionRate: toAmount(values.commissionRate),
        start: values.start,
        renewal: values.renewal,
      },
      policy ?? undefined,
    );
    setReview({ input, warnings });
  }

  async function save(input: PolicyInput) {
    setSaving(true);
    try {
      const updated = policy
        ? await updatePolicy(client.id, policy.id, input, changeReason(values))
        : await createPolicy(client.id, input);
      toast.success(policy ? `Policy ${input.id} updated.` : input.id ? `Policy ${input.id} added to ${client.name}.` : `Policy added to ${client.name}.`);
      setReview(null);
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
        {editing ? `Edit policy ${policy?.id}` : `Add policy for ${client.name}`}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {locked
          ? "Change the premium and payment figures. Balance and commission are worked out automatically."
          : "All fields are required. Amounts are in RWF. Balance and commission are worked out automatically."}
      </p>
      {catalog.fromBackend ? (
        <p className="mt-2 rounded-xl bg-pale px-3 py-2 text-[11px] text-muted-foreground">
          {policy
            ? "The policy number, insurer, class and cover dates are fixed. Each change to the figures is saved as a new version, with your reason, and shows in the policy's history."
            : "GRAL's system gives the policy its number when you save. Its status follows the cover dates."}
        </p>
      ) : null}
 
      <div className="mt-4 space-y-6">
        <Section title="Policy details">
          {numberGenerated ? null : (
            <Field id="policyId" label="Policy number" error={errors.id} wide>
              <input
                id="policyId"
                value={values.id}
                onChange={(e) => set("id", e.target.value)}
                placeholder="As issued by the insurer, e.g. POL/2026/0001"
                readOnly={catalog.fromBackend}
                className={inputClass(errors.id)}
                {...describedBy("policyId", errors.id)}
              />
            </Field>
          )}
          {editing ? <>
            <Field id="insurer" label="Insurer" error={errors.insurer} wide>
              <GroupedSelect
                id="insurer"
                value={values.insurer}
                onChange={(v) => {
                  set("insurer", v);
                  set("classOfInsurance", "");
                }}
                placeholder="Select an insurer"
                groups={insurerGroups}
                error={errors.insurer}
                disabled={locked}
              />
            </Field>
            <Field id="classOfInsurance" label="Class of insurance" error={errors.classOfInsurance} wide>
              <GroupedSelect
                id="classOfInsurance"
                value={values.classOfInsurance}
                onChange={(v) => set("classOfInsurance", v)}
                placeholder={values.insurer ? "Select a class" : "Choose the insurer first"}
                groups={classGroups}
                error={errors.classOfInsurance}
                disabled={locked}
              />
              {noProductsForInsurer ? (
                <p className="mt-1.5 text-xs text-warning">
                  No classes are linked to this insurer in the catalog yet. Ask an administrator to link them.
                </p>
              ) : null}
            </Field>
          </> : <>
            <Field id="insuranceType" label="Insurance type" wide>
              <select
                id="insuranceType"
                value={insuranceType}
                onChange={(event) => {
                  const nextType = event.target.value as "LIFE" | "NON_LIFE";
                  setInsuranceType(nextType);
                  setSelectedInsurerId("");
                  set("insurer", "");
                  set("classOfInsurance", "");
                }}
                className={inputClass()}
              >
                <option value="NON_LIFE">Non-life</option>
                <option value="LIFE">Life</option>
              </select>
            </Field>
            <Field id="insurer" label="Insurer" error={errors.insurer} wide>
              <select
                id="insurer"
                value={selectedInsurerId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  const nextInsurer = selectionCatalog?.insurers.find((item) => item.id === nextId);
                  setSelectedInsurerId(nextId);
                  set("insurer", nextInsurer?.name ?? "");
                  set("classOfInsurance", "");
                }}
                disabled={!selectionCatalog || !!selectionCatalogError || selectableInsurers.length === 0}
                className={inputClass(errors.insurer)}
                {...describedBy("insurer", errors.insurer)}
              >
                <option value="">{selectionCatalog ? "Select an insurer" : "Loading insurers…"}</option>
                {selectableInsurers.map((insurer) => <option key={insurer.id} value={insurer.id}>{insurer.name}</option>)}
              </select>
              {selectionCatalogError ? <p role="alert" className="mt-1.5 text-xs text-danger">{selectionCatalogError}</p> : null}
            </Field>
            <Field id="classOfInsurance" label="Products" error={errors.classOfInsurance} wide>
              <p className="mb-2 text-[11px] text-muted-foreground">Choose one product for this policy.</p>
              {!selectedInsurerId ? <p className="rounded-xl bg-pale px-3 py-3 text-xs text-muted-foreground">Choose an insurance type and insurer to see available products.</p> : selectableProducts.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectableProducts.map((product) => (
                    <label key={product.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-sm transition-colors ${values.classOfInsurance === product.name ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"}`}>
                      <input type="checkbox" checked={values.classOfInsurance === product.name} onChange={(event) => set("classOfInsurance", event.target.checked ? product.name : "")} aria-label={`Select ${product.name}`} />
                      <span className="font-medium">{product.name}</span>
                    </label>
                  ))}
                </div>
              ) : <p className="rounded-xl bg-pale px-3 py-3 text-xs text-muted-foreground">No active products are linked to {selectedInsurer?.name ?? "this insurer"} for this insurance type.</p>}
            </Field>
          </>}
        </Section>
 
        <Section title="Cover and premium">
          {onServer ? null : (
            <Field id="sumInsured" label="Sum insured (RWF)" error={errors.sumInsured}>
              <AmountInput
                id="sumInsured"
                value={values.sumInsured}
                onChange={(v) => set("sumInsured", v)}
                placeholder="e.g. 250000000"
                className={inputClass(errors.sumInsured)}
                {...describedBy("sumInsured", errors.sumInsured)}
              />
            </Field>
          )}
          <Field id="premium" label="Total premium (RWF)" error={errors.premium}>
            <AmountInput
              id="premium"
              value={values.premium}
              onChange={(v) => set("premium", v)}
              placeholder="e.g. 1500000"
              className={inputClass(errors.premium)}
              {...describedBy("premium", errors.premium)}
            />
          </Field>
          <Field id="netPremium" label="Net premium (RWF)" error={errors.netPremium}>
            <AmountInput
              id="netPremium"
              value={values.netPremium}
              onChange={(v) => set("netPremium", v)}
              placeholder="Before taxes and levies, e.g. 1300000"
              className={inputClass(errors.netPremium)}
              {...describedBy("netPremium", errors.netPremium)}
            />
          </Field>
          <Field id="amountPaid" label="Amount paid (RWF)" error={errors.amountPaid}>
            <AmountInput
              id="amountPaid"
              value={values.amountPaid}
              onChange={(v) => set("amountPaid", v)}
              placeholder="e.g. 750000"
              className={inputClass(errors.amountPaid)}
              {...describedBy("amountPaid", errors.amountPaid)}
            />
          </Field>
          <Field id="commissionRate" label="Commission rate (%)" error={errors.commissionRate}>
            <input
              id="commissionRate"
              inputMode="decimal"
              value={values.commissionRate}
              onChange={(e) => set("commissionRate", e.target.value)}
              placeholder="e.g. 15"
              className={inputClass(errors.commissionRate)}
              {...describedBy("commissionRate", errors.commissionRate)}
            />
          </Field>
        </Section>
 
        <Section title={onServer ? "Cover dates" : "Dates and status"}>
          <Field id="start" label="Start date" error={errors.start}>
            <input
              id="start"
              type="date"
              value={values.start}
              onChange={(e) => set("start", e.target.value)}
              disabled={locked}
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
              disabled={locked}
              className={inputClass(errors.renewal)}
              {...describedBy("renewal", errors.renewal)}
            />
          </Field>
          {onServer ? null : (
          <Field id="status" label="Status" error={errors.status} wide>
            <select
              id="status"
              value={values.status}
              onChange={(e) => set("status", e.target.value as PolicyStatus | "")}
              className={inputClass(errors.status)}
              {...describedBy("status", errors.status)}
            >
              {EDITABLE_POLICY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          )}
        </Section>

        {locked ? (
          <Section title="Reason for the change">
            <Field id="endorsementNo" label="Endorsement number (if any)">
              <input
                id="endorsementNo"
                maxLength={60}
                value={values.endorsementNo}
                onChange={(e) => set("endorsementNo", e.target.value)}
                placeholder="e.g. END-02"
                className={inputClass()}
              />
            </Field>
            <Field id="reason" label="Why are the figures changing?" error={errors.reason} wide>
              <textarea
                id="reason"
                rows={2}
                maxLength={500}
                value={values.reason}
                onChange={(e) => set("reason", e.target.value)}
                placeholder="e.g. Insurer endorsement 02: two vehicles added"
                className={inputClass(errors.reason)}
                {...describedBy("reason", errors.reason)}
              />
            </Field>
          </Section>
        ) : null}
      </div>
 
      <div className="mt-6 flex justify-between gap-2">
        <OutlineButton onClick={onCancel} className="px-4 py-2 text-sm">
          Cancel
        </OutlineButton>
        <NavyButton type="submit" disabled={saving} className="px-4 py-2 text-sm">
          {editing ? "Review and save" : "Review and add"}
        </NavyButton>
      </div>

      <ReviewDialog
        open={review !== null}
        title={editing ? `Check policy ${review?.input.id ?? ""}` : `Check the new policy for ${client.name}`}
        rows={
          review && locked && policy
            ? [
                ...changedFigures(policy, values).map((c) => ({ label: c.label, value: `${c.before} → ${c.after}` })),
                { label: "Policy number", value: review.input.id },
                { label: "Reason", value: changeReason(values) },
              ]
            : review
            ? [
                ...(onServer ? [] : [{ label: "Sum insured", amount: review.input.sumInsured! }]),
                { label: "Total premium", amount: review.input.premium! },
                { label: "Net premium", amount: review.input.netPremium! },
                { label: "Amount paid", amount: review.input.amountPaid! },
                { label: "Policy number", value: review.input.id || "Given by GRAL's system when you save" },
                { label: "Class and insurer", value: `${review.input.classOfInsurance} · ${review.input.insurer}` },
                { label: "Commission rate", value: `${values.commissionRate}%` },
                { label: "Cover", value: `${review.input.start} to ${review.input.renewal}` },
              ]
            : []
        }
        warnings={review?.warnings ?? []}
        confirmLabel={editing ? "Save policy" : "Add policy"}
        saving={saving}
        onConfirm={() => review && save(review.input)}
        onBack={() => setReview(null)}
      />
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
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  groups: OptionGroup[];
  error?: string;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
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
  );
}
/** The figures that differ from the saved policy, as "before" and "after" text for the review. */
function changedFigures(p: Policy, v: FormValues): { label: string; before: string; after: string }[] {
  const money = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? "Not recorded" : formatRwf(n));
  const rows: { label: string; before: string; after: string }[] = [];
  const add = (label: string, before: number | undefined, after: number) => {
    if (before === after) return;
    rows.push({ label, before: money(before), after: money(after) });
  };
  add("Total premium", p.premium || undefined, toAmount(v.premium));
  add("Net premium", p.netPremium, toAmount(v.netPremium));
  add("Amount paid", p.amountPaid, toAmount(v.amountPaid));
  const rate = toAmount(v.commissionRate) / 100;
  if (p.commissionRate === undefined || Math.abs(p.commissionRate - rate) > 1e-9) {
    const pct = (n: number | undefined) => (n === undefined ? "Not recorded" : `${+(n * 100).toFixed(2)}%`);
    rows.push({ label: "Commission rate", before: pct(p.commissionRate), after: pct(rate) });
  }
  return rows;
}
