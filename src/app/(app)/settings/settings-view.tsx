"use client";

// Settings: the signed-in person's own account, a way to change their
// password (through the reset email, which is how the backend supports it),
// and help. Admin tools stay in the name menu.

import { useState } from "react";
import { HelpCircle, KeyRound, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/gral/shell";
import { Chip, FloatCard, NavyButton } from "@/components/gral/ui";
import { MOCK_AUTH, requestPasswordReset } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { initials } from "@/lib/format";
import { PERMISSIONS } from "@/lib/mock-admin";
import { isAdministrationAccount } from "@/lib/permissions";

/** CLAIMS_MANAGER → Claims Manager */
function roleLabel(code: string) {
  if (code === "MD") return "Managing Director";
  if (code === "DMD") return "Deputy Managing Director";
  return code
    .toLowerCase()
    .split("_")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

function permissionLabel(code: string) {
  return PERMISSIONS.find((p) => p.code === code)?.name ?? code;
}

export function SettingsView() {
  const { user } = useCurrentUser();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const roles = user.backendRoles?.length ? user.backendRoles.map(roleLabel) : [user.role];
  const permissions = [...(user.permissions ?? [])].map(permissionLabel).sort();

  async function sendReset() {
    setSending(true);
    try {
      await requestPasswordReset(user.email);
      setSent(true);
      toast.success(`We sent a password reset link to ${user.email}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the reset email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" />

      <div className="mt-5 grid items-start gap-4 xl:grid-cols-2">
        <FloatCard className="p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <UserRound className="size-4 text-primary" /> My account
          </h2>
          <div className="mt-4 flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
              {initials(user.name).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold">{user.name}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <dl className="mt-5 divide-y divide-border text-sm">
            <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-3">
              <dt className="text-muted-foreground">{roles.length === 1 ? "Role" : "Roles"}</dt>
              <dd className="flex flex-wrap gap-1.5">
                {roles.map((r) => (
                  <Chip key={r} tone="sky">
                    {r}
                  </Chip>
                ))}
              </dd>
            </div>
            <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-3">
              <dt className="text-muted-foreground">Account type</dt>
              <dd>{isAdministrationAccount(user) ? "Administration" : "Business"}</dd>
            </div>
            {permissions.length ? (
              <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-3">
                <dt className="text-muted-foreground">What you can do</dt>
                <dd>
                  <ul className="space-y-1">
                    {permissions.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-3 text-xs text-subtle">
            Your name, email and roles are managed by an administrator. Ask them if something needs to change.
          </p>
        </FloatCard>

        <div className="space-y-4">
          <FloatCard className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <KeyRound className="size-4 text-primary" /> Password
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              To change your password, we email you a secure link. Open it and choose a new password.
            </p>
            {sent ? (
              <p className="mt-4 rounded-xl bg-pale px-3 py-2.5 text-sm">
                Check your inbox at <span className="font-medium">{user.email}</span> for the link.
                {MOCK_AUTH ? " (Demo mode: no email is actually sent.)" : ""}
              </p>
            ) : (
              <NavyButton className="mt-4 px-4 py-2 text-sm" disabled={sending} onClick={sendReset}>
                {sending ? "Sending…" : "Send password reset email"}
              </NavyButton>
            )}
          </FloatCard>

          <FloatCard className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <HelpCircle className="size-4 text-primary" /> Help
            </h2>
            <dl className="mt-3 divide-y divide-border text-sm">
              <div className="flex items-center justify-between gap-3 py-3">
                <dt>Search the whole platform</dt>
                <dd>
                  <kbd className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs">Ctrl</kbd>{" "}
                  <kbd className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs">K</kbd>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-3">
                <dt>Close a panel or search</dt>
                <dd>
                  <kbd className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs">Esc</kbd>
                </dd>
              </div>
              <div className="py-3">
                <dt>Can&apos;t see a page or button you need?</dt>
                <dd className="mt-1 text-muted-foreground">
                  What you can see depends on your role. Ask your administrator to check your access.
                </dd>
              </div>
              <div className="py-3">
                <dt>Something not working?</dt>
                <dd className="mt-1 text-muted-foreground">
                  Tell your administrator what you were doing and what you saw, with a screenshot if you can.
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-subtle">GRAL Operations Platform · version {process.env.NEXT_PUBLIC_APP_VERSION}</p>
          </FloatCard>
        </div>
      </div>
    </>
  );
}
