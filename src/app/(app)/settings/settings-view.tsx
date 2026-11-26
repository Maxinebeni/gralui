"use client";

// Settings: the signed-in person's own account, sign-in security and email notifications.
// Change password emails a reset link. Two-step login (an authenticator app code
// after the password) is set up here; it cannot be turned off.

import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/gral/shell";
import { Chip, FloatCard } from "@/components/gral/ui";
import { useCurrentUser } from "@/lib/auth-context";
import { initials } from "@/lib/format";
import { ChangePassword } from "./change-password";
import { EmailNotifications } from "./email-notifications";
import { TwoStepLogin } from "./two-step-login";

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

export function SettingsView() {
  const { user } = useCurrentUser();
  const roles = user.backendRoles?.length ? user.backendRoles.map(roleLabel) : [user.role];

  return (
    <>
      <PageHeader title="Settings" />

      <div className="mt-5 space-y-3 sm:space-y-4">
        <FloatCard className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
              {initials(user.name).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold">{user.name}</h2>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-sm text-muted-foreground">{roles.length === 1 ? "Role" : "Roles"}</span>
            {roles.map((r) => (
              <Chip key={r} tone="sky">
                {r}
              </Chip>
            ))}
          </div>
        </FloatCard>

        <FloatCard className="p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h2 className="text-base font-semibold tracking-tight">Sign-in and security</h2>
          </div>
          <div className="mt-1 divide-y divide-border">
            <ChangePassword />
            <TwoStepLogin />
          </div>
        </FloatCard>

        <EmailNotifications />
      </div>
    </>
  );
}
