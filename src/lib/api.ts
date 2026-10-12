// Data access for the screens. Every screen goes through these functions,
// never through mock-data.ts directly.
//
// Requests go to /api/..., which src/app/api/[...path]/route.ts forwards to
// the backend. The screens will not need to change as long as the response
// shapes match src/lib/types.ts.
//
// STATUS: authentication and clients are connected to the real backend.
// Policies, claims, renewals and the overview still use mock data.

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
import {
  mockCreateClient,
  mockGetClient,
  mockListClients,
  mockListManagers,
  mockUpdateClient,
} from "./mock-clients";
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

// Empty means "same address as the frontend". The /api route forwards to the backend.
const API_URL = "";

/**
 * Demo mode: set NEXT_PUBLIC_MOCK_AUTH=true in .env.local to sign in with any
 * email and password and use sample clients, with no backend at all. Handy for
 * presentations and for front-end work offline.
 */
export const MOCK_AUTH = process.env.NEXT_PUBLIC_MOCK_AUTH === "true";

/* ---------------------------------- Clients ---------------------------------- */
// Connected to the backend: /api/v1/clients. The screens keep using the
// client reference (e.g. CLT-001) as the ID; the backend UUID and version are
// kept on each client for saving.

type BackendClientType = "CORPORATE" | "STATE_ENTERPRISE" | "NGO" | "FINANCIAL_INSTITUTION" | "SME";

const TYPE_TO_BACKEND: Record<ClientType, BackendClientType> = {
  Corporate: "CORPORATE",
  "State Enterprise": "STATE_ENTERPRISE",
  NGO: "NGO",
  "Financial Institution": "FINANCIAL_INSTITUTION",
  SME: "SME",
};

const TYPE_FROM_BACKEND: Record<BackendClientType, ClientType> = {
  CORPORATE: "Corporate",
  STATE_ENTERPRISE: "State Enterprise",
  NGO: "NGO",
  FINANCIAL_INSTITUTION: "Financial Institution",
  SME: "SME",
};

type BackendContact = { name: string; jobTitle: string; email: string; phone: string };

type ClientView = {
  id: string;
  reference: string;
  profile: {
    registeredName: string;
    type: BackendClientType;
    sector: string;
    physicalAddress: string;
    remarks?: string;
  };
  primaryContact?: BackendContact;
  managerId?: string;
  restricted: boolean;
  version: number;
};

type ClientSummary = {
  id: string;
  reference: string;
  registeredName: string;
  type: BackendClientType;
  managerId?: string;
  restricted: boolean;
  version: number;
};

type Page<T> = { items: T[]; page: number; size: number; totalElements: number; totalPages: number };

type ManagerChoice = { id: string; fullName: string };

/** Backend clients already loaded, by reference, so saving can find the UUID and version. */
const CLIENT_CACHE = new Map<string, Client>();

/** Policies are not on the backend yet, so they are kept in memory per client until refresh. */
const LOCAL_POLICIES = new Map<string, Policy[]>();

/** Eligible account managers from the backend, loaded once. */
let MANAGERS: ManagerChoice[] | null = null;

async function loadManagers(): Promise<ManagerChoice[]> {
  if (MANAGERS) return MANAGERS;
  try {
    const res = await apiFetch("/api/v1/clients/managers?size=100");
    if (!res.ok) return [];
    MANAGERS = ((await res.json()) as Page<ManagerChoice>).items ?? [];
    return MANAGERS;
  } catch {
    return [];
  }
}

function managerName(id: string | undefined, managers: ManagerChoice[]): string {
  if (!id) return "Unassigned";
  return managers.find((m) => m.id === id)?.fullName ?? "Account manager";
}

