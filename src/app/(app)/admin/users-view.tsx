"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Mail, Search, ShieldCheck, UserCheck, UserPlus, UserX } from "lucide-react";
import { PageHeader, SlideOver } from "@/components/gral/shell";
import { Td, Th } from "@/components/gral/claim-list";
import {
  CATEGORY_LABEL,
  InviteUserForm,
  UserPanel,
  UserStatusChip,
  formatDay,
  roleName,
} from "@/components/gral/admin-users";
import { CardHeader, Chip, FloatCard, NavyButton, SegmentedTabs, StatTile, TextLink } from "@/components/gral/ui";
import { adminSelfId, listManagedRoles, listManagedUsers } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { adminPermissions } from "@/lib/permissions";
import type { ManagedRole, ManagedUser } from "@/lib/types";

const TABS = ["All", "Active", "Invited", "Deactivated"] as const;
type Tab = (typeof TABS)[number];
const TAB_STATUS: Record<Tab, ManagedUser["status"] | null> = {
  All: null,
  Active: "ACTIVE",
  Invited: "INVITED",
  Deactivated: "INACTIVE",
};

export function UsersView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const rights = adminPermissions(user);
  const selfId = adminSelfId(user);

  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [roles, setRoles] = useState<ManagedRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("All");
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  const reload = useCallback(() => {
    Promise.all([listManagedUsers(), listManagedRoles()])
      .then(([u, r]) => {
        setUsers(u);
        setRoles(r);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load the users.");
        setUsers([]);
      });
  }, []);
  useEffect(reload, [reload]);

  const all = users ?? [];
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const status = TAB_STATUS[tab];
    return all
      .filter((u) => !status || u.status === status)
      .filter(
        (u) =>
          !q ||
          u.fullName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.roles.some((c) => roleName(c, roles).toLowerCase().includes(q)),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [all, tab, query, roles]);

  const openId = searchParams.get("user");
  const open = all.find((u) => u.id === openId) ?? null;
  const setOpen = (u: ManagedUser | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (u) params.set("user", u.id);
    else params.delete("user");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const count = (s: ManagedUser["status"]) => all.filter((u) => u.status === s).length;
  const admins = all.filter((u) => u.status === "ACTIVE" && u.profileCategory === "ADMINISTRATION").length;

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Staff accounts, invitations and roles"
        action={
          rights.canInvite ? (
            <NavyButton className="px-4 py-2 text-sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" /> Invite User
            </NavyButton>
          ) : null
        }
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={UserCheck} label="Active" value={String(count("ACTIVE"))} />
        <StatTile icon={Mail} label="Invitation Pending" value={String(count("INVITED"))} delay={60} />
        <StatTile icon={UserX} label="Deactivated" value={String(count("INACTIVE"))} delay={120} />
        <StatTile icon={ShieldCheck} label="Active Administrators" value={String(admins)} delay={180} />
      </div>

      <FloatCard className="mt-4 overflow-hidden" delay={120}>
        <CardHeader
          title="User Accounts"
          right={
            <div className="flex flex-wrap items-center gap-2">
              <label className="float-pill flex w-full items-center gap-2 px-3.5 py-2 sm:w-64">
                <Search className="size-3.5 shrink-0 text-subtle" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, email or role"
                  aria-label="Search users"
                  className="w-full bg-transparent text-xs outline-none placeholder:text-subtle"
                />
              </label>
              <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
            </div>
          }
        />
        <div className="mt-4 overflow-x-auto px-2 pb-4">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
            <thead>
              <tr className="bg-pale text-[11px] text-muted-foreground">
                <Th className="rounded-l-xl">Person</Th>
                <Th>Roles</Th>
                <Th>Account type</Th>
                <Th>Status</Th>
                <Th>Added</Th>
                <Th className="rounded-r-xl">Action</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="cursor-pointer hover:bg-pale/50" onClick={() => setOpen(u)}>
                  <Td>
                    <div className="flex items-center gap-2 text-xs font-medium">
                      {u.fullName}
                      {u.id === selfId ? <Chip tone="sky">You</Chip> : null}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{u.email}</div>
                  </Td>
                  <Td>
                    <div className="flex max-w-[260px] flex-wrap gap-1">
                      {u.roles.map((c) => (
                        <Chip key={c} tone="sky">
                          {roleName(c, roles)}
                        </Chip>
                      ))}
                    </div>
                  </Td>
                  <Td className="text-xs">{CATEGORY_LABEL[u.profileCategory]}</Td>
                  <Td>
                    <UserStatusChip status={u.status} />
                  </Td>
                  <Td className="text-xs whitespace-nowrap">{formatDay(u.createdAt)}</Td>
                  <Td>
                    <TextLink>Manage</TextLink>
                  </Td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <Td className={error ? "text-xs text-danger" : "text-xs text-muted-foreground"} colSpan={6}>
                    {error ?? (users === null ? "Loading users…" : query ? `No users match "${query}".` : "No users in this view.")}
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </FloatCard>

      <SlideOver open={!!open} onClose={() => setOpen(null)}>
        {open ? (
          <UserPanel
            key={`${open.id}-${open.version}`}
            user={open}
            roles={roles}
            isSelf={open.id === selfId}
            rights={rights}
            onClose={() => setOpen(null)}
            onChanged={reload}
          />
        ) : null}
      </SlideOver>

      <SlideOver open={inviteOpen} onClose={() => setInviteOpen(false)} wide>
        {inviteOpen ? (
          <InviteUserForm
            roles={roles}
            onClose={() => setInviteOpen(false)}
            onInvited={() => {
              reload();
              setTab("Invited");
            }}
          />
        ) : null}
      </SlideOver>
    </>
  );
}
