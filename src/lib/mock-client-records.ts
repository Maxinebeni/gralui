// Sample contacts and interactions for the client file, used in demo mode
// (NEXT_PUBLIC_MOCK_AUTH=true) and for sample clients. Changes are kept in
// memory until the page is refreshed.

import type { ClientContactEntry, ClientInteraction, InteractionInput } from "./api";
import { displayToIso } from "./format";
import { CLIENTS } from "./mock-data";
import type { Client, ClientContact } from "./types";

const CONTACTS = new Map<string, ClientContactEntry[]>();
const INTERACTIONS = new Map<string, ClientInteraction[]>();

function contactsOf(client: Client) {
  let list = CONTACTS.get(client.id);
  if (!list) {
    list = client.contact ? [{ id: `${client.id}-c1`, primary: true, contact: client.contact }] : [];
    CONTACTS.set(client.id, list);
  }
  return list;
}

/** Puts the primary contact back on the client record so the file header matches. */
function syncPrimary(client: Client): Client {
  const primary = contactsOf(client).find((c) => c.primary)?.contact;
  const updated = { ...client, contact: primary };
  const index = CLIENTS.findIndex((c) => c.id === client.id);
  if (index !== -1) CLIENTS[index] = updated;
  return updated;
}

export async function mockListContacts(client: Client) {
  return contactsOf(client).map((c) => ({ ...c }));
}

export async function mockAddContact(client: Client, contact: ClientContact) {
  const list = contactsOf(client);
  list.push({ id: `${client.id}-c${list.length + 1}-${Date.now()}`, primary: list.length === 0, contact });
  return syncPrimary(client);
}

export async function mockUpdateContact(client: Client, contactId: string, contact: ClientContact) {
  const entry = contactsOf(client).find((c) => c.id === contactId);
  if (!entry) throw new Error("This contact could not be found.");
  entry.contact = contact;
  return syncPrimary(client);
}

export async function mockMakePrimary(client: Client, contactId: string) {
  for (const c of contactsOf(client)) c.primary = c.id === contactId;
  return syncPrimary(client);
}

const CHANNEL_TYPE: Record<string, string> = { Email: "EMAIL", Letter: "OTHER", Call: "CALL", Meeting: "MEETING" };

function interactionsOf(client: Client) {
  let list = INTERACTIONS.get(client.id);
  if (!list) {
    // Older sample records list their correspondence; show it as interactions.
    list = client.correspondence.map((c, i) => {
      const day = displayToIso(c.date) || new Date().toISOString().slice(0, 10);
      return {
        id: `${client.id}-i${i + 1}`,
        occurredAt: `${day}T09:00:00.000Z`,
        type: CHANNEL_TYPE[c.channel] ?? "OTHER",
        summary: c.subject,
        recordedAt: `${day}T09:00:00.000Z`,
      };
    });
    INTERACTIONS.set(client.id, list);
  }
  return list;
}

export async function mockListInteractions(client: Client) {
  return [...interactionsOf(client)].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export async function mockRecordInteraction(client: Client, input: InteractionInput) {
  const entry: ClientInteraction = {
    id: `${client.id}-i${Date.now()}`,
    occurredAt: new Date(input.occurredAt).toISOString(),
    type: input.type,
    summary: input.summary.trim(),
    followUp: input.followUp?.trim() || undefined,
    correctsId: input.correctsId,
    recordedAt: new Date().toISOString(),
  };
  interactionsOf(client).push(entry);
  return entry;
}
