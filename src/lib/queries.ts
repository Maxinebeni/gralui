"use client";

// The shared lists. Every screen that shows claims, clients, leads, renewals,
// approvals or tasks reads them through these hooks, so one request serves the
// whole app and a page you have seen opens at once. After a change, call
// useRefresh() with the lists it affects.

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  activityFromRecords,
  listApprovals,
  listAssignees,
  listClaims,
  listClaimsWithOutcomes,
  listClients,
  listClientsWithPolicies,
  listImports,
  listLeads,
  listRenewals,
  listTasks,
} from "./api";
import { getOperationsDashboard } from "./operations-dashboard";
import { queryKeys } from "./query";
import { canAccessPath } from "./permissions";
import type { ActivityItem, ActivityModule, SessionUser } from "./types";

/** Every client with all their policies, for reports. Refreshed with the client lists. */
export function useClientsWithPolicies(enabled = true) {
  return useQuery({ queryKey: ["clients", "with-policies"] as const, queryFn: () => listClientsWithPolicies(), enabled });
}

/** Claims with how each closed one ended (settled or not), for reports. Refreshed with the claims list. */
export function useClaimsWithOutcomes(enabled = true) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["claims", "with-outcomes"] as const,
    queryFn: async () => listClaimsWithOutcomes(await queryClient.fetchQuery({ queryKey: queryKeys.claims, queryFn: () => listClaims() })),
    enabled,
  });
}

/**
 * TC's dashboard summary for the Overview (real backend only). Refreshed at most
 * once a minute, as the backend asks; a failure is not retried here (the
 * request already retries once when the server is busy).
 */
export function useOperationsDashboard(enabled = true) {
  return useQuery({ queryKey: ["dashboard", "operations"] as const, queryFn: () => getOperationsDashboard(), enabled, staleTime: 60_000, retry: false });
}

export function useClaims(enabled = true) {
  return useQuery({ queryKey: queryKeys.claims, queryFn: () => listClaims(), enabled });
}

/** The client book, or the clients matching a search. Rows stay on screen while a new search loads. */
export function useClients(search = "", enabled = true) {
  return useQuery({
    queryKey: queryKeys.clients(search.trim()),
    queryFn: () => listClients(search.trim()),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useLeads(enabled = true) {
  return useQuery({ queryKey: queryKeys.leads, queryFn: () => listLeads(), enabled });
}

export function useRenewals(enabled = true) {
  return useQuery({ queryKey: queryKeys.renewals, queryFn: () => listRenewals(), enabled });
}

export function useApprovals(role: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.approvals(role), queryFn: () => listApprovals(), enabled });
}

export function useTasks(role: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.tasks(role), queryFn: () => listTasks(), enabled });
}

export function useImports() {
  return useQuery({ queryKey: queryKeys.imports, queryFn: () => listImports() });
}

export function useAssignees() {
  return useQuery({ queryKey: queryKeys.assignees, queryFn: () => listAssignees() });
}

type ListName = "claims" | "clients" | "leads" | "renewals" | "approvals" | "tasks" | "imports";

/** Marks lists as changed; screens showing them load them again. Tasks change with almost everything, so they always refresh. */
export function useRefresh() {
  const queryClient = useQueryClient();
  return useCallback(
    (...lists: ListName[]) => {
      // The dashboard counts clients, policies, renewals and claims, so it follows any change.
      for (const name of new Set([...lists, "tasks", "inbox", "dashboard"])) void queryClient.invalidateQueries({ queryKey: [name] });
    },
    [queryClient],
  );
}

/**
 * Recent activity across everything this person can open: claims, renewals,
 * approvals, clients and leads. sources lists the kinds they can see; when it is
 * empty there is nothing to show, and the activity card is left out.
 */
export function useRecentActivity(user: SessionUser): {
  items: ActivityItem[] | null;
  sources: ActivityModule[];
} {
  const can = {
    Claims: canAccessPath(user, "/claims"),
    Renewals: canAccessPath(user, "/renewals"),
    Approvals: canAccessPath(user, "/approvals"),
    Clients: canAccessPath(user, "/clients"),
    Leads: canAccessPath(user, "/clients/leads"),
  };
  const claims = useClaims(can.Claims);
  const renewals = useRenewals(can.Renewals);
  const approvals = useApprovals(user.role, can.Approvals);
  const clients = useClients("", can.Clients);
  const leads = useLeads(can.Leads);
  const pending =
    (can.Claims && claims.isPending) ||
    (can.Renewals && renewals.isPending) ||
    (can.Approvals && approvals.isPending) ||
    (can.Clients && clients.isPending) ||
    (can.Leads && leads.isPending);
  const items = useMemo(
    () =>
      pending
        ? null
        : activityFromRecords({
            claims: can.Claims ? claims.data : [],
            renewals: can.Renewals ? renewals.data : [],
            approvals: can.Approvals ? approvals.data : [],
            clients: can.Clients ? clients.data : [],
            leads: can.Leads ? leads.data?.leads : [],
          }),
    [pending, claims.data, renewals.data, approvals.data, clients.data, leads.data, can.Claims, can.Renewals, can.Approvals, can.Clients, can.Leads],
  );
  const sources = (Object.keys(can) as ActivityModule[]).filter((k) => can[k]);
  return { items, sources };
}
