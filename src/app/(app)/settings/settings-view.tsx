"use client";

// Settings: the signed-in person's own account, sign-in security and email notifications.
// Passwords are changed from "Forgot password" on the sign-in page. Two-step
// login (an authenticator app code after the password) is set up here.

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

      <div className="mt-5 grid items-start gap-3 sm:gap-4 xl:grid-cols-2">
        <FloatCard className="p-5 sm:p-6">
          <h2 className="text-base font-semibold tracking-tight">My account</h2>
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
            <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-3 sm:grid-cols-[140px_minmax(0,1fr)]">
              <dt className="text-muted-foreground">{roles.length === 1 ? "Role" : "Roles"}</dt>
              <dd className="flex flex-wrap gap-1.5">
                {roles.map((r) => (
                  <Chip key={r} tone="sky">
                    {r}
                  </Chip>
                ))}
              </dd>
            </div>
          </dl>
        </FloatCard>

        <ChangePassword />
        <TwoStepLogin />
        <EmailNotifications />

      </div>
    </>
  );
}