/** Turns a backend error into a message the user can act on. */
async function problemMessage(res: Response, fallback: string): Promise<string> {
  const problem = await readProblem(res);
  if (res.status === 401) return "Your session has ended. Please sign in again.";
  if (res.status === 403) return "You do not have permission to do this.";
  if (res.status === 404) return "This client could not be found.";
  if (problem.code === "STALE_VERSION") {
    return "Someone else changed this client. Close it and open it again to see the latest details.";
  }
  if (problem.code === "DUPLICATE_REVIEW_REQUIRED") {
    return "A client with the same name, email or phone number already exists.";
  }
  if (res.status === 400 && problem.fields?.length) {
    return `Please check these fields: ${problem.fields.join(", ")}.`;
  }
  return fallback;
}

/** The backend only accepts +250 followed by 9 digits. */
function toBackendPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("250")) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `+250${digits.slice(1)}`;
  if (digits.length === 9) return `+250${digits}`;
  throw new Error("Enter a Rwandan phone number, for example +250 788 123 456.");
}

function toClient(v: ClientView, managers: ManagerChoice[]): Client {
  const policies = LOCAL_POLICIES.get(v.reference) ?? [];
  const active = policies.filter((p) => p.status === "Active" || p.status === "In Renewal").length;
  const client: Client = {
    id: v.reference,
    uuid: v.id,
    version: v.version,
    managerId: v.managerId,
    name: v.profile.registeredName,
    type: TYPE_FROM_BACKEND[v.profile.type] ?? "Corporate",
    sector: v.profile.sector,
    address: v.profile.physicalAddress,
    remarks: v.profile.remarks,
    contact: v.primaryContact
      ? {
          name: v.primaryContact.name,
          title: v.primaryContact.jobTitle,
          email: v.primaryContact.email,
          phone: v.primaryContact.phone,
        }
      : undefined,
    manager: managerName(v.managerId, managers),
    // Not tracked by the backend yet.
    activePolicies: active,
    kyc: false,
    policiesOk: active > 0,
    claimsOk: false,
    correspondenceOk: false,
    docsFiled: 0,
    docsTotal: 4,
    nonCompliant: false,
    documents: [],
    policies,
    correspondence: [],
  };
  CLIENT_CACHE.set(client.id, client);
  return client;
}

async function fetchClientView(uuid: string): Promise<ClientView> {
  const res = await apiFetch(`/api/v1/clients/${uuid}`);
  if (!res.ok) throw new Error(await problemMessage(res, "Could not load this client."));
  return (await res.json()) as ClientView;
}

/** Search clients on the backend (name, reference and more). */
export async function listClients(query = ""): Promise<Client[]> {
  if (MOCK_AUTH) return mockListClients(query);
  try {
    const params = new URLSearchParams({ size: "100", sort: "name" });
    if (query.trim()) params.set("q", query.trim());
    const res = await apiFetch(`/api/v1/clients?${params}`);
    if (!res.ok) throw new Error(await problemMessage(res, "Could not load clients."));
    const page = (await res.json()) as Page<ClientSummary>;
    const managers = await loadManagers();

    // The list only has summaries, so load each full record. Unchanged ones come from the cache.
    return await Promise.all(
      page.items.map(async (s) => {
        const cached = CLIENT_CACHE.get(s.reference);
        if (cached && cached.uuid === s.id && cached.version === s.version) return cached;
        return toClient(await fetchClientView(s.id), managers);
      }),
    );
  } catch (err) {
    console.error(err);
    return [];
  }
}

export async function getClient(id: string): Promise<Client | null> {
  if (MOCK_AUTH) return mockGetClient(id);
  const cached = CLIENT_CACHE.get(id);
  if (cached?.uuid) return toClient(await fetchClientView(cached.uuid), await loadManagers());
  return (await listClients(id)).find((c) => c.id === id) ?? null;
}

