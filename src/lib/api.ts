// Data access for the screens. Every screen goes through these functions,
// never through mock-data.ts directly.
//
// BACKEND HAND-OFF: when the Spring Boot API is ready, replace the body of
// each function with a fetch() to the matching endpoint (e.g.
// `${process.env.NEXT_PUBLIC_API_URL}/clients?q=...`). The screens will not
// need to change as long as the response shapes match src/lib/types.ts.

import { CLIENTS, CLIENT_CLAIMS, POLICIES_BY_INSURER } from "./mock-data";
import type { Client, ClientClaim, InsurerSummary, Role, SessionUser } from "./types";

/** Search across name, ID, sector, type and account manager. */
export async function listClients(query = ""): Promise<Client[]> {
  const q = query.trim().toLowerCase();
  if (!q) return CLIENTS;
  return CLIENTS.filter((c) =>
    [c.name, c.id, c.sector, c.type, c.manager].some((f) => f.toLowerCase().includes(q)),
  );
}

export async function getClient(id: string): Promise<Client | null> {
  return CLIENTS.find((c) => c.id === id) ?? null;
}

export async function listClientClaims(clientName: string): Promise<ClientClaim[]> {
  return CLIENT_CLAIMS.filter((c) => c.client === clientName);
}

export async function getPoliciesByInsurer(): Promise<InsurerSummary[]> {
  return POLICIES_BY_INSURER;
}

/**
 * Mock password-reset request. The real version will POST the email to the
 * backend, which emails a reset link if the account exists. The UI shows the
 * same message either way so it never reveals which emails have accounts.
 */
export async function requestPasswordReset(_email: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 400));
}

/**
 * Mock sign-in: accepts any email/password. The real version will POST to
 * the Spring Security login endpoint and get the user's role from the server.
 */
export async function signIn(email: string, _password: string): Promise<SessionUser> {
  const local = email.split("@")[0] || "GRAL User";
  const name = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
  // MD sees every menu item; use the Role pill to preview other roles.
  const role: Role = "MD";
  return { email, name: name || "GRAL User", role };
}
