// Data access for the screens. Every screen goes through these functions,
// never through mock-data.ts directly.
//
// Requests go to /api/..., which src/app/api/[...path]/route.ts forwards to
// the backend. The screens will not need to change as long as the response
// shapes match src/lib/types.ts.
//
// STATUS: authentication, clients, client documents and administration
// (users, roles) are connected to the real backend. Policies, claims, renewals, approvals, tasks and the overview
// still use mock data.

import {
  APPROVALS,
  CLAIMS,
  CLAIM_MONTHLY,
  CLAIM_STEPS,
  CLIENTS,
  MANUAL_TASKS,
  POLICIES_BY_INSURER,
  POLICY_TERMS,
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
import { DEMO_ADMIN_ID, PERMISSIONS, ROLES_DATA, USERS_DATA } from "./mock-admin";
import {
  APPROVAL_POLICY_VERSION,
  DECISION_DAYS,
  actingRole,
  approveBlocker,
  buildSteps,
  canDecide,
  currentStep,
  renewalApprovers,
} from "./approvals";
import {
  addWorkingDays,
  claimBlocker,
  claimSignOffChain,
  claimSla,
  dueDate,
  isClosed,
  isDisputed,
  missingDocuments,
  needsEscalation,
  nextSigner,
  stageLabel,
  stepDef,
} from "./claims";
import { displayToIso } from "./format";
import { RWANDA_HOLIDAYS, type Holiday } from "./holidays";
import { completionBlocker, currentMilestone, milestoneDue, todayIso } from "./renewals";
import type {
  AccessCategory,
  ActivityItem,
  ApprovalDecision,
  ApprovalRequest,
  ApprovalStep,
  Claim,
  ClaimEvent,
  ClaimFollowUp,
  ClaimPriority,
  ClaimMonth,
  ClaimStep,
  Client,
  ClientClaim,
  ClientContact,
  ClientType,
  DocumentClassification,
  DocumentSubject,
  EvidenceRef,
  InsurerSummary,
  ManagedRole,
  ManagedUser,
  PermissionDefinition,
  Policy,
  PolicyDetail,
  PolicyFinancials,
  PolicyMovement,
  PolicyPeriod,
  RenewalCase,
  RenewalMonth,
  RenewalQuote,
  Role,
  SessionUser,
  StoredDocument,
  WorkTask,
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
  return CLAIMS.filter((c) => c.client === clientName).map(toClaimSummary);
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
  // Internal approval goes through the Approvals inbox (APR-01), never a tick box.
  if (m.code === "APPROVAL") {
    throw new Error("Internal approval is recorded in the Approvals inbox. Use Request approval.");
  }
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

/* --------------------------------- Approvals --------------------------------- */
// Mock versions of APR-01 to APR-04 (Christian). Changes are kept in memory
// until the page is refreshed. The backend must enforce the same rules: only
// the current step's role decides, steps go in order, a decision carries the
// request version (an out-of-date one is refused), reject and return need a
// comment, and evidence-backed requests cannot be approved without evidence.
// Claim settlement sign-offs are built from the claims, so the claim screen
// and the inbox always agree.

const CLAIM_APPROVAL_PREFIX = "APR-";

function claimApproval(c: Claim): ApprovalRequest {
  const s = c.settlement!;
  const chain = claimSignOffChain(s.amount);
  const signer = nextSigner(c);
  const signedEvent = (role: string) =>
    [...c.history].reverse().find((e) => e.text === (role === "Board" ? "Board informed (recorded by MD)" : `${role} sign-off given`));
  return {
    id: `${CLAIM_APPROVAL_PREFIX}${c.id}`,
    subjectType: "CLAIM_SETTLEMENT",
    subjectId: c.id,
    subjectRef: c.id,
    subjectRevision: 1,
    title: `Claim settlement · ${c.classOfInsurance}`,
    summary: `${c.insurer} offered ${`RWF ${s.amount.toLocaleString("en-US")}`} on an estimated loss of RWF ${c.amount.toLocaleString("en-US")}. Payment to the client can only be recorded after sign-off.`,
    clientId: c.clientId,
    client: c.client,
    amount: s.amount,
    amountLabel: "Settlement",
    policyVersion: APPROVAL_POLICY_VERSION.CLAIM_SETTLEMENT,
    requestedBy: c.handler,
    requestedAt: s.advisedAt,
    dueAt: addWorkingDays(s.advisedAt, stepDef("SETTLEMENT").slaDays),
    status: signer ? "PENDING" : "APPROVED",
    steps: chain.map((role, i) => {
      const done = s.signedBy.includes(role);
      const event = done ? signedEvent(role) : undefined;
      return {
        order: i + 1,
        role,
        status: done ? "APPROVED" : role === signer ? "PENDING" : "WAITING",
        decidedBy: event?.by,
        decidedAt: event?.at,
      };
    }),
    evidenceRequired: false,
    evidence: [],
    version: s.signedBy.length + 1,
    history: c.history.filter((e) => /sign-off|Board informed|Settlement offer|returned/i.test(e.text)),
  };
}

function claimApprovals(): ApprovalRequest[] {
  return CLAIMS.filter((c) => c.settlement && (c.step === "SETTLEMENT" || c.closure?.outcome === "SETTLED")).map(claimApproval);
}

export async function listApprovals(): Promise<ApprovalRequest[]> {
  return [...APPROVALS, ...claimApprovals()].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export async function getApproval(id: string): Promise<ApprovalRequest | null> {
  return (await listApprovals()).find((r) => r.id === id) ?? null;
}

function saveApproval(updated: ApprovalRequest, by: string, event: string): ApprovalRequest {
  const saved = {
    ...updated,
    version: updated.version + 1,
    history: [...updated.history, { at: todayIso(), by, text: event }],
  };
  APPROVALS[APPROVALS.findIndex((r) => r.id === updated.id)] = saved;
  return saved;
}

export type DecisionInput = {
  decision: ApprovalDecision;
  comment: string;
  /** The request version the approver was looking at. */
  expectedVersion: number;
};

/** Approve, reject or return the current step (APR-02). */
export async function decideApproval(
  id: string,
  input: DecisionInput,
  actor: { name: string; role: string },
): Promise<ApprovalRequest> {
  const r = await getApproval(id);
  if (!r) throw new Error("This approval request could not be found.");
  if (r.version !== input.expectedVersion) {
    throw new Error("This request changed since you opened it. Close it and open it again to see the latest.");
  }
  if (!canDecide(r, actor.role)) throw new Error("This request is not waiting for your decision.");
  const comment = input.comment.trim();
  if (input.decision !== "APPROVE" && !comment) throw new Error("Say why, so the requester knows what to change.");

  // Claim settlements: the claim records the sign-off.
  if (r.subjectType === "CLAIM_SETTLEMENT") {
    if (input.decision === "REJECT") {
      throw new Error("A settlement cannot be rejected here. Return it to the handler with your reasons.");
    }
    if (input.decision === "APPROVE") await signClaimSettlement(r.subjectId, actor.role, actor.name);
    else await addClaimNote(r.subjectId, `Settlement sign-off returned by ${actor.role}: ${comment}`, actor.name);
    if (comment && input.decision === "APPROVE") {
      await addClaimNote(r.subjectId, `${actor.role} sign-off note: ${comment}`, actor.name);
    }
    return (await getApproval(id))!;
  }

  if (input.decision === "APPROVE") {
    const blocker = approveBlocker(r);
    if (blocker) throw new Error(blocker);
  }

  const step = currentStep(r)!;
  const status = { APPROVE: "APPROVED", REJECT: "REJECTED", RETURN: "RETURNED" }[input.decision] as ApprovalStep["status"];
  let steps = r.steps.map((s) =>
    s.order === step.order
      ? { ...s, status, decidedBy: actor.name, decidedAt: todayIso(), comment: comment || undefined }
      : s,
  );
  let requestStatus: ApprovalRequest["status"] = r.status;

  if (input.decision === "APPROVE") {
    // Board steps after an approval are informed, not asked.
    steps = steps.map((s) =>
      s.order > step.order && s.informOnly && s.status === "WAITING"
        ? { ...s, status: "INFORMED", decidedBy: actor.name, decidedAt: todayIso() }
        : s,
    );
    const next = steps.find((s) => s.status === "WAITING");
    if (next) steps = steps.map((s) => (s.order === next.order ? { ...s, status: "PENDING" } : s));
    else requestStatus = "APPROVED";
  } else {
    requestStatus = input.decision === "REJECT" ? "REJECTED" : "RETURNED";
  }

  const label = { APPROVE: "Approved", REJECT: "Rejected", RETURN: "Returned" }[input.decision];
  const saved = saveApproval({ ...r, steps, status: requestStatus }, actor.name, `${label} by ${step.role}`);

  // A fully approved renewal completes its Approval milestone.
  if (saved.status === "APPROVED" && saved.subjectType === "RENEWAL") {
    const renewal = RENEWAL_CASES.find((c) => c.id === saved.subjectId);
    if (renewal && currentMilestone(renewal)?.code === "APPROVAL") {
      saveRenewal({
        ...renewal,
        completed: [
          ...renewal.completed,
          {
            code: "APPROVAL",
            completedAt: todayIso(),
            completedBy: actor.name,
            note: `Approved through ${saved.id}`,
            evidence: saved.evidence.at(-1)?.name,
          },
        ],
      });
    }
  }
  return saved;
}

/** Send a returned request back for decision after it was fixed. The record's revision goes up. */
export async function resubmitApproval(id: string, note: string, by: string): Promise<ApprovalRequest> {
  const r = APPROVALS.find((x) => x.id === id);
  if (!r) throw new Error("This approval request could not be found.");
  if (r.status !== "RETURNED") throw new Error("Only a returned request can be sent again.");
  if (!note.trim()) throw new Error("Say what was changed.");
  const steps = r.steps.map((s, i) => ({ order: s.order, role: s.role, informOnly: s.informOnly, status: i === 0 ? "PENDING" : "WAITING" }) as ApprovalStep);
  return saveApproval(
    { ...r, steps, status: "PENDING", subjectRevision: r.subjectRevision + 1, dueAt: addWorkingDays(todayIso(), DECISION_DAYS) },
    by,
    `Sent again: ${note.trim()}`,
  );
}

export async function addApprovalEvidence(id: string, evidence: EvidenceRef, by: string): Promise<ApprovalRequest> {
  const r = APPROVALS.find((x) => x.id === id);
  if (!r) throw new Error("Evidence for this request is kept on the claim.");
  if (r.status === "APPROVED" || r.status === "REJECTED") throw new Error("This request is already decided.");
  return saveApproval({ ...r, evidence: [...r.evidence, evidence] }, by, `Evidence attached: ${evidence.name}`);
}

/** Ask for internal approval of a renewal's recommended quote (APR-01). */
export async function requestRenewalApproval(renewalId: string, by: string): Promise<ApprovalRequest> {
  const c = findRenewal(renewalId);
  if (currentMilestone(c)?.code !== "APPROVAL") throw new Error("This renewal is not at the approval step.");
  const live = APPROVALS.find((r) => r.subjectId === renewalId && r.status === "PENDING");
  if (live) return live; // the same request is never created twice
  const quote = c.quotes.find((q) => q.recommended);
  if (!quote) throw new Error("Recommend a quote first.");
  const rate = POLICY_TERMS[c.policyId]?.commissionRate ?? 0.15;
  const commission = Math.round(quote.premium * rate);
  const year = new Date().getFullYear();
  const highest = APPROVALS.reduce((max, r) => Math.max(max, Number(r.id.split("-").at(-1)) || 0), 0);
  const request: ApprovalRequest = {
    id: `APR-${year}-${String(highest + 1).padStart(3, "0")}`,
    subjectType: "RENEWAL",
    subjectId: c.id,
    subjectRef: c.id,
    subjectRevision: c.completed.length + c.quotes.length,
    title: `Renewal recommendation · ${c.classOfInsurance}`,
    summary: `Renew with ${quote.insurer} at RWF ${quote.premium.toLocaleString("en-US")} (${quote.terms}).`,
    clientId: c.clientId,
    client: c.client,
    amount: commission,
    amountLabel: "Annual commission",
    policyVersion: APPROVAL_POLICY_VERSION.RENEWAL,
    requestedBy: by,
    requestedAt: todayIso(),
    dueAt: addWorkingDays(todayIso(), DECISION_DAYS),
    status: "PENDING",
    steps: buildSteps(renewalApprovers(commission)),
    evidenceRequired: true,
    evidence: c.completed.find((m) => m.code === "QUOTES")?.evidence
      ? [{ name: c.completed.find((m) => m.code === "QUOTES")!.evidence!, version: 1 }]
      : [],
    version: 1,
    history: [{ at: todayIso(), by, text: "Approval requested" }],
  };
  APPROVALS.unshift(request);
  return request;
}

/** The latest approval request for a renewal, if any. */
export async function renewalApproval(renewalId: string): Promise<ApprovalRequest | null> {
  return APPROVALS.find((r) => r.subjectType === "RENEWAL" && r.subjectId === renewalId) ?? null;
}

/* ---------------------------------- My Work ---------------------------------- */
// Mock version of WFL-02/WFL-04 (Christian). System tasks are built from the
// claims, renewals and approvals and close when the record moves on; a task
// cannot move a record forward by itself. Manual tasks are completed by hand.

/** Reassignments, by task key, kept in memory until refresh. */
const TASK_ASSIGNMENTS = new Map<string, { owner: string; history: ClaimEvent[] }>();

function claimTask(c: Claim): WorkTask | null {
  if (isClosed(c)) return null;
  const due = dueDate(c) ?? todayIso();
  const base = {
    resourceType: "CLAIM" as const,
    resourceId: c.id,
    resourceRef: c.id,
    client: c.client,
    dueDate: due,
    status: "OPEN" as const,
    source: "SYSTEM" as const,
    createdAt: c.stepStartedAt,
    history: [],
  };
  if (isDisputed(c)) {
    return {
      ...base,
      id: `T-${c.id}-DISPUTE`,
      key: `CLAIM:${c.id}:DISPUTE`,
      type: "CLAIM_DISPUTE",
      title: "Claims Committee decision",
      detail: c.dispute!.reason,
      ownerRole: "DMD",
    };
  }
  // Sign-offs appear as approval tasks instead.
  if (c.step === "SETTLEMENT" && nextSigner(c)) return null;
  const missing = missingDocuments(c).length;
  const titles: Record<Claim["step"], string> = {
    REGISTER: "Confirm the claim registration",
    DOCUMENTS: `Collect ${missing} missing ${missing === 1 ? "document" : "documents"}`,
    SUBMIT: `Submit the claim to ${c.insurer}`,
    FOLLOW_UP: needsEscalation(c) ? `Escalate: no response from ${c.insurer}` : `Follow up with ${c.insurer}`,
    SETTLEMENT: "Record the payment to the client",
    CLOSE: "Close with the discharge voucher",
  };
  return {
    ...base,
    id: `T-${c.id}-${c.step}`,
    key: `CLAIM:${c.id}:${c.step}`,
    type: c.step === "FOLLOW_UP" ? "CLAIM_FOLLOW_UP" : "CLAIM_STEP",
    title: titles[c.step],
    detail: claimBlocker(c) ?? undefined,
    owner: c.handler,
  };
}

function renewalTask(r: RenewalCase, pendingApproval: boolean): WorkTask | null {
  const m = currentMilestone(r);
  if (!m || (m.code === "APPROVAL" && pendingApproval)) return null;
  return {
    id: `T-${r.id}-${m.code}`,
    key: `RENEWAL:${r.id}:${m.code}`,
    type: "RENEWAL_MILESTONE",
    title: m.code === "APPROVAL" ? "Request internal approval" : m.name,
    detail: `${r.policyId} · ${r.classOfInsurance} · ${m.output}`,
    resourceType: "RENEWAL",
    resourceId: r.id,
    resourceRef: r.id,
    client: r.client,
    owner: r.owner,
    dueDate: milestoneDue(r, m),
    status: "OPEN",
    source: "SYSTEM",
    createdAt: todayIso(),
    history: [],
  };
}

function approvalTask(r: ApprovalRequest): WorkTask | null {
  const step = currentStep(r);
  if (!step) return null;
  return {
    id: `T-${r.id}-${step.order}`,
    key: `APPROVAL:${r.id}:${step.order}`,
    type: "APPROVAL",
    title: `Decide: ${r.title}`,
    detail: `${r.subjectRef}${r.amount ? ` · ${r.amountLabel} RWF ${r.amount.toLocaleString("en-US")}` : ""}`,
    resourceType: "APPROVAL",
    resourceId: r.id,
    resourceRef: r.id,
    client: r.client,
    ownerRole: actingRole(step.role),
    dueDate: r.dueAt,
    status: "OPEN",
    source: "SYSTEM",
    createdAt: r.requestedAt,
    history: [],
  };
}

export async function listTasks(): Promise<WorkTask[]> {
  const approvals = await listApprovals();
  const pendingRenewals = new Set(approvals.filter((a) => a.subjectType === "RENEWAL" && a.status === "PENDING").map((a) => a.subjectId));
  const system = [
    ...CLAIMS.map(claimTask),
    ...RENEWAL_CASES.map((r) => renewalTask(r, pendingRenewals.has(r.id))),
    ...approvals.map(approvalTask),
  ].filter((t): t is WorkTask => t !== null);

  return [...system, ...MANUAL_TASKS].map((t) => {
    const assigned = TASK_ASSIGNMENTS.get(t.key);
    if (!assigned) return t;
    return { ...t, owner: assigned.owner, ownerRole: undefined, history: [...t.history, ...assigned.history] };
  });
}

/** Names that tasks can be assigned to. */
export async function listAssignees(): Promise<string[]> {
  const names = new Set<string>([
    ...CLAIMS.map((c) => c.handler),
    ...RENEWAL_CASES.map((r) => r.owner),
    ...MANUAL_TASKS.flatMap((t) => (t.owner ? [t.owner] : [])),
  ]);
  return [...names].sort();
}

export async function reassignTask(key: string, owner: string, by: string): Promise<void> {
  if (!owner) throw new Error("Choose who should do this.");
  const index = MANUAL_TASKS.findIndex((t) => t.key === key);
  if (index >= 0) {
    // Manual tasks keep one history, in order.
    const t = MANUAL_TASKS[index]!;
    if (t.status === "DONE") throw new Error("This task is already done.");
    MANUAL_TASKS[index] = { ...t, owner, ownerRole: undefined, history: [...t.history, { at: todayIso(), by, text: `Reassigned to ${owner}` }] };
    return;
  }
  const previous = TASK_ASSIGNMENTS.get(key);
  TASK_ASSIGNMENTS.set(key, {
    owner,
    history: [...(previous?.history ?? []), { at: todayIso(), by, text: `Reassigned to ${owner}` }],
  });
}

export async function completeTask(id: string, note: string, by: string): Promise<void> {
  const index = MANUAL_TASKS.findIndex((t) => t.id === id);
  if (index < 0) throw new Error("This task closes by itself when the record moves on. Open the record to do the work.");
  const t = MANUAL_TASKS[index]!;
  if (t.status === "DONE") throw new Error("This task is already done.");
  MANUAL_TASKS[index] = {
    ...t,
    status: "DONE",
    completedAt: todayIso(),
    completedBy: by,
    history: [...t.history, { at: todayIso(), by, text: note.trim() ? `Completed: ${note.trim()}` : "Completed" }],
  };
}

export type NewTaskInput = Pick<WorkTask, "title" | "detail" | "resourceType" | "resourceId" | "resourceRef" | "client" | "owner" | "dueDate">;

export async function createTask(input: NewTaskInput, by: string): Promise<WorkTask> {
  if (!input.title.trim()) throw new Error("Say what needs to be done.");
  if (!input.owner) throw new Error("Choose who should do this.");
  if (!input.dueDate) throw new Error("Choose a due date.");
  const highest = MANUAL_TASKS.reduce((max, t) => Math.max(max, Number(t.id.split("-").at(-1)) || 0), 100);
  const id = `TSK-${String(highest + 1).padStart(4, "0")}`;
  const task: WorkTask = {
    ...input,
    title: input.title.trim(),
    id,
    key: `MANUAL:${id}`,
    type: "MANUAL",
    status: "OPEN",
    source: "MANUAL",
    createdAt: todayIso(),
    history: [{ at: todayIso(), by, text: "Task created" }],
  };
  MANUAL_TASKS.unshift(task);
  return task;
}

/* ------------------------------- Policy detail ------------------------------- */
// Mock version of POL-02 to POL-05 (TC). Balance and commission are worked
// out here, as the backend will: balance = total premium − amount paid,
// commission = net premium × commission rate.

export function policyFinancials(p: Policy): PolicyFinancials {
  const terms = POLICY_TERMS[p.id];
  const netPremium = p.netPremium ?? terms?.netPremium ?? null;
  const amountPaid = p.amountPaid ?? terms?.amountPaid ?? null;
  const commissionRate = p.commissionRate ?? terms?.commissionRate ?? null;
  return {
    sumInsured: p.sumInsured ?? null,
    totalPremium: p.premium ?? null,
    netPremium,
    amountPaid,
    commissionRate,
    balance: amountPaid === null || p.premium === undefined ? null : p.premium - amountPaid,
    commission: netPremium === null || commissionRate === null ? null : Math.round(netPremium * commissionRate),
  };
}

export async function getPolicyDetail(policyId: string): Promise<PolicyDetail | null> {
  const client = allKnownClients().find((c) => c.policies.some((p) => sameText(p.id, policyId)));
  if (!client) return null;
  const policy = client.policies.find((p) => sameText(p.id, policyId))!;
  const terms = POLICY_TERMS[policy.id];
  const financials = policyFinancials(policy);
  const earlier = terms?.earlierPeriods ?? [];

  const current: PolicyPeriod = {
    periodId: `PER-${policy.id}-current`,
    from: displayToIso(policy.start),
    to: displayToIso(policy.renewal),
    sumInsured: policy.sumInsured ?? null,
    netPremium: financials.netPremium,
    totalPremium: policy.premium ?? null,
    movement: earlier.length ? "RENEWAL" : "NEW",
    current: true,
  };
  const periods = [current, ...earlier.map((p) => ({ ...p, current: false }))];

  const movements: PolicyMovement[] = [
    ...periods.map((p) => ({
      id: `MOV-${p.periodId}`,
      date: p.from,
      type: p.movement,
      description:
        p.movement === "NEW"
          ? `Policy placed with ${policy.insurer}`
          : `Renewed for ${formatIsoRange(p.from, p.to)}`,
      by: "Imported",
    })),
    ...(terms?.movements ?? []),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return {
    policy,
    clientId: client.id,
    client: client.name,
    financials,
    periods,
    movements,
    claims: CLAIMS.filter((c) => c.policyId === policy.id).map(toClaimSummary),
    renewalCaseId: RENEWAL_CASES.find((r) => r.policyId === policy.id)?.id,
  };
}

function formatIsoRange(from: string, to: string) {
  return `${from.slice(0, 4)}–${to.slice(0, 4)}`;
}

/* --------------------------------- Documents --------------------------------- */
// Client documents use the backend (/api/v1/documents, DOC-01 to DOC-03),
// which only accepts CLIENT records so far. Everything else, and demo mode,
// keeps files in this browser tab until refresh.

/** The backend's rules: PDF, PNG or JPEG, up to 10 MB (document.upload.max-bytes). */
export const DOCUMENT_RULES = {
  maxBytes: 10 * 1024 * 1024,
  mediaTypes: ["application/pdf", "image/png", "image/jpeg"],
  accept: ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg",
};

const LOCAL_DOCUMENTS = new Map<string, StoredDocument[]>([
  [
    "POLICY:POL-2025-412",
    [
      {
        id: "doc-412-schedule",
        version: 2,
        originalFileName: "Policy schedule 2025-26.pdf",
        mediaType: "application/pdf",
        sizeBytes: 482113,
        classification: "POLICY_SCHEDULE",
        purpose: "POLICY_SCHEDULE",
        uploadedAt: "2025-09-24T09:12:00Z",
        previous: [{ version: 1, originalFileName: "Policy schedule draft.pdf", uploadedAt: "2025-09-19T15:40:00Z" }],
      },
    ],
  ],
]);
const LOCAL_FILES = new Map<string, Blob>();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function usesDocumentBackend(subject: DocumentSubject) {
  return !MOCK_AUTH && subject.type === "CLIENT" && UUID_PATTERN.test(subject.id);
}

function subjectKey(subject: DocumentSubject) {
  return `${subject.type}:${subject.id}`;
}

/** Checks a file before upload, with the same rules as the backend. */
export function documentProblem(file: File): string | null {
  if (file.size === 0) return "This file is empty.";
  if (file.size > DOCUMENT_RULES.maxBytes) return "This file is larger than 10 MB.";
  if (file.type && !DOCUMENT_RULES.mediaTypes.includes(file.type)) return "Only PDF, PNG or JPEG files can be uploaded.";
  if (!file.type && !/\.(pdf|png|jpe?g)$/i.test(file.name)) return "Only PDF, PNG or JPEG files can be uploaded.";
  return null;
}

async function documentError(res: Response, fallback: string) {
  const problem = await readProblem(res);
  if (res.status === 401) return "Your session has ended. Please sign in again.";
  if (res.status === 403) return "You do not have permission to upload or read documents here.";
  if (res.status === 409) return "Someone else replaced this file. Refresh the list and try again.";
  if (res.status === 413 || problem.code === "FILE_TOO_LARGE") return "This file is larger than 10 MB.";
  if (res.status === 415 || problem.code === "UNSUPPORTED_FILE_TYPE") return "Only PDF, PNG or JPEG files can be uploaded.";
  return fallback;
}

type BackendDocumentItem = {
  id: string;
  version: number;
  originalFileName: string;
  mediaType: string;
  sizeBytes: number;
  classification: DocumentClassification;
  uploadedAt: string;
  purpose?: string;
};

/** Groups versions of the same document: the newest is shown, older ones go in "previous". */
function groupVersions(items: BackendDocumentItem[]): StoredDocument[] {
  const byId = new Map<string, BackendDocumentItem[]>();
  for (const item of items) byId.set(item.id, [...(byId.get(item.id) ?? []), item]);
  return [...byId.values()]
    .map((versions) => {
      const sorted = [...versions].sort((a, b) => b.version - a.version);
      const latest = sorted[0]!;
      return {
        ...latest,
        purpose: latest.purpose ?? "",
        previous: sorted.slice(1).map((v) => ({ version: v.version, originalFileName: v.originalFileName, uploadedAt: v.uploadedAt })),
      };
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function listDocuments(subject: DocumentSubject): Promise<StoredDocument[]> {
  if (!usesDocumentBackend(subject)) return [...(LOCAL_DOCUMENTS.get(subjectKey(subject)) ?? [])];
  const params = new URLSearchParams({ subjectType: subject.type, subjectId: subject.id, size: "100" });
  const res = await apiFetch(`/api/v1/documents?${params}`);
  if (!res.ok) throw new Error(await documentError(res, "Could not load the documents."));
  return groupVersions(((await res.json()) as { items: BackendDocumentItem[] }).items ?? []);
}

export type UploadOptions = { classification: DocumentClassification; purpose: string };

export async function uploadDocument(subject: DocumentSubject, file: File, options: UploadOptions): Promise<StoredDocument> {
  const problem = documentProblem(file);
  if (problem) throw new Error(problem);

  if (!usesDocumentBackend(subject)) {
    const doc: StoredDocument = {
      id: crypto.randomUUID(),
      version: 1,
      originalFileName: file.name,
      mediaType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      classification: options.classification,
      purpose: options.purpose,
      uploadedAt: new Date().toISOString(),
      previous: [],
    };
    LOCAL_FILES.set(`${doc.id}:1`, file);
    LOCAL_DOCUMENTS.set(subjectKey(subject), [doc, ...(LOCAL_DOCUMENTS.get(subjectKey(subject)) ?? [])]);
    return doc;
  }

  const body = new FormData();
  body.append("file", file);
  const params = new URLSearchParams({
    subjectType: subject.type,
    subjectId: subject.id,
    purpose: options.purpose,
    classification: options.classification,
  });
  const res = await apiFetch(`/api/v1/documents?${params}`, { method: "POST", body });
  if (!res.ok) throw new Error(await documentError(res, "Could not upload the file. Please try again."));
  const view = (await res.json()) as BackendDocumentItem;
  return { ...view, purpose: options.purpose, previous: [] };
}

/** Upload a replacement. The old file stays available as an earlier version (DOC-03). */
export async function replaceDocument(subject: DocumentSubject, doc: StoredDocument, file: File): Promise<StoredDocument> {
  const problem = documentProblem(file);
  if (problem) throw new Error(problem);

  if (!usesDocumentBackend(subject)) {
    const list = LOCAL_DOCUMENTS.get(subjectKey(subject)) ?? [];
    const current = list.find((d) => d.id === doc.id);
    if (!current || current.version !== doc.version) throw new Error("Someone else replaced this file. Refresh the list and try again.");
    const next: StoredDocument = {
      ...current,
      version: current.version + 1,
      originalFileName: file.name,
      mediaType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
      previous: [{ version: current.version, originalFileName: current.originalFileName, uploadedAt: current.uploadedAt }, ...current.previous],
    };
    LOCAL_FILES.set(`${doc.id}:${next.version}`, file);
    LOCAL_DOCUMENTS.set(subjectKey(subject), list.map((d) => (d.id === doc.id ? next : d)));
    return next;
  }

  const body = new FormData();
  body.append("file", file);
  const params = new URLSearchParams({
    expectedVersion: String(doc.version),
    subjectType: subject.type,
    subjectId: subject.id,
    purpose: doc.purpose,
    classification: doc.classification,
  });
  const res = await apiFetch(`/api/v1/documents/${doc.id}/versions?${params}`, { method: "PUT", body });
  if (!res.ok) throw new Error(await documentError(res, "Could not replace the file. Please try again."));
  const view = (await res.json()) as BackendDocumentItem;
  return {
    ...view,
    purpose: doc.purpose,
    previous: [{ version: doc.version, originalFileName: doc.originalFileName, uploadedAt: doc.uploadedAt }, ...doc.previous],
  };
}

/** Download an exact version of a document. */
export async function downloadDocument(
  subject: DocumentSubject,
  doc: StoredDocument,
  version = doc.version,
): Promise<void> {
  const name = version === doc.version ? doc.originalFileName : doc.previous.find((p) => p.version === version)?.originalFileName ?? doc.originalFileName;
  let blob: Blob | undefined;
  if (!usesDocumentBackend(subject)) {
    blob = LOCAL_FILES.get(`${doc.id}:${version}`);
    if (!blob) throw new Error("This is a sample record; there is no file to download.");
  } else {
    const params = new URLSearchParams({ subjectType: subject.type, subjectId: subject.id, purpose: doc.purpose });
    const res = await apiFetch(`/api/v1/documents/${doc.id}/versions/${version}/content?${params}`);
    if (!res.ok) throw new Error(await documentError(res, "Could not download the file."));
    blob = await res.blob();
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------- Administration ------------------------------ */
// Connected to the backend's /api/v1/admin endpoints (TC). In demo mode the
// same rules run on sample data in memory. Backend rules the screens follow:
// an account is Business or Administration for good, and all its roles must
// match; nobody changes their own account; the last active administrator
// stays; the built-in ADMINISTRATOR role cannot be edited; nobody changes the
// permissions of a role they hold; every change needs a reason (audit log).

type AdminProblem = { status?: number; code?: string; fields?: string[] };

const ADMIN_MESSAGES: Record<string, string> = {
  DUPLICATE: "An account or role with these details already exists.",
  ACCOUNT_CATEGORY_MISMATCH: "An account's roles must all be Business roles or all Administration roles.",
  ROLE_CATEGORY_MISMATCH: "A Business role can only have Business permissions, and an Administration role only Administration ones.",
  SELF_OPERATION: "You can't change or deactivate your own account. Ask another administrator.",
  LAST_ADMINISTRATOR: "This is the last active administrator, so it must keep the administrator role.",
  STALE_VERSION: "Someone else changed this just now. Close it and open it again to see the latest.",
  INVALID_TRANSITION: "This account can't do that in its current state.",
  PROTECTED_ROLE: "The built-in System Administrator role can't be edited.",
  SELF_ROLE_GRANTS: "You can't change the permissions of a role you hold yourself.",
  FORBIDDEN_GRANT: "You can only grant administration permissions that you hold yourself.",
  UNKNOWN_ROLE: "One of the roles no longer exists. Refresh the page.",
  UNKNOWN_PERMISSION: "One of the permissions no longer exists. Refresh the page.",
  ACCESS_DENIED: "You do not have permission to do this.",
};

async function adminError(res: Response, fallback: string): Promise<string> {
  const problem = (await readProblem(res)) as AdminProblem;
  if (res.status === 401) return "Your session has ended. Please sign in again.";
  if (res.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  if (problem.code && ADMIN_MESSAGES[problem.code]) return ADMIN_MESSAGES[problem.code]!;
  if (res.status === 403) return ADMIN_MESSAGES.ACCESS_DENIED!;
  if (res.status === 400 && problem.fields?.length) return `Please check these fields: ${problem.fields.join(", ")}.`;
  return fallback;
}

/** Loads every page of an admin list (the backend allows at most 100 per page). */
async function allPages<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 0; page < 50; page++) {
    const res = await apiFetch(`${path}?page=${page}&size=100`);
    if (!res.ok) throw new Error(await adminError(res, "Could not load the list."));
    const data = (await res.json()) as { items: T[]; totalPages: number };
    items.push(...(data.items ?? []));
    if (page + 1 >= (data.totalPages ?? 1)) break;
  }
  return items;
}

async function adminSend<T>(path: string, body: unknown, fallback: string): Promise<T | null> {
  const res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await adminError(res, fallback));
  return res.status === 202 || res.status === 204 ? null : ((await res.json()) as T);
}

function requireReason(reason: string) {
  if (!reason.trim()) throw new Error("Give a reason. It is kept in the audit log.");
}

/** The signed-in admin's account ID, used for the "not your own account" rule. */
export function adminSelfId(user: SessionUser): string | undefined {
  return MOCK_AUTH ? DEMO_ADMIN_ID : user.id;
}

/* Demo-mode store and checks, mirroring the backend. */

const DEMO = { users: USERS_DATA, roles: ROLES_DATA };

function demoAccount(id: string) {
  const found = DEMO.users.find((u) => u.id === id);
  if (!found) throw new Error("This account could not be found.");
  return found;
}

function demoCheckRoles(codes: string[], category: AccessCategory) {
  if (codes.length === 0) throw new Error("Choose at least one role.");
  const roles = codes.map((c) => DEMO.roles.find((r) => r.code === c));
  if (roles.some((r) => !r)) throw new Error(ADMIN_MESSAGES.UNKNOWN_ROLE);
  if (roles.some((r) => r!.category !== category)) throw new Error(ADMIN_MESSAGES.ACCOUNT_CATEGORY_MISMATCH);
}

function demoSaveUser(updated: ManagedUser): ManagedUser {
  const saved = { ...updated, version: updated.version + 1, updatedAt: new Date().toISOString() };
  DEMO.users[DEMO.users.findIndex((u) => u.id === updated.id)] = saved;
  return saved;
}

function demoActiveAdmins() {
  return DEMO.users.filter((u) => u.status === "ACTIVE" && u.roles.includes("ADMINISTRATOR")).length;
}

/* Users */

export async function listManagedUsers(): Promise<ManagedUser[]> {
  if (MOCK_AUTH) return [...DEMO.users];
  return allPages<ManagedUser>("/api/v1/admin/users");
}

export type InviteInput = { email: string; fullName: string; roles: string[]; category: AccessCategory; reason: string };

/** Creates the account and emails the person a link to set their password. */
export async function inviteUser(input: InviteInput): Promise<ManagedUser> {
  requireReason(input.reason);
  if (MOCK_AUTH) {
    demoCheckRoles(input.roles, input.category);
    if (DEMO.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) {
      throw new Error("Someone with this email already has an account.");
    }
    const now = new Date().toISOString();
    const created: ManagedUser = {
      id: crypto.randomUUID(),
      email: input.email.trim().toLowerCase(),
      fullName: input.fullName.trim(),
      status: "INVITED",
      profileCategory: input.category,
      roles: input.roles,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    DEMO.users.unshift(created);
    return created;
  }
  const created = await adminSend<ManagedUser>(
    "/api/v1/admin/users",
    { email: input.email.trim().toLowerCase(), fullName: input.fullName.trim(), roles: input.roles, reason: input.reason.trim() },
    // The backend answers a non-staff email (e.g. a personal Gmail) with a plain 400.
    "Check the details. The email must be a GRAL staff address (for example name@globalrisk.rw); personal emails are not accepted.",
  );
  return created!;
}

export async function resendInvitation(u: ManagedUser): Promise<void> {
  if (MOCK_AUTH) {
    const current = demoAccount(u.id);
    if (current.version !== u.version) throw new Error(ADMIN_MESSAGES.STALE_VERSION);
    if (current.status !== "INVITED") throw new Error("Only people who have not accepted their invitation yet can get a new one.");
    demoSaveUser(current);
    return;
  }
  await adminSend(`/api/v1/admin/users/${u.id}/resend-invitation`, { version: u.version }, "Could not resend the invitation.");
}

export async function assignUserRoles(u: ManagedUser, roles: string[], reason: string, selfId?: string): Promise<ManagedUser> {
  requireReason(reason);
  if (MOCK_AUTH) {
    const current = demoAccount(u.id);
    if (current.version !== u.version) throw new Error(ADMIN_MESSAGES.STALE_VERSION);
    if (current.id === selfId) throw new Error(ADMIN_MESSAGES.SELF_OPERATION);
    demoCheckRoles(roles, current.profileCategory);
    if (current.roles.includes("ADMINISTRATOR") && !roles.includes("ADMINISTRATOR") && current.status === "ACTIVE" && demoActiveAdmins() <= 1) {
      throw new Error(ADMIN_MESSAGES.LAST_ADMINISTRATOR);
    }
    return demoSaveUser({ ...current, roles });
  }
  const saved = await adminSend<ManagedUser>(
    `/api/v1/admin/users/${u.id}/assign-roles`,
    { version: u.version, roles, reason: reason.trim() },
    "Could not change the roles.",
  );
  return saved!;
}

export async function deactivateUser(u: ManagedUser, selfId?: string): Promise<ManagedUser> {
  if (MOCK_AUTH) {
    const current = demoAccount(u.id);
    if (current.version !== u.version) throw new Error(ADMIN_MESSAGES.STALE_VERSION);
    if (current.id === selfId) throw new Error(ADMIN_MESSAGES.SELF_OPERATION);
    if (current.status === "INACTIVE") throw new Error("This account is already deactivated.");
    if (current.roles.includes("ADMINISTRATOR") && current.status === "ACTIVE" && demoActiveAdmins() <= 1) {
      throw new Error(ADMIN_MESSAGES.LAST_ADMINISTRATOR);
    }
    return demoSaveUser({ ...current, status: "INACTIVE" });
  }
  const saved = await adminSend<ManagedUser>(
    `/api/v1/admin/users/${u.id}/deactivate`,
    { version: u.version },
    "Could not deactivate the account.",
  );
  return saved!;
}

/* Roles and permissions */

export async function listManagedRoles(): Promise<ManagedRole[]> {
  if (MOCK_AUTH) return [...DEMO.roles];
  return allPages<ManagedRole>("/api/v1/admin/roles");
}

export async function listPermissionDefinitions(): Promise<PermissionDefinition[]> {
  if (MOCK_AUTH) return [...PERMISSIONS];
  const res = await apiFetch("/api/v1/admin/permissions");
  if (!res.ok) throw new Error(await adminError(res, "Could not load the permissions."));
  return (await res.json()) as PermissionDefinition[];
}

function demoCheckPermissions(codes: string[], category: AccessCategory) {
  const defs = codes.map((c) => PERMISSIONS.find((p) => p.code === c));
  if (defs.some((d) => !d)) throw new Error(ADMIN_MESSAGES.UNKNOWN_PERMISSION);
  if (defs.some((d) => d!.category !== category)) throw new Error(ADMIN_MESSAGES.ROLE_CATEGORY_MISMATCH);
}

export type RoleInput = { code: string; name: string; category: AccessCategory; permissions: string[]; reason: string };

export async function createRole(input: RoleInput): Promise<ManagedRole> {
  requireReason(input.reason);
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(input.code)) {
    throw new Error("The code must start with a letter and use only capital letters, numbers and underscores.");
  }
  if (MOCK_AUTH) {
    if (DEMO.roles.some((r) => r.code === input.code)) throw new Error("A role with this code already exists.");
    demoCheckPermissions(input.permissions, input.category);
    const created: ManagedRole = { id: crypto.randomUUID(), code: input.code, name: input.name.trim(), category: input.category, permissions: input.permissions, version: 0 };
    DEMO.roles.push(created);
    return created;
  }
  const created = await adminSend<ManagedRole>(
    "/api/v1/admin/roles",
    { code: input.code, name: input.name.trim(), category: input.category, permissions: input.permissions, reason: input.reason.trim() },
    "Could not create the role.",
  );
  return created!;
}

export async function updateRole(
  role: ManagedRole,
  input: { name: string; permissions: string[]; reason: string },
  heldRoleCodes: string[] = [],
): Promise<ManagedRole> {
  requireReason(input.reason);
  if (MOCK_AUTH) {
    const index = DEMO.roles.findIndex((r) => r.id === role.id);
    const current = DEMO.roles[index];
    if (!current) throw new Error(ADMIN_MESSAGES.UNKNOWN_ROLE);
    if (current.version !== role.version) throw new Error(ADMIN_MESSAGES.STALE_VERSION);
    if (current.code === "ADMINISTRATOR") throw new Error(ADMIN_MESSAGES.PROTECTED_ROLE);
    const changed = [...current.permissions].sort().join() !== [...input.permissions].sort().join();
    if (changed && heldRoleCodes.includes(current.code)) throw new Error(ADMIN_MESSAGES.SELF_ROLE_GRANTS);
    demoCheckPermissions(input.permissions, current.category);
    const saved = { ...current, name: input.name.trim(), permissions: input.permissions, version: current.version + 1 };
    DEMO.roles[index] = saved;
    return saved;
  }
  const saved = await adminSend<ManagedRole>(
    `/api/v1/admin/roles/${role.id}/update`,
    { version: role.version, name: input.name.trim(), permissions: input.permissions, reason: input.reason.trim() },
    "Could not save the role.",
  );
  return saved!;
}

/* --------------------------------- Calendar ---------------------------------- */
// The backend's Rwanda business calendar (WFL-01). Any signed-in user can read
// it. Until its holiday list is loaded, the official list in holidays.ts is used.

type BackendCalendar = { today: string; timeZone: string; holidays: { date: string; label: string }[] };

export async function getHolidays(): Promise<Holiday[]> {
  if (MOCK_AUTH) return RWANDA_HOLIDAYS;
  try {
    const res = await apiFetch("/api/v1/workflow/calendar");
    if (!res.ok) return RWANDA_HOLIDAYS;
    const calendar = (await res.json()) as BackendCalendar;
    return calendar.holidays?.length ? calendar.holidays : RWANDA_HOLIDAYS;
  } catch {
    return RWANDA_HOLIDAYS;
  }
}

/* --------------------------------- Overview ---------------------------------- */

/** Short claim rows for the Overview, search and client file (open claims only). */
export async function listClaimsSummary(): Promise<ClientClaim[]> {
  return CLAIMS.filter((c) => !isClosed(c)).map(toClaimSummary);
}

function toClaimSummary(c: Claim): ClientClaim {
  const sla = claimSla(c);
  return {
    id: c.id,
    client: c.client,
    classOfInsurance: c.classOfInsurance,
    amount: c.amount,
    step: stepDef(c.step).n,
    stage: stageLabel(c),
    sla: sla === "closed" ? "ontrack" : sla,
  };
}

/* ---------------------------------- Claims ----------------------------------- */
// Mock versions following GRAL's SOP; changes are kept in memory until the
// page is refreshed. Backend: CLM-01 to CLM-07 (Christian). The backend must
// enforce the same rules: documents before submission, follow-ups every 10
// working days, disputes decided by the Claims Committee, sign-off before
// payment, and evidence to close. Every change is added to the claim history.

function findClaim(id: string): Claim {
  const found = CLAIMS.find((c) => c.id === id);
  if (!found) throw new Error("This claim could not be found.");
  return found;
}

function saveClaim(updated: Claim, by: string, event: string): Claim {
  const withHistory = { ...updated, history: [...updated.history, { at: todayIso(), by, text: event }] };
  CLAIMS[CLAIMS.findIndex((c) => c.id === updated.id)] = withHistory;
  return withHistory;
}

function requireOpen(c: Claim) {
  if (isClosed(c)) throw new Error("This claim is closed.");
}

export async function listClaims(): Promise<Claim[]> {
  return [...CLAIMS];
}

export type NewClaimInput = {
  clientId: string;
  client: string;
  policyId?: string;
  classOfInsurance: string;
  insurer: string;
  dateOfLoss: string;
  dateReported: string;
  amount: number;
  priority: ClaimPriority;
  handler: string;
  description: string;
};

/** Register a claim (step 1). Standard documents are added as the checklist. */
export async function createClaim(input: NewClaimInput, by: string): Promise<Claim> {
  if (input.dateOfLoss > todayIso()) throw new Error("The date of loss cannot be in the future.");
  if (input.dateReported < input.dateOfLoss) throw new Error("The claim cannot be reported before the loss happened.");
  const year = new Date().getFullYear();
  const highest = CLAIMS.reduce((max, c) => Math.max(max, Number(c.id.split("-").at(-1)) || 0), 0);
  const claim: Claim = {
    ...input,
    id: `CLM-${year}-${String(highest + 1).padStart(3, "0")}`,
    step: "REGISTER",
    stepStartedAt: todayIso(),
    documents: [
      { name: "Notification of loss", required: true },
      { name: "Supporting report (police, fire or medical)", required: true },
      { name: "Repair or replacement quotation", required: true },
    ],
    followUps: [],
    notes: [],
    history: [{ at: todayIso(), by, text: "Claim registered" }],
  };
  CLAIMS.unshift(claim);
  return claim;
}

/** Step 1 → 2: registration checked, start collecting documents. */
export async function confirmClaimRegistration(id: string, by: string): Promise<Claim> {
  const c = findClaim(id);
  requireOpen(c);
  if (c.step !== "REGISTER") throw new Error("This claim is already registered.");
  return saveClaim({ ...c, step: "DOCUMENTS", stepStartedAt: todayIso() }, by, "Registration confirmed; moved to Documents");
}

export async function fileClaimDocument(id: string, name: string, evidence: string, by: string): Promise<Claim> {
  const c = findClaim(id);
  requireOpen(c);
  const documents = c.documents.map((d) => (d.name === name ? { ...d, filedAt: todayIso(), evidence } : d));
  return saveClaim({ ...c, documents }, by, `${name} received`);
}

/** Step 2 → 3: only once every required document is in. */
export async function markClaimReadyToSubmit(id: string, by: string): Promise<Claim> {
  const c = findClaim(id);
  requireOpen(c);
  const missing = missingDocuments(c);
  if (missing.length) throw new Error(`Still missing: ${missing.map((d) => d.name).join(", ")}.`);
  return saveClaim({ ...c, step: "SUBMIT", stepStartedAt: todayIso() }, by, "All documents received; moved to Submit");
}

/** Step 3 → 4: submitted to the insurer with the formal intimation letter. */
export async function submitClaimToInsurer(
  id: string,
  input: { insurerClaimNo?: string; evidence: string },
  by: string,
): Promise<Claim> {
  const c = findClaim(id);
  requireOpen(c);
  if (c.step !== "SUBMIT") throw new Error("This claim is not ready to submit.");
  return saveClaim(
    { ...c, step: "FOLLOW_UP", stepStartedAt: todayIso(), submission: { submittedAt: todayIso(), ...input } },
    by,
    `Submitted to ${c.insurer}`,
  );
}

export async function logClaimFollowUp(id: string, input: Omit<ClaimFollowUp, "date" | "by">, by: string): Promise<Claim> {
  const c = findClaim(id);
  requireOpen(c);
  const followUp: ClaimFollowUp = { ...input, date: todayIso(), by };
  return saveClaim(
    { ...c, followUps: [...c.followUps, followUp] },
    by,
    `Follow-up by ${input.channel.toLowerCase()}${input.insurerResponded ? " (insurer responded)" : " (no response)"}`,
  );
}

/** Step 4 → 5: the insurer offered a settlement. */
export async function recordSettlementOffer(id: string, amount: number, by: string): Promise<Claim> {
  const c = findClaim(id);
  requireOpen(c);
  if (c.step !== "FOLLOW_UP" || isDisputed(c)) throw new Error("A settlement can only be recorded during follow-up.");
  if (!(amount > 0)) throw new Error("Enter the settlement amount.");
  return saveClaim(
    { ...c, step: "SETTLEMENT", stepStartedAt: todayIso(), settlement: { advisedAt: todayIso(), amount, signedBy: [] } },
    by,
    `Settlement offer of RWF ${amount.toLocaleString("en-US")} recorded`,
  );
}

/** The insurer rejected the claim: it goes to the Claims Committee. */
export async function recordInsurerRejection(id: string, reason: string, by: string): Promise<Claim> {
  const c = findClaim(id);
  requireOpen(c);
  if (c.step !== "FOLLOW_UP" || isDisputed(c)) throw new Error("A rejection can only be recorded during follow-up.");
  if (!reason.trim()) throw new Error("Give the insurer's reason for rejecting.");
  return saveClaim({ ...c, dispute: { raisedAt: todayIso(), reason } }, by, "Insurer rejected the claim; sent to Claims Committee");
}

/** Claims Committee decision: appeal (back to follow-up) or accept the rejection (close). */
export async function decideDispute(
  id: string,
  input: { decision: "APPEAL" | "ACCEPT_REJECTION"; note: string; evidence?: string },
  by: string,
): Promise<Claim> {
  const c = findClaim(id);
  requireOpen(c);
  if (!isDisputed(c)) throw new Error("This claim is not waiting for a committee decision.");
  if (!input.note.trim()) throw new Error("Record the committee's reasons.");
  const dispute = { ...c.dispute!, decision: input.decision, decidedAt: todayIso(), decidedBy: by, note: input.note };
  if (input.decision === "APPEAL") {
    return saveClaim({ ...c, dispute, stepStartedAt: todayIso() }, by, "Claims Committee decided to appeal; back to follow-up");
  }
  if (!input.evidence?.trim()) throw new Error("Attach the committee decision record.");
  return saveClaim(
    {
      ...c,
      dispute,
      step: "CLOSE",
      stepStartedAt: todayIso(),
      closure: { closedAt: todayIso(), by, outcome: "REJECTION_ACCEPTED", evidence: input.evidence },
    },
    by,
    "Claims Committee accepted the rejection; claim closed",
  );
}

/** Settlement sign-off by the next role in the chain. */
export async function signClaimSettlement(id: string, role: string, by: string): Promise<Claim> {
  const c = findClaim(id);
  requireOpen(c);
  const signer = nextSigner(c);
  if (!signer) throw new Error("Sign-off is already complete.");
  if (signer !== role && !(signer === "Board" && role === "MD")) {
    throw new Error(`This needs ${signer} sign-off.`);
  }
  return saveClaim(
    { ...c, settlement: { ...c.settlement!, signedBy: [...c.settlement!.signedBy, signer] } },
    by,
    signer === "Board" ? "Board informed (recorded by MD)" : `${signer} sign-off given`,
  );
}

/** Step 5 → 6: payment passed to the client, after full sign-off. */
export async function recordPaidToClient(id: string, evidence: string, by: string): Promise<Claim> {
  const c = findClaim(id);
  requireOpen(c);
  if (c.step !== "SETTLEMENT" || !c.settlement) throw new Error("This claim is not at settlement.");
  if (nextSigner(c)) throw new Error(`Waiting for ${nextSigner(c)} sign-off.`);
  if (!evidence.trim()) throw new Error("Attach the payment advice.");
  return saveClaim(
    { ...c, step: "CLOSE", stepStartedAt: todayIso(), settlement: { ...c.settlement, paidToClientAt: todayIso(), evidence } },
    by,
    "Settlement paid to client; moved to Close",
  );
}

/** Step 6: close a settled claim with the discharge voucher. */
export async function closeClaim(id: string, evidence: string, by: string): Promise<Claim> {
  const c = findClaim(id);
  requireOpen(c);
  if (c.step !== "CLOSE") throw new Error("This claim is not ready to close.");
  if (!evidence.trim()) throw new Error("Attach the discharge voucher.");
  return saveClaim({ ...c, closure: { closedAt: todayIso(), by, outcome: "SETTLED", evidence } }, by, "Claim closed (settled)");
}

export async function setClaimFraudFlag(id: string, flagged: boolean, by: string): Promise<Claim> {
  const c = findClaim(id);
  return saveClaim({ ...c, fraudFlag: flagged }, by, flagged ? "Fraud flag raised" : "Fraud flag cleared");
}

export async function addClaimNote(id: string, text: string, by: string): Promise<Claim> {
  const c = findClaim(id);
  if (!text.trim()) throw new Error("Write a note first.");
  return saveClaim({ ...c, notes: [...c.notes, { at: todayIso(), by, text: text.trim() }] }, by, "Internal note added");
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
  // Administration accounts have no client access on the backend, so they get
  // their own role and see only My Work, Approvals and the admin pages.
  ADMINISTRATOR: "Administrator",
  ADMIN: "Administrator",
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
  // Roles this app does not know yet (e.g. a custom role made in Admin) sign in
  // as "Staff": their menus then follow their backend permissions only.
  const role = toFrontendRole(me.roles ?? []) ?? "Staff";
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