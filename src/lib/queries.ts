"use client";

// The shared lists. Every screen that shows claims, clients, leads, renewals,
// approvals or tasks reads them through these hooks, so one request serves the
// whole app and a page you have seen opens at once. After a change, call
// useRefresh() with the lists it affects.

import { useCallback } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { listApprovals, listAssignees, listClaims, listClients, listLeads, listRenewals, listTasks } from "./api";
import { queryKeys } from "./query";

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

export function useAssignees() {
  return useQuery({ queryKey: queryKeys.assignees, queryFn: () => listAssignees() });
}

type ListName = "claims" | "clients" | "leads" | "renewals" | "approvals" | "tasks";

/** Marks lists as changed; screens showing them load them again. Tasks change with almost everything, so they always refresh. */
export function useRefresh() {
  const queryClient = useQueryClient();
  return useCallback(
    (...lists: ListName[]) => {
      for (const name of new Set([...lists, "tasks", "inbox"])) void queryClient.invalidateQueries({ queryKey: [name] });
    },
    [queryClient],
  );
}
