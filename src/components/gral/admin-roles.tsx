"use client";

// Role administration: edit a role's name and permissions, or create a new
// role. Permissions are grouped by area so the checklist reads like the app.

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createRole, updateRole } from "@/lib/api";
import type { AccessCategory, ManagedRole, PermissionDefinition } from "@/lib/types";
import { CATEGORY_LABEL } from "./admin-users";
import { Field, Section, describedBy, inputClass } from "./client-form";
import { Chip, NavyButton, OutlineButton } from "./ui";

const AREAS: [prefix: string, label: string][] = [
  ["CLIENT", "Clients"],
  ["POLICY", "Policies"],
  ["CLAIM", "Claims"],
  ["DOCUMENT", "Documents"],
  ["INSURER", "Insurer and product catalog"],
  ["PRODUCT", "Insurer and product catalog"],
  ["USER", "Users"],
  ["ROLE", "Roles"],
  ["CALENDAR", "Business calendar"],
];

function areaOf(code: string) {
  return AREAS.find(([prefix]) => code.startsWith(`${prefix}_`))?.[1] ?? "Other";
}

/** Permissions of one category, grouped by area, in a stable order. */
function grouped(permissions: PermissionDefinition[], category: AccessCategory) {
  const groups = new Map<string, PermissionDefinition[]>();
  for (const p of permissions.filter((x) => x.category === category)) {
    const area = areaOf(p.code);
    groups.set(area, [...(groups.get(area) ?? []), p]);
  }
  return [...groups.entries()];
}

