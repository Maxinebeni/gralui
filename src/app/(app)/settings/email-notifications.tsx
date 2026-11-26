"use client";

// Email notifications: which events also arrive by email. Notices always show
// in the bell; this only decides email. People only see the groups for areas
// they can open, since they are never notified about the others.

import { useEffect, useMemo, useState } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { FloatCard, Loader, OutlineButton } from "@/components/gral/ui";
import { MOCK_AUTH, getEmailPreferences, setEmailPreference, type EmailPreference } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { canAccessPath, hasPermission, usesBackendPermissions } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Groups in the order shown, with the page that makes each relevant. */
const GROUPS: { name: string; page?: string }[] = [
  { name: "Tasks" },
  { name: "Approvals", page: "/approvals" },
  { name: "Clients", page: "/clients" },
  { name: "Onboarding", page: "/clients/leads" },
  { name: "KYC", page: "/clients" },
  { name: "Renewals", page: "/renewals" },
  { name: "Claims", page: "/claims" },
  { name: "Security" },
];

function relevant(user: SessionUser, event: EmailPreference) {
  // Only administrators approve authenticator resets.
  if (event.key === "MFA_RECOVERY_APPROVAL") return canAccessPath(user, "/admin");
  if (event.group === "KYC" && usesBackendPermissions(user)) return hasPermission(user, "KYC_READ");
  const group = GROUPS.find((g) => g.name === event.group);
  // A group added on the server later still shows.
  return !group?.page || canAccessPath(user, group.page);
}

export function EmailNotifications() {
  const { user } = useCurrentUser();
  const [events, setEvents] = useState<EmailPreference[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (MOCK_AUTH) return;
    let cancelled = false;
    getEmailPreferences()
      .then((list) => !cancelled && setEvents(list))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Could not load your email settings."));
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    const visible = (events ?? []).filter((e) => relevant(user, e));
    const order = (name: string) => {
      const i = GROUPS.findIndex((g) => g.name === name);
      return i < 0 ? GROUPS.length : i;
    };
    const names = [...new Set(visible.map((e) => e.group))].sort((a, b) => order(a) - order(b));
    return names.map((name) => ({ name, events: visible.filter((e) => e.group === name) }));
  }, [events, user]);

  async function change(keys: string[], enabled: boolean) {
    const targets = keys.filter((k) => events?.find((e) => e.key === k)?.enabled !== enabled);
    if (targets.length === 0) return;
    const before = events;
    // Show the change at once; put it back if the server refuses.
    setEvents((list) => list?.map((e) => (targets.includes(e.key) ? { ...e, enabled } : e)) ?? list);
    setSaving((s) => new Set([...s, ...targets]));
    try {
      let latest: EmailPreference[] | null = null;
      for (const key of targets) latest = await setEmailPreference(key, enabled);
      if (latest) setEvents(latest);
    } catch (err) {
      setEvents(before);
      toast.error(err instanceof Error ? err.message : "Could not save your email setting.");
    } finally {
      setSaving((s) => new Set([...s].filter((k) => !targets.includes(k))));
    }
  }

  const onCount = groups.reduce((n, g) => n + g.events.filter((e) => e.enabled).length, 0);

  return (
    <FloatCard className="p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Mail className="size-5 text-primary" />
        <h2 className="text-base font-semibold tracking-tight">Email notifications</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose what we also send to {user.email ? <span className="font-medium text-foreground">{user.email}</span> : "your email"}. Everything
        still shows in the bell at the top of the app, whatever you choose here.
      </p>

      {MOCK_AUTH ? (
        <p className="mt-4 text-xs text-subtle">Available on the live system.</p>
      ) : error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : !events ? (
        <div className="mt-4">
          <Loader />
        </div>
      ) : groups.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">There are no email notifications for your role.</p>
      ) : (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            {onCount === 0 ? "No emails are turned on." : `${onCount} ${onCount === 1 ? "email is" : "emails are"} turned on.`}
          </p>
          <div className="mt-2 divide-y divide-border">
            {groups.map((g) => {
              const allOn = g.events.every((e) => e.enabled);
              const busy = g.events.some((e) => saving.has(e.key));
              return (
                <section key={g.name} className="py-4" aria-labelledby={`email-group-${g.name}`}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 id={`email-group-${g.name}`} className="text-sm font-semibold">
                      {g.name}
                    </h3>
                    {g.events.length > 1 ? (
                      <OutlineButton
                        disabled={busy}
                        onClick={() => void change(g.events.map((e) => e.key), !allOn)}
                      >
                        {allOn ? "Turn all off" : "Turn all on"}
                      </OutlineButton>
                    ) : null}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {g.events.map((e) => (
                      <li key={e.key} className="flex items-center justify-between gap-3 py-1.5">
                        <span id={`email-${e.key}`} className="text-sm">
                          {e.label}
                        </span>
                        <Switch
                          checked={e.enabled}
                          disabled={saving.has(e.key)}
                          labelledBy={`email-${e.key}`}
                          onChange={(on) => void change([e.key], on)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </FloatCard>
  );
}

function Switch({
  checked,
  disabled,
  labelledBy,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  labelledBy: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky/40 disabled:opacity-60",
        checked ? "bg-primary" : "bg-secondary ring-1 ring-border ring-inset",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-card shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
      <span className="sr-only">{checked ? "On" : "Off"}</span>
    </button>
  );
}