/** Account manager names for the dropdown, from the backend. */
export async function listManagers(): Promise<string[]> {
  if (MOCK_AUTH) return mockListManagers();
  return (await loadManagers()).map((m) => m.fullName).sort();
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

function toProfile(input: ClientInput) {
  return {
    registeredName: input.name,
    type: TYPE_TO_BACKEND[input.type],
    sector: input.sector,
    physicalAddress: input.address,
  };
}

function toContact(contact: ClientContact): BackendContact {
  return {
    name: contact.name,
    jobTitle: contact.title,
    email: contact.email,
    phone: toBackendPhone(contact.phone),
  };
}

async function managerIdFor(name: string): Promise<string> {
  const id = (await loadManagers()).find((m) => m.fullName === name)?.id;
  if (!id) throw new Error("Choose an account manager from the list.");
  return id;
}

/** Add a new client: POST /api/v1/clients. */
export async function createClient(input: ClientInput): Promise<Client> {
  if (MOCK_AUTH) return mockCreateClient(input);
  const body = {
    // Lets the backend ignore an accidental double submit.
    commandId: crypto.randomUUID(),
    profile: toProfile(input),
    primaryContact: toContact(input.contact),
    managerId: await managerIdFor(input.manager),
  };
  const res = await apiFetch("/api/v1/clients", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await problemMessage(res, "Could not save the client. Please try again."));
  return toClient((await res.json()) as ClientView, await loadManagers());
}

/**
 * Update a client. The backend uses three separate steps: profile, primary
 * contact and account manager. Each step needs the latest version number.
 */
export async function updateClient(id: string, input: ClientInput): Promise<Client> {
  if (MOCK_AUTH) return mockUpdateClient(id, input);
  const current = CLIENT_CACHE.get(id);
  if (!current?.uuid || current.version === undefined) {
    throw new Error("This client could not be found. Close it and open it again.");
  }
  const uuid = current.uuid;
  let version = current.version;

  // 1. Company details.
  let res = await apiFetch(`/api/v1/clients/${uuid}`, {
    method: "PUT",
    body: JSON.stringify({ version, profile: { ...toProfile(input), remarks: current.remarks } }),
  });
  if (!res.ok) throw new Error(await problemMessage(res, "Could not save the client details."));
  let view = (await res.json()) as ClientView;
  version = view.version;

  // 2. Primary contact person.
  res = await apiFetch(`/api/v1/clients/${uuid}/primary-contact`, {
    method: "PUT",
    body: JSON.stringify({ version, primaryContact: toContact(input.contact) }),
  });
  if (!res.ok) throw new Error(await problemMessage(res, "Could not save the contact person."));
  view = (await res.json()) as ClientView;
  version = view.version;

  // 3. Account manager, only if it changed.
  const managerId = await managerIdFor(input.manager);
  if (managerId !== view.managerId) {
    res = await apiFetch(`/api/v1/clients/${uuid}/reassign`, {
      method: "POST",
      body: JSON.stringify({ version, managerId, reason: "Account manager changed from the client form." }),
    });
    if (!res.ok) throw new Error(await problemMessage(res, "Could not change the account manager."));
    view = (await res.json()) as ClientView;
  }

  return toClient(view, await loadManagers());
}

/* --------------------------------- Policies ---------------------------------- */
// Not on the backend yet. Policies for backend clients are kept in memory
// until the page is refreshed; sample clients keep using mock-data.ts.

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** What the Add Policy and Edit Policy forms send. */
export type PolicyInput = Policy;

function allKnownClients(): Client[] {
  return [...CLIENTS, ...CLIENT_CACHE.values()];
}

/** True if any client already holds a policy with this number (ignoring one policy, when editing). */
function policyNumberTaken(policyId: string, ignore?: { clientId: string; policyId: string }): boolean {
  return allKnownClients().some((c) =>
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

function findClientForPolicies(clientId: string): Client {
  const found = CLIENTS.find((c) => c.id === clientId) ?? CLIENT_CACHE.get(clientId);
  if (!found) throw new Error("This client could not be found.");
  return found;
}

function savePolicies(clientId: string, policies: Policy[]): Client {
  const updated = withPolicies(findClientForPolicies(clientId), policies);
  const mockIndex = CLIENTS.findIndex((c) => c.id === clientId);
  if (mockIndex >= 0) {
    CLIENTS[mockIndex] = updated;
  } else {
    LOCAL_POLICIES.set(clientId, policies);
    CLIENT_CACHE.set(clientId, updated);
  }
  return updated;
}

/** Add a policy to a client. Kept in memory until the page is refreshed. */
export async function createPolicy(clientId: string, input: PolicyInput): Promise<Client> {
  const client = findClientForPolicies(clientId);
  if (policyNumberTaken(input.id)) throw new Error("This policy number is already in use.");
  return savePolicies(clientId, [...client.policies, input]);
}

/** Update one of a client's policies. Kept in memory until the page is refreshed. */
export async function updatePolicy(
  clientId: string,
  originalPolicyId: string,
  input: PolicyInput,
): Promise<Client> {
  const client = findClientForPolicies(clientId);
  if (policyNumberTaken(input.id, { clientId, policyId: originalPolicyId })) {
    throw new Error("This policy number is already in use.");
  }
  return savePolicies(
    clientId,
    client.policies.map((p) => (p.id === originalPolicyId ? input : p)),
  );
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
  // Business roles in the backend's roles table (migration V9).
  ACCOUNTS_EXECUTIVE: "Accounts Executive",
  CRM_MANAGER: "CRM Manager",
  CLIENT_RELATION_RECORDS_OFFICER: "Client Relation Records Officer",
  GI_UNDERWRITING_MANAGER: "GI Underwriting Manager",
  CLAIMS_MANAGER: "Claims Manager",
  CLAIMS_UNDERWRITER: "Claims Underwriter",
  INTERNAL_AUDIT_MANAGER: "Internal Audit Manager",
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
  if (MOCK_AUTH) return null; // demo sessions live in the browser (auth-context.tsx)
  const res = await apiFetch("/api/v1/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Could not check who is signed in.");
  return toSessionUser((await res.json()) as MeResponse);
}

/** Demo-mode user: the name comes from the email, and everyone is MD. */
function demoUser(email: string): SessionUser {
  const name = (email.split("@")[0] ?? "")
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
  return { email, name: name || "GRAL User", role: "MD", permissions: [] };
}

/** Real sign-in: POST /api/v1/auth/login with a fresh CSRF token. */
export async function signIn(email: string, password: string): Promise<SessionUser> {
  if (MOCK_AUTH) return demoUser(email);
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
  // Forget cached clients and managers so the next user starts fresh.
  CLIENT_CACHE.clear();
  MANAGERS = null;
  if (MOCK_AUTH) return;
  const res = await apiFetch("/api/v1/auth/logout", { method: "POST" });
  // 401 means the session had already ended, which is fine.
  if (!res.ok && res.status !== 401) throw new Error("Could not sign out on the server.");
}

/** Thrown when an invitation or reset link is invalid, used or expired. */
export class InvalidLinkError extends Error {}

/** Shared error messages for the invitation and password reset links. */
async function confirmChallenge(path: string, token: string, password: string): Promise<void> {
  if (MOCK_AUTH) return; // demo mode: any link works
  const res = await apiFetch(path, { method: "POST", body: JSON.stringify({ token, password }) });
  if (res.ok) return;
  const problem = await readProblem(res);
  if (problem.code === "INVALID_OR_EXPIRED_TOKEN") {
    throw new InvalidLinkError("This link is invalid or has expired. Please ask for a new one.");
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
  if (MOCK_AUTH) return;
  const res = await apiFetch("/api/v1/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (res.status === 429) throw new Error("Too many requests. Please wait a few minutes and try again.");
  if (!res.ok && res.status !== 202) throw new Error("Could not send the reset email. Please try again.");
}