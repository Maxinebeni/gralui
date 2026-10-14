"use client";

// User administration: one user's panel (roles, invitation, deactivation)
// and the Invite User form. Rules come from the backend; the screens explain
// them before the person tries, instead of only showing an error.

import { useState } from "react";
import { Mail, ShieldCheck, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { assignUserRoles, deactivateUser, inviteUser, resendInvitation } from "@/lib/api";
import type { AccessCategory, ManagedRole, ManagedUser } from "@/lib/types";
import { Field, Section, describedBy, inputClass } from "./client-form";
import { Chip, NavyButton, OutlineButton } from "./ui";

export const CATEGORY_LABEL: Record<AccessCategory, string> = {
  BUSINESS: "Business",
  ADMINISTRATION: "Administration",
};

export const STATUS_LABEL: Record<ManagedUser["status"], string> = {
  ACTIVE: "Active",
  INVITED: "Invited",
  INACTIVE: "Deactivated",
};

export function UserStatusChip({ status }: { status: ManagedUser["status"] }) {
  return <Chip tone={status === "ACTIVE" ? "success" : status === "INVITED" ? "warning" : "neutral"}>{STATUS_LABEL[status]}</Chip>;
}

export function roleName(code: string, roles: ManagedRole[]) {
  return roles.find((r) => r.code === code)?.name ?? code;
}

export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

type AdminRights = {
  canResendInvite: boolean;
  canAssignRoles: boolean;
  canDeactivate: boolean;
};

export function UserPanel({
  user: u,
  roles,
  isSelf,
  rights,
  onClose,
  onChanged,
}: {
  user: ManagedUser;
  roles: ManagedRole[];
  isSelf: boolean;
  rights: AdminRights;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(u.roles);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const sameCategory = roles.filter((r) => r.category === u.profileCategory);
  const inactive = u.status === "INACTIVE";
  const changed = [...selected].sort().join() !== [...u.roles].sort().join();

  async function act(work: () => Promise<unknown>, success: string) {
    setSaving(true);
    try {
      await work();
      toast.success(success);
      onChanged();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const rolesLocked = isSelf
    ? "You can't change your own roles. Ask another administrator."
    : inactive
      ? "This account is deactivated."
      : !rights.canAssignRoles
        ? "Your account can't change roles."
        : null;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">{u.fullName}</span>
            <UserStatusChip status={u.status} />
            {isSelf ? <Chip tone="sky">You</Chip> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{u.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {CATEGORY_LABEL[u.profileCategory]} account · added {formatDay(u.createdAt)} · last changed {formatDay(u.updatedAt)}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close user"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-6 px-4 py-5 sm:px-6">
        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" /> Roles
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            A {CATEGORY_LABEL[u.profileCategory].toLowerCase()} account can only have{" "}
            {CATEGORY_LABEL[u.profileCategory].toLowerCase()} roles. What each role can do is set under Roles & Permissions.
          </p>
          {rolesLocked ? (
            <>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {u.roles.map((code) => (
                  <Chip key={code} tone="sky">
                    {roleName(code, roles)}
                  </Chip>
                ))}
              </div>
              <p className="mt-2 text-xs text-subtle">{rolesLocked}</p>
            </>
          ) : (
            <>
              <RolePicker roles={sameCategory} selected={selected} onChange={setSelected} />
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Reason for the change, e.g. Moved to the claims team"
                aria-label="Reason for the role change"
                className={cn(inputClass(), "mt-3")}
              />
              <NavyButton
                className="mt-3 px-4 py-2 text-sm"
                disabled={saving || !changed || selected.length === 0}
                onClick={() => act(() => assignUserRoles(u, selected, reason), `Roles updated for ${u.fullName}.`)}
              >
                Save roles
              </NavyButton>
              {selected.length === 0 ? <p className="mt-2 text-xs text-warning">Choose at least one role.</p> : null}
            </>
          )}
        </section>

        {u.status === "INVITED" ? (
          <section className="rounded-2xl bg-pale p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="size-4 text-primary" /> Invitation not accepted yet
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {u.fullName} has not set a password yet. Sending a new invitation cancels the old link.
            </p>
            {rights.canResendInvite ? (
              <OutlineButton
                className="mt-3 px-4 py-2 text-sm"
                onClick={() => act(() => resendInvitation(u), `A new invitation was sent to ${u.email}.`)}
              >
                Resend invitation
              </OutlineButton>
            ) : null}
          </section>
        ) : null}

        {inactive ? (
          <p className="rounded-2xl border border-border p-4 text-xs text-muted-foreground">
            This account is deactivated and can't sign in. There is no way to reactivate it from here yet.
          </p>
        ) : rights.canDeactivate && !isSelf ? (
          <section className="rounded-2xl border border-danger/30 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-danger">
              <UserX className="size-4" /> Deactivate account
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              They will no longer be able to sign in. Their past work and history stay in the system. This can't be undone
              from here.
            </p>
            {confirming ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Deactivate {u.fullName}?</span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    if (await act(() => deactivateUser(u), `${u.fullName} was deactivated.`)) setConfirming(false);
                  }}
                  className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                >
                  Yes, deactivate
                </button>
                <OutlineButton className="px-4 py-2 text-sm" onClick={() => setConfirming(false)}>
                  Cancel
                </OutlineButton>
              </div>
            ) : (
              <OutlineButton className="mt-3 px-4 py-2 text-sm" onClick={() => setConfirming(true)}>
                Deactivate
              </OutlineButton>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function RolePicker({
  roles,
  selected,
  onChange,
}: {
  roles: ManagedRole[];
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {roles.map((r) => {
        const on = selected.includes(r.code);
        return (
          <label
            key={r.code}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
              on ? "border-sky bg-pale" : "border-border hover:bg-secondary/50",
            )}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => onChange(on ? selected.filter((c) => c !== r.code) : [...selected, r.code])}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{r.name}</span>
              <span className="block text-xs text-muted-foreground">
                {r.permissions.length} {r.permissions.length === 1 ? "permission" : "permissions"}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteUserForm({
  roles,
  onClose,
  onInvited,
}: {
  roles: ManagedRole[];
  onClose: () => void;
  onInvited: (u: ManagedUser) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<AccessCategory>("BUSINESS");
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (fullName.trim().length < 2) found.fullName = "Enter the person's full name.";
    if (!EMAIL_PATTERN.test(email.trim())) found.email = "Enter a valid work email address.";
    if (selected.length === 0) found.roles = "Choose at least one role.";
    if (!reason.trim()) found.reason = "Give a reason. It is kept in the audit log.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const created = await inviteUser({ fullName, email, category, roles: selected, reason });
      toast.success(`Invitation sent to ${created.email}.`);
      onInvited(created);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the invitation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-full flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Invite User</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            They get an email with a link to set their own password. You never see or set it.
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
        <Section title="Person">
          <Field id="fullName" label="Full name" error={errors.fullName}>
            <input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Aline Uwase"
              className={inputClass(errors.fullName)}
              {...describedBy("fullName", errors.fullName)}
            />
          </Field>
          <Field id="email" label="Work email" error={errors.email}>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@globalrisk.rw"
              className={inputClass(errors.email)}
              {...describedBy("email", errors.email)}
            />
            <p className="mt-1.5 text-xs text-subtle">Must be a GRAL staff address. Personal emails are not accepted.</p>
          </Field>
        </Section>

        <Section title="Access">
          <div className="sm:col-span-2">
            <p className="text-xs font-medium text-muted-foreground">Account type</p>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {(["BUSINESS", "ADMINISTRATION"] as const).map((c) => (
                <label
                  key={c}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5",
                    category === c ? "border-sky bg-pale" : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="category"
                    checked={category === c}
                    onChange={() => {
                      setCategory(c);
                      setSelected([]);
                    }}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium">{CATEGORY_LABEL[c]}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c === "BUSINESS" ? "GRAL staff who work with clients, claims and renewals" : "Manages users, roles and system settings"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-subtle">This can't be changed later.</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-medium text-muted-foreground">Roles</p>
            <RolePicker roles={roles.filter((r) => r.category === category)} selected={selected} onChange={setSelected} />
            {errors.roles ? <p className="mt-1.5 text-xs font-medium text-danger">{errors.roles}</p> : null}
          </div>
          <Field id="reason" label="Reason" error={errors.reason} wide>
            <textarea
              id="reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. New claims underwriter starting 20 Oct"
              className={inputClass(errors.reason)}
              {...describedBy("reason", errors.reason)}
            />
          </Field>
        </Section>
      </div>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card px-6 py-4">
        <OutlineButton onClick={onClose} className="px-4 py-2 text-sm">
          Cancel
        </OutlineButton>
        <NavyButton type="submit" disabled={saving} className="px-4 py-2 text-sm">
          {saving ? "Sending…" : "Send Invitation"}
        </NavyButton>
      </div>
    </form>
  );
}
