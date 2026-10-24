"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader, SlideOver } from "@/components/gral/shell";
import { Td, Th } from "@/components/gral/claim-list";
import { NewRoleForm, RolePanel } from "@/components/gral/admin-roles";
import { CardHeader, Chip, FloatCard, NavyButton, SegmentedTabs, TextLink } from "@/components/gral/ui";
import { MOCK_AUTH, listManagedRoles, listManagedUsers, listPermissionDefinitions } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { adminPermissions } from "@/lib/permissions";
import type { ManagedRole, ManagedUser, PermissionDefinition } from "@/lib/types";

const TABS = ["Business", "Administration"] as const;

export function RolesView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const { canCreateRole, canUpdateRole } = adminPermissions(user);
  // Roles the signed-in person holds (they may rename these but not change their permissions).
  const heldRoleCodes = MOCK_AUTH ? ["ADMINISTRATOR"] : (user.backendRoles ?? []);

  const [roles, setRoles] = useState<ManagedRole[] | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Business");
  const [newOpen, setNewOpen] = useState(false);

  const reload = useCallback(() => {
    Promise.all([listManagedRoles(), listPermissionDefinitions(), listManagedUsers().catch(() => [])])
      .then(([r, p, u]) => {
        setRoles(r);
        setPermissions(p);
        setUsers(u);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load the roles.");
        setRoles([]);
      });
  }, []);
  useEffect(reload, [reload]);

  const all = roles ?? [];
  const category = tab === "Business" ? "BUSINESS" : "ADMINISTRATION";
  const rows = all.filter((r) => r.category === category).sort((a, b) => a.name.localeCompare(b.name));
  const people = (code: string) => users.filter((u) => u.status !== "INACTIVE" && u.roles.includes(code)).length;

  const openId = searchParams.get("role");
  const open = all.find((r) => r.id === openId) ?? null;
  const setOpen = (r: ManagedRole | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (r) params.set("role", r.id);
    else params.delete("role");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        action={
          canCreateRole ? (
            <NavyButton className="px-4 py-2 text-sm" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" /> New Role
            </NavyButton>
          ) : null
        }
      />

      <FloatCard className="mt-5 overflow-hidden">
        <CardHeader title="Roles" right={<SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />} />
        <div className="mt-4 overflow-x-auto px-2 pb-4">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
            <thead>
              <tr className="bg-pale text-[11px] text-muted-foreground">
                <Th className="rounded-l-xl">Role</Th>
                <Th>Permissions</Th>
                <Th>People</Th>
                <Th className="rounded-r-xl">Action</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-pale/50" onClick={() => setOpen(r)}>
                  <Td>
                    <div className="flex items-center gap-2 text-xs font-medium">
                      {r.name}
                      {r.code === "ADMINISTRATOR" ? <Chip tone="neutral">Built-in</Chip> : null}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{r.code}</div>
                  </Td>
                  <Td className="text-xs">{r.permissions.length}</Td>
                  <Td className="text-xs">{people(r.code)}</Td>
                  <Td>
                    <TextLink>{canUpdateRole && r.code !== "ADMINISTRATOR" ? "Edit" : "View"}</TextLink>
                  </Td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <Td className={error ? "text-xs text-danger" : "text-xs text-muted-foreground"} colSpan={4}>
                    {error ?? (roles === null ? "Loading roles…" : "No roles of this type yet.")}
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </FloatCard>

      <SlideOver open={!!open} onClose={() => setOpen(null)}>
        {open ? (
          <RolePanel
            key={`${open.id}-${open.version}`}
            role={open}
            permissions={permissions}
            peopleCount={people(open.code)}
            canUpdate={canUpdateRole}
            heldRoleCodes={heldRoleCodes}
            onClose={() => setOpen(null)}
            onChanged={reload}
          />
        ) : null}
      </SlideOver>

      <SlideOver open={newOpen} onClose={() => setNewOpen(false)} wide>
        {newOpen ? (
          <NewRoleForm
            permissions={permissions}
            existingCodes={all.map((r) => r.code)}
            onClose={() => setNewOpen(false)}
            onCreated={(created) => {
              reload();
              setTab(created.category === "BUSINESS" ? "Business" : "Administration");
            }}
          />
        ) : null}
      </SlideOver>
    </>
  );
}
