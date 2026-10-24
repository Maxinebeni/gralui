"use client";

// Who is signed in right now (GET /api/v1/admin/sessions), with ending one
// session or all of a person's sessions. Every ending needs a reason, kept in
// the audit log. Administrators cannot end their own sessions here.

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/gral/shell";
import { Td, Th } from "@/components/gral/claim-list";
import { CardHeader, Chip, Dot, FloatCard, NavyButton, OutlineButton, StatTile } from "@/components/gral/ui";
import { adminSelfId, endAllSessionsFor, endSession, listActiveSessions } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { adminPermissions } from "@/lib/permissions";
import type { ManagedSession } from "@/lib/types";

const REFRESH_SECONDS = 30;

function minutesSince(iso?: string) {
  return iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000)) : null;
}

function ago(iso?: string) {
  const m = minutesSince(iso);
  if (m === null) return "Not recorded";
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

function time(iso?: string) {
  if (!iso) return "Not recorded";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Green: active in the last 5 minutes. Amber: in the last 30. Grey: idle. */
function activityTone(iso?: string) {
  const m = minutesSince(iso);
  if (m === null) return "subtle" as const;
  return m <= 5 ? ("success" as const) : m <= 30 ? ("warning" as const) : ("subtle" as const);
}

type Ending = { kind: "one"; session: ManagedSession } | { kind: "all"; userId: string; name: string };

export function SessionsView() {
  const { user } = useCurrentUser();
  const { canEndSessions } = adminPermissions(user);
  const selfId = adminSelfId(user);

  const [sessions, setSessions] = useState<ManagedSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [ending, setEnding] = useState<Ending | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    listActiveSessions()
      .then((s) => {
        setSessions(s);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load the sessions.");
        setSessions([]);
      });
  }, []);
  useEffect(() => {
    reload();
    const timer = setInterval(reload, REFRESH_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [reload]);

  const all = sessions ?? [];
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((s) => !q || s.fullName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
      .sort((a, b) => (b.lastAccessedAt ?? "").localeCompare(a.lastAccessedAt ?? ""));
  }, [all, query]);

  const people = new Set(all.map((s) => s.userId)).size;
  const activeNow = all.filter((s) => activityTone(s.lastAccessedAt) === "success").length;
  const sessionsOf = (userId: string) => all.filter((s) => s.userId === userId).length;

  async function confirmEnd() {
    if (!ending) return;
    setBusy(true);
    try {
      if (ending.kind === "one") {
        await endSession(ending.session, reason, selfId);
        toast.success(`${ending.session.fullName} has been signed out of that session.`);
      } else {
        const n = await endAllSessionsFor(ending.userId, reason, selfId);
        toast.success(`${ending.name} has been signed out everywhere (${n} ${n === 1 ? "session" : "sessions"}).`);
      }
      setEnding(null);
      setReason("");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not end the session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Active Sessions"
        action={
          <OutlineButton className="px-4 py-2 text-sm" onClick={reload}>
            <RefreshCw className="size-4" /> Refresh
          </OutlineButton>
        }
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <StatTile label="People signed in" value={String(people)} />
        <StatTile label="Sessions" value={String(all.length)} delay={60} />
        <StatTile label="Active in the last 5 minutes" value={String(activeNow)} delay={120} />
      </div>

      <FloatCard className="mt-4 overflow-hidden" delay={120}>
        <CardHeader
          title="Signed in"
          right={
            <label className="float-pill flex w-full items-center gap-2 px-3.5 py-2 sm:w-64">
              <Search className="size-3.5 shrink-0 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or email"
                aria-label="Search sessions"
                className="w-full bg-transparent text-xs outline-none placeholder:text-subtle"
              />
            </label>
          }
        />
        <div className="mt-4 overflow-x-auto px-2 pb-4">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
            <thead>
              <tr className="bg-pale text-[11px] text-muted-foreground">
                <Th className="rounded-l-xl">Person</Th>
                <Th>Last active</Th>
                <Th>Signed in</Th>
                <Th>Expires</Th>
                <Th className="rounded-r-xl">{canEndSessions ? "Action" : ""}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const self = s.userId === selfId;
                const isEnding = ending?.kind === "one" && ending.session.sessionReference === s.sessionReference;
                return (
                  <tr key={s.sessionReference}>
                    <Td>
                      <div className="flex items-center gap-2 text-xs font-medium">
                        {s.fullName}
                        {self ? <Chip tone="sky">You</Chip> : null}
                        {sessionsOf(s.userId) > 1 ? <Chip>{sessionsOf(s.userId)} sessions</Chip> : null}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{s.email}</div>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                        <Dot tone={activityTone(s.lastAccessedAt)} />
                        {ago(s.lastAccessedAt)}
                      </span>
                    </Td>
                    <Td className="text-xs whitespace-nowrap">{time(s.authenticatedAt)}</Td>
                    <Td className="text-xs whitespace-nowrap">{time(s.expiresAt)}</Td>
                    <Td>
                      {canEndSessions && !self && !isEnding ? (
                        <div className="flex flex-wrap gap-2">
                          <OutlineButton onClick={() => { setEnding({ kind: "one", session: s }); setReason(""); }}>End session</OutlineButton>
                          {sessionsOf(s.userId) > 1 ? (
                            <OutlineButton onClick={() => { setEnding({ kind: "all", userId: s.userId, name: s.fullName }); setReason(""); }}>End all</OutlineButton>
                          ) : null}
                        </div>
                      ) : null}
                      {isEnding ? <EndForm reason={reason} setReason={setReason} busy={busy} onConfirm={confirmEnd} onCancel={() => setEnding(null)} /> : null}
                    </Td>
                  </tr>
                );
              })}
              {ending?.kind === "all" ? (
                <tr>
                  <Td colSpan={5}>
                    <div className="rounded-xl bg-pale px-3 py-3">
                      <p className="text-xs font-medium">Sign {ending.name} out everywhere</p>
                      <EndForm reason={reason} setReason={setReason} busy={busy} onConfirm={confirmEnd} onCancel={() => setEnding(null)} />
                    </div>
                  </Td>
                </tr>
              ) : null}
              {rows.length === 0 ? (
                <tr>
                  <Td className={error ? "text-xs text-danger" : "text-xs text-muted-foreground"} colSpan={5}>
                    {error ?? (sessions === null ? "Loading sessions…" : query ? `Nobody matches "${query}".` : "Nobody is signed in.")}
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </FloatCard>
    </>
  );
}

function EndForm({
  reason,
  setReason,
  busy,
  onConfirm,
  onCancel,
}: {
  reason: string;
  setReason: (v: string) => void;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason"
        aria-label="Reason for ending the session"
        autoFocus
        className="min-w-0 flex-1 rounded-xl border border-input bg-card px-3 py-1.5 text-xs outline-none focus:border-sky focus:ring-2 focus:ring-sky/30"
      />
      <NavyButton disabled={busy || !reason.trim()} onClick={onConfirm}>
        {busy ? "Ending…" : "End"}
      </NavyButton>
      <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
    </div>
  );
}