function PermissionChecklist({
  permissions,
  category,
  selected,
  onChange,
  readOnly,
}: {
  permissions: PermissionDefinition[];
  category: AccessCategory;
  selected: string[];
  onChange: (codes: string[]) => void;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-4">
      {grouped(permissions, category).map(([area, list]) => (
        <div key={area}>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{area}</p>
          <div className="mt-2 space-y-1.5">
            {list.map((p) => {
              const on = selected.includes(p.code);
              return (
                <label
                  key={p.code}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border px-3 py-2.5",
                    on ? "border-sky bg-pale" : "border-border",
                    readOnly ? "cursor-default" : "cursor-pointer hover:bg-secondary/50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={readOnly}
                    onChange={() => onChange(on ? selected.filter((c) => c !== p.code) : [...selected, p.code])}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">{p.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RolePanel({
  role,
  permissions,
  peopleCount,
  canUpdate,
  heldRoleCodes,
  onClose,
  onChanged,
}: {
  role: ManagedRole;
  permissions: PermissionDefinition[];
  peopleCount: number;
  canUpdate: boolean;
  heldRoleCodes: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [selected, setSelected] = useState<string[]>(role.permissions);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const isProtected = role.code === "ADMINISTRATOR";
  const holdsIt = heldRoleCodes.includes(role.code);
  const editable = canUpdate && !isProtected;
  const permissionsLocked = !editable || holdsIt;
  const changed = name.trim() !== role.name || [...selected].sort().join() !== [...role.permissions].sort().join();
  const note = isProtected
    ? "The built-in System Administrator role can't be edited."
    : !canUpdate
      ? "Your account can't edit roles."
      : holdsIt
        ? "You hold this role, so you can rename it but not change its permissions."
        : null;

  async function save() {
    setSaving(true);
    try {
      await updateRole(role, { name, permissions: selected, reason }, heldRoleCodes);
      toast.success(`${name.trim()} saved.`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the role.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">{role.name}</span>
            <Chip tone="sky">{CATEGORY_LABEL[role.category]}</Chip>
            {isProtected ? (
              <Chip tone="neutral">
                Built-in
              </Chip>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Code {role.code} · {peopleCount} {peopleCount === 1 ? "person" : "people"} · {role.permissions.length}{" "}
            {role.permissions.length === 1 ? "permission" : "permissions"}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close role"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-5 px-4 py-5 sm:px-6">
        {note ? <p className="rounded-xl bg-secondary px-3 py-2.5 text-xs text-muted-foreground">{note}</p> : null}
        {editable ? (
          <div>
            <label htmlFor="roleName" className="text-xs font-medium text-muted-foreground">
              Role name
            </label>
            <input id="roleName" value={name} onChange={(e) => setName(e.target.value)} className={inputClass()} />
          </div>
        ) : null}
        <PermissionChecklist
          permissions={permissions}
          category={role.category}
          selected={selected}
          onChange={setSelected}
          readOnly={permissionsLocked}
        />
        {editable ? (
          <div className="space-y-3 border-t border-border pt-4">
            {peopleCount > 0 ? (
              <p className="text-xs text-warning">
                Changes apply to the {peopleCount} {peopleCount === 1 ? "person" : "people"} with this role the next time they
                sign in.
              </p>
            ) : null}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Reason for the change, e.g. Claims Managers now upload documents"
              aria-label="Reason for the role change"
              className={inputClass()}
            />
            <NavyButton className="px-4 py-2 text-sm" disabled={saving || !changed || !name.trim()} onClick={save}>
              {saving ? "Saving…" : "Save role"}
            </NavyButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** "Claims Team Lead" → "CLAIMS_TEAM_LEAD" */
function codeFrom(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/&/g, "AND")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^A-Z]+/, "")
    .slice(0, 64);
}

export function NewRoleForm({
  permissions,
  existingCodes,
  onClose,
  onCreated,
}: {
  permissions: PermissionDefinition[];
  existingCodes: string[];
  onClose: () => void;
  onCreated: (role: ManagedRole) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [category, setCategory] = useState<AccessCategory>("BUSINESS");
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const finalCode = codeTouched ? code : codeFrom(name);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = "Enter the role's name.";
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(finalCode)) found.code = "Use capital letters, numbers and underscores, starting with a letter.";
    else if (existingCodes.includes(finalCode)) found.code = "A role with this code already exists.";
    if (!reason.trim()) found.reason = "Give a reason. It is kept in the audit log.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const created = await createRole({ code: finalCode, name, category, permissions: selected, reason });
      toast.success(`${created.name} created.`);
      onCreated(created);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the role.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-full flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">New Role</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Give it a name and choose what it can do. You can then give it to people from the Users page.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-6 px-6 py-5">
        <Section title="Role">
          <Field id="newRoleName" label="Name" error={errors.name}>
            <input
              id="newRoleName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Claims Team Lead"
              className={inputClass(errors.name)}
              {...describedBy("newRoleName", errors.name)}
            />
          </Field>
          <Field id="newRoleCode" label="Code (can't be changed later)" error={errors.code}>
            <input
              id="newRoleCode"
              value={finalCode}
              onChange={(e) => {
                setCodeTouched(true);
                setCode(e.target.value.toUpperCase());
              }}
              className={inputClass(errors.code)}
              {...describedBy("newRoleCode", errors.code)}
            />
          </Field>
          <div className="sm:col-span-2">
            <p className="text-xs font-medium text-muted-foreground">Type (can't be changed later)</p>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {(["BUSINESS", "ADMINISTRATION"] as const).map((c) => (
                <label
                  key={c}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm",
                    category === c ? "border-sky bg-pale" : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="roleCategory"
                    checked={category === c}
                    onChange={() => {
                      setCategory(c);
                      setSelected([]);
                    }}
                  />
                  {CATEGORY_LABEL[c]}
                </label>
              ))}
            </div>
          </div>
        </Section>

        <section>
          <h3 className="text-sm font-semibold tracking-tight">Permissions</h3>
          <div className="mt-3">
            <PermissionChecklist
              permissions={permissions}
              category={category}
              selected={selected}
              onChange={setSelected}
              readOnly={false}
            />
          </div>
        </section>

        <Field id="newRoleReason" label="Reason" error={errors.reason} wide>
          <textarea
            id="newRoleReason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Team leads need claims and document access"
            className={inputClass(errors.reason)}
            {...describedBy("newRoleReason", errors.reason)}
          />
        </Field>
      </div>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card px-6 py-4">
        <OutlineButton onClick={onClose} className="px-4 py-2 text-sm">
          Cancel
        </OutlineButton>
        <NavyButton type="submit" disabled={saving} className="px-4 py-2 text-sm">
          {saving ? "Creating…" : "Create Role"}
        </NavyButton>
      </div>
    </form>
  );
}
