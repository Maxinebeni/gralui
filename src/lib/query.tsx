"use client";

// One shared cache for data from the backend (TanStack Query). Pages and the
// bell that need the same data share one request, revisits show saved data
// at once and refresh in the background, and nothing is fetched twice at the
// same moment. The cache is emptied when someone else signs in.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth-context";

/** Cache keys, so every screen names the same data the same way. */
export const queryKeys = {
  claims: ["claims"] as const,
  clients: (search: string) => ["clients", search] as const,
  leads: ["leads"] as const,
  renewals: ["renewals"] as const,
  assignees: ["assignees"] as const,
  approvals: (role: string) => ["approvals", role] as const,
  tasks: (role: string) => ["tasks", role] as const,
  inbox: (userId: string) => ["inbox", userId] as const,
  document: (subjectType: string, subjectId: string, documentId: string, version: number) =>
    ["document", subjectType, subjectId, documentId, version] as const,
};

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data younger than this is shown without asking the backend again.
            staleTime: 20_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  // A different person (or demo role) must never see the previous one's data.
  const { user } = useAuth();
  const who = user ? `${user.id ?? user.email}:${user.role}` : "";
  const previous = useRef(who);
  useEffect(() => {
    // Reset rather than clear: screens already listening refetch for the new person.
    // Nothing to reset on the first sign-in.
    if (previous.current && previous.current !== who) void client.resetQueries();
    previous.current = who;
  }, [who, client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
