// Data access for the screens. Every screen goes through these functions,
// never through mock-data.ts directly.
//
// BACKEND HAND-OFF: when the Spring Boot API is ready, replace the body of
// each function with a fetch() to the matching endpoint. Requests go to
// /api/..., which next.config.ts forwards to the backend. The screens will
// not need to change as long as the response shapes match src/lib/types.ts.
//
// STATUS: signIn is connected to the real backend. Everything else still
// uses mock data until the backend has the matching endpoints.

import { CLIENTS, CLIENT_CLAIMS, POLICIES_BY_INSURER } from "./mock-data";
import type {
  Client,
  ClientClaim,
  ClientContact,
  ClientType,
  InsurerSummary,
  Policy,
  Role,
  SessionUser,
} from "./types";

// Empty means "same address as the frontend". next.config.ts forwards /api to the backend.
const API_URL = "";

// Backend role names translated to the frontend's role names.
// Add more here as the backend team creates new roles.
const BACKEND_TO_FRONTEND_ROLE: Record<string, Role> = {
  ADMINISTRATOR: "MD",
};

/* ---------------------------------- Clients ---------------------------------- */

/** Search across name, ID, sector, type and account manager. */
export async function listClients(query = ""): Promise<Client[]> {
  const q = query.trim().toLowerCase();
  // Return a copy so React notices when a client has been added or edited.
  if (!q) return [...CLIENTS];
  return CLIENTS.filter((c) =>
    [c.name, c.id, c.sector, c.type, c.manager].some((f) => f.toLowerCase().includes(q)),
  );
}

export async function getClient(id: string): Promise<Client | null> {
  return CLIENTS.find((c) => c.id === id) ?? null;
}

/** GRAL relationship managers already assigned to clients, for dropdowns. */
export async function listManagers(): Promise<string[]> {
  return Array.from(new Set(CLIENTS.map((c) => c.manager).filter(Boolean))).sort();
}

/** What the Add Client and Edit Client forms send. */
export type ClientInput = {
  name: string;
  type: ClientType;
  sector: string;
  address: string;
  contact: ClientContact;
  manager: string;
};

/** Next free ID in the CLT-001 style. The backend will generate this itself later. */
function nextClientId(): string {
  const highest = CLIENTS.reduce((max, c) => {
    const n = Number(c.id.replace(/\D/g, ""));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `CLT-${String(highest + 1).padStart(3, "0")}`;
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Add a new client (requirements doc, section 4). The file starts empty:
 * no documents, no policies, and KYC Pending until the Risk & Compliance
 * Manager marks Section A complete.
 * Mock version: saves in memory until the page is refreshed.
 */
export async function createClient(input: ClientInput): Promise<Client> {
  if (CLIENTS.some((c) => sameText(c.name, input.name))) {
    throw new Error("A client with this name already exists.");
  }

  const client: Client = {
    id: nextClientId(),
    name: input.name,
    type: input.type,
    sector: input.sector,
    address: input.address,
    contact: input.contact,
    manager: input.manager,
    activePolicies: 0,
    kyc: false,
    policiesOk: false,
    claimsOk: false,
    correspondenceOk: false,
    docsFiled: 0,
    docsTotal: 4,
    nonCompliant: false,
    documents: [],
    policies: [],
    correspondence: [],
  };

  CLIENTS.unshift(client);
  return client;
}

/** Update a client's details. Mock version: saves in memory until the page is refreshed. */
export async function updateClient(id: string, input: ClientInput): Promise<Client> {
  const index = CLIENTS.findIndex((c) => c.id === id);
  if (index === -1) throw new Error("This client could not be found.");

  if (CLIENTS.some((c) => c.id !== id && sameText(c.name, input.name))) {
    throw new Error("Another client already has this name.");
  }

  const updated: Client = { ...CLIENTS[index], ...input };
  CLIENTS[index] = updated;
  return updated;
}

/* --------------------------------- Policies ---------------------------------- */

/** What the Add Policy and Edit Policy forms send. */
export type PolicyInput = Policy;

/** True if any client already holds a policy with this number (ignoring one policy, when editing). */
function policyNumberTaken(policyId: string, ignore?: { clientId: string; policyId: string }): boolean {
  return CLIENTS.some((c) =>
    c.policies.some(
      (p) =>
        sameText(p.id, policyId) &&
        !(ignore && c.id === ignore.clientId && sameText(p.id, ignore.policyId)),
    ),
  );
}

/** Rebuild a client after its policies change, keeping the active count live. */
function withPolicies(client: Client, policies: Policy[]): Client {
  const active = policies.filter((p) => p.status === "Active" || p.status === "In Renewal").length;
  return {
    ...client,
    policies,
    activePolicies: active,
    policiesOk: client.policiesOk || active > 0,
  };
}

/** Add a policy to a client. Mock version: saves in memory until the page is refreshed. */
export async function createPolicy(clientId: string, input: PolicyInput): Promise<Client> {
  const index = CLIENTS.findIndex((c) => c.id === clientId);
  if (index === -1) throw new Error("This client could not be found.");
  if (policyNumberTaken(input.id)) throw new Error("This policy number is already in use.");

  const updated = withPolicies(CLIENTS[index], [...CLIENTS[index].policies, input]);
  CLIENTS[index] = updated;
  return updated;
}

/** Update one of a client's policies. Mock version: saves in memory until the page is refreshed. */
export async function updatePolicy(
  clientId: string,
  originalPolicyId: string,
  input: PolicyInput,
): Promise<Client> {
  const index = CLIENTS.findIndex((c) => c.id === clientId);
  if (index === -1) throw new Error("This client could not be found.");
  if (policyNumberTaken(input.id, { clientId, policyId: originalPolicyId })) {
    throw new Error("This policy number is already in use.");
  }

  const policies = CLIENTS[index].policies.map((p) => (p.id === originalPolicyId ? input : p));
  const updated = withPolicies(CLIENTS[index], policies);
  CLIENTS[index] = updated;
  return updated;
}

/* ---------------------------------- Claims ----------------------------------- */

export async function listClientClaims(clientName: string): Promise<ClientClaim[]> {
  return CLIENT_CLAIMS.filter((c) => c.client === clientName);
}

export async function getPoliciesByInsurer(): Promise<InsurerSummary[]> {
  return POLICIES_BY_INSURER;
}

/* ------------------------------- Authentication ------------------------------ */

/**
 * Mock password-reset request. The real version will POST the email to the
 * backend, which emails a reset link if the account exists. The UI shows the
 * same message either way so it never reveals which emails have accounts.
 */
export async function requestPasswordReset(_email: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 400));
}

/**
 * Real sign-in: sends the email and password to the Spring Boot backend.
 * The backend keeps the login in a cookie, so credentials: "include"
 * makes the browser store it and send it back on later requests.
 */
export async function signIn(email: string, password: string): Promise<SessionUser> {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? "Incorrect email or password."
        : "Could not sign in right now. Please try again.",
    );
  }

  const data: { id: number; email: string; fullName: string; roles: string[] } = await res.json();

  const role = data.roles.map((r) => BACKEND_TO_FRONTEND_ROLE[r]).find(Boolean);
  if (!role) {
    throw new Error("Your account does not have a role set up in this system yet.");
  }

  return { email: data.email, name: data.fullName, role };
}