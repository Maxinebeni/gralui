// Data access for the screens. Every screen goes through these functions,
// never through mock-data.ts directly.
//
// BACKEND HAND-OFF: when the Spring Boot API is ready, replace the body of
// each function with a fetch() to the matching endpoint. Requests go to
// /api/..., which next.config.ts forwards to the backend. The screens will
// not need to change as long as the response shapes match src/lib/types.ts.
//
// STATUS: authentication (login, who am I, logout, invitations and password
// reset) is connected to the real backend. Everything else still uses mock
// data until it is connected.

import {
  CLAIM_MONTHLY,
  CLAIM_STEPS,
  CLIENTS,
  CLIENT_CLAIMS,
  POLICIES_BY_INSURER,
  RECENT_ACTIVITY,
  RENEWAL_CASES,
  RENEWAL_MONTHLY,
} from "./mock-data";
import { completionBlocker, currentMilestone, todayIso } from "./renewals";
import type {
  ActivityItem,
  ClaimMonth,
  ClaimStep,
  Client,
  ClientClaim,
  ClientContact,
  ClientType,
  InsurerSummary,
  Policy,
  RenewalCase,
  RenewalMonth,
  RenewalQuote,
  Role,
  SessionUser,
} from "./types";

// Empty means "same address as the frontend". next.config.ts forwards /api to the backend.
const API_URL = "";

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

/* --------------------------------- Renewals ---------------------------------- */
// Mock versions: changes are kept in memory until the page is refreshed.
// Backend: REN-01 to REN-06 (Toochukwu). Rules the backend must also enforce:
// only the current milestone can be completed, quotes need a recommendation,
// and placement needs written client acceptance.

function findRenewal(id: string): RenewalCase {
  const found = RENEWAL_CASES.find((r) => r.id === id);
  if (!found) throw new Error("This renewal could not be found.");
  return found;
}

function saveRenewal(updated: RenewalCase): RenewalCase {
  const index = RENEWAL_CASES.findIndex((r) => r.id === updated.id);
  RENEWAL_CASES[index] = updated;
  return updated;
}

export async function listRenewals(): Promise<RenewalCase[]> {
  return [...RENEWAL_CASES];
}

export async function getRenewalMonthly(): Promise<RenewalMonth[]> {
  return RENEWAL_MONTHLY;
}

/** Complete the case's current milestone with a note and optional evidence. */
export async function completeRenewalMilestone(
  id: string,
  input: { note: string; evidence?: string; completedBy: string },
): Promise<RenewalCase> {
  const c = findRenewal(id);
  const blocker = completionBlocker(c);
  if (blocker) throw new Error(blocker);
  const m = currentMilestone(c)!;
  return saveRenewal({
    ...c,
    completed: [
      ...c.completed,
      { code: m.code, completedAt: todayIso(), completedBy: input.completedBy, note: input.note, evidence: input.evidence },
    ],
  });
}

export async function addRenewalQuote(
  id: string,
  input: Omit<RenewalQuote, "id" | "recommended">,
): Promise<RenewalCase> {
  const c = findRenewal(id);
  const quote: RenewalQuote = { ...input, id: `Q${c.quotes.length + 1}`, recommended: false };
  return saveRenewal({ ...c, quotes: [...c.quotes, quote] });
}

export async function recommendRenewalQuote(id: string, quoteId: string): Promise<RenewalCase> {
  const c = findRenewal(id);
  if (c.acceptance) throw new Error("The client has already accepted an option.");
  return saveRenewal({ ...c, quotes: c.quotes.map((q) => ({ ...q, recommended: q.id === quoteId })) });
}

export async function recordRenewalAcceptance(
  id: string,
  input: { quoteId: string; evidence: string; recordedBy: string },
): Promise<RenewalCase> {
  const c = findRenewal(id);
  if (!c.quotes.some((q) => q.id === input.quoteId)) throw new Error("Choose one of the quotes.");
  return saveRenewal({ ...c, acceptance: { ...input, acceptedAt: todayIso() } });
}

/* --------------------------------- Overview ---------------------------------- */

export async function listClaimsSummary(): Promise<ClientClaim[]> {
  return CLIENT_CLAIMS;
}

export async function getClaimSteps(): Promise<ClaimStep[]> {
  return CLAIM_STEPS;
}

export async function getClaimMonthly(): Promise<ClaimMonth[]> {
  return CLAIM_MONTHLY;
}

export async function listRecentActivity(): Promise<ActivityItem[]> {
  return RECENT_ACTIVITY;
}

/* ------------------------------- Authentication ------------------------------ */
// The backend uses a browser session (SESSION cookie) plus a CSRF token.
// Every POST or PUT must send a fresh CSRF token in the header the backend
// names (X-CSRF-TOKEN). The backend says not to cache it, so we fetch one
// before each request that changes something.

type MeResponse = {
  id: string;
  email: string;
  fullName: string;
  status: string;
  profileCategory: "ADMINISTRATION" | "BUSINESS";
  roles: string[];
  permissions: string[];
};

/** Problem details the backend sends with errors, e.g. { code: "LOGIN_FAILED" }. */
type ApiProblem = { title?: string; status?: number; code?: string; fields?: string[] };

async function readProblem(res: Response): Promise<ApiProblem> {
  try {
    return (await res.json()) as ApiProblem;
  } catch {
    return {};
  }
}

/** Get a fresh CSRF token and the header name to send it in. */
async function getCsrf(): Promise<{ headerName: string; token: string }> {
  const res = await fetch(`${API_URL}/api/v1/auth/csrf`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Could not reach the server. Please try again.");
  const data = (await res.json()) as { token: string; headerName?: string };
  return { headerName: data.headerName || "X-CSRF-TOKEN", token: data.token };
}

/**
 * fetch() for the backend. Always sends the session cookie. For anything that
 * is not a GET, it adds a fresh CSRF token, and retries once if the backend
 * says the token was invalid (it changes after login and logout).
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();

  const send = async () => {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (method !== "GET" && method !== "HEAD") {
      const csrf = await getCsrf();
      headers.set(csrf.headerName, csrf.token);
    }
    return fetch(`${API_URL}${path}`, { ...init, method, headers, credentials: "include", cache: "no-store" });
  };

  let res = await send();
  if (res.status === 403 && method !== "GET") {
    const problem = await readProblem(res.clone());
    if (problem.code === "CSRF_INVALID") res = await send();
  }
  return res;
}

// Backend role codes translated to the frontend's role names. Add codes here
// as the backend team confirms them (PLN-02). Codes are compared in upper
// case with spaces and dashes turned into underscores.
const BACKEND_TO_FRONTEND_ROLE: Record<string, Role> = {
  ADMINISTRATOR: "MD",
  ADMIN: "MD",
  MD: "MD",
  MANAGING_DIRECTOR: "MD",
  DMD: "DMD",
  DEPUTY_MANAGING_DIRECTOR: "DMD",
  TD: "Technical Director",
  TECHNICAL_DIRECTOR: "Technical Director",
  CD: "Commercial Director",
  COMMERCIAL_DIRECTOR: "Commercial Director",
  FD: "Finance Director",
  FINANCE_DIRECTOR: "Finance Director",
  RCM: "Risk & Compliance Manager",
  RISK_AND_COMPLIANCE_MANAGER: "Risk & Compliance Manager",
  RISK_COMPLIANCE_MANAGER: "Risk & Compliance Manager",
};

function toFrontendRole(backendRoles: string[]): Role | undefined {
  return backendRoles
    .map((r) => BACKEND_TO_FRONTEND_ROLE[r.trim().toUpperCase().replace(/[\s-]+/g, "_")])
    .find(Boolean);
}

function toSessionUser(me: MeResponse): SessionUser {
  const role = toFrontendRole(me.roles ?? []);
  if (!role) {
    // Shows the backend's role codes so they can be added to the list above.
    throw new Error(
      `Your account's role (${(me.roles ?? []).join(", ") || "none"}) is not set up in this app yet. Please contact the administrator.`,
    );
  }
  return {
    id: me.id,
    email: me.email,
    name: me.fullName,
    role,
    backendRoles: me.roles ?? [],
    permissions: me.permissions ?? [],
  };
}

/**
 * Who is signed in (GET /api/v1/me). Returns null when nobody is, so the app
 * can send the user to the login page. Used when the page loads or refreshes.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const res = await apiFetch("/api/v1/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Could not check who is signed in.");
  return toSessionUser((await res.json()) as MeResponse);
}

/** Real sign-in: POST /api/v1/auth/login with a fresh CSRF token. */
export async function signIn(email: string, password: string): Promise<SessionUser> {
  const res = await apiFetch("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Incorrect email or password.");
    if (res.status === 429) {
      throw new Error("Too many sign-in attempts. Please wait a few minutes and try again.");
    }
    throw new Error("Could not sign in right now. Please try again.");
  }

  return toSessionUser((await res.json()) as MeResponse);
}

/** Real sign-out: POST /api/v1/auth/logout ends the session on the backend. */
export async function signOut(): Promise<void> {
  const res = await apiFetch("/api/v1/auth/logout", { method: "POST" });
  // 401 means the session had already ended, which is fine.
  if (!res.ok && res.status !== 401) throw new Error("Could not sign out on the server.");
}

/** Shared error messages for the invitation and password reset links. */
async function confirmChallenge(path: string, token: string, password: string): Promise<void> {
  const res = await apiFetch(path, { method: "POST", body: JSON.stringify({ token, password }) });
  if (res.ok) return;
  const problem = await readProblem(res);
  if (problem.code === "INVALID_OR_EXPIRED_TOKEN") {
    throw new Error("This link is invalid or has expired. Please ask for a new one.");
  }
  if (res.status === 429) throw new Error("Too many attempts. Please wait a few minutes and try again.");
  if (res.status === 400) {
    throw new Error("Please check your password. It must be at least 15 characters long.");
  }
  throw new Error("Something went wrong. Please try again.");
}

/**
 * Set a new password from a reset email link
 * (POST /api/v1/auth/password-reset/confirm). The backend signs the user out
 * everywhere afterwards, so they sign in again with the new password.
 */
export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  await confirmChallenge("/api/v1/auth/password-reset/confirm", token, password);
}

/**
 * Set a first password from an invitation email link
 * (POST /api/v1/auth/invitations/accept). Does not sign the user in.
 */
export async function acceptInvitation(token: string, password: string): Promise<void> {
  await confirmChallenge("/api/v1/auth/invitations/accept", token, password);
}

/**
 * Ask for a password reset email (POST /api/v1/auth/password-reset/request).
 * The backend answers the same way whether or not the account exists, so the
 * screen shows the same message either way.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const res = await apiFetch("/api/v1/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (res.status === 429) throw new Error("Too many requests. Please wait a few minutes and try again.");
  if (!res.ok && res.status !== 202) throw new Error("Could not send the reset email. Please try again.");
}