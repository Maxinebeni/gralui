import { CommandAttempt, OnboardingError, collectPages } from "./command-attempt";
// Data access for the screens. Every screen goes through these functions,
// never through mock-data.ts directly.
//
// Requests go to /api/..., which src/app/api/[...path]/route.ts forwards to
// the backend. The screens will not need to change as long as the response
// shapes match src/lib/types.ts.
//
// STATUS: authentication, clients, client and claim documents, administration
// (users, roles), policies (insurer, product, policy number and dates), the
// insurer and product catalog, and claim registration are connected to the
// real backend. Policy premiums, the later claim steps, renewals, approvals,
// tasks and the overview still use mock data.

import {
  APPROVALS,
  CLAIMS,
  CLAIM_STEPS,
  CLIENTS,
  MANUAL_TASKS,
  POLICIES_BY_INSURER,
  POLICY_TERMS,
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
import { DEMO_KYC_REVIEWS, DEMO_KYC_TEMPLATES, DEMO_LEADS, DEMO_TRACKS } from "./mock-leads";
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
import {
  ACTION_LABEL,
  TIER_LABEL,
  blockerText,
  commissionTier,
  leadReady,
  nextLeadStep,
  openMilestone,
  stageOf,
} from "./onboarding";
import { RWANDA_HOLIDAYS, type Holiday } from "./holidays";
import { recordHref } from "./links";
import { demoCanRunTrackAction } from "./permissions";
import { INSURER_GROUPS, PRODUCT_GROUPS, type OptionGroup } from "./reference-data";
import { RENEWAL_MILESTONES, completionBlocker, currentMilestone, formatDate, milestoneDue, todayIso } from "./renewals";
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
  CommandHistory,
  DocumentClassification,
  DocumentSubject,
  EvidenceRef,
  InsurerSummary,
  KycGate,
  KycRequirement,
  KycReview,
  KycTemplate,
  Lead,
  LeadType,
  ManagedRole,
  ManagedSession,
  ManagedUser,
  PermissionDefinition,
  Policy,
  PolicyDetail,
  PolicyStatus,
  PolicyTerms,
  PolicyTrack,
  Proof,
  PolicyFinancials,
  PolicyMovement,
  PolicyPeriod,
  RenewalCase,
  RenewalMonth,
  RenewalQuote,
  Role,
  SessionUser,
  StoredDocument,
  TrackStatus,
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
  // Show the status so problems like a sleeping or busy server (502, 503, 429) are easy to spot.
  return `${fallback} (error ${res.status})`;
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
  SUMMARY_ONLY.delete(client.id);
  return client;
}

async function fetchClientView(uuid: string): Promise<ClientView> {
  const res = await apiFetch(`/api/v1/clients/${uuid}`);
  if (!res.ok) throw new Error(await problemMessage(res, "Could not load this client."));
  return (await res.json()) as ClientView;
}

/** Run async work on a list, a few items at a time, so the backend is not flooded. */
async function mapLimited<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Clients cached from the list summary only; the full record is loaded the next time the list loads. */
const SUMMARY_ONLY = new Set<string>();

/** A client built from the list summary alone, used when its full record could not be loaded. */
function clientFromSummary(s: ClientSummary, managers: ManagerChoice[]): Client {
  const client = toClient(
    {
      id: s.id,
      reference: s.reference,
      profile: { registeredName: s.registeredName, type: s.type, sector: "Not recorded", physicalAddress: "" },
      managerId: s.managerId,
      restricted: s.restricted,
      version: s.version,
    },
    managers,
  );
  SUMMARY_ONLY.add(client.id);
  return client;
}

let CLIENT_CHOICES_REQUEST: Promise<Client[]> | null = null;

/**
 * Clients for pick lists and the claims list: one request, names and IDs only.
 * Much faster than listClients, which also loads every full record.
 * Throws when the list cannot be loaded, so the screen can say so.
 */
export async function listClientChoices(): Promise<Client[]> {
  if (MOCK_AUTH) return mockListClients("");
  if (CLIENT_CHOICES_REQUEST) return CLIENT_CHOICES_REQUEST;
  CLIENT_CHOICES_REQUEST = (async () => {
    try {
      const res = await apiFetch("/api/v1/clients?size=100&sort=name");
      if (!res.ok) throw new Error(await problemMessage(res, "Could not load clients."));
      const page = (await res.json()) as Page<ClientSummary>;
      const managers = await loadManagers();
      return page.items.map((s) => {
        const cached = CLIENT_CACHE.get(s.reference);
        return cached && cached.uuid === s.id ? cached : clientFromSummary(s, managers);
      });
    } finally {
      CLIENT_CHOICES_REQUEST = null;
    }
  })();
  return CLIENT_CHOICES_REQUEST;
}

/** Full client record, retried once because the free backend server sometimes drops a request. */
async function fetchClientViewWithRetry(uuid: string): Promise<ClientView> {
  try {
    return await fetchClientView(uuid);
  } catch {
    return await fetchClientView(uuid);
  }
}

/** Requests already on their way, by search text, so the same list is never asked for twice at once. */
const CLIENT_LIST_REQUESTS = new Map<string, Promise<Client[]>>();

/** Search clients on the backend (name, reference and more). */
export async function listClients(query = ""): Promise<Client[]> {
  if (MOCK_AUTH) return mockListClients(query);
  const key = query.trim();
  const pending = CLIENT_LIST_REQUESTS.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const params = new URLSearchParams({ size: "100", sort: "name" });
      if (key) params.set("q", key);
      const res = await apiFetch(`/api/v1/clients?${params}`);
      if (!res.ok) throw new Error(await problemMessage(res, "Could not load clients."));
      const page = (await res.json()) as Page<ClientSummary>;
      const managers = await loadManagers();

      // The list only has summaries, so load each full record, 4 at a time.
      // Unchanged ones come from the cache. One that fails is shown from its summary.
      return await mapLimited(page.items, 4, async (s) => {
        const cached = CLIENT_CACHE.get(s.reference);
        let client: Client;
        if (cached && cached.uuid === s.id && cached.version === s.version && !SUMMARY_ONLY.has(s.reference)) {
          client = cached;
        } else {
          try {
            client = toClient(await fetchClientViewWithRetry(s.id), managers);
          } catch (err) {
            console.warn(`Showing ${s.reference} from the list only:`, err);
            client = clientFromSummary(s, managers);
          }
        }
        let kycGateStatus = "NOT_STARTED";
        try {
          const kyc = await readOnboarding<KycGate>(`/api/v1/clients/${s.id}/kyc-summary`, "Could not load the KYC summary.");
          kycGateStatus = kyc?.gateStatus ?? "NOT_STARTED";
        } catch (err) {
          console.warn(`Could not load KYC summary for ${s.reference}:`, err);
          kycGateStatus = "UNAVAILABLE";
        }
        client.kycGateStatus = kycGateStatus;
        client.kyc = client.kycGateStatus === "READY";
        return client;
      });
    } catch (err) {
      console.warn(err);
      return [];
    } finally {
      CLIENT_LIST_REQUESTS.delete(key);
    }
  })();

  CLIENT_LIST_REQUESTS.set(key, request);
  return request;
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
 * Steps whose fields did not change are skipped, so a small edit only waits
 * for one request to the backend instead of three.
 */
export async function updateClient(id: string, input: ClientInput): Promise<Client> {
  if (MOCK_AUTH) return mockUpdateClient(id, input);
  const current = CLIENT_CACHE.get(id);
  if (!current?.uuid || current.version === undefined) {
    throw new Error("This client could not be found. Close it and open it again.");
  }
  const uuid = current.uuid;
  let version = current.version;
  let view: ClientView | null = null;
  let res: Response;

  const profileChanged =
    !sameText(input.name, current.name) ||
    input.type !== current.type ||
    !sameText(input.sector, current.sector) ||
    !sameText(input.address, current.address ?? "");

  const before = current.contact;
  const contactChanged =
    !before ||
    !sameText(input.contact.name, before.name ?? "") ||
    !sameText(input.contact.title, before.title ?? "") ||
    !sameText(input.contact.email, before.email ?? "") ||
    toBackendPhone(input.contact.phone) !== toBackendPhone(before.phone ?? "");

  // 1. Company details, only if they changed.
  if (profileChanged) {
    res = await apiFetch(`/api/v1/clients/${uuid}`, {
      method: "PUT",
      body: JSON.stringify({ version, profile: { ...toProfile(input), remarks: current.remarks } }),
    });
    if (!res.ok) throw new Error(await problemMessage(res, "Could not save the client details."));
    view = (await res.json()) as ClientView;
    version = view.version;
  }

  // 2. Primary contact person, only if it changed.
  if (contactChanged) {
    res = await apiFetch(`/api/v1/clients/${uuid}/primary-contact`, {
      method: "PUT",
      body: JSON.stringify({ version, primaryContact: toContact(input.contact) }),
    });
    if (!res.ok) throw new Error(await problemMessage(res, "Could not save the contact person."));
    view = (await res.json()) as ClientView;
    version = view.version;
  }

  // 3. Account manager, only if it changed.
  if (input.manager !== current.manager) {
    const managerId = await managerIdFor(input.manager);
    res = await apiFetch(`/api/v1/clients/${uuid}/reassign`, {
      method: "POST",
      body: JSON.stringify({ version, managerId, reason: "Account manager changed from the client form." }),
    });
    if (!res.ok) throw new Error(await problemMessage(res, "Could not change the account manager."));
    view = (await res.json()) as ClientView;
  }

  // Nothing changed: no request needed.
  if (!view) return current;
  return toClient(view, await loadManagers());
}

/* --------------------------------- Policies ---------------------------------- */
// Backend clients: policies come from /api/v1/clients/{id}/policies (POL-02).
// The backend stores the insurer, product, policy number and dates of each
// cover period. Sum insured, premiums, amount paid, commission rate and status
// are not on the backend yet (POL-03), so for backend policies they are kept in
// this browser tab until refresh. Sample clients (demo mode) keep using
// mock-data.ts.

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** What the Add Policy and Edit Policy forms send. */
export type PolicyInput = Policy;

type InsurerView = { id: string; code: string; name: string; typeCode: string; active: boolean };
type ProductView = {
  id: string;
  code: string;
  name: string;
  termCode: string;
  active: boolean;
  productLineCodes?: string[];
};
type CategoryView = { id: string; code: string; name: string; termCode: string; active: boolean };
type ProductTermView = { id: string; code: string; name: string; active: boolean };
type InsurerTypeView = { id: string; code: string; name: string; active: boolean; termCodes?: string[] };

type PolicyPeriodView = {
  id: string;
  policyId: string;
  insurerId: string;
  insurerName: string;
  productId: string;
  productName: string;
  externalPolicyNumber: string;
  effectDate: string; // yyyy-mm-dd
  expiryDate: string; // yyyy-mm-dd
  version: number;
  /** Money snapshots (POL-03), oldest to newest or in any order; the highest version is current. */
  financialTerms?: FinancialTermsView[];
};

type FinancialTermsView = {
  periodId: string;
  version: number;
  netPremium: number;
  totalPremium: number;
  amountPaid: number;
  currency: string;
  commissionRate: number;
  balance: number;
  commissionAmount: number;
  recordedAt: string;
};

type PolicyView = {
  id: string;
  clientId: string;
  /** GRAL's own policy number, generated by the backend. */
  policyNumber?: string;
  version: number;
  createdAt: string;
  periods: PolicyPeriodView[];
};

/** Current money snapshot version per cover period, needed to record new terms. */
const FINANCIAL_VERSION = new Map<string, number>();

function latestTerms(period: PolicyPeriodView): FinancialTermsView | undefined {
  return [...(period.financialTerms ?? [])].sort((a, b) => b.version - a.version)[0];
}

type Catalog = {
  insurers: InsurerView[];
  products: ProductView[];
  lines: CategoryView[];
  terms: ProductTermView[];
  insurerTypes: InsurerTypeView[];
};

/** The insurer and product catalog from the backend, loaded once. */
let CATALOG: Catalog | null = null;
const INSURER_PRODUCT_IDS = new Map<string, string[]>();

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await apiFetch(path);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function loadCatalog(): Promise<Catalog | null> {
  if (CATALOG) return CATALOG;
  const [insurers, products, lines, insurerTypes, terms] = await Promise.all([
    getJson<InsurerView[]>("/api/v1/policy/catalog/insurers"),
    getJson<ProductView[]>("/api/v1/policy/catalog/products"),
    getJson<CategoryView[]>("/api/v1/policy/catalog/product-lines"),
    getJson<InsurerTypeView[]>("/api/v1/policy/catalog/insurer-types"),
    getJson<ProductTermView[]>("/api/v1/policy/catalog/product-terms"),
  ]);
  if (!insurers || !products) return null;
  CATALOG = { insurers, products, lines: lines ?? [], insurerTypes: insurerTypes ?? [], terms: terms ?? [] };
  return CATALOG;
}

async function loadInsurerProductLinks(insurers: InsurerView[]): Promise<void> {
  await Promise.all(insurers.filter((insurer) => insurer.active).map(async (insurer) => {
    if (INSURER_PRODUCT_IDS.has(insurer.id)) return;
    const products = await getJson<ProductView[]>(`/api/v1/policy/catalog/insurers/${insurer.id}/products`);
    if (products) INSURER_PRODUCT_IDS.set(insurer.id, products.filter((product) => product.active).map((product) => product.id));
  }));
}

/** Dropdown lists for the policy form, grouped with headings. */
export type PolicyCatalog = { insurerGroups: OptionGroup[]; productGroups: OptionGroup[]; fromBackend: boolean };

function groupBy<T>(items: T[], label: (item: T) => string, name: (item: T) => string): OptionGroup[] {
  const groups = new Map<string, string[]>();
  for (const item of items) groups.set(label(item), [...(groups.get(label(item)) ?? []), name(item)]);
  return [...groups.entries()].map(([l, options]) => ({ label: l, options: options.sort() }));
}

/**
 * Insurers and products for the policy form. Uses the backend catalog when it
 * is available, otherwise GRAL's official list in reference-data.ts.
 */
export async function getPolicyCatalog(): Promise<PolicyCatalog> {
  const fallback: PolicyCatalog = { insurerGroups: INSURER_GROUPS, productGroups: PRODUCT_GROUPS, fromBackend: false };
  if (MOCK_AUTH) return fallback;
  const catalog = await loadCatalog();
  if (!catalog) return fallback;

  const typeName = (code: string) => catalog.insurerTypes.find((t) => t.code === code)?.name ?? code;
  const lineName = (code?: string) =>
    code ? (catalog.lines.find((l) => l.code === code)?.name ?? code) : "Other products";

  return {
    insurerGroups: groupBy(
      catalog.insurers.filter((i) => i.active),
      (i) => typeName(i.typeCode),
      (i) => i.name,
    ),
    productGroups: groupBy(
      catalog.products.filter((p) => p.active),
      (p) => lineName(p.productLineCodes?.[0]),
      (p) => p.name,
    ),
    fromBackend: true,
  };
}

/**
 * The products an insurer offers, by name. The backend only accepts a policy
 * when the insurer offers the product. null means "not known" (demo mode or no
 * backend catalog), and the form then shows every product.
 */
export async function productsForInsurer(insurerName: string): Promise<string[] | null> {
  if (MOCK_AUTH || !insurerName) return null;
  const catalog = await loadCatalog();
  const insurer = catalog?.insurers.find((i) => sameText(i.name, insurerName));
  if (!insurer) return null;
  const linked = await getJson<ProductView[]>(`/api/v1/policy/catalog/insurers/${insurer.id}/products`);
  return linked ? linked.filter((p) => p.active).map((p) => p.name) : null;
}

/** Fields the backend does not store yet (sum insured and status), by backend policy ID. */
const LOCAL_POLICY_TERMS = new Map<string, Partial<Policy>>();

function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Until the backend sends a status, a policy past its expiry date shows as Lapsed. */
function statusFromDates(expiryIso: string): PolicyStatus {
  return expiryIso < todayIso() ? "Lapsed" : "Active";
}

/** Turns a backend policy into the shape the screens use, from its latest cover period. */
function toPolicy(v: PolicyView): Policy | null {
  const latest = [...v.periods].sort((a, b) => b.effectDate.localeCompare(a.effectDate))[0];
  if (!latest) return null;
  const terms = latestTerms(latest);
  FINANCIAL_VERSION.set(latest.id, terms?.version ?? 0);
  return {
    id: v.policyNumber || latest.externalPolicyNumber || `POL-${v.id.slice(0, 8).toUpperCase()}`,
    uuid: v.id,
    periodId: latest.id,
    version: v.version,
    classOfInsurance: latest.productName,
    insurer: latest.insurerName,
    // Sum insured is not on the backend yet, so it stays undefined and shows
    // as "Not recorded" (unless typed in this session).
    start: isoToDisplay(latest.effectDate),
    renewal: isoToDisplay(latest.expiryDate),
    status: statusFromDates(latest.expiryDate),
    ...LOCAL_POLICY_TERMS.get(v.id),
    ...(terms
      ? {
          premium: Number(terms.totalPremium),
          netPremium: Number(terms.netPremium),
          amountPaid: Number(terms.amountPaid),
          commissionRate: Number(terms.commissionRate),
        }
      : {}),
  };
}

async function policyProblem(res: Response, fallback: string): Promise<string> {
  const problem = await readProblem(res);
  if (res.status === 401) return "Your session has ended. Please sign in again.";
  if (res.status === 403) return "You do not have permission to add or view policies for this client.";
  if (res.status === 404) return "This client or policy could not be found.";
  if (res.status === 400 && problem.fields?.length) return `Please check these fields: ${problem.fields.join(", ")}.`;
  if (problem.title) return problem.title;
  return fallback;
}

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

/** Backend policies already seen, by policy number, so the policy page can find them again. */
const POLICY_INDEX = new Map<string, { uuid: string; clientRef: string }>();

function policyKey(policyNumber: string) {
  return policyNumber.trim().toUpperCase();
}

function savePolicies(clientId: string, policies: Policy[]): Client {
  for (const p of policies) if (p.uuid) POLICY_INDEX.set(policyKey(p.id), { uuid: p.uuid, clientRef: clientId });
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

function isBackendClient(clientId: string): Client | null {
  if (MOCK_AUTH) return null;
  const cached = CLIENT_CACHE.get(clientId);
  return cached?.uuid ? cached : null;
}

/** A client's policies. Backend clients load them from the backend; sample clients from mock data. */
export async function listClientPolicies(clientId: string): Promise<Policy[]> {
  const backend = isBackendClient(clientId);
  if (!backend) return findClientForPolicies(clientId).policies;
  const res = await apiFetch(`/api/v1/clients/${backend.uuid}/policies`);
  if (!res.ok) throw new Error(await policyProblem(res, "Could not load this client's policies."));
  const policies = ((await res.json()) as PolicyView[])
    .map(toPolicy)
    .filter((p): p is Policy => p !== null)
    .sort((a, b) => displayToIso(b.start).localeCompare(displayToIso(a.start)));
  savePolicies(clientId, policies);
  return policies;
}

/** The fields the backend does not store yet: sum insured and status. */
function localTerms(input: PolicyInput): Partial<Policy> {
  return { sumInsured: input.sumInsured, status: input.status };
}

/** The money fields the backend stores (POL-03). Commission rate is a fraction, e.g. 0.1 for 10%. */
function moneyTerms(input: PolicyInput) {
  return {
    netPremium: input.netPremium,
    totalPremium: input.premium,
    amountPaid: input.amountPaid,
    currency: "RWF",
    commissionRate: input.commissionRate,
  };
}

/** Add a policy to a client. Backend clients: registers the policy and its first cover period. */
export async function createPolicy(clientId: string, input: PolicyInput): Promise<Client> {
  const backend = isBackendClient(clientId);
  if (!backend) {
    const client = findClientForPolicies(clientId);
    if (policyNumberTaken(input.id)) throw new Error("This policy number is already in use.");
    return savePolicies(clientId, [...client.policies, input]);
  }

  // The backend generates GRAL's policy number itself (unique per insurer),
  // so the number typed in the form is not sent.
  const catalog = await loadCatalog();
  if (!catalog) throw new Error("Could not load the insurer and product lists. Please try again.");
  const insurer = catalog.insurers.find((i) => sameText(i.name, input.insurer));
  const product = catalog.products.find((p) => sameText(p.name, input.classOfInsurance));
  if (!insurer || !product) throw new Error("Choose the insurer and the class of insurance from the lists.");

  const res = await apiFetch(`/api/v1/clients/${backend.uuid}/policies`, {
    method: "POST",
    body: JSON.stringify({
      insurerId: insurer.id,
      productId: product.id,
      effectDate: displayToIso(input.start),
      expiryDate: displayToIso(input.renewal),
      ...moneyTerms(input),
    }),
  });
  if (!res.ok) throw new Error(await policyProblem(res, "Could not save the policy. Please try again."));
  const view = (await res.json()) as PolicyView;
  LOCAL_POLICY_TERMS.set(view.id, localTerms(input));

  await listClientPolicies(clientId);
  return findClientForPolicies(clientId);
}

/**
 * Update one of a client's policies. The backend has no edit endpoint yet, so
 * for backend policies only the premium, payment and status fields can change,
 * and they are kept in this browser tab until refresh.
 */
export async function updatePolicy(
  clientId: string,
  originalPolicyId: string,
  input: PolicyInput,
): Promise<Client> {
  const client = findClientForPolicies(clientId);
  const original = client.policies.find((p) => p.id === originalPolicyId);

  if (original?.uuid && isBackendClient(clientId)) {
    const keyFieldsChanged =
      !sameText(input.id, original.id) ||
      !sameText(input.insurer, original.insurer) ||
      !sameText(input.classOfInsurance, original.classOfInsurance) ||
      displayToIso(input.start) !== displayToIso(original.start) ||
      displayToIso(input.renewal) !== displayToIso(original.renewal);
    if (keyFieldsChanged) {
      throw new Error(
        "The policy number, insurer, class and dates cannot be changed. Only the premium, payment and status details can be updated.",
      );
    }
    if (original.periodId) {
      const res = await apiFetch(`/api/v1/policy-periods/${original.periodId}/financial-terms`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: FINANCIAL_VERSION.get(original.periodId) ?? 0,
          ...moneyTerms(input),
          reason: "Updated from the client file",
        }),
      });
      if (res.status === 409) throw new Error("Someone else changed this policy. Close the form, reopen it and try again.");
      if (!res.ok) throw new Error(await policyProblem(res, "Could not save the premium details. Please try again."));
      const saved = (await res.json()) as FinancialTermsView;
      FINANCIAL_VERSION.set(original.periodId, saved.version);
    }
    LOCAL_POLICY_TERMS.set(original.uuid, localTerms(input));
    const updated = { ...localTerms(input), premium: input.premium, netPremium: input.netPremium, amountPaid: input.amountPaid, commissionRate: input.commissionRate };
    return savePolicies(
      clientId,
      client.policies.map((p) => (p.id === originalPolicyId ? { ...p, ...updated } : p)),
    );
  }

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
  const backend = MOCK_AUTH ? [] : await listBackendApprovals();
  return [...backend, ...APPROVALS, ...claimApprovals()].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
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
  if (BACKEND_APPROVALS.has(id)) return decideBackendApproval(id, input);
  const r = await getApproval(id);
  if (!r) throw new Error("This approval request could not be found.");
  if (r.version !== input.expectedVersion) {
    throw new Error("This request changed since you opened it. Close it and open it again to see the latest.");
  }
  if (!canDecide(r, actor.role)) throw new Error("This request is not waiting for your decision.");
  const comment = input.comment.trim();
  if (!comment) throw new Error("Enter a comment explaining your decision.");

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
  const saved = saveApproval({ ...r, steps, currentStepNumber: steps.find((s) => s.status === "PENDING")?.order ?? r.currentStepNumber, status: requestStatus }, actor.name, `${label} by ${step.role}`);

  // A fully approved onboarding request moves its policy track to the presentation step.
  if (saved.subjectType === "NEW_BUSINESS") onTrackApprovalDecided(saved);

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
  if (BACKEND_APPROVALS.has(id)) throw new Error("A returned request is sent again from the record it belongs to.");
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
  const backend = BACKEND_APPROVALS.get(id);
  if (backend) {
    // Backend evidence is sent with the decision, pinned to the exact file version.
    if (!evidence.documentId) throw new Error("Upload the file first, then attach it.");
    const updated = { ...backend, evidence: [...backend.evidence, evidence] };
    BACKEND_APPROVALS.set(id, updated);
    return updated;
  }
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

/**
 * What the bell shows: approvals waiting for this person's decision and their
 * own open tasks, soonest due first. With the backend, only the backend's own
 * tasks count; sample tasks never notify a real user. Built from approvals and
 * tasks the caller already has, so nothing is fetched twice.
 */
export type Notice = { key: string; title: string; detail?: string; href: string; due: string };

export function buildNotices(approvals: ApprovalRequest[], tasks: WorkTask[], user: SessionUser): Notice[] {
  const decide: Notice[] = approvals
    .filter((r) => canDecide(r, user.role))
    .map((r) => ({
      key: `APPROVAL:${r.id}`,
      title: `Approve: ${r.title}`,
      detail: r.client,
      href: recordHref("APPROVAL", r.id),
      due: r.dueAt,
    }));
  const mine = (t: WorkTask) =>
    MOCK_AUTH
      ? t.ownerRole === user.role || t.owner === user.name
      : t.key.startsWith("BACKEND:") && (t.owner === user.name || (!!user.id && t.owner === user.id));
  const work: Notice[] = tasks
    .filter((t) => t.status === "OPEN" && t.type !== "APPROVAL" && mine(t))
    .map((t) => ({
      key: t.key,
      title: t.title,
      detail: t.client && !t.title.includes(t.client) ? t.client : undefined,
      href: recordHref(t.resourceType, t.resourceId),
      due: t.dueDate,
    }));
  return [...decide, ...work].sort((a, b) => a.due.localeCompare(b.due));
}

/** Pass the approvals when they are already loaded, so they are not fetched twice. */
export async function listTasks(loadedApprovals?: ApprovalRequest[]): Promise<WorkTask[]> {
  const approvals = loadedApprovals ?? (await listApprovals());
  const pendingRenewals = new Set(approvals.filter((a) => a.subjectType === "RENEWAL" && a.status === "PENDING").map((a) => a.subjectId));
  const system = [
    ...CLAIMS.map(claimTask),
    ...RENEWAL_CASES.map((r) => renewalTask(r, pendingRenewals.has(r.id))),
    ...approvals.map(approvalTask),
    ...(MOCK_AUTH ? onboardingTasks() : []),
  ].filter((t): t is WorkTask => t !== null);

  const backend = MOCK_AUTH ? [] : await listBackendTasks();
  return [...backend, ...system, ...MANUAL_TASKS].map((t) => {
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
    // Backend tasks can only be given to people the backend knows.
    ...(MOCK_AUTH ? [] : (await loadManagers()).map((m) => m.fullName)),
  ]);
  return [...names].sort();
}

