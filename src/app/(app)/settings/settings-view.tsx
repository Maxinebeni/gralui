"use client";

// Settings: the signed-in person's own account and keyboard shortcuts.
// Passwords are changed from "Forgot password" on the sign-in page.

import { PageHeader } from "@/components/gral/shell";
import { Chip, FloatCard } from "@/components/gral/ui";
import { useCurrentUser } from "@/lib/auth-context";
import { initials } from "@/lib/format";

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

function Key({ children }: { children: string }) {
  return <kbd className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs">{children}</kbd>;
}

export function SettingsView() {
  const { user } = useCurrentUser();
  const roles = user.backendRoles?.length ? user.backendRoles.map(roleLabel) : [user.role];

  return (
    <>
      <PageHeader title="Settings" />

      <div className="mt-5 grid items-start gap-4 xl:grid-cols-2">
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
          </dl>
        </FloatCard>

        <FloatCard className="p-5 sm:p-6">
          <h2 className="text-base font-semibold tracking-tight">Shortcuts</h2>
          <dl className="mt-3 divide-y divide-border text-sm">
            <div className="flex items-center justify-between gap-3 py-3">
              <dt>Search</dt>
              <dd>
                <Key>Ctrl</Key> <Key>K</Key>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <dt>Close a panel</dt>
              <dd>
                <Key>Esc</Key>
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-subtle">GRAL Operations Platform · version {process.env.NEXT_PUBLIC_APP_VERSION}</p>
        </FloatCard>
      </div>
    </>
  );
}
