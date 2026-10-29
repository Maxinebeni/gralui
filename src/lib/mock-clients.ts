// Sample-data versions of the client functions, used only in demo mode
// (NEXT_PUBLIC_MOCK_AUTH=true) so the client screens work without a backend.
// Changes are kept in memory until the page is refreshed.

import type { ClientInput } from "./api";
import { CLIENTS } from "./mock-data";
import { todayIso } from "./renewals";
import type { Client } from "./types";

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Search across name, ID, sector, type and account manager. */
export async function mockListClients(query = ""): Promise<Client[]> {
  const q = query.trim().toLowerCase();
  // Return a copy so React notices when a client has been added or edited.
  if (!q) return [...CLIENTS];
  return CLIENTS.filter((c) =>
    [c.name, c.id, c.sector, c.type, c.manager].some((f) => f.toLowerCase().includes(q)),
  );
}

export async function mockGetClient(id: string): Promise<Client | null> {
  return CLIENTS.find((c) => c.id === id) ?? null;
}

/** Relationship managers already assigned to sample clients, for dropdowns. */
export async function mockListManagers(): Promise<string[]> {
  return Array.from(new Set(CLIENTS.map((c) => c.manager).filter(Boolean))).sort();
}

/** Next free ID in the CLT-001 style. */
function nextClientId(): string {
  const highest = CLIENTS.reduce((max, c) => {
    const n = Number(c.id.replace(/\D/g, ""));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `CLT-${String(highest + 1).padStart(3, "0")}`;
}

export async function mockCreateClient(input: ClientInput): Promise<Client> {
  if (CLIENTS.some((c) => sameText(c.name, input.name))) {
    throw new Error("A client with this name already exists.");
  }
  const client: Client = {
    id: nextClientId(),
    createdAt: todayIso(),
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

export async function mockUpdateClient(id: string, input: ClientInput): Promise<Client> {
  const index = CLIENTS.findIndex((c) => c.id === id);
  if (index === -1) throw new Error("This client could not be found.");
  if (CLIENTS.some((c) => c.id !== id && sameText(c.name, input.name))) {
    throw new Error("Another client already has this name.");
  }
  const updated: Client = { ...CLIENTS[index], ...input };
  CLIENTS[index] = updated;
  return updated;
}