export async function reassignTask(key: string, owner: string, by: string): Promise<void> {
  if (!owner) throw new Error("Choose who should do this.");
  const backendTask = [...BACKEND_TASKS.values()].find((t) => t.key === key);
  if (backendTask) return reassignBackendTask(backendTask, owner);
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
  if (BACKEND_TASKS.has(id)) return completeBackendTask(id, note);
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

/* ----------------------- Approvals and tasks on the backend ---------------------- */
// Connected: GET /approvals/inbox, GET /approvals/{id}/history, POST
// /approvals/{id}/decisions (APR-01, APR-02) and GET /tasks, POST
// /tasks/{id}/complete, POST /tasks/{id}/reassign (WFL-02). The backend creates
// approval requests and tasks itself from its workflows. Requests and tasks for
// renewals, onboarding and sample claims still come from sample data, shown
// beside the backend ones until those workflows are on the backend.

/** The signed-in user, kept so tasks can be matched to them. */
let CURRENT_USER: SessionUser | null = null;

type BackendApprovalView = {
  id: string;
  subjectType: string;
  subjectId: string;
  action: string;
  materialRevision: number;
  initiatedBy?: string;
  policyId?: string;
  policyVersion?: number;
  status: string;
  currentStep: number;
  version: number;
  createdAt: string;
  previousRequestId?: string;
};
type BackendApprovalStep = {
  number: number;
  requiredRole?: string;
  requiredPermission?: string;
  evidenceRequired?: boolean;
  evidencePurpose?: string;
};
type BackendApprovalDecision = {
  id: string;
  step: number;
  outcome: string;
  actorId?: string;
  comment?: string;
  occurredAt: string;
  evidence?: { documentId: string; version: number }[] | null;
};
type BackendApprovalHistory = {
  request: BackendApprovalView;
  steps: BackendApprovalStep[];
  decisions: BackendApprovalDecision[];
};

/** Backend approval requests already loaded, by ID, so a decision knows where to go. */
const BACKEND_APPROVALS = new Map<string, ApprovalRequest>();

/** The record each backend request is about, and the purpose its evidence is filed under. */
const BACKEND_APPROVAL_SUBJECTS = new Map<string, { type: string; id: string; purpose: string }>();

/** "CLAIM_SETTLEMENT" becomes "Claim settlement". */
function humanize(code: string): string {
  const words = code.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : code;
}

/** A backend role code as the screens name it, e.g. TECHNICAL_DIRECTOR → Technical Director. */
function roleName(code?: string): string {
  if (!code) return "Approver";
  return BACKEND_TO_FRONTEND_ROLE[code.trim().toUpperCase().replace(/[\s-]+/g, "_")] ?? humanize(code);
}

async function personName(id?: string): Promise<string | undefined> {
  if (!id) return undefined;
  if (CURRENT_USER?.id === id) return CURRENT_USER.name;
  return (await loadManagers()).find((m) => m.id === id)?.fullName;
}

/** The reference people know a record by: claim number, client ID, or a short ID. */
function subjectReference(type: string, id: string): { ref: string; client?: string; clientId?: string } {
  const t = type.toUpperCase();
  if (t === "CLAIM") {
    const claim = CLAIMS.find((c) => c.uuid === id);
    if (claim) return { ref: claim.id, client: claim.client, clientId: claim.clientId };
  }
  if (t === "CLIENT") {
    const client = [...CLIENT_CACHE.values()].find((c) => c.uuid === id);
    if (client) return { ref: client.id, client: client.name, clientId: client.id };
  }
  if (t === "POLICY") {
    for (const [number, p] of POLICY_INDEX) if (p.uuid === id) return { ref: number, clientId: p.clientRef };
  }
  return { ref: `${humanize(type)} ${id.slice(0, 8).toUpperCase()}` };
}

function approvalStatus(code: string): ApprovalRequest["status"] {
  const c = code.toUpperCase();
  if (c.includes("APPROV")) return "APPROVED";
  if (c.includes("REJECT")) return "REJECTED";
  if (c.includes("RETURN")) return "RETURNED";
  return "PENDING";
}

/**
 * inInbox: the backend listed this request as waiting for the signed-in user,
 * so its current step is shown under their role and the screens let them decide.
 */
async function toBackendApproval(h: BackendApprovalHistory, inInbox = false): Promise<ApprovalRequest> {
  const v = h.request;
  const status = approvalStatus(v.status);
  let subject = subjectReference(v.subjectType, v.subjectId);
  let onboardingTrack: TrackDetail | null = null;
  if (v.subjectType.toUpperCase() === "ONBOARDING") {
    onboardingTrack = await getTrack(v.subjectId).catch(() => null);
    if (onboardingTrack) {
      const clientName = onboardingTrack.lead?.clientName ?? onboardingTrack.lead?.name;
      subject = {
        ref: [clientName, onboardingTrack.track.productName].filter(Boolean).join(" · ") || subject.ref,
        client: clientName,
        clientId: onboardingTrack.track.clientId,
      };
    }
  }
  const steps: ApprovalStep[] = await Promise.all(
    [...h.steps]
      .sort((a, b) => a.number - b.number)
      .map(async (st) => {
        const decided = [...h.decisions].reverse().find((d) => d.step === st.number);
        const outcome = decided ? approvalStatus(decided.outcome) : null;
        const stepStatus: ApprovalStep["status"] =
          outcome && outcome !== "PENDING"
            ? outcome
            : status === "PENDING" && st.number === v.currentStep
              ? "PENDING"
              : "WAITING";
        const mineNow = inInbox && stepStatus === "PENDING" && CURRENT_USER;
        return {
          order: st.number,
          requiredPermission: st.requiredPermission,
          evidencePurpose: st.evidencePurpose,
          role: mineNow ? CURRENT_USER!.role : roleName(st.requiredRole),
          status: stepStatus,
          decidedBy: decided ? (await personName(decided.actorId)) ?? "Reviewer" : undefined,
          decidedAt: decided?.occurredAt.slice(0, 10),
          comment: decided?.comment || undefined,
        };
      }),
  );
  const requestedAt = v.createdAt.slice(0, 10);
  const history = await Promise.all(
    h.decisions.map(async (d) => ({
      at: d.occurredAt.slice(0, 10),
      by: (await personName(d.actorId)) ?? "Reviewer",
      text: `${humanize(d.outcome)} at step ${d.step}${d.comment ? `: ${d.comment}` : ""}`,
    })),
  );
  const known = BACKEND_APPROVALS.get(v.id);
  return {
    id: v.id,
    action: v.action,
    currentStepNumber: v.currentStep,
    boardEvidence: [...h.decisions].reverse().find((d) => d.step === 2 && d.outcome === "APPROVE")?.evidence,
    // The screens group requests by type; backend types not known here show under KYC.
    subjectType: (v.subjectType.toUpperCase() === "ONBOARDING"
      ? "NEW_BUSINESS"
      : ["RENEWAL", "CLAIM_SETTLEMENT", "KYC", "POLICY_ENDORSEMENT", "NEW_BUSINESS"].includes(v.subjectType.toUpperCase())
        ? v.subjectType.toUpperCase()
        : "KYC") as ApprovalRequest["subjectType"],
    subjectId: v.subjectId,
    subjectRef: subject.ref,
    subjectRevision: v.materialRevision,
    title: `${humanize(v.action)} · ${humanize(v.subjectType)}`,
    summary: `Approval requested in the system for ${subject.ref}.`,
    clientId: subject.clientId,
    client: subject.client,
    amount: onboardingTrack?.track.recommendation?.annualCommissionRwf,
    amountLabel: onboardingTrack?.track.recommendation ? "Annual commission" : undefined,
    policyVersion: v.policyVersion !== undefined ? `Policy v${v.policyVersion}` : "Backend policy",
    requestedBy: (await personName(v.initiatedBy)) ?? "Requested in the system",
    requestedAt,
    dueAt: addWorkingDays(requestedAt, DECISION_DAYS),
    status,
    steps,
    evidenceRequired: h.steps.some((st) => st.number === v.currentStep && st.evidenceRequired),
    // Evidence attached in this tab but not sent yet stays until the decision.
    evidence: known?.evidence ?? [],
    version: v.version,
    history: [{ at: requestedAt, by: "System", text: "Approval requested" }, ...history],
  };
}

async function approvalHistory(id: string): Promise<BackendApprovalHistory> {
  const res = await apiFetch(`/api/v1/approvals/${id}/history?size=100`);
  if (!res.ok) throw new Error(await approvalProblem(res, "Could not load this approval request."));
  return (await res.json()) as BackendApprovalHistory;
}

async function approvalProblem(res: Response, fallback: string): Promise<string> {
  const problem = await readProblem(res);
  if (res.status === 401) return "Your session has ended. Please sign in again.";
  if (res.status === 403) return "You are not allowed to decide or see this request.";
  if (res.status === 404) return "This approval request could not be found.";
  if (res.status === 409) return "This request changed since you opened it. Close it and open it again to see the latest.";
  if (problem.title) return problem.title;
  return fallback;
}

/** Requests waiting for the signed-in user's decision (the backend's inbox). */
async function listBackendApprovals(): Promise<ApprovalRequest[]> {
  try {
    const res = await apiFetch("/api/v1/approvals/inbox?size=100");
    if (!res.ok) return [];
    const items = ((await res.json()) as Page<BackendApprovalView>).items ?? [];
    return await mapLimited(items, 4, async (v) => {
      const history = await approvalHistory(v.id).catch(() => ({ request: v, steps: [], decisions: [] }));
      const mapped = await toBackendApproval(history, true);
      BACKEND_APPROVALS.set(mapped.id, mapped);
      const step = history.steps.find((st) => st.number === v.currentStep);
      BACKEND_APPROVAL_SUBJECTS.set(v.id, {
        type: v.subjectType.toUpperCase(),
        id: v.subjectId,
        purpose: step?.evidencePurpose || "APPROVAL_EVIDENCE",
      });
      return mapped;
    });
  } catch (err) {
    console.warn("Could not load the approval inbox:", err);
    return [];
  }
}

async function decideBackendApproval(id: string, input: DecisionInput): Promise<ApprovalRequest> {
  const known = BACKEND_APPROVALS.get(id)!;
  const comment = input.comment.trim();
  if (!comment) throw new Error("Enter a comment explaining your decision.");
  if (input.decision === "APPROVE" && known.evidenceRequired && known.evidence.length === 0) {
    throw new Error("Attach the written or signed evidence first.");
  }
  const res = await apiFetch(`/api/v1/approvals/${id}/decisions`, {
    method: "POST",
    body: JSON.stringify({
      version: input.expectedVersion,
      decision: input.decision,
      comment,
      evidence: known.evidence
        .filter((e) => e.documentId)
        .map((e) => ({ documentId: e.documentId, version: e.version ?? 1 })),
    }),
  });
  if (!res.ok) throw new Error(await approvalProblem(res, "Could not save your decision. Please try again."));
  const updated = await toBackendApproval(await approvalHistory(id));
  BACKEND_APPROVALS.set(id, { ...updated, evidence: [] });
  return BACKEND_APPROVALS.get(id)!;
}

type BackendTaskView = {
  id: string;
  subjectType: string;
  subjectId: string;
  kind: string;
  assigneeId?: string;
  dueDate?: string | null;
  status: string;
  completedBy?: string;
  completedAt?: string;
  version: number;
  ownerControlled?: boolean;
};

/** Backend tasks already loaded, by ID, with the version the next change must send. */
const BACKEND_TASKS = new Map<string, WorkTask & { version: number }>();

function taskType(kind: string): WorkTask["type"] {
  const k = kind.toUpperCase();
  if (k.includes("APPROVAL")) return "APPROVAL";
  if (k.includes("FOLLOW")) return "CLAIM_FOLLOW_UP";
  if (k.includes("CLAIM")) return "CLAIM_STEP";
  if (k.includes("RENEWAL")) return "RENEWAL_MILESTONE";
  if (k.includes("KYC")) return "KYC_DOCUMENT";
  if (k.includes("ONBOARD")) return "ONBOARDING_STEP";
  return "MANUAL";
}

function taskResourceType(type: string): WorkTask["resourceType"] {
  const t = type.toUpperCase();
  if (t === "KYC") return "KYC_REVIEW";
  return (["CLAIM", "RENEWAL", "CLIENT", "POLICY", "APPROVAL", "LEAD", "ONBOARDING"].includes(t) ? t : "CLIENT") as WorkTask["resourceType"];
}

async function toBackendTask(v: BackendTaskView): Promise<WorkTask & { version: number }> {
  const subject = subjectReference(v.subjectType, v.subjectId);
  const done = v.status.toUpperCase().includes("COMPLET") || v.status.toUpperCase() === "DONE";
  return {
    id: v.id,
    key: `BACKEND:${v.id}`,
    type: taskType(v.kind),
    title: humanize(v.kind),
    detail: subject.ref,
    resourceType: taskResourceType(v.subjectType),
    // Links open the record by the reference people know; the UUID when there is none.
    resourceId: subject.ref.includes(" ") ? v.subjectId : subject.ref,
    resourceRef: subject.ref,
    client: subject.client,
    owner: (await personName(v.assigneeId)) ?? (v.assigneeId ? "Assigned user" : undefined),
    ownerRole: v.assigneeId ? undefined : "Unassigned",
    // Some owner-controlled work has no deadline yet; it shows as due today.
    dueDate: v.dueDate ?? todayIso(),
    status: done ? "DONE" : "OPEN",
    // Owner-controlled work is completed by hand; the rest closes when its workflow moves on.
    source: v.ownerControlled ? "MANUAL" : "SYSTEM",
    createdAt: todayIso(),
    completedAt: v.completedAt?.slice(0, 10),
    completedBy: await personName(v.completedBy),
    history: [],
    version: v.version,
  };
}

/** Tasks from the backend: the whole team's for people who may assign work, otherwise the user's own. */
async function listBackendTasks(): Promise<WorkTask[]> {
  try {
    let res = await apiFetch("/api/v1/tasks?assignedToMe=false&size=100");
    if (res.status === 403) res = await apiFetch("/api/v1/tasks?assignedToMe=true&size=100");
    if (!res.ok) return [];
    const items = ((await res.json()) as Page<BackendTaskView>).items ?? [];
    const tasks = await Promise.all(items.map(toBackendTask));
    for (const t of tasks) BACKEND_TASKS.set(t.id, t);
    return tasks.map(({ version: _version, ...t }) => t);
  } catch (err) {
    console.warn("Could not load tasks:", err);
    return [];
  }
}

async function taskProblem(res: Response, fallback: string): Promise<string> {
  const problem = await readProblem(res);
  if (res.status === 401) return "Your session has ended. Please sign in again.";
  if (res.status === 403) return "You are not allowed to change this task.";
  if (res.status === 409) return "This task changed since you opened it. Close it and open it again.";
  if (problem.title) return problem.title;
  return fallback;
}

async function completeBackendTask(id: string, note: string): Promise<void> {
  const t = BACKEND_TASKS.get(id)!;
  if (t.source !== "MANUAL") throw new Error("This task closes by itself when the record moves on. Open the record to do the work.");
  const res = await apiFetch(`/api/v1/tasks/${id}/complete`, {
    method: "POST",
    body: JSON.stringify({ version: t.version, reason: note.trim() || "Completed" }),
  });
  if (!res.ok) throw new Error(await taskProblem(res, "Could not complete the task. Please try again."));
  BACKEND_TASKS.set(id, await toBackendTask((await res.json()) as BackendTaskView));
}

async function reassignBackendTask(t: WorkTask & { version: number }, owner: string): Promise<void> {
  const assignee = (await loadManagers()).find((m) => m.fullName === owner);
  if (!assignee) throw new Error("Choose someone from the list. The backend can only assign work to its own users.");
  const res = await apiFetch(`/api/v1/tasks/${t.id}/reassign`, {
    method: "POST",
    body: JSON.stringify({ version: t.version, assigneeId: assignee.id, reason: `Reassigned to ${owner}` }),
  });
  if (!res.ok) throw new Error(await taskProblem(res, "Could not reassign the task. Please try again."));
  BACKEND_TASKS.set(t.id, await toBackendTask((await res.json()) as BackendTaskView));
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

/**
 * Finds a backend policy by its number. Uses what is already loaded; after a
 * page refresh it looks through the clients' policies, 4 clients at a time.
 */
async function findBackendPolicy(policyNumber: string): Promise<{ uuid: string; clientRef: string } | null> {
  const known = POLICY_INDEX.get(policyKey(policyNumber));
  if (known) return known;
  const clients = (await listClientChoices()).filter((c) => c.uuid);
  await mapLimited(clients, 4, async (c) => {
    if (POLICY_INDEX.has(policyKey(policyNumber))) return;
    try {
      await listClientPolicies(c.id);
    } catch {
      // A client whose policies cannot be read is skipped.
    }
  });
  return POLICY_INDEX.get(policyKey(policyNumber)) ?? null;
}

/**
 * Policy page for a backend policy: GET /policies/{id} for the policy and all
 * its cover periods, plus the client's claims on those periods. Premiums,
 * payments and policy history (POL-03, POL-05) are not on the backend yet.
 */
async function getBackendPolicyDetail(policyNumber: string, policyUuid?: string): Promise<PolicyDetail | null> {
  const found = policyUuid ? { uuid: policyUuid, clientRef: "" } : await findBackendPolicy(policyNumber);
  if (!found) return null;

  const res = await apiFetch(`/api/v1/policies/${found.uuid}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await policyProblem(res, "Could not load this policy."));
  const view = (await res.json()) as PolicyView;
  const policy = toPolicy(view);
  if (!policy) return null;

  const client =
    [...CLIENT_CACHE.values()].find((c) => c.uuid === view.clientId) ??
    (await listClientChoices()).find((c) => c.uuid === view.clientId);
  const clientRef = client?.id ?? found.clientRef;
  const clientName = client?.name ?? "Client";
  if (clientRef) POLICY_INDEX.set(policyKey(policy.id), { uuid: view.id, clientRef });

  const financials = policyFinancials(policy);
  // Newest period first; the oldest one is when the policy was placed.
  const sorted = [...view.periods].sort((a, b) => b.effectDate.localeCompare(a.effectDate));
  const periods: PolicyPeriod[] = sorted.map((per, i) => ({
    periodId: per.id,
    from: per.effectDate,
    to: per.expiryDate,
    // Premiums come from each period's latest money snapshot (POL-03).
    // Sum insured is not on the backend yet, so only this session's value shows.
    sumInsured: i === 0 ? (policy.sumInsured ?? null) : null,
    netPremium: latestTerms(per) ? Number(latestTerms(per)!.netPremium) : null,
    totalPremium: latestTerms(per) ? Number(latestTerms(per)!.totalPremium) : null,
    movement: i === sorted.length - 1 ? "NEW" : "RENEWAL",
    current: i === 0,
  }));
  const movements: PolicyMovement[] = sorted.map((per, i) => ({
    id: `MOV-${per.id}`,
    date: per.effectDate,
    type: i === sorted.length - 1 ? "NEW" : "RENEWAL",
    description:
      i === sorted.length - 1
        ? `Policy placed with ${per.insurerName}`
        : `Renewed for ${formatIsoRange(per.effectDate, per.expiryDate)}`,
    by: "Recorded in the system",
  }));

  // Claims registered on any of this policy's cover periods.
  let claims: ClientClaim[] = [];
  try {
    const periodIds = new Set(view.periods.map((per) => per.id));
    const claimRes = await apiFetch(`/api/v1/clients/${view.clientId}/claims?size=100`);
    if (claimRes.ok) {
      const items = ((await claimRes.json()) as Page<ClaimView>).items ?? [];
      claims = items
        .filter((c) => periodIds.has(c.policyPeriodId))
        .map((c) => {
          const per = view.periods.find((x) => x.id === c.policyPeriodId);
          const period: PolicyPeriodDetail | null = per
            ? { id: per.id, policyId: view.id, insurerName: per.insurerName, productName: per.productName, externalPolicyNumber: per.externalPolicyNumber, effectDate: per.effectDate, expiryDate: per.expiryDate }
            : null;
          return toClaimSummary(rememberClaim(toClaim(c, clientRef, clientName, period)));
        });
    }
  } catch (err) {
    console.warn("Could not load the claims on this policy:", err);
  }

  return { policy, clientId: clientRef, client: clientName, financials, periods, movements, claims };
}

export async function getPolicyDetail(policyId: string, policyUuid?: string): Promise<PolicyDetail | null> {
  if (!MOCK_AUTH) {
    const backend = await getBackendPolicyDetail(policyId, policyUuid);
    if (backend) return backend;
  }
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
  // The backend accepts documents for clients, claims, leads, policy tracks and KYC reviews.
  return !MOCK_AUTH && ["CLIENT", "CLAIM", "LEAD", "ONBOARDING", "KYC"].includes(subject.type) && UUID_PATTERN.test(subject.id);
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
  const docs = groupVersions(((await res.json()) as { items: BackendDocumentItem[] }).items ?? []);
  // The list only returns the newest version of each file. For files that
  // were replaced, ask for their full version history (DOC-03).
  return mapLimited(docs, 4, async (doc) => {
    if (doc.version <= 1 || doc.previous.length >= doc.version - 1) return doc;
    const previous = await loadDocumentVersions(subject, doc).catch(() => null);
    return previous ? { ...doc, previous } : doc;
  });
}

type BackendDocumentVersion = {
  version: number;
  fileName: string;
  uploadedAt: string;
};

/** Earlier versions of a document, newest first, from GET /documents/{id}/versions. */
async function loadDocumentVersions(subject: DocumentSubject, doc: StoredDocument): Promise<StoredDocument["previous"]> {
  const params = new URLSearchParams({
    subjectType: subject.type,
    subjectId: subject.id,
    purpose: doc.purpose,
    size: "100",
  });
  const res = await apiFetch(`/api/v1/documents/${doc.id}/versions?${params}`);
  if (!res.ok) throw new Error(await documentError(res, "Could not load the earlier versions."));
  const items = ((await res.json()) as { items?: BackendDocumentVersion[] }).items ?? [];
  return items
    .filter((v) => v.version !== doc.version)
    .sort((a, b) => b.version - a.version)
    .map((v) => ({ version: v.version, originalFileName: v.fileName, uploadedAt: v.uploadedAt }));
}

export type UploadOptions = { classification: DocumentClassification; purpose: string };

export async function uploadDocument(subject: DocumentSubject, file: File, options: UploadOptions): Promise<StoredDocument> {
  const problem = documentProblem(file);
  if (problem) throw new Error(problem);

  // Evidence for a backend approval is filed on the record being approved, so the decision can pin it.
  const approvalSubject = subject.type === "APPROVAL" ? BACKEND_APPROVAL_SUBJECTS.get(subject.id) : undefined;
  if (approvalSubject) {
    return uploadDocument({ type: approvalSubject.type as DocumentSubject["type"], id: approvalSubject.id }, file, {
      classification: "APPROVAL_EVIDENCE",
      purpose: approvalSubject.purpose,
    });
  }

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
  if (!res.ok) throw new OnboardingError(await documentError(res, "Could not upload the file. Please try again."), undefined, res.status);
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

/** Load an exact document version for inline preview or download. */
export async function getDocumentContent(
  subject: DocumentSubject,
  doc: StoredDocument,
  version = doc.version,
): Promise<Blob> {
  if (!usesDocumentBackend(subject)) {
    const blob = LOCAL_FILES.get(`${doc.id}:${version}`);
    if (!blob) throw new Error("This is a sample record; there is no file to download.");
    return blob;
  }
  const params = new URLSearchParams({ subjectType: subject.type, subjectId: subject.id, purpose: doc.purpose });
  const res = await apiFetch(`/api/v1/documents/${doc.id}/versions/${version}/content?${params}`);
  if (!res.ok) throw new Error(await documentError(res, "Could not load the file."));
  return res.blob();
}

/** Download an exact version of a document. */
export async function downloadDocument(
  subject: DocumentSubject,
  doc: StoredDocument,
  version = doc.version,
): Promise<void> {
  const name = version === doc.version ? doc.originalFileName : doc.previous.find((p) => p.version === version)?.originalFileName ?? doc.originalFileName;
  const blob = await getDocumentContent(subject, doc, version);
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
  if (reason.trim().length > 500) throw new Error("Keep the reason within 500 characters.");
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

/* Sessions: who is signed in (Christian, admin session management) */

/** Demo sessions for the active sample accounts, at different times of activity. */
const DEMO_SESSIONS: ManagedSession[] = (() => {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const active = USERS_DATA.filter((u) => u.status === "ACTIVE");
  const activity = [[95, 1], [240, 4], [30, 12], [480, 45], [60, 3], [20, 26], [300, 90]];
  return active.slice(0, activity.length).flatMap((u, i) => {
    const [since, last] = activity[i]!;
    const session = (n: number, s: number, l: number): ManagedSession => ({
      sessionReference: `${u.id}-session-${n}`,
      userId: u.id,
      email: u.email,
      fullName: u.fullName,
      authenticatedAt: ago(s),
      lastAccessedAt: ago(l),
      expiresAt: new Date(Date.now() - l * 60_000 + 30 * 60_000).toISOString(),
    });
    // One person signed in on two devices.
    return i === 1 ? [session(1, since, last), session(2, 35, 7)] : [session(1, since, last)];
  });
})();

export async function listActiveSessions(): Promise<ManagedSession[]> {
  if (MOCK_AUTH) return [...DEMO_SESSIONS];
  return allPages<ManagedSession>("/api/v1/admin/sessions");
}

/** Signs one session out. The backend refuses ending your own sessions here. */
export async function endSession(s: ManagedSession, reason: string, selfId?: string): Promise<void> {
  requireReason(reason);
  if (s.userId === selfId) throw new Error("You can't end your own session here. Use Sign out instead.");
  if (MOCK_AUTH) {
    const i = DEMO_SESSIONS.findIndex((x) => x.sessionReference === s.sessionReference);
    if (i < 0) throw new Error("This session has already ended.");
    DEMO_SESSIONS.splice(i, 1);
    return;
  }
  const res = await apiFetch(`/api/v1/admin/sessions/${s.sessionReference}/revoke`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
  if (res.status === 404) throw new Error("This session has already ended.");
  if (!res.ok) throw new Error(await adminError(res, "Could not end the session."));
}

/** Signs a person out everywhere. Returns how many sessions were ended. */
export async function endAllSessionsFor(userId: string, reason: string, selfId?: string): Promise<number> {
  requireReason(reason);
  if (userId === selfId) throw new Error("You can't end your own sessions here. Use Sign out instead.");
  if (MOCK_AUTH) {
    const before = DEMO_SESSIONS.length;
    for (let i = DEMO_SESSIONS.length - 1; i >= 0; i--) if (DEMO_SESSIONS[i]!.userId === userId) DEMO_SESSIONS.splice(i, 1);
    return before - DEMO_SESSIONS.length;
  }
  const result = await adminSend<{ revokedSessions: number }>(`/api/v1/admin/users/${userId}/sessions/revoke`, { reason: reason.trim() }, "Could not end the sessions.");
  return result?.revokedSessions ?? 0;
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

/* ---------------------------- Leads and onboarding ---------------------------- */
// The backend's onboarding (docs/api/onboarding.md in the backend repo): a lead
// for steps 1 and 2, then one policy track per policy for steps 3 to 11, with
// KYC as a review of the client. Every action is a command carrying a fresh
// commandId and the version the screen was showing; most need a document as
// proof, uploaded first and then referenced by ID and version. The backend
// returns which actions are allowed (availableActions) and what is blocking.
// Demo mode keeps sample data in the same shapes (mock-leads.ts) and applies
// the main rules, so the screens behave the same way.

export type ChoiceOption = { id: string; name: string };

/** A document chosen as proof, with when the thing it proves happened. */
export type EvidenceInput = { file: File; occurredAt: string; detail?: string };

function commandEnvelope(version?: number, reason?: string, attempt?: CommandAttempt) {
  const create = () => ({ commandId: crypto.randomUUID(), expectedVersion: version, ...(reason ? { reason } : {}) });
  return attempt ? attempt.value("command", create) : create();
}

/** Convert date-only evidence consistently; today uses one captured clock so consecutive commands retain their order. */
function instantFrom(date: string, now = Date.now()): string {
  if (date.length > 10) return date;
  if (date >= todayIso()) return new Date(now).toISOString();
  return `${date}T09:00:00Z`;
}

const ONBOARDING_MESSAGES: Record<string, string> = {
  STALE_VERSION: "Someone else changed this since you opened it. Refresh the page and try again.",
  LEAD_NOT_READY: "The lead needs a confirmed registration, a needs assessment and a client before a policy track can start.",
  LEAD_NOT_CONFIRMED: "The Commercial Director must confirm the registration first.",
  OWNER_REQUIRED: "Assign an Accounts Executive first.",
  CLIENT_ALREADY_LINKED: "This lead already has a client.",
  CLIENT_OWNER_MISMATCH: "The client's account manager must be the lead's Accounts Executive.",
  CLIENT_TYPE_MISMATCH: "The client's type does not match the lead (company or individual).",
  CLOSE_POLICY_TRACKS_FIRST: "Close the lead's open policy tracks first.",
  INVALID_STAGE: "This action is not allowed at the current step.",
  INVALID_STATE: "This action is not allowed in the current state.",
  NO_ELIGIBLE_KYC_REVIEWER: "Ask the CRM Manager or MD to assign an active compliance reviewer before submission.",
  APPROVER_INELIGIBLE: "Only the assigned compliance reviewer can perform this action. Refresh to check the current assignment.",
  DUPLICATE_REVIEW_REQUIRED: "Review the current matching clients before creating this prospect.",
  KYC_NOT_READY: "The client's KYC must be approved first.",
  RFQ_ALREADY_DISPATCHED: "The requests for quotations were already sent.",
  RESPONSE_NOT_DUE: "An insurer can be marked as not replying only after its response date.",
  INSURER_PRODUCT_NOT_AVAILABLE: "That insurer does not offer this product.",
  QUOTE_REQUIRED: "Choose a quote to recommend.",
  RECOMMENDATION_REQUIRED: "Recommend a quote first.",
  APPROVAL_ALREADY_REQUESTED: "Approval was already requested.",
  PLACEMENT_ALREADY_INSTRUCTED: "The insurer was already instructed, so the recommendation can no longer be revised.",
  ACCEPTANCE_ALREADY_RECORDED: "The written acceptance is already recorded.",
  SCHEDULE_REQUIRED: "Record the policy schedule first.",
  SCHEDULE_TERMS_MISMATCH: "The schedule does not match the accepted terms.",
  OWNER_REASSIGNMENT_REQUIRED: "The client's account manager changed. Reassign the Accounts Executive first.",
  UNKNOWN_TIMELINE_PROFILE: "Unknown renewal timeline.",
  INVALID_ASSIGNEE: "That person cannot be assigned to this responsibility.",
  KYC_TEMPLATE_UNAVAILABLE: "No KYC checklist is set up for this client type yet.",
  KYC_REVIEW_ALREADY_OPEN: "This client already has an open KYC review.",
  KYC_DOCUMENTS_INCOMPLETE: "Some required KYC documents are still missing.",
  KYC_REVIEW_NOT_OVERDUE: "A KYC review can only be escalated after its deadline.",
  CLIENT_TYPE_UNRESOLVED: "The client's type must be set before a KYC review can start.",
  DOCUMENT_NOT_USABLE: "The document could not be used. Upload it again.",
  APPROVAL_DISABLED: "Approvals are switched off on this server, so the request cannot be sent.",
  APPROVAL_POLICY_UNAVAILABLE: "No approval rules are set up on this server for new business yet.",
  INVALID_ONBOARDING_APPROVAL_POLICY: "The approval rules on this server do not match the onboarding tiers.",
  INVALID_BOARD_APPROVAL_POLICY: "The approval rules on this server are missing the board evidence step.",
};

async function onboardingProblem(res: Response, fallback: string): Promise<string> {
  const problem = await readProblem(res);
  if (res.status === 401) return "Your session has ended. Please sign in again.";
  if (res.status === 403) return "You do not have permission to do this.";
  if (res.status === 404) return "This record could not be found.";
  // A generic 400 with field names is more useful than "Invalid request".
  if (res.status === 400 && problem.fields?.length) return `Please check these fields: ${problem.fields.join(", ")}.`;
  if (problem.code && ONBOARDING_MESSAGES[problem.code]) return ONBOARDING_MESSAGES[problem.code]!;
  if (problem.code) return blockerText(problem.code);
  if (problem.title && problem.title !== "Bad Request") return problem.title;
  return fallback;
}

async function sendOnboarding<T>(method: "POST" | "PUT", path: string, body: unknown, fallback: string, attempt?: CommandAttempt): Promise<T> {
  const request = attempt ? attempt.value(`request:${path}`, () => JSON.stringify(body)) : JSON.stringify(body);
  let res: Response;
  try { res = await apiFetch(path, { method, body: request }); }
  catch (error) { if (attempt) attempt.uncertain = true; throw error; }
  if (!res.ok) {
    if (attempt && res.status >= 500) attempt.uncertain = true;
    const problem = await readProblem(res.clone());
    throw new OnboardingError(await onboardingProblem(res, fallback), problem.code, res.status);
  }
  if (res.status === 204) return undefined as T;
  try { const content = await res.text(); const value = content ? JSON.parse(content) as T : undefined as T; if (attempt) attempt.uncertain = true; return value; }
  catch (error) { if (attempt) attempt.uncertain = true; throw error; }
}

async function readOnboarding<T>(path: string, fallback: string): Promise<T | null> {
  const res = await apiFetch(path);
  if (res.status === 404) return null;
  if (!res.ok) { const problem = await readProblem(res.clone()); throw new OnboardingError(await onboardingProblem(res, fallback), problem.code, res.status); }
  return (await res.json()) as T;
}

async function readAllOnboarding<T>(path: string, fallback: string): Promise<T[]> {
  return collectPages(async (page) => {
    const result = await readOnboarding<Page<T>>(`${path}${path.includes("?") ? "&" : "?"}page=${page}&size=100`, fallback);
    if (!result) throw new Error(fallback);
    return result;
  });
}

export type StaffChoice = { id: string; fullName: string };
export const DEMO_REVIEWER = "Risk & Compliance Manager";

export async function listKycReviewers(): Promise<StaffChoice[]> {
  if (MOCK_AUTH) return [{ id: DEMO_REVIEWER, fullName: DEMO_REVIEWER }];
  return readAllOnboarding<StaffChoice>("/api/v1/kyc-reviewers", "Could not load eligible compliance reviewers.");
}

export async function listTrackAssignees(id: string, responsibility: "TECHNICAL" | "UNDERWRITING"): Promise<StaffChoice[]> {
  if (MOCK_AUTH) {
    const t = DEMO_TRACKS.find((t) => t.id === id);
    const name = responsibility === "TECHNICAL" ? "Technical Director" : t?.underwritingRole === "MEDICAL_UNDERWRITING_MANAGER" ? "Medical Underwriting Manager" : "GI Underwriting Manager";
    return [{ id: name, fullName: name }];
  }
  return readAllOnboarding<StaffChoice>(`/api/v1/onboarding-cases/${id}/assignees?responsibility=${responsibility}`, "Eligible staff could not be loaded. Try again or contact support.");
}

export async function getOnboardingClient(clientId: string): Promise<{ clientType: LeadType; managerId?: string; name?: string }> {
  if (MOCK_AUTH) {
    const lead = DEMO_LEADS.find((l) => l.clientId === clientId);
    return { clientType: lead?.type ?? "CORPORATE", managerId: lead?.ownerId, name: lead?.clientName };
  }
  const client = await readOnboarding<ClientView>(`/api/v1/clients/${clientId}`, "Could not load the client details.");
  if (!client) throw new Error("The client details are unavailable.");
  return { clientType: String(client.profile.type) === "INDIVIDUAL" ? "INDIVIDUAL" : "CORPORATE", managerId: client.managerId, name: client.profile.registeredName };
}

export async function assignKycReviewer(review: KycReview, assigneeId: string, reason: string, attempt?: CommandAttempt): Promise<KycReview> {
  requireReason(reason);
  if (!assigneeId) throw new Error("Choose a compliance reviewer.");
  if (MOCK_AUTH) {
    if (!["CRM Manager", "MD"].includes(DEMO_ROLE ?? "")) throw new Error("You do not have permission to assign this review.");
    if (assigneeId !== DEMO_REVIEWER) throw new Error(ONBOARDING_MESSAGES.INVALID_ASSIGNEE);
    if (!["DRAFT", "SUBMITTED", "RETURNED"].includes(review.status)) throw new Error(ONBOARDING_MESSAGES.INVALID_STATE);
    const saved = demoKycCommand(review, "KYC_ASSIGNED", () => ({ reviewerId: assigneeId }));
    const history = DEMO_HISTORY.get(review.id); if (history?.[0]) history[0].reason = reason.trim();
    return saved;
  }
  return sendOnboarding<KycReview>("POST", `/api/v1/kyc-cases/${review.id}/assignment`, { ...commandEnvelope(review.version, reason.trim(), attempt), assigneeId }, "Could not assign the compliance reviewer.", attempt);
}

export type ProspectDuplicateReview = { fingerprint: string; candidates: { id: string; reference: string; name: string; matches: string[]; managerId?: string }[] };

export async function checkProspectDuplicates(input: ProspectInput): Promise<ProspectDuplicateReview> {
  if (MOCK_AUTH) {
    const matches = DEMO_LEADS.filter((l) => l.clientId && l.clientName?.trim().toLowerCase() === input.registeredName.trim().toLowerCase());
    return { fingerprint: JSON.stringify(input), candidates: matches.map((l) => ({ id: l.clientId!, reference: l.clientId!, name: l.clientName!, matches: ["name"], managerId: l.ownerId })) };
  }
  const body = { profile: { registeredName: input.registeredName, type: input.clientType, sector: input.sector, physicalAddress: input.address }, primaryContact: { name: input.contactName, jobTitle: input.jobTitle, email: input.email, phone: input.phone } };
  let fingerprint = "";
  const candidates = await collectPages(async (page) => {
    const result = await sendOnboarding<{ fingerprint: string; candidates: Page<{ client: { id: string; reference: string; registeredName: string; managerId?: string }; matches: string[] }> }>("POST", `/api/v1/clients/duplicate-check?page=${page}&size=100`, body, "Could not review matching clients.");
    if (fingerprint && fingerprint !== result.fingerprint) throw new Error("Matching clients changed. Review duplicates again.");
    fingerprint = result.fingerprint;
    return result.candidates;
  });
  return { fingerprint, candidates: candidates.map(({ client, matches }) => ({ id: client.id, reference: client.reference, name: client.registeredName, managerId: client.managerId, matches })) };
}

export async function getOnboardingApproval(id: string): Promise<ApprovalRequest> {
  if (MOCK_AUTH) { const r = APPROVALS.find((a) => a.id === id); if (!r) throw new Error("Approval request unavailable."); return r; }
  return toBackendApproval(await approvalHistory(id));
}

export async function loadCommandHistory(type: "LEAD" | "ONBOARDING" | "KYC", id: string, page: number): Promise<CommandHistory[]> {
  if (MOCK_AUTH) return (DEMO_HISTORY.get(id) ?? []).slice(page * 50, (page + 1) * 50);
  const path = type === "LEAD" ? "leads" : type === "KYC" ? "kyc-cases" : "onboarding-cases";
  const result = await readOnboarding<Page<CommandHistory> | CommandHistory[]>(`/api/v1/${path}/${id}/history?page=${page}&size=50`, "Could not load more history.");
  if (!result) throw new Error("History is unavailable.");
  return toHistory(Array.isArray(result) ? result : result.items);
}

/** Uploads the proof under its record with the purpose the backend checks, and returns the reference. */
async function uploadProof(
  subject: { type: "LEAD" | "ONBOARDING" | "KYC"; id: string },
  input: EvidenceInput,
  purpose: string,
  classification: DocumentClassification = "CORRESPONDENCE",
  attempt?: CommandAttempt,
) {
  const load = async () => {
  const occurredAt = instantFrom(input.occurredAt);
  const detail = input.detail?.trim() || undefined;
  if (MOCK_AUTH) {
    const problem = documentProblem(input.file);
    if (problem) throw new Error(problem);
    return { documentId: crypto.randomUUID(), documentVersion: 1, occurredAt, detail, fileName: input.file.name };
  }
  let doc: StoredDocument;
  try { doc = await uploadDocument(subject, input.file, { classification, purpose }); }
  catch (error) { if (attempt && (!(error instanceof OnboardingError) || (error.status ?? 500) >= 500)) attempt.uncertain = true; throw error; }
  return { documentId: doc.id, documentVersion: doc.version, occurredAt, detail, fileName: input.file.name };
  };
  return attempt ? attempt.memo(`proof:${subject.type}:${subject.id}:${purpose}`, load) : load();
}

/* Names and choices */

/** Products, insurers and Accounts Executives for the onboarding forms. */
export async function onboardingOptions(): Promise<{ products: ChoiceOption[]; insurers: ChoiceOption[]; accountExecutives: ChoiceOption[] }> {
  if (MOCK_AUTH) {
    const names = (groups: OptionGroup[]) => groups.flatMap((g) => g.options).map((n) => ({ id: n, name: n }));
    return { products: names(PRODUCT_GROUPS), insurers: names(INSURER_GROUPS), accountExecutives: (await mockListManagers()).map((n) => ({ id: n, name: n })) };
  }
  const [catalog, managers] = await Promise.all([loadCatalog(), loadManagers()]);
  const activeInsurers = (catalog?.insurers ?? []).filter((insurer) => insurer.active);
  await loadInsurerProductLinks(activeInsurers);
  const supportedProductIds = new Set(activeInsurers.flatMap((insurer) => INSURER_PRODUCT_IDS.get(insurer.id) ?? []));
  return {
    products: (catalog?.products ?? []).filter((p) => p.active && supportedProductIds.has(p.id)).map((p) => ({ id: p.id, name: p.name })),
    insurers: activeInsurers.map((i) => ({ id: i.id, name: i.name })),
    accountExecutives: managers.map((m) => ({ id: m.id, name: m.fullName })),
  };
}

/** Active insurers that the backend catalog links to a product. */
export async function insurersForProduct(productId: string): Promise<string[] | null> {
  if (MOCK_AUTH) return null;
  const catalog = await loadCatalog();
  if (!catalog || !productId) return null;
  const insurers = catalog.insurers.filter((insurer) => insurer.active);
  await loadInsurerProductLinks(insurers);
  return insurers.filter((insurer) => INSURER_PRODUCT_IDS.get(insurer.id)?.includes(productId)).map((insurer) => insurer.id);
}

export type InsurerProductCatalog = {
  insurers: { id: string; name: string; typeCode: string; supportedTermCodes: string[] }[];
  products: { id: string; name: string; termCode: string }[];
  insurerTypes: { code: string; name: string; termCodes: string[] }[];
  productTerms: { code: string; name: string }[];
  productLines: { code: string; name: string; termCode: string }[];
  linkedProductIds: Record<string, string[]>;
};

/** Load active catalog entries and their current insurer-product links for management. */
export async function getInsurerProductCatalog(): Promise<InsurerProductCatalog> {
  if (MOCK_AUTH) throw new Error("Sign in to the backend as a GI Underwriting Manager to manage insurer products.");
  const catalog = await loadCatalog();
  if (!catalog) throw new Error("Could not load the insurer and product catalogs.");
  const activeInsurers = catalog.insurers.filter((insurer) => insurer.active);
  const activeProducts = catalog.products.filter((product) => product.active);
  const linkedProductIds: Record<string, string[]> = {};
  await Promise.all(activeInsurers.map(async (insurer) => {
    const path = `/api/v1/policy/catalog/insurers/${insurer.id}/products`;
    const res = await apiFetch(path);
    if (!res.ok) throw new Error(await catalogApiProblem(res, `Could not load products for ${insurer.name}.`));
    const products = (await res.json()) as ProductView[];
    const ids = products.filter((product) => product.active).map((product) => product.id);
    linkedProductIds[insurer.id] = ids;
    INSURER_PRODUCT_IDS.set(insurer.id, ids);
  }));
  return {
    insurers: activeInsurers.map((insurer) => ({
      id: insurer.id,
      name: insurer.name,
      typeCode: insurer.typeCode,
      supportedTermCodes: catalog.insurerTypes.find((type) => type.code === insurer.typeCode)?.termCodes ?? [],
    })),
    products: activeProducts.map((product) => ({ id: product.id, name: product.name, termCode: product.termCode })),
    insurerTypes: catalog.insurerTypes.filter((type) => type.active).map((type) => ({ code: type.code, name: type.name, termCodes: type.termCodes ?? [] })),
    productTerms: catalog.terms.filter((term) => term.active).map((term) => ({ code: term.code, name: term.name })),
    productLines: catalog.lines.filter((line) => line.active).map((line) => ({ code: line.code, name: line.name, termCode: line.termCode })),
    linkedProductIds,
  };
}

/** Create the backend-audited insurer-product link. */
export async function linkProductToInsurer(insurerId: string, productId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error("Give a reason for linking this product to the insurer.");
  const res = await apiFetch(`/api/v1/policy/catalog/insurers/${insurerId}/products/${productId}`, {
    method: "POST",
    body: JSON.stringify({ reason: reason.trim() }),
  });
  if (!res.ok) throw new Error(await catalogApiProblem(res, "Could not link the product to the insurer."));
  INSURER_PRODUCT_IDS.delete(insurerId);
}

export async function addInsurer(input: { code: string; name: string; typeCode: string; reason: string }): Promise<void> {
  if (!input.reason.trim()) throw new Error("Give a reason for adding this insurer.");
  const res = await apiFetch("/api/v1/policy/catalog/insurers", { method: "POST", body: JSON.stringify({ ...input, reason: input.reason.trim() }) });
  if (!res.ok) throw new Error(await catalogApiProblem(res, "Could not add the insurer."));
  CATALOG = null;
  INSURER_PRODUCT_IDS.clear();
}

export async function addCatalogProduct(input: { code: string; name: string; notes?: string; termCode: string; productLineCodes: string[]; reason: string }): Promise<void> {
  if (!input.reason.trim()) throw new Error("Give a reason for adding this product.");
  if (!input.productLineCodes.length) throw new Error("Choose at least one product line.");
  const res = await apiFetch("/api/v1/policy/catalog/products", { method: "POST", body: JSON.stringify({ ...input, notes: input.notes?.trim() || undefined, reason: input.reason.trim() }) });
  if (!res.ok) throw new Error(await catalogApiProblem(res, "Could not add the product."));
  CATALOG = null;
  INSURER_PRODUCT_IDS.clear();
}

export async function unlinkProductFromInsurer(insurerId: string, productId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error("Give a reason for removing this product link.");
  const params = new URLSearchParams({ reason: reason.trim() });
  const res = await apiFetch(`/api/v1/policy/catalog/insurers/${insurerId}/products/${productId}?${params}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await catalogApiProblem(res, "Could not remove the product link."));
  INSURER_PRODUCT_IDS.delete(insurerId);
}

async function catalogApiProblem(res: Response, fallback: string): Promise<string> {
  const problem = await readProblem(res);
  if (res.status === 401) return "Your session has ended. Please sign in again.";
  if (res.status === 403) return "You do not have permission to manage insurer products.";
  if (problem.code === "INSURANCE_TYPE_MISMATCH") return "This insurer cannot offer products in that insurance term.";
  if (problem.code === "INSURER_PRODUCT_ALREADY_LINKED") return "This product is already linked to the insurer.";
  if (problem.code) return `${problem.code}: ${fallback}`;
  return problem.title && problem.title !== "Bad Request" ? problem.title : fallback;
}

/** Name of a person, insurer or product from its ID. Demo IDs are already names. */
export async function nameOf(kind: "person" | "insurer" | "product", id?: string): Promise<string | undefined> {
  if (!id) return undefined;
  if (MOCK_AUTH) return id;
  if (kind === "person") return personName(id);
  const catalog = await loadCatalog();
  const list = kind === "insurer" ? catalog?.insurers : catalog?.products;
  return list?.find((x) => x.id === id)?.name;
}

/** Adds the Accounts Executive's name, and the client's name when `withClient` (one extra call, so not for lists). */
async function decorateLead(l: Lead, withClient = true): Promise<Lead> {
  const clientName = l.clientName ?? (withClient && l.clientId ? await clientNameById(l.clientId) : undefined);
  return { ...l, ownerName: l.ownerName ?? (await nameOf("person", l.ownerId)), clientName };
}

async function decorateTrack(t: PolicyTrack, leadName?: string): Promise<PolicyTrack> {
  return { ...t, productName: t.productName ?? (await nameOf("product", t.productId)) ?? "Policy", leadName: t.leadName ?? leadName };
}

async function clientNameById(id: string): Promise<string | undefined> {
  if (MOCK_AUTH) return DEMO_LEADS.find((l) => l.clientId === id)?.clientName;
  const known = allKnownClients().find((c) => c.uuid === id || c.id === id);
  if (known) return known.name;
  const res = await apiFetch(`/api/v1/clients/${id}`).catch(() => null);
  return res?.ok ? ((await res.json()) as ClientView).profile?.registeredName : undefined;
}

async function toHistory(items: { action: string; actorId?: string; reason?: string; occurredAt: string }[]): Promise<CommandHistory[]> {
  return Promise.all(items.map(async (h) => ({ ...h, actorName: (await personName(h.actorId)) ?? undefined })));
}

/* Lists and records */

export async function listLeads(): Promise<{ leads: Lead[]; tracks: PolicyTrack[] }> {
  if (MOCK_AUTH) {
    return {
      leads: DEMO_LEADS.map(demoLeadView),
      tracks: DEMO_TRACKS.map((t) => demoTrackView(t)),
    };
  }
  const [leads, tracks] = await Promise.all([
    readAllOnboarding<Lead>("/api/v1/leads", "Could not load the leads."),
    readAllOnboarding<PolicyTrack>("/api/v1/onboarding-cases", "Could not load the policy tracks."),
  ]);
  const names = new Map(leads.map((l) => [l.id, l.name]));
  return {
    leads: await Promise.all(leads.map((l) => decorateLead(l, false))),
    tracks: await Promise.all(tracks.map((t) => decorateTrack(t, names.get(t.leadId)))),
  };
}

export type LeadDetail = { lead: Lead; tracks: PolicyTrack[]; kyc: KycGate | null; history: CommandHistory[] };

export async function getLead(id: string): Promise<LeadDetail | null> {
  if (MOCK_AUTH) {
    const l = DEMO_LEADS.find((x) => x.id === id);
    if (!l) return null;
    return {
      lead: demoLeadView(l),
      tracks: DEMO_TRACKS.filter((t) => t.leadId === id).map((t) => demoTrackView(t)),
      kyc: l.clientId ? demoKycGate(l.clientId) : null,
      history: DEMO_HISTORY.get(id) ?? [],
    };
  }
  const raw = await readOnboarding<Lead>(`/api/v1/leads/${id}`, "Could not load this lead.");
  if (!raw) return null;
  const [lead, tracks, history, kyc] = await Promise.all([
    decorateLead(raw),
    readAllOnboarding<PolicyTrack>(`/api/v1/leads/${id}/onboarding-cases`, "Could not load the policy tracks."),
    readOnboarding<Page<{ action: string; actorId?: string; reason?: string; occurredAt: string }>>(`/api/v1/leads/${id}/history?size=50`, "").catch(() => null),
    raw.clientId ? readOnboarding<KycGate>(`/api/v1/clients/${raw.clientId}/kyc-summary`, "").catch(() => null) : Promise.resolve(null),
  ]);
  return {
    lead,
    tracks: await Promise.all(tracks.map((t) => decorateTrack(t, raw.name))),
    kyc,
    history: await toHistory(history?.items ?? []),
  };
}

export type TrackDetail = { track: PolicyTrack; lead: Lead | null; history: CommandHistory[] };

export async function getTrack(id: string): Promise<TrackDetail | null> {
  if (MOCK_AUTH) {
    const t = DEMO_TRACKS.find((x) => x.id === id);
    if (!t) return null;
    const l = DEMO_LEADS.find((x) => x.id === t.leadId);
    return { track: demoTrackView(t), lead: l ? demoLeadView(l) : null, history: DEMO_HISTORY.get(id) ?? [] };
  }
  const raw = await readOnboarding<PolicyTrack>(`/api/v1/onboarding-cases/${id}`, "Could not load this policy track.");
  if (!raw) return null;
  const [lead, history] = await Promise.all([
    readOnboarding<Lead>(`/api/v1/leads/${raw.leadId}`, "").catch(() => null),
    readOnboarding<Page<CommandHistory>>(`/api/v1/onboarding-cases/${id}/history?size=50`, "Could not load track history."),
  ]);
  return {
    track: await decorateTrack(raw, lead?.name),
    lead: lead ? await decorateLead(lead) : null,
    history: await toHistory(history?.items ?? []),
  };
}

/* Steps 1 and 2: the lead */

export type NewLeadInput = {
  name: string;
  type: LeadType;
  industry: string;
  source: string;
  sourceReference?: string;
  contactName: string;
  email?: string;
  phone?: string;
  /** When the enquiry arrived (date box value). */
  receivedAt: string;
  /** The Accounts Executive, when the CRM Manager assigns one straight away. */
  ownerId?: string;
  /** Required when assigning an Accounts Executive during lead registration. */
  assignmentReason?: string;
};

/** Step 1: register the lead, then assign the Accounts Executive if one was chosen. */
export async function registerLead(input: NewLeadInput, attempt?: CommandAttempt): Promise<Lead> {
  if (input.ownerId) requireReason(input.assignmentReason ?? "");
  const body = {
    commandId: attempt ? attempt.value("registrationId", () => crypto.randomUUID()) : crypto.randomUUID(),
    name: input.name.trim(),
    type: input.type,
    industry: input.industry.trim(),
    source: input.source,
    sourceReference: input.sourceReference?.trim() || undefined,
    contactName: input.contactName.trim(),
    email: input.email?.trim().toLowerCase() || undefined,
    phone: input.phone?.trim() || undefined,
    receivedAt: instantFrom(input.receivedAt),
  };
  if (MOCK_AUTH) {
    if (DEMO_LEADS.some((l) => sameText(l.name, body.name))) throw new Error("A lead with this name already exists.");
    const highest = DEMO_LEADS.reduce((max, l) => Math.max(max, Number(l.id.split("-").at(-1)) || 0), 0);
    const created: Lead = {
      ...body,
      id: `LD-${new Date().getFullYear()}-${String(highest + 1).padStart(3, "0")}`,
      status: "OPEN",
      version: 1,
      confirmed: false,
      assessed: false,
      blockers: [],
      possibleDuplicateLeadIds: [],
      work: [],
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      responseDueAt: new Date(new Date(body.receivedAt).getTime() + 24 * 3600_000).toISOString(),
      needsDueAt: `${addWorkingDays(body.receivedAt.slice(0, 10), 3)}T17:00:00Z`,
      ownerId: input.ownerId,
    };
    DEMO_LEADS.unshift(created);
    demoLog(created.id, "LEAD_REGISTERED");
    if (input.ownerId) demoLog(created.id, "LEAD_ASSIGNED", input.assignmentReason);
    return demoLeadView(created);
  }
  let lead = await sendOnboarding<Lead>("POST", "/api/v1/leads", body, "Could not register the lead. Please try again.", attempt);
  if (input.ownerId && input.ownerId !== lead.ownerId) {
    // The lead is saved; a failed assignment is shown on the lead to retry, not undone.
    lead = await assignLead(lead, input.ownerId, input.assignmentReason!).catch(() => lead);
  }
  return decorateLead(lead);
}

function demoLeadCommand(lead: Lead, action: string, change: (l: Lead) => Partial<Lead>, reason?: string): Lead {
  const index = DEMO_LEADS.findIndex((l) => l.id === lead.id);
  const current = DEMO_LEADS[index];
  if (!current) throw new Error("This lead could not be found.");
  if (current.version !== lead.version) throw new Error(ONBOARDING_MESSAGES.STALE_VERSION!);
  const updated = { ...current, ...change(current), version: current.version + 1, updatedAt: new Date().toISOString() };
  DEMO_LEADS[index] = updated;
  demoLog(lead.id, action, reason);
  return demoLeadView(updated);
}

export async function assignLead(lead: Lead, ownerId: string, reason: string, attempt?: CommandAttempt): Promise<Lead> {
  requireReason(reason);
  if (MOCK_AUTH) return demoLeadCommand(lead, "LEAD_ASSIGNED", () => ({ ownerId }), reason.trim());
  const path = `/api/v1/leads/${lead.id}/assignment`;
  const body = { command: commandEnvelope(lead.version, reason.trim(), attempt), ownerId };
  return decorateLead(
    await sendOnboarding<Lead>("POST", path, body, "Could not assign the Accounts Executive.", attempt),
  );
}

export async function confirmLead(lead: Lead, attempt?: CommandAttempt): Promise<Lead> {
  if (MOCK_AUTH) {
    return demoLeadCommand(lead, "LEAD_CONFIRMED", (l) => {
      if (!l.ownerId) throw new Error(ONBOARDING_MESSAGES.OWNER_REQUIRED);
      return { confirmed: true };
    });
  }
  return decorateLead(await sendOnboarding<Lead>("POST", `/api/v1/leads/${lead.id}/confirm-registration`, commandEnvelope(lead.version, undefined, attempt), "Could not confirm the registration.", attempt));
}

/** Step 2, first part: the Accounts Executive's first response, within 24 hours. */
export async function recordLeadResponse(lead: Lead, evidence: EvidenceInput, attempt?: CommandAttempt): Promise<Lead> {
  const p = await uploadProof({ type: "LEAD", id: lead.id }, evidence, "LEAD_RESPONSE", "CORRESPONDENCE", attempt);
  if (MOCK_AUTH) {
    return demoLeadCommand(lead, "LEAD_RESPONDED", () => ({ respondedAt: p.occurredAt, responseEvidence: { purpose: "LEAD_RESPONSE", ...p } }));
  }
  return decorateLead(
    await sendOnboarding<Lead>("POST", `/api/v1/leads/${lead.id}/record-response`, { command: commandEnvelope(lead.version, undefined, attempt), ...p, fileName: undefined }, "Could not record the response.", attempt),
  );
}

export type AssessmentInput = {
  meetingAt: string;
  needs: string;
  assets: string;
  employeeCount?: number;
  existingCover: string;
  request: EvidenceInput;
  summary: EvidenceInput;
  confirmation: EvidenceInput;
};

/** Step 2: the meeting and needs assessment, with the pre-meeting request, the summary and the client's confirmation. */
export async function recordAssessment(lead: Lead, input: AssessmentInput, attempt?: CommandAttempt): Promise<Lead> {
  // The backend checks the order: request on or before the meeting, summary on
  // or after it, confirmation on or after the summary.
  if (input.request.occurredAt > input.meetingAt) throw new Error("The pre-meeting request must be sent on or before the meeting date.");
  if (input.summary.occurredAt < input.meetingAt) throw new Error("The meeting summary must be written on or after the meeting date.");
  if (input.confirmation.occurredAt < input.summary.occurredAt) throw new Error("The client's confirmation must be on or after the summary date.");
  // Dates on the same day get the same time, so their order holds.
  const clock = Date.now();
  const meetingAt = instantFrom(input.meetingAt, clock);
  const at = (date: string) => ({ occurredAt: instantFrom(date, clock) });
  const subject = { type: "LEAD" as const, id: lead.id };
  const [request, summary, confirmation] = await Promise.all([
    uploadProof(subject, { ...input.request, ...at(input.request.occurredAt) }, "PRE_MEETING_REQUEST", "CORRESPONDENCE", attempt),
    uploadProof(subject, { ...input.summary, ...at(input.summary.occurredAt) }, "MEETING_SUMMARY", "CORRESPONDENCE", attempt),
    uploadProof(subject, { ...input.confirmation, ...at(input.confirmation.occurredAt) }, "MEETING_CONFIRMATION", "CORRESPONDENCE", attempt),
  ]);
  const fields = { meetingAt, needs: input.needs.trim(), assets: input.assets.trim(), employeeCount: input.employeeCount, existingCover: input.existingCover.trim() };
  if (MOCK_AUTH) {
    return demoLeadCommand(lead, "LEAD_ASSESSED", (l) => {
      if (!l.confirmed || !l.ownerId) throw new Error(ONBOARDING_MESSAGES.LEAD_NOT_CONFIRMED);
      return {
        assessed: true,
        assessment: {
          ...fields,
          evidence: [
            { purpose: "PRE_MEETING_REQUEST", ...request },
            { purpose: "MEETING_SUMMARY", ...summary },
            { purpose: "MEETING_CONFIRMATION", ...confirmation },
          ],
        },
      };
    });
  }
  const strip = ({ fileName: _fileName, ...rest }: typeof request) => rest;
  return decorateLead(
    await sendOnboarding<Lead>(
      "POST",
      `/api/v1/leads/${lead.id}/assessment`,
      { command: commandEnvelope(lead.version, undefined, attempt), ...fields, request: strip(request), summary: strip(summary), confirmation: strip(confirmation) },
      "Could not record the needs assessment.", attempt
    ),
  );
}

export type ProspectInput = {
  registeredName: string;
  clientType: string;
  sector: string;
  address: string;
  contactName: string;
  jobTitle: string;
  email: string;
  phone: string;
  /** Required when the backend warned about a possible duplicate and the person goes ahead. */
  duplicateReason?: string;
  reviewFingerprint?: string;
};

/** Step 2, last part: open the prospect client (a client record that is not insured yet). */
export async function openProspect(lead: Lead, input: ProspectInput, attempt?: CommandAttempt): Promise<Lead> {
  if (MOCK_AUTH) {
    return demoLeadCommand(lead, "LEAD_PROSPECT_CREATED", (l) => {
      if (!l.assessed) throw new Error(ONBOARDING_MESSAGES.LEAD_NOT_READY);
      const n = DEMO_LEADS.length + 100;
      return { clientId: `CLT-P${n}`, clientName: input.registeredName.trim() };
    });
  }
  return decorateLead(
    await sendOnboarding<Lead>("POST", `/api/v1/leads/${lead.id}/prospect`, { command: commandEnvelope(lead.version, undefined, attempt), ...input }, "Could not open the prospect client.", attempt),
  );
}

/** Or link a client GRAL already has (its account manager must be the lead's Accounts Executive). */
export async function linkLeadClient(lead: Lead, client: Client, attempt?: CommandAttempt): Promise<Lead> {
  if (MOCK_AUTH) return demoLeadCommand(lead, "LEAD_CLIENT_LINKED", () => ({ clientId: client.id, clientName: client.name }));
  if (!client.uuid) throw new Error("This client is not on the backend yet.");
  return decorateLead(
    await sendOnboarding<Lead>("POST", `/api/v1/leads/${lead.id}/link-client`, { command: commandEnvelope(lead.version, undefined, attempt), clientId: client.uuid }, "Could not link the client.", attempt),
  );
}

export async function linkProspectCandidate(lead: Lead, clientId: string, name: string, attempt?: CommandAttempt): Promise<Lead> {
  if (MOCK_AUTH) return demoLeadCommand(lead, "LEAD_CLIENT_LINKED", () => ({ clientId, clientName: name }));
  return decorateLead(await sendOnboarding<Lead>("POST", `/api/v1/leads/${lead.id}/link-client`, { command: commandEnvelope(lead.version, undefined, attempt), clientId }, "Could not link the client.", attempt));
}

export async function closeLead(lead: Lead, disposition: "CLOSED_LOST" | "CANCELLED", reason: string, attempt?: CommandAttempt): Promise<Lead> {
  if (!reason.trim()) throw new Error("Say why the lead is being closed.");
  if (MOCK_AUTH) {
    return demoLeadCommand(lead, "LEAD_CLOSED", () => {
      if (DEMO_TRACKS.some((t) => t.leadId === lead.id && (t.status === "OPEN" || t.status === "ON_HOLD"))) throw new Error(ONBOARDING_MESSAGES.CLOSE_POLICY_TRACKS_FIRST);
      return { status: disposition };
    });
  }
  return decorateLead(
    await sendOnboarding<Lead>("POST", `/api/v1/leads/${lead.id}/close`, { command: commandEnvelope(lead.version, reason.trim(), attempt), disposition }, "Could not close the lead.", attempt),
  );
}

/** Start a policy track: one policy to place for this lead, moving through steps 3 to 11 on its own. */
export async function startTrack(lead: Lead, input: { productId: string; underwritingRole: string; property: boolean }, attempt?: CommandAttempt): Promise<PolicyTrack> {
  if (MOCK_AUTH) {
    const l = DEMO_LEADS.find((x) => x.id === lead.id);
    if (!l || !leadReady(l)) throw new Error(ONBOARDING_MESSAGES.LEAD_NOT_READY);
    const highest = DEMO_TRACKS.reduce((max, t) => Math.max(max, Number(t.id.split("-").at(-1)) || 0), 0);
    const created: PolicyTrack = {
      id: `TRK-${new Date().getFullYear()}-${String(highest + 1).padStart(3, "0")}`,
      leadId: l.id,
      clientId: l.clientId!,
      ownerId: l.ownerId,
      productId: input.productId,
      underwritingRole: input.underwritingRole,
      stage: 3,
      status: "OPEN",
      version: 1,
      materialRevision: 0,
      milestones: [{ code: "KYC", stage: 3, status: "OPEN" }],
      quotes: [],
      approvalRequests: {},
      evidence: [],
      discrepancies: [],
      blockers: [],
      availableActions: [],
      invitations: [],
      renewalProfile: "STANDARD",
      assignees: {},
      property: input.property,
    } as PolicyTrack & { property: boolean };
    DEMO_TRACKS.unshift(created);
    demoLog(created.id, "ONBOARDING_STARTED");
    demoLog(l.id, "ONBOARDING_STARTED");
    return demoTrackView(created);
  }
  return decorateTrack(
    await sendOnboarding<PolicyTrack>(
      "POST",
      `/api/v1/leads/${lead.id}/onboarding-cases`,
      { command: commandEnvelope(lead.version, undefined, attempt), productId: input.productId, underwritingRole: input.underwritingRole, property: input.property },
      "Could not start the policy track.", attempt
    ),
    lead.name,
  );
}

/* Steps 3 to 11: a policy track */

export type TrackActionInput = {
  attempt?: CommandAttempt;
  existingEvidence?: Record<string, { documentId: string; documentVersion: number; occurredAt: string; detail?: string }>;
  /** An action code from availableActions, or INSURER_RESPONSE / SINGLE_SOURCE / DEADLINE. */
  action: string;
  fields?: Record<string, unknown>;
  /** Proof documents by slot: main, letter, delivery, fileChecklist. */
  evidence?: Record<string, EvidenceInput>;
  reason?: string;
};

/** Where each action goes, which document purpose it proves, and how its body is shaped. */
const TRACK_ROUTES: Record<string, { path: string; purpose?: string; classification?: DocumentClassification; shape: "plain" | "flat" | "nested" | "custom" }> = {
  QUALIFY_KYC: { path: "qualify-kyc", shape: "plain" },
  SURVEY: { path: "risk-survey", purpose: "RISK_SURVEY", shape: "nested" },
  SURVEY_NOT_APPLICABLE: { path: "risk-survey-not-applicable", shape: "plain" },
  PROGRAM: { path: "program", purpose: "PROGRAM", classification: "APPROVAL_EVIDENCE", shape: "nested" },
  LICENSE: { path: "insurer-license", purpose: "INSURER_LICENSE", classification: "CORRESPONDENCE", shape: "nested" },
  SINGLE_SOURCE: { path: "request-single-source", purpose: "SINGLE_SOURCE", shape: "flat" },
  RFQ: { path: "dispatch-rfq", purpose: "RFQ", shape: "nested" },
  INSURER_RESPONSE: { path: "insurer-response", shape: "custom" },
  QUOTE: { path: "quotes", purpose: "QUOTE", shape: "nested" },
  RECOMMEND: { path: "recommend", purpose: "RECOMMENDATION", shape: "nested" },
  REQUEST_APPROVAL: { path: "request-approval", shape: "plain" },
  REVISE: { path: "revise", shape: "plain" },
  RECORD_BOARD_EVIDENCE: { path: "record-board-approval", purpose: "BOARD_APPROVAL", classification: "APPROVAL_EVIDENCE", shape: "flat" },
  PRESENT: { path: "record-presentation", purpose: "CLIENT_PRESENTATION", shape: "flat" },
  ACCEPT: { path: "record-client-acceptance", purpose: "CLIENT_ACCEPTANCE", classification: "CLIENT_ACCEPTANCE", shape: "flat" },
  PROPERTY_ASSETS: { path: "property-assets", purpose: "PROPERTY_ASSET_LIST", shape: "flat" },
  PLACE: { path: "place", purpose: "PLACEMENT", shape: "flat" },
  CONFIRM_PLACEMENT: { path: "confirm-placement", purpose: "PLACEMENT_CONFIRMATION", shape: "flat" },
  SCHEDULE: { path: "receive-schedule", purpose: "SCHEDULE", classification: "POLICY_SCHEDULE", shape: "nested" },
  TECHNICAL_VERIFICATION: { path: "technical-verification", purpose: "POLICY_TECHNICAL_APPROVAL", classification: "APPROVAL_EVIDENCE", shape: "flat" },
  VERIFY: { path: "verify", shape: "plain" },
  CONVERT: { path: "convert", shape: "custom" },
  WELCOME: { path: "complete-welcome", shape: "custom" },
  ASSIGN: { path: "assignment", shape: "custom" },
  ON_HOLD: { path: "disposition", shape: "custom" },
  RESUME: { path: "disposition", shape: "custom" },
  CLOSE: { path: "disposition", shape: "custom" },
  DEADLINE: { path: "deadline", shape: "custom" },
};

/** Runs one action on a policy track and returns the track as the backend now shows it. */
export async function runTrackAction(track: PolicyTrack, input: TrackActionInput): Promise<PolicyTrack> {
  const route = TRACK_ROUTES[input.action];
  if (!route) throw new Error("This action is not available here.");
  if (input.reason && input.reason.trim().length > 500) throw new Error("Keep the reason within 500 characters.");
  const reasonRequired = ["SURVEY_NOT_APPLICABLE", "REVISE", "ON_HOLD", "CLOSE", "DEADLINE", "ASSIGN"].includes(input.action);
  if (reasonRequired && !input.reason?.trim()) throw new Error("Give the reason. It is kept in the history.");
  const attempt = input.attempt;
  const subject = { type: "ONBOARDING" as const, id: track.id };
  const f = input.fields ?? {};
  if (input.action === "LICENSE" && (!f.insurerId || !f.validUntil || !String(f.source ?? "").trim() || !input.evidence?.main)) {
    throw new Error("Choose an insurer, enter the licence expiry date and source, and attach the licence evidence file.");
  }
  if (input.action === "SINGLE_SOURCE") {
    const justification = input.evidence?.main?.detail?.trim();
    if (!justification) throw new Error("Write the justification for the single-source exception.");
    if (justification.length > 2000) throw new Error("Keep the single-source justification within 2000 characters.");
  }
  const purpose = input.action === "LICENSE" ? `INSURER_LICENSE_${String(f.insurerId ?? "").replace(/-/g, "")}` : route.purpose;

  const proofs: Record<string, Awaited<ReturnType<typeof uploadProof>>> = {};
  if (input.action === "WELCOME") {
    const slots: [string, string][] = [["letter", "WELCOME_LETTER"], ["delivery", "POLICY_DELIVERY"], ["fileChecklist", "FILE_CHECKLIST"]];
    for (const [slot, p] of slots) {
      const e = input.evidence?.[slot];
      if (!e) throw new Error("Attach the welcome letter, the delivery proof and the file checklist.");
      proofs[slot] = await uploadProof(subject, e, p, "CORRESPONDENCE", attempt);
    }
  } else if (purpose && input.existingEvidence?.main) {
    proofs.main = { ...input.existingEvidence.main, detail: input.existingEvidence.main.detail, fileName: "Existing signed evidence" };
  } else if (purpose) {
    const e = input.evidence?.main;
    if (!e) throw new Error("Attach the document that proves this step.");
    proofs.main = await uploadProof(subject, e, purpose, route.classification, attempt);
  }

  if (MOCK_AUTH) return demoTrackAction(track, input, proofs, purpose);

  const command = commandEnvelope(track.version, input.reason?.trim(), attempt);
  const strip = (p?: Awaited<ReturnType<typeof uploadProof>>) => (p ? { documentId: p.documentId, documentVersion: p.documentVersion, occurredAt: p.occurredAt, detail: p.detail } : undefined);
  let body: unknown;
  switch (route.shape) {
    case "plain":
      body = command;
      break;
    case "flat":
      body = { command, ...strip(proofs.main) };
      break;
    case "nested":
      body = { evidence: { command, ...strip(proofs.main) }, ...f };
      break;
    case "custom":
      body =
        input.action === "INSURER_RESPONSE"
          ? { command, insurerId: f.insurerId, outcome: f.outcome, detail: f.detail }
          : input.action === "CONVERT"
            ? { command, amountPaid: f.amountPaid }
            : input.action === "WELCOME"
              ? { command, letter: strip(proofs.letter), delivery: strip(proofs.delivery), fileChecklist: strip(proofs.fileChecklist) }
              : input.action === "ASSIGN"
                ? { command, responsibility: f.responsibility, assigneeId: f.assigneeId }
                : input.action === "DEADLINE"
                  ? { command, milestone: f.milestone, dueAt: new Date(String(f.dueAt)).toISOString() }
                  : { command, disposition: input.action === "CLOSE" ? (f.disposition ?? "CLOSED_LOST") : input.action };
  }
  const saved = await sendOnboarding<PolicyTrack>("POST", `/api/v1/onboarding-cases/${track.id}/${route.path}`, body, "Could not save this step.", attempt);
  return decorateTrack(saved, track.leadName);
}

/* KYC: a review of the client */

export async function listKycTemplates(): Promise<KycTemplate[]> {
  if (MOCK_AUTH) return [...DEMO_KYC_TEMPLATES];
  return (await readOnboarding<KycTemplate[]>("/api/v1/kyc-templates", "Could not load the KYC checklists.")) ?? [];
}

/** Adds a new version of GRAL's checklist for a client type (needs the KYC policy permission). */
export async function saveKycTemplate(
  code: string,
  input: { clientType: LeadType; requirements: KycRequirement[]; reason: string },
  expectedVersion?: number,
): Promise<KycTemplate | void> {
  if (!input.reason.trim()) throw new Error("Say why the checklist is being set up or changed.");
  if (!input.requirements.length) throw new Error("Add at least one document to the checklist.");
  if (MOCK_AUTH) {
    const existing = DEMO_KYC_TEMPLATES.findIndex((t) => t.code === code);
    const saved: KycTemplate = { code, version: (DEMO_KYC_TEMPLATES[existing]?.version ?? 0) + 1, clientType: input.clientType, requirements: input.requirements };
    if (existing >= 0) DEMO_KYC_TEMPLATES[existing] = saved;
    else DEMO_KYC_TEMPLATES.push(saved);
    return saved;
  }
  const path = `/api/v1/kyc-templates/${encodeURIComponent(code)}`;
  const body = { expectedVersion, ...input };
  console.info("[KYC checklist request]", { method: "PUT", url: `${API_URL}${path}`, body });
  return sendOnboarding<KycTemplate>("PUT", path, body, "Could not save the KYC checklist.");
}

export async function getClientKyc(clientId: string): Promise<{ summary: KycGate | null; reviews: KycReview[] }> {
  if (MOCK_AUTH) return { summary: demoKycGate(clientId), reviews: DEMO_KYC_REVIEWS.filter((r) => r.clientId === clientId).map(demoKycView) };
  const [summary, reviews] = await Promise.all([
    readOnboarding<KycGate>(`/api/v1/clients/${clientId}/kyc-summary`, "Could not load the KYC summary.").catch(() => null),
    readOnboarding<Page<KycReview> | KycReview[]>(`/api/v1/clients/${clientId}/kyc-cases`, "Could not load the KYC reviews."),
  ]);
  if (!reviews) throw new Error("The client KYC reviews are unavailable under your current access.");
  return { summary, reviews: Array.isArray(reviews) ? reviews : reviews.items };
}

export async function getKycReview(id: string): Promise<{ review: KycReview; history: CommandHistory[] } | null> {
  if (MOCK_AUTH) {
    const r = DEMO_KYC_REVIEWS.find((x) => x.id === id);
    return r ? { review: demoKycView(r), history: DEMO_HISTORY.get(id) ?? [] } : null;
  }
  const review = await readOnboarding<KycReview>(`/api/v1/kyc-cases/${id}`, "Could not load this KYC review.");
  if (!review) return null;
  const history = await readOnboarding<CommandHistory[]>(`/api/v1/kyc-cases/${id}/history?size=50`, "Could not load the review history.");
  return { review: { ...review, clientName: review.clientName ?? (await clientNameById(review.clientId)) }, history: await toHistory(history ?? []) };
}

function kycCommand(review: KycReview, attempt?: CommandAttempt) {
  return commandEnvelope(review.version, undefined, attempt);
}

function demoKycCommand(review: KycReview, action: string, change: (r: KycReview) => Partial<KycReview>): KycReview {
  const index = DEMO_KYC_REVIEWS.findIndex((r) => r.id === review.id);
  const current = DEMO_KYC_REVIEWS[index];
  if (!current) throw new Error("This KYC review could not be found.");
  if (current.version !== review.version) throw new Error(ONBOARDING_MESSAGES.STALE_VERSION!);
  const updated = { ...current, ...change(current), version: current.version + 1 };
  DEMO_KYC_REVIEWS[index] = updated;
  demoLog(review.id, action);
  return demoKycView(updated);
}

export async function startKycReview(clientId: string, templateCode: string, attempt?: CommandAttempt): Promise<KycReview> {
  if (MOCK_AUTH) {
    if (DEMO_KYC_REVIEWS.some((r) => r.clientId === clientId && ["DRAFT", "SUBMITTED", "RETURNED"].includes(r.status))) throw new Error(ONBOARDING_MESSAGES.KYC_REVIEW_ALREADY_OPEN);
    const template = DEMO_KYC_TEMPLATES.find((t) => t.code === templateCode);
    if (!template) throw new Error(ONBOARDING_MESSAGES.KYC_TEMPLATE_UNAVAILABLE);
    const highest = DEMO_KYC_REVIEWS.reduce((max, r) => Math.max(max, Number(r.id.split("-").at(-1)) || 0), 0);
    const created: KycReview = {
      id: `KYC-${new Date().getFullYear()}-${String(highest + 1).padStart(3, "0")}`,
      clientId,
      clientName: DEMO_LEADS.find((l) => l.clientId === clientId)?.clientName,
      version: 1,
      status: "DRAFT",
      templateCode: template.code,
      templateVersion: template.version,
      items: template.requirements.map((r) => ({ ...r })),
      blockers: [],
      evidence: [],
    };
    DEMO_KYC_REVIEWS.unshift(created);
    demoLog(created.id, "KYC_STARTED");
    return demoKycView(created);
  }
  return sendOnboarding<KycReview>("POST", "/api/v1/kyc-cases", { ...commandEnvelope(undefined, undefined, attempt), clientId, templateCode }, "Could not start the KYC review.", attempt);
}

/** Files one checklist document, with the date it actually arrived (the review clock starts from the last one). */
export async function attachKycDocument(review: KycReview, code: string, evidence: EvidenceInput, attempt?: CommandAttempt): Promise<KycReview> {
  const p = await uploadProof({ type: "KYC", id: review.id }, evidence, code, "KYC", attempt);
  if (MOCK_AUTH) {
    return demoKycCommand(review, "KYC_EVIDENCE", (r) => {
      const items = r.items.map((i) => (i.code === code ? { ...i, documentId: p.documentId, documentVersion: 1 } : i));
      const evidenceList = [...r.evidence.filter((e) => e.purpose !== code), { purpose: code, documentId: p.documentId, documentVersion: 1, occurredAt: p.occurredAt, receivedAt: p.occurredAt, fileName: p.fileName }];
      const complete = items.filter((i) => i.required).every((i) => i.documentId);
      const last = evidenceList.map((e) => e.receivedAt ?? e.occurredAt).sort().at(-1);
      return { items, evidence: evidenceList, completeDocumentsAt: complete ? last : undefined, dueAt: complete && last ? `${addWorkingDays(last.slice(0, 10), 3)}T17:00:00Z` : undefined };
    });
  }
  return sendOnboarding<KycReview>(
    "PUT",
    `/api/v1/kyc-cases/${review.id}/requirements/${encodeURIComponent(code)}`,
    { command: kycCommand(review, attempt), documentId: p.documentId, documentVersion: p.documentVersion, receivedAt: p.occurredAt },
    "Could not file the document.", attempt
  );
}

export async function recordKycScreening(review: KycReview, input: { result: "CLEAR" | "REVIEW_REQUIRED" | "REJECTED"; notes: string; evidence: EvidenceInput }, attempt?: CommandAttempt): Promise<KycReview> {
  if (MOCK_AUTH && (DEMO_ROLE !== "Risk & Compliance Manager" || review.reviewerId !== DEMO_REVIEWER)) throw new Error(ONBOARDING_MESSAGES.APPROVER_INELIGIBLE);
  if (!input.notes.trim()) throw new Error("Say which lists were checked and what was found.");
  const p = await uploadProof({ type: "KYC", id: review.id }, input.evidence, "SCREENING", "KYC", attempt);
  if (MOCK_AUTH) {
    return demoKycCommand(review, "KYC_SCREENED", (r) => ({
      screeningResult: input.result,
      screeningNotes: input.notes.trim(),
      evidence: [...r.evidence.filter((e) => e.purpose !== "SCREENING"), { purpose: "SCREENING", documentId: p.documentId, documentVersion: 1, occurredAt: p.occurredAt, fileName: p.fileName }],
    }));
  }
  return sendOnboarding<KycReview>(
    "POST",
    `/api/v1/kyc-cases/${review.id}/record-screening`,
    { command: kycCommand(review, attempt), result: input.result, notes: input.notes.trim(), documentId: p.documentId, documentVersion: p.documentVersion },
    "Could not record the screening.", attempt
  );
}

export async function submitKycReview(review: KycReview, attempt?: CommandAttempt): Promise<KycReview> {
  if (MOCK_AUTH) {
    return demoKycCommand(review, "KYC_SUBMITTED", (r) => {
      if (!r.reviewerId) throw new Error(ONBOARDING_MESSAGES.NO_ELIGIBLE_KYC_REVIEWER);
      if (r.items.some((i) => i.required && !i.documentId)) throw new Error(ONBOARDING_MESSAGES.KYC_DOCUMENTS_INCOMPLETE);
      return { status: "SUBMITTED" };
    });
  }
  return sendOnboarding<KycReview>("POST", `/api/v1/kyc-cases/${review.id}/submit`, kycCommand(review, attempt), "Could not send the KYC review.", attempt);
}

/** The Risk & Compliance Manager's decision. Approval needs a clear screening and the signed KYC Approval Form. */
export async function decideKycReview(review: KycReview, input: { decision: "APPROVE" | "RETURN" | "REJECT"; reason: string; evidence?: EvidenceInput }, attempt?: CommandAttempt): Promise<KycReview> {
  if (MOCK_AUTH && (DEMO_ROLE !== "Risk & Compliance Manager" || review.reviewerId !== DEMO_REVIEWER)) throw new Error(ONBOARDING_MESSAGES.APPROVER_INELIGIBLE);
  if (!input.reason.trim()) throw new Error("Give the reason for the decision.");
  if (input.decision === "APPROVE" && !input.evidence) throw new Error("Attach the signed KYC Approval Form.");
  const p = input.evidence ? await uploadProof({ type: "KYC", id: review.id }, input.evidence, "KYC_APPROVAL", "APPROVAL_EVIDENCE", attempt) : undefined;
  if (MOCK_AUTH) {
    return demoKycCommand(review, "KYC_DECIDED", (r) => {
      if (r.status !== "SUBMITTED") throw new Error("Only a submitted review can be decided.");
      if (input.decision === "APPROVE" && r.screeningResult !== "CLEAR") throw new Error("Approval needs a clear screening result.");
      const status = ({ APPROVE: "APPROVED", RETURN: "RETURNED", REJECT: "REJECTED" } as const)[input.decision];
      return {
        status,
        decisionReason: input.reason.trim(),
        decidedAt: new Date().toISOString(),
        decidedBy: CURRENT_USER?.name ?? "Risk & Compliance Manager",
        evidence: p ? [...r.evidence, { purpose: "KYC_APPROVAL", documentId: p.documentId, documentVersion: 1, occurredAt: p.occurredAt, fileName: p.fileName }] : r.evidence,
      };
    });
  }
  const path = `/api/v1/kyc-cases/${review.id}/decisions`;
  const body = { command: kycCommand(review, attempt), decision: input.decision, reason: input.reason.trim(), documentId: p?.documentId, documentVersion: p?.documentVersion };
  console.info("[KYC decision request]", { method: "POST", url: `${API_URL}${path}`, body });
  return sendOnboarding<KycReview>("POST", path, body, "Could not record the decision.", attempt);
}

export async function escalateKycReview(review: KycReview, input: { evidence: EvidenceInput; revisedDueAt: string; reason: string }, attempt?: CommandAttempt): Promise<KycReview> {
  if (!input.reason.trim()) throw new Error("Give the reason for the delay.");
  const p = await uploadProof({ type: "KYC", id: review.id }, input.evidence, "KYC_ESCALATION", "CORRESPONDENCE", attempt);
  if (MOCK_AUTH) return demoKycCommand(review, "KYC_ESCALATED", () => ({ revisedDueAt: `${input.revisedDueAt}T17:00:00Z` }));
  return sendOnboarding<KycReview>(
    "POST",
    `/api/v1/kyc-cases/${review.id}/escalate`,
    { command: kycCommand(review, attempt), documentId: p.documentId, documentVersion: p.documentVersion, revisedDueAt: `${input.revisedDueAt}T17:00:00Z`, reason: input.reason.trim() },
    "Could not escalate the review.", attempt
  );
}

/* Demo mode: the same rules on sample data */

const DEMO_HISTORY = new Map<string, CommandHistory[]>();

/** Demo mode: the signed-in sample role, so track actions follow the backend's permissions. */
let DEMO_ROLE: Role | null = null;
export function setDemoRole(role: Role | null) {
  DEMO_ROLE = role;
}

function demoLog(id: string, action: string, reason?: string) {
  const list = DEMO_HISTORY.get(id) ?? [];
  list.unshift({ action, actorName: CURRENT_USER?.name ?? "You", reason, occurredAt: new Date().toISOString() });
  DEMO_HISTORY.set(id, list);
}

function demoLeadView(l: Lead): Lead {
  const blockers: string[] = [];
  if (!l.ownerId) blockers.push("OWNER_REQUIRED");
  if (!l.confirmed) blockers.push("LEAD_CONFIRMATION_REQUIRED");
  if (!l.assessed) blockers.push("ASSESSMENT_REQUIRED");
  if (!l.clientId) blockers.push("CLIENT_IDENTITY_REQUIRED");
  return { ...l, blockers: l.status === "OPEN" ? blockers : [], ownerName: l.ownerId };
}

function demoKycGate(clientId: string): KycGate {
  const r = DEMO_KYC_REVIEWS.find((x) => x.clientId === clientId);
  if (!r) return { clientId, status: "NOT_STARTED", gateStatus: "NOT_STARTED", missingRequirements: [] };
  return {
    clientId,
    caseId: r.id,
    status: r.status,
    gateStatus: demoKycView(r).blockers.includes("KYC_TEMPLATE_CHANGED") ? "KYC_TEMPLATE_CHANGED" : r.status === "APPROVED" ? "READY" : r.status,
    completeDocumentsAt: r.completeDocumentsAt,
    dueAt: r.dueAt,
    revisedDueAt: r.revisedDueAt,
    missingRequirements: r.items.filter((i) => i.required && !i.documentId).map((i) => i.label),
  };
}

function demoKycView(r: KycReview): KycReview {
  const blockers: string[] = [];
  const current = DEMO_KYC_TEMPLATES.find((t) => t.code === r.templateCode);
  if (current && current.version !== r.templateVersion) blockers.push("KYC_TEMPLATE_CHANGED");
  if (!r.reviewerId && ["DRAFT", "RETURNED"].includes(r.status)) blockers.push("NO_ELIGIBLE_KYC_REVIEWER");
  if (r.items.some((i) => i.required && !i.documentId)) blockers.push("KYC_DOCUMENTS_INCOMPLETE");
  if (!r.screeningResult) blockers.push("SCREENING_REQUIRED");
  return { ...r, blockers: ["DRAFT", "RETURNED"].includes(r.status) ? blockers : blockers.filter((b) => b === "KYC_TEMPLATE_CHANGED") };
}

function demoApprovalStatus(id?: string) {
  return id ? (APPROVALS.find((r) => r.id === id)?.status ?? "STATUS_UNAVAILABLE") : undefined;
}

function hasProof(t: PolicyTrack, purpose: string) {
  return t.evidence.some((e) => e.purpose === purpose);
}

/** Blockers and allowed actions, worked out the way the backend's OnboardingViews does. */
function demoTrackView(t: PolicyTrack): PolicyTrack {
  const blockers: string[] = [];
  const actions: string[] = [];
  const kyc = demoKycGate(t.clientId);
  const kycReady = kyc.gateStatus === "READY";
  if (!kycReady) blockers.push(kyc.gateStatus);
  const lead = DEMO_LEADS.find((l) => l.id === t.leadId);
  const individual = lead?.type === "INDIVIDUAL";
  const property = (t as PolicyTrack & { property?: boolean }).property ?? /property/i.test(t.productId);
  const discrepancy = t.discrepancies.length > 0;
  if (discrepancy) blockers.push("SCHEDULE_TERMS_MISMATCH");
  const approval = demoApprovalStatus(t.approvalRequests.RECOMMENDATION);
  let primary: string | null = null;
  switch (t.stage) {
    case 3:
      if (kycReady) primary = "QUALIFY_KYC";
      break;
    case 4:
      primary = individual ? "SURVEY_NOT_APPLICABLE" : "SURVEY";
      blockers.push(individual ? "SURVEY_APPLICABILITY_REQUIRED" : "RISK_SURVEY_REQUIRED");
      break;
    case 5:
      primary = "PROGRAM";
      blockers.push("PROGRAM_SIGNOFF_REQUIRED");
      break;
    case 6:
      primary = "RFQ";
      blockers.push("RFQ_DISPATCH_REQUIRED");
      break;
    case 7:
      primary = "QUOTE";
      if (t.invitations.some((i) => !i.response)) blockers.push("RFQ_RESPONSES_UNACCOUNTED");
      else if (t.quotes.length === 0) blockers.push("QUOTE_REQUIRED");
      else if (new Set(t.quotes.map((q) => q.terms.insurerId)).size < 2 && demoApprovalStatus(t.approvalRequests.SINGLE_SOURCE) !== "APPROVED") blockers.push("SINGLE_SOURCE_APPROVAL_REQUIRED");
      else primary = "RECOMMEND";
      break;
    case 8:
      if (!approval) {
        blockers.push("APPROVAL_REQUIRED");
        primary = "REQUEST_APPROVAL";
      } else if (approval !== "APPROVED") blockers.push(`APPROVAL_${approval}`);
      else primary = "PRESENT";
      if (t.recommendation?.tier === "STRATEGIC" && approval && !hasProof(t, "BOARD_APPROVAL")) {
        const r = APPROVALS.find((x) => x.id === t.approvalRequests.RECOMMENDATION);
        if (r && r.steps[0]?.status === "APPROVED") actions.push("RECORD_BOARD_EVIDENCE");
      }
      break;
    case 9:
      if (!hasProof(t, "CLIENT_PRESENTATION")) {
        primary = "PRESENT";
        blockers.push("CLIENT_PRESENTATION_REQUIRED");
      } else if (!hasProof(t, "CLIENT_ACCEPTANCE")) {
        primary = "ACCEPT";
        blockers.push("WRITTEN_ACCEPTANCE_REQUIRED");
      } else if (property && !hasProof(t, "PROPERTY_ASSET_LIST")) {
        blockers.push("PROPERTY_ASSET_LIST_REQUIRED");
        actions.push("PROPERTY_ASSETS");
      } else primary = "PLACE";
      break;
    case 10:
      if (!hasProof(t, "PLACEMENT_CONFIRMATION")) {
        primary = "CONFIRM_PLACEMENT";
        blockers.push("PLACEMENT_CONFIRMATION_REQUIRED");
      } else if (!t.observedSchedule || discrepancy) {
        primary = "SCHEDULE";
        if (!t.observedSchedule) blockers.push("POLICY_SCHEDULE_REQUIRED");
      } else if (!hasProof(t, "POLICY_TECHNICAL_APPROVAL")) {
        primary = "TECHNICAL_VERIFICATION";
        blockers.push("TECHNICAL_VERIFICATION_REQUIRED");
      } else if (!hasProof(t, "VERIFIED")) {
        primary = "VERIFY";
        blockers.push("POLICY_VERIFICATION_REQUIRED");
      } else primary = "CONVERT";
      break;
    case 11:
      if (!t.convertedAt || !hasProof(t, "WELCOME_LETTER")) primary = "WELCOME";
      break;
  }
  const needsKyc = ["QUALIFY_KYC", "SURVEY", "PROGRAM", "RFQ", "QUOTE", "RECOMMEND", "REQUEST_APPROVAL", "PRESENT", "PLACE", "CONVERT"];
  const open = t.status === "OPEN";
  if (open && primary && (!needsKyc.includes(primary) || kycReady)) actions.push(primary);
  if (open && t.stage === 7 && kycReady && !actions.includes("QUOTE")) actions.push("QUOTE");
  if (open && t.stage >= 6 && t.stage <= 10) actions.push("LICENSE");
  if (open && [7, 8, 9].includes(t.stage) && !hasProof(t, "PLACEMENT")) actions.push("REVISE");
  if (t.status === "OPEN" || t.status === "ON_HOLD") {
    actions.push("ASSIGN", t.status === "ON_HOLD" ? "RESUME" : "ON_HOLD");
    if (!t.convertedAt) actions.push("CLOSE");
  }
  return {
    ...t,
    blockers: t.status === "OPEN" || t.status === "ON_HOLD" ? blockers : [],
    availableActions: DEMO_ROLE ? actions.filter((a) => demoCanRunTrackAction(DEMO_ROLE!, a)) : actions,
    kyc,
    productName: t.productId,
    leadName: lead?.name,
  };
}

const STAGE_CODES: Record<number, string> = { 3: "KYC", 4: "SURVEY", 5: "PROGRAM", 6: "RFQ", 7: "COMPARISON", 8: "APPROVAL", 9: "ACCEPTANCE", 10: "PLACEMENT", 11: "WELCOME" };
const STAGE_DAYS: Record<number, number> = { 4: 5, 5: 3, 6: 1, 7: 2, 8: 2, 9: 3, 10: 2, 11: 2 };

/** Moves a demo track to a new step: closes the open milestone and opens the next with its deadline. */
function demoAdvance(t: PolicyTrack, stage: number): PolicyTrack {
  const milestones = t.milestones.map((m) => (m.status === "OPEN" ? { ...m, status: "COMPLETED" } : m));
  milestones.push({ code: STAGE_CODES[stage]!, stage, status: "OPEN", dueAt: STAGE_DAYS[stage] ? `${addWorkingDays(todayIso(), STAGE_DAYS[stage]!)}T17:00:00Z` : undefined });
  return { ...t, stage, milestones };
}

function demoTrackAction(track: PolicyTrack, input: TrackActionInput, proofs: Record<string, Awaited<ReturnType<typeof uploadProof>>>, purpose?: string): PolicyTrack {
  const index = DEMO_TRACKS.findIndex((t) => t.id === track.id);
  const current = DEMO_TRACKS[index];
  if (!current) throw new Error("This policy track could not be found.");
  if (current.version !== track.version) throw new Error(ONBOARDING_MESSAGES.STALE_VERSION!);
  const view = demoTrackView(current);
  const free = ["INSURER_RESPONSE", "SINGLE_SOURCE", "DEADLINE"];
  if (input.action === "DEADLINE" && (DEMO_ROLE !== "CRM Manager" || current.status !== "OPEN")) throw new Error("You cannot adjust this deadline.");
  if (input.action === "SINGLE_SOURCE" && (!input.evidence?.main?.detail?.trim() || ![6, 7].includes(current.stage) || DEMO_ROLE !== "GI Underwriting Manager")) throw new Error("An underwriting justification is required at the quotation stage.");
  if (!free.includes(input.action) && !view.availableActions.includes(input.action)) {
    throw new Error(view.blockers[0] ? blockerText(view.blockers[0]) : ONBOARDING_MESSAGES.INVALID_STAGE!);
  }
  const f = input.fields ?? {};
  const proofOf = (slot: string, p: string): Proof => ({ purpose: p, documentId: proofs[slot]!.documentId, documentVersion: 1, occurredAt: proofs[slot]!.occurredAt, fileName: proofs[slot]!.fileName });
  let t: PolicyTrack = { ...current, evidence: proofs.main && purpose ? [...current.evidence.filter((e) => e.purpose !== purpose), proofOf("main", purpose)] : current.evidence };

  switch (input.action) {
    case "QUALIFY_KYC":
      t = demoAdvance(t, 4);
      break;
    case "SURVEY":
      t = demoAdvance({ ...t, riskGrade: String(f.grade), surveyFindings: String(f.findings ?? "") }, 5);
      break;
    case "SURVEY_NOT_APPLICABLE":
      t = demoAdvance({ ...t, riskGrade: "NOT_APPLICABLE", surveyFindings: input.reason }, 5);
      break;
    case "PROGRAM":
      t = demoAdvance({ ...t, programTerms: String(f.terms ?? "") }, 6);
      break;
    case "RFQ": {
      const insurerIds = (f.insurerIds as string[]) ?? [];
      if (insurerIds.length < 3 && demoApprovalStatus(t.approvalRequests.SINGLE_SOURCE) !== "APPROVED") {
        throw new Error("Ask at least 3 insurers, or get the MD's single-source exception first.");
      }
      t = demoAdvance({ ...t, invitations: insurerIds.map((insurerId) => ({ insurerId, sentAt: new Date().toISOString(), responseDue: String(f.responseDue) })) }, 7);
      break;
    }
    case "INSURER_RESPONSE": {
      const due = t.invitations.find((i) => i.insurerId === f.insurerId)?.responseDue ?? "";
      if (f.outcome === "NO_RESPONSE" && due >= todayIso()) throw new Error(ONBOARDING_MESSAGES.RESPONSE_NOT_DUE);
      t = { ...t, invitations: t.invitations.map((i) => (i.insurerId === f.insurerId ? { ...i, response: String(f.outcome), resolvedAt: new Date().toISOString(), responseDetail: String(f.detail ?? "") } : i)) };
      break;
    }
    case "QUOTE": {
      const terms = f.terms as PolicyTerms;
      const id = `Q-${t.id.slice(-3)}-${t.quotes.length + 1}`;
      t = {
        ...t,
        quotes: [...t.quotes, { id, version: 1, terms, insurerReference: f.insurerReference as string | undefined, receivedAt: new Date().toISOString(), documentId: proofs.main?.documentId }],
        invitations: t.invitations.map((i) => (i.insurerId === terms.insurerId && !i.response ? { ...i, response: "QUOTED", resolvedAt: new Date().toISOString() } : i)),
      };
      break;
    }
    case "RECOMMEND": {
      const amount = Number(f.annualCommissionRwf);
      t = demoAdvance(
        { ...t, materialRevision: t.materialRevision + 1, recommendation: { quoteId: String(f.quoteId), quoteVersion: 1, annualCommissionRwf: amount, basis: String(f.commissionBasis ?? ""), comparison: String(f.comparison ?? ""), rationale: String(f.rationale ?? ""), tier: commissionTier(amount) } },
        8,
      );
      break;
    }
    case "SINGLE_SOURCE":
    case "REQUEST_APPROVAL": {
      const purposeKey = input.action === "SINGLE_SOURCE" ? "SINGLE_SOURCE" : "RECOMMENDATION";
      const tier = purposeKey === "SINGLE_SOURCE" ? "SINGLE_SOURCE" : (t.recommendation?.tier ?? "STANDARD");
      const roles = tier === "STANDARD" ? ["Technical Director"] : tier === "STRATEGIC" ? ["MD", "MD"] : ["Technical Director", "MD"];
      const requestedAt = todayIso();
      const quote = t.quotes.find((q) => q.id === t.recommendation?.quoteId);
      const request: ApprovalRequest = {
        id: nextApprovalId(),
        subjectType: "NEW_BUSINESS",
        action: purposeKey === "SINGLE_SOURCE" ? "SINGLE_SOURCE" : `RECOMMEND_${tier}`,
        currentStepNumber: 1,
        subjectId: t.id,
        subjectRef: t.id,
        subjectRevision: t.materialRevision,
        title: purposeKey === "SINGLE_SOURCE" ? `Single-source exception · ${t.productId}` : `New business · ${t.productId}`,
        summary:
          purposeKey === "SINGLE_SOURCE"
            ? `Fewer than two usable quotes for ${view.leadName}'s ${t.productId}. The written justification is attached.`
            : `Place ${t.productId} for ${view.leadName} with ${quote?.terms.insurerId ?? "the recommended insurer"} at RWF ${(quote?.terms.totalPremium ?? 0).toLocaleString("en-US")}. ${TIER_LABEL[tier] ?? ""}.`,
        client: view.leadName,
        amount: purposeKey === "RECOMMENDATION" ? t.recommendation?.annualCommissionRwf : undefined,
        amountLabel: purposeKey === "RECOMMENDATION" ? "Annual commission" : undefined,
        policyVersion: APPROVAL_POLICY_VERSION.NEW_BUSINESS,
        requestedBy: CURRENT_USER?.name ?? "Underwriting Manager",
        requestedAt,
        dueAt: addWorkingDays(requestedAt, DECISION_DAYS),
        status: "PENDING",
        steps: buildSteps(roles.map((role) => ({ role }))).map((step) => ({ ...step, requiredPermission: tier === "STRATEGIC" && step.order === 2 ? "ONBOARDING_BOARD_EVIDENCE" : "APPROVAL_DECIDE", evidencePurpose: tier === "STRATEGIC" && step.order === 2 ? "BOARD_APPROVAL" : "RECOMMENDATION_APPROVAL" })),
        evidenceRequired: true,
        evidence: [],
        version: 1,
        history: [{ at: requestedAt, by: CURRENT_USER?.name ?? "Underwriting Manager", text: "Approval requested" }],
      };
      APPROVALS.unshift(request);
      t = { ...t, approvalRequests: { ...t.approvalRequests, [purposeKey]: request.id } };
      break;
    }
    case "REVISE": {
      const pending = APPROVALS.find((r) => r.id === t.approvalRequests.RECOMMENDATION && r.status === "PENDING");
      if (pending) pending.status = "REJECTED";
      const { RECOMMENDATION: _old, ...rest } = t.approvalRequests;
      t = demoAdvance(
        { ...t, approvalRequests: rest, recommendation: undefined, evidence: t.evidence.filter((e) => !["CLIENT_PRESENTATION", "CLIENT_ACCEPTANCE", "BOARD_APPROVAL"].includes(e.purpose)) },
        7,
      );
      break;
    }
    case "RECORD_BOARD_EVIDENCE": {
      const approval = APPROVALS.find((r) => r.id === t.approvalRequests.RECOMMENDATION);
      if (approval) { approval.status = "APPROVED"; approval.steps = approval.steps.map((s) => ({ ...s, status: "APPROVED" })); approval.version++; }
      t = demoAdvance({ ...t, boardApproval: { authority: "BOARD_OF_DIRECTORS", recordedBy: CURRENT_USER?.name ?? "MD", recordedAt: new Date().toISOString(), decisionAt: proofs.main!.occurredAt } }, 9);
      break;
    }
    case "PRESENT":
      if (t.stage === 8) t = demoAdvance(t, 9);
      break;
    case "ACCEPT":
    case "PROPERTY_ASSETS":
      break;
    case "PLACE":
      t = demoAdvance(t, 10);
      break;
    case "CONFIRM_PLACEMENT":
      break;
    case "SCHEDULE":
      t = { ...t, observedSchedule: f.observed as PolicyTerms, discrepancies: (f.discrepancies as string[]) ?? [] };
      break;
    case "TECHNICAL_VERIFICATION":
      break;
    case "VERIFY":
      t = { ...t, evidence: [...t.evidence, { purpose: "VERIFIED", documentId: "", documentVersion: 0, occurredAt: new Date().toISOString() }] };
      break;
    case "CONVERT": {
      const lead = DEMO_LEADS.find((l) => l.id === t.leadId);
      if (lead && lead.status === "OPEN") Object.assign(lead, { status: "CONVERTED", convertedAt: new Date().toISOString(), version: lead.version + 1 });
      t = demoAdvance({ ...t, convertedAt: new Date().toISOString(), policyId: String(f.externalPolicyNumber ?? `POL-${t.id.slice(-3)}`) }, 11);
      break;
    }
    case "WELCOME":
      t = {
        ...t,
        status: "COMPLETED",
        evidence: [...t.evidence, proofOf("letter", "WELCOME_LETTER"), proofOf("delivery", "POLICY_DELIVERY"), proofOf("fileChecklist", "FILE_CHECKLIST")],
        milestones: t.milestones.map((m) => (m.status === "OPEN" ? { ...m, status: "COMPLETED" } : m)),
      };
      break;
    case "ASSIGN":
      if (f.responsibility === "OWNER" && DEMO_LEADS.find((l) => l.clientId === t.clientId)?.ownerId !== f.assigneeId) throw new Error(ONBOARDING_MESSAGES.CLIENT_OWNER_MISMATCH);
      t = { ...t, assignees: { ...t.assignees, [String(f.responsibility)]: String(f.assigneeId) }, ownerId: f.responsibility === "OWNER" ? String(f.assigneeId) : t.ownerId };
      break;
    case "ON_HOLD":
      t = { ...t, status: "ON_HOLD" };
      break;
    case "RESUME":
      t = { ...t, status: "OPEN" };
      break;
    case "CLOSE":
      t = { ...t, status: (f.disposition as TrackStatus) ?? "CLOSED_LOST", milestones: t.milestones.map((m) => (m.status === "OPEN" ? { ...m, status: "CANCELLED" } : m)) };
      break;
    case "DEADLINE":
      t = { ...t, milestones: t.milestones.map((m) => (m.code === f.milestone && m.status === "OPEN" ? { ...m, dueAt: new Date(String(f.dueAt)).toISOString() } : m)) };
      break;
  }
  t = { ...t, version: current.version + 1 };
  DEMO_TRACKS[index] = t;
  demoLog(t.id, `ONBOARDING_${input.action}`, input.reason);
  return demoTrackView(t);
}

/** Demo: a decided onboarding approval moves its track on (the backend does this itself). */
function onTrackApprovalDecided(r: ApprovalRequest) {
  const index = DEMO_TRACKS.findIndex((t) => t.id === r.subjectId);
  const t = DEMO_TRACKS[index];
  if (!t || r.status !== "APPROVED") return;
  if (t.approvalRequests.RECOMMENDATION === r.id && t.stage === 8 && t.recommendation?.tier !== "STRATEGIC") {
    DEMO_TRACKS[index] = { ...demoAdvance(t, 9), version: t.version + 1 };
    demoLog(t.id, "ONBOARDING_APPROVAL_HANDOFF");
  }
}

function nextApprovalId() {
  const year = new Date().getFullYear();
  const highest = APPROVALS.reduce((max, r) => Math.max(max, Number(r.id.split("-").at(-1)) || 0), 0);
  return `APR-${year}-${String(highest + 1).padStart(3, "0")}`;
}

/** Demo: who acts next on each lead and track, for My Work. The backend creates real tasks itself. */
function onboardingTasks(): WorkTask[] {
  const tasks: WorkTask[] = [];
  for (const raw of DEMO_LEADS) {
    if (raw.status !== "OPEN") continue;
    const step = nextLeadStep(raw);
    if (!step) continue;
    const byOwner = step.owner === "Accounts Executive";
    tasks.push({
      id: `T-${raw.id}-${step.key}`,
      key: `LEAD:${raw.id}:${step.key}`,
      type: "ONBOARDING_STEP",
      title: `${step.name}: ${raw.name}`,
      detail: `Lead step ${step.step}. ${step.deadline}.`,
      resourceType: "LEAD",
      resourceId: raw.id,
      resourceRef: raw.id,
      client: raw.name,
      owner: byOwner ? raw.ownerId : undefined,
      ownerRole: step.owner,
      dueDate: ((step.key === "RESPOND" ? raw.responseDueAt : raw.needsDueAt) ?? raw.receivedAt).slice(0, 10),
      status: "OPEN",
      source: "SYSTEM",
      createdAt: raw.receivedAt.slice(0, 10),
      history: [],
    });
  }
  for (const raw of DEMO_TRACKS) {
    const t = demoTrackView(raw);
    const action = t.availableActions.find((a) => !["LICENSE", "REVISE", "ASSIGN", "ON_HOLD", "RESUME", "CLOSE"].includes(a));
    if (t.status !== "OPEN" || !action) continue;
    const stage = stageOf(t.stage);
    // Who acts, by the action's permission in the backend's matrix.
    const byOwner = ["QUALIFY_KYC", "PRESENT", "ACCEPT", "WELCOME"].includes(action);
    const role = ["SURVEY", "SURVEY_NOT_APPLICABLE", "PROGRAM", "TECHNICAL_VERIFICATION"].includes(action)
      ? "Technical Director"
      : action === "RECORD_BOARD_EVIDENCE"
        ? "MD"
        : t.underwritingRole === "MEDICAL_UNDERWRITING_MANAGER"
          ? "Medical Underwriting Manager"
          : "GI Underwriting Manager";
    const due = openMilestone(t)?.dueAt?.slice(0, 10) ?? todayIso();
    tasks.push({
      id: `T-${t.id}-${action}`,
      key: `ONBOARDING:${t.id}:${action}`,
      type: "ONBOARDING_STEP",
      title: `${ACTION_LABEL[action] ?? action}: ${t.leadName} · ${t.productName}`,
      detail: `Step ${t.stage}: ${stage.name}.`,
      resourceType: "ONBOARDING",
      resourceId: t.id,
      resourceRef: t.id,
      client: t.leadName,
      owner: byOwner ? t.ownerId : undefined,
      ownerRole: byOwner ? "Accounts Executive" : role,
      dueDate: due,
      status: "OPEN",
      source: "SYSTEM",
      createdAt: todayIso(),
      history: [],
    });
  }
  for (const r of DEMO_KYC_REVIEWS.filter((x) => x.status === "SUBMITTED" && x.reviewerId)) {
    tasks.push({
      id: `T-${r.id}-DECIDE`,
      key: `KYC:${r.id}:DECIDE`,
      type: "KYC_DOCUMENT",
      title: `Decide the KYC review: ${r.clientName}`,
      detail: "Check the documents and screening, then approve with the signed KYC Approval Form, return or reject.",
      resourceType: "KYC_REVIEW",
      resourceId: r.id,
      resourceRef: r.id,
      client: r.clientName,
      owner: r.reviewerId,
      ownerRole: "Risk & Compliance Manager",
      dueDate: (r.revisedDueAt ?? r.dueAt ?? new Date().toISOString()).slice(0, 10),
      status: "OPEN",
      source: "SYSTEM",
      createdAt: todayIso(),
      history: [],
    });
  }
  return tasks;
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
  return (await listClaims()).filter((c) => !isClosed(c)).map(toClaimSummary);
}

export function toClaimSummary(c: Claim): ClientClaim {
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

/* ----------------------------- Claims on the backend ----------------------------- */
// Connected: GET /clients/{id}/claims, GET /policy-periods/{id} and POST /claims
// (claim step 1, Register). The backend stores the client, policy period, date
// of loss, description and estimated amount. Priority, handler, report date and
// the later steps (documents, submission, follow-ups, settlement) are not on the
// backend yet, so they are kept in this browser tab until refresh, like the
// sample claims.

type ClaimView = {
  id: string;
  reference: string;
  clientId: string;
  policyPeriodId: string;
  lossDate: string;
  description: string;
  estimatedAmount: number;
  currency: string;
  ownerId?: string;
  state: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type PolicyPeriodDetail = {
  id: string;
  policyId: string;
  insurerName: string;
  productName: string;
  externalPolicyNumber: string;
  effectDate: string;
  expiryDate: string;
};

/** Details typed in this tab that the backend does not store yet, by claim UUID. */
const LOCAL_CLAIM_DETAILS = new Map<string, Pick<Claim, "priority" | "handler" | "dateReported">>();

/** Policy periods already loaded, by period UUID. */
const PERIOD_CACHE = new Map<string, PolicyPeriodDetail | null>();

async function loadPeriod(periodId: string): Promise<PolicyPeriodDetail | null> {
  if (PERIOD_CACHE.has(periodId)) return PERIOD_CACHE.get(periodId)!;
  try {
    const res = await apiFetch(`/api/v1/policy-periods/${periodId}`);
    const period = res.ok ? ((await res.json()) as PolicyPeriodDetail) : null;
    PERIOD_CACHE.set(periodId, period);
    return period;
  } catch {
    return null;
  }
}

async function claimProblem(res: Response, fallback: string): Promise<string> {
  const problem = await readProblem(res);
  if (res.status === 401) return "Your session has ended. Please sign in again.";
  if (res.status === 403) return "You do not have permission to register claims for this client.";
  if (res.status === 404) return "This client or policy could not be found.";
  if (res.status === 400 && problem.fields?.length) return `Please check these fields: ${problem.fields.join(", ")}.`;
  if (problem.title) return problem.title;
  return fallback;
}

function standardClaimDocuments(): Claim["documents"] {
  return [
    { name: "Notification of loss", required: true },
    { name: "Supporting report (police, fire or medical)", required: true },
    { name: "Repair or replacement quotation", required: true },
  ];
}

/** Turns a backend claim into the shape the screens use. */
function toClaim(v: ClaimView, clientRef: string, clientName: string, period: PolicyPeriodDetail | null): Claim {
  const created = v.createdAt.slice(0, 10);
  const local = LOCAL_CLAIM_DETAILS.get(v.id);
  // Work done in this tab on the same claim (documents, steps, notes) is kept.
  const existing = CLAIMS.find((c) => c.uuid === v.id);
  return {
    ...(existing ?? {
      step: "REGISTER" as const,
      stepStartedAt: created,
      documents: standardClaimDocuments(),
      followUps: [],
      notes: [],
      history: [{ at: created, by: "Backend", text: "Claim registered" }],
    }),
    id: v.reference,
    uuid: v.id,
    version: v.version,
    clientId: clientRef,
    client: clientName,
    policyId: period?.externalPolicyNumber || undefined,
    policyPeriodId: v.policyPeriodId,
    classOfInsurance: period?.productName ?? "",
    insurer: period?.insurerName ?? "",
    dateOfLoss: v.lossDate,
    dateReported: local?.dateReported ?? existing?.dateReported ?? created,
    amount: Number(v.estimatedAmount),
    currency: v.currency,
    priority: local?.priority ?? existing?.priority ?? "P2",
    handler: local?.handler ?? existing?.handler ?? "Not assigned",
    description: v.description,
  };
}

/** Adds or replaces a backend claim in the in-memory list, so the claim steps can work on it. */
function rememberClaim(claim: Claim): Claim {
  const index = CLAIMS.findIndex((c) => c.uuid === claim.uuid || c.id === claim.id);
  if (index >= 0) CLAIMS[index] = claim;
  else CLAIMS.unshift(claim);
  return claim;
}

/** Claims on the backend, loaded client by client (4 at a time). */
async function listBackendClaims(): Promise<Claim[]> {
  let clients: Client[];
  try {
    clients = (await listClientChoices()).filter((c) => c.uuid);
  } catch (err) {
    console.warn("Could not load clients for the claims list:", err);
    return [];
  }
  const perClient = await mapLimited(clients, 4, async (client) => {
    try {
      const res = await apiFetch(`/api/v1/clients/${client.uuid}/claims?size=100`);
      if (!res.ok) return [];
      const views = ((await res.json()) as Page<ClaimView>).items ?? [];
      return await mapLimited(views, 4, async (v) =>
        rememberClaim(toClaim(v, client.id, client.name, await loadPeriod(v.policyPeriodId))),
      );
    } catch (err) {
      console.warn(`Could not load claims for ${client.id}:`, err);
      return [];
    }
  });
  return perClient.flat().sort((a, b) => b.dateReported.localeCompare(a.dateReported));
}

export async function listClaims(): Promise<Claim[]> {
  if (MOCK_AUTH) return [...CLAIMS];
  return listBackendClaims();
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
  /** Backend policy period. Required for backend clients: a claim must sit on a policy. */
  policyPeriodId?: string;
};

/** Register a claim (step 1). Standard documents are added as the checklist. */
export async function createClaim(input: NewClaimInput, by: string): Promise<Claim> {
  if (input.dateOfLoss > todayIso()) throw new Error("The date of loss cannot be in the future.");
  if (input.dateReported < input.dateOfLoss) throw new Error("The claim cannot be reported before the loss happened.");

  const backendClient = !MOCK_AUTH ? CLIENT_CACHE.get(input.clientId) : undefined;
  if (backendClient?.uuid) {
    if (!input.policyPeriodId) throw new Error("Choose the policy this claim is on.");
    const res = await apiFetch("/api/v1/claims", {
      method: "POST",
      body: JSON.stringify({
        clientId: backendClient.uuid,
        policyPeriodId: input.policyPeriodId,
        lossDate: input.dateOfLoss,
        description: input.description,
        estimatedAmount: input.amount,
        currency: "RWF",
      }),
    });
    if (!res.ok) throw new Error(await claimProblem(res, "Could not register the claim. Please try again."));
    const view = (await res.json()) as ClaimView;
    LOCAL_CLAIM_DETAILS.set(view.id, {
      priority: input.priority,
      handler: input.handler,
      dateReported: input.dateReported,
    });
    const claim = toClaim(view, backendClient.id, backendClient.name, await loadPeriod(view.policyPeriodId));
    return rememberClaim({ ...claim, history: [{ at: todayIso(), by, text: "Claim registered" }] });
  }
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

/**
 * Claims reported per month, from the first month with a claim (at least the
 * last 6 months, at most 12): how many, and their total (RWF m).
 */
export function claimsPerMonth(claims: Claim[], now = new Date()): ClaimMonth[] {
  const first = claims.reduce((min, c) => (c.dateReported < min ? c.dateReported : min), now.toISOString().slice(0, 10));
  const since = (now.getFullYear() - Number(first.slice(0, 4))) * 12 + now.getMonth() - (Number(first.slice(5, 7)) - 1);
  const months = Math.min(12, Math.max(6, since + 1));
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const inMonth = claims.filter((c) => c.dateReported.startsWith(key));
    return {
      month: d.toLocaleDateString("en-GB", { month: "short" }),
      count: inMonth.length,
      amount: Math.round(inMonth.reduce((s, c) => s + c.amount, 0) / 100000) / 10,
    };
  });
}

export async function getClaimMonthly(): Promise<ClaimMonth[]> {
  return claimsPerMonth(await listClaims());
}

/**
 * Everything recorded on claims and renewals, newest first. Built from each
 * record's own history until the backend has a shared activity feed.
 */
export async function listActivity(modules: { claims: boolean; renewals: boolean }): Promise<ActivityItem[]> {
  const [claims, renewals] = await Promise.all([
    modules.claims ? listClaims().catch(() => []) : Promise.resolve([]),
    modules.renewals ? listRenewals() : Promise.resolve([]),
  ]);
  return activityFrom(claims, renewals);
}

/** The activity in claims and renewals that are already loaded, newest first. */
export function activityFrom(claims: Claim[], renewals: RenewalCase[]): ActivityItem[] {
  const items: ActivityItem[] = [
    ...claims.flatMap((c) =>
      c.history.map((e) => ({
        at: e.at,
        who: e.by,
        what: `${e.text} · ${c.id}`,
        module: "Claims" as const,
        href: `/claims?claim=${encodeURIComponent(c.id)}`,
      })),
    ),
    ...renewals.flatMap((r) =>
      r.completed.map((m) => ({
        at: m.completedAt,
        who: m.completedBy,
        what: `${RENEWAL_MILESTONES.find((x) => x.code === m.code)?.name ?? m.code} done · ${r.id}`,
        module: "Renewals" as const,
        href: `/renewals?case=${encodeURIComponent(r.id)}`,
      })),
    ),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at));
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
  // A revoked or expired backend session is authoritative. Notify the auth
  // provider so the open tab clears its local user state and returns to login.
  // Ignore auth endpoints because 401 there can mean an ordinary failed login.
  if (res.status === 401 && !path.startsWith("/api/v1/auth/")) {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("gral:session-expired"));
  }
  return res;
}

export type InboxNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type NotificationInbox = { items: InboxNotification[]; unreadCount: number };

/** Fresh CSRF token for the STOMP CONNECT frame after the session is established. */
export async function getNotificationSocketCsrf(): Promise<{ headerName: string; token: string }> {
  return getCsrf();
}

/** Load the signed-in user's durable notification inbox and unread count. */
export async function getNotificationInbox(): Promise<NotificationInbox> {
  const [inboxResponse, countResponse] = await Promise.all([
    apiFetch("/api/v1/notifications?page=0&size=20&unreadOnly=false"),
    apiFetch("/api/v1/notifications/unread-count"),
  ]);
  if (!inboxResponse.ok) throw new Error(await onboardingProblem(inboxResponse, "Could not load notifications."));
  if (!countResponse.ok) throw new Error(await onboardingProblem(countResponse, "Could not load notification count."));
  const inbox = (await inboxResponse.json()) as { items?: InboxNotification[] };
  const count = (await countResponse.json()) as { count?: number };
  return { items: inbox.items ?? [], unreadCount: count.count ?? 0 };
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const response = await apiFetch(`/api/v1/notifications/${encodeURIComponent(notificationId)}/read`, { method: "POST" });
  if (!response.ok) throw new Error(await onboardingProblem(response, "Could not mark the notification as read."));
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
  CURRENT_USER = {
    id: me.id,
    email: me.email,
    name: me.fullName,
    role,
    backendRoles: me.roles ?? [],
    permissions: me.permissions ?? [],
  };
  return CURRENT_USER;
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
