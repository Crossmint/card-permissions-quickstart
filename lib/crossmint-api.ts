"use server";

// Server actions for all Crossmint API calls.
//
// These endpoints (/payment-methods, /agents, /order-intents) are user-scoped
// and Crossmint requires a client-side API key + user JWT to auth them — a
// server key is rejected with 403. The server-action layer here is purely a
// CORS proxy (the staging API doesn't accept direct browser fetches), not a
// secrets boundary. The same NEXT_PUBLIC_* client key is also bundled to the
// browser for the Crossmint React SDK in app/layout.tsx.

import type {
  AgenticEnrollmentResponse,
  AgentResponse,
  CardCredentials,
  Mandate,
  OrderIntentResponse,
  PaymentMethodResponse,
} from "@/lib/crossmint-types";

const BASE_URL = "https://staging.crossmint.com/api/unstable";
const API_KEY = process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY ?? "";

// ─── Helpers ────────────────────────────────────────────────────────────────
function log(label: string, data: unknown) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`▶ ${label}`);
  console.log(JSON.stringify(data, null, 2));
  console.log(`${"─".repeat(60)}\n`);
}

function authHeaders(jwt: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-API-KEY": API_KEY,
    Authorization: `Bearer ${jwt}`,
  };
}

// ─── Payment methods ────────────────────────────────────────────────────────

/** List all saved payment methods for the authenticated user. */
export async function fetchPaymentMethods(jwt: string): Promise<PaymentMethodResponse[]> {
  const res = await fetch(`${BASE_URL}/payment-methods`, { headers: authHeaders(jwt) });
  if (!res.ok) throw new Error(`Failed to fetch payment methods (${res.status})`);
  const body: { data: PaymentMethodResponse[]; nextCursor?: string; previousCursor?: string } =
    await res.json();
  log("GET /payment-methods → response", body);
  // The endpoint returns a cursor-paginated `{ data, nextCursor?, previousCursor? }`
  // envelope. This quickstart only reads the first page; pagination is left as an
  // exercise for production integrations.
  return body.data;
}

/** Delete a saved payment method. */
export async function removePaymentMethod(jwt: string, paymentMethodId: string): Promise<void> {
  log("DELETE /payment-methods/:id → request", { paymentMethodId });
  const res = await fetch(`${BASE_URL}/payment-methods/${paymentMethodId}`, {
    method: "DELETE",
    headers: authHeaders(jwt),
  });
  if (!res.ok) throw new Error(`Failed to delete payment method (${res.status})`);
  log("DELETE /payment-methods/:id → success", { paymentMethodId, status: res.status });
}

// ─── Agents ─────────────────────────────────────────────────────────────────

/** List all agents for the authenticated user. */
export async function fetchAgents(jwt: string): Promise<AgentResponse[]> {
  const res = await fetch(`${BASE_URL}/agents`, { headers: authHeaders(jwt) });
  if (!res.ok) throw new Error(`Failed to fetch agents (${res.status})`);
  const data = await res.json();
  log("GET /agents → response", data);
  return data;
}

/** Delete an agent by ID. */
export async function deleteAgent(jwt: string, agentId: string): Promise<void> {
  log("DELETE /agents/:id → request", { agentId });
  const res = await fetch(`${BASE_URL}/agents/${agentId}`, {
    method: "DELETE",
    headers: authHeaders(jwt),
  });
  if (!res.ok) throw new Error(`Failed to delete agent (${res.status})`);
  log("DELETE /agents/:id → success", { agentId, status: res.status });
}

/** Create a new agent. An agent is required before allowing card payments. */
export async function createNewAgent(jwt: string, name: string, description?: string): Promise<AgentResponse> {
  const body = { metadata: { name, description } };
  log("POST /agents → request body", body);
  const res = await fetch(`${BASE_URL}/agents`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to create agent (${res.status})`);
  const data = await res.json();
  log("POST /agents → response", data);
  return data;
}

// ─── Order intents (card permissions) ───────────────────────────────────────

/** List all order intents (card permissions) for the authenticated user. */
export async function fetchOrderIntents(jwt: string): Promise<OrderIntentResponse[]> {
  const res = await fetch(`${BASE_URL}/order-intents`, { headers: authHeaders(jwt) });
  if (!res.ok) throw new Error(`Failed to fetch order intents (${res.status})`);
  const data = await res.json();
  log("GET /order-intents → response", data);
  return data;
}

/** Fetch a single order intent, synchronizing its latest phase. */
export async function fetchOrderIntent(jwt: string, orderIntentId: string): Promise<OrderIntentResponse> {
  const res = await fetch(`${BASE_URL}/order-intents/${orderIntentId}`, { headers: authHeaders(jwt) });
  if (!res.ok) {
    throw new Error(`Failed to fetch order intent (${res.status})`);
  }
  const data = await res.json();
  log("GET /order-intents/:id → response", data);
  return data;
}

// ─── Batch fetch ────────────────────────────────────────────────────────────
// Next.js serializes concurrent server action calls from the client, so
// fetching cards, agents, and intents as separate calls runs sequentially.
// This single action fetches all three in parallel on the server side.

export async function fetchAllData(jwt: string): Promise<{
  cards: PaymentMethodResponse[];
  agents: AgentResponse[];
  orderIntents: OrderIntentResponse[];
  enrollmentStatuses: Record<string, AgenticEnrollmentResponse["status"]>;
}> {
  const [cards, agents, orderIntents] = await Promise.all([
    fetchPaymentMethods(jwt),
    fetchAgents(jwt),
    fetchOrderIntents(jwt).catch(() => [] as OrderIntentResponse[]),
  ]);

  // Fan out verification checks for each saved card in parallel.
  // A single failure shouldn't break the whole page — fall back to "not_started".
  const enrollmentEntries = await Promise.all(
    cards.map(async (c) => {
      try {
        const res = await checkEnrollment(jwt, c.paymentMethodId);
        return [c.paymentMethodId, res.status] as const;
      } catch {
        return [c.paymentMethodId, "not_started" as const];
      }
    }),
  );
  const enrollmentStatuses = Object.fromEntries(enrollmentEntries);

  log("fetchAllData → summary", {
    cardCount: cards.length,
    agentCount: agents.length,
    orderIntentCount: orderIntents.length,
    enrollmentStatuses,
  });
  return { cards, agents, orderIntents, enrollmentStatuses };
}

// ─── Agentic verification ───────────────────────────────────────────────────
// Before an agent can use a payment method, the card must be verified.
// Verification requires passkey confirmation from the user.

/** Check the agentic verification status for a payment method. */
export async function checkEnrollment(jwt: string, paymentMethodId: string): Promise<AgenticEnrollmentResponse> {
  const res = await fetch(`${BASE_URL}/payment-methods/${paymentMethodId}/agentic-enrollment`, {
    headers: authHeaders(jwt),
  });
  // 404 is the server's signal that the card has never been verified.
  // TODO: replace with a proper "not_verified" status once the API supports it.
  if (res.status === 404) {
    log(`GET /payment-methods/${paymentMethodId}/agentic-enrollment → 404`, { status: "not_started" });
    return { status: "not_started" };
  }
  if (!res.ok) throw new Error(`Failed to check enrollment (${res.status})`);
  const data = await res.json();
  log(`GET /payment-methods/${paymentMethodId}/agentic-enrollment → response`, data);
  return data;
}

/** Start agentic verification for a payment method. Returns a pending verification that needs passkey confirmation. */
export async function enrollPaymentMethod(jwt: string, paymentMethodId: string, email: string): Promise<AgenticEnrollmentResponse> {
  const body = { email };
  log(`POST /payment-methods/${paymentMethodId}/agentic-enrollment → request body`, body);
  const res = await fetch(`${BASE_URL}/payment-methods/${paymentMethodId}/agentic-enrollment`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to enroll payment method (${res.status})`);
  const data = await res.json();
  log(`POST /payment-methods/${paymentMethodId}/agentic-enrollment → response`, data);
  return data;
}

/**
 * Ensure a payment method is verified for agentic payments.
 * - If already active/pending, returns the existing verification as-is.
 * - If not started, initiates verification and returns the pending response.
 * Combines the check + start calls into a single server round-trip.
 */
export async function ensureEnrollment(
  jwt: string,
  paymentMethodId: string,
  email: string,
): Promise<AgenticEnrollmentResponse> {
  const existing = await checkEnrollment(jwt, paymentMethodId);
  if (existing.status !== "not_started") return existing;
  return enrollPaymentMethod(jwt, paymentMethodId, email);
}

// ─── Card permissions ───────────────────────────────────────────────────────

/** Delete an order intent (card permission) by ID. */
export async function deleteOrderIntent(jwt: string, orderIntentId: string): Promise<void> {
  log("DELETE /order-intents/:id → request", { orderIntentId });
  const res = await fetch(`${BASE_URL}/order-intents/${orderIntentId}`, {
    method: "DELETE",
    headers: authHeaders(jwt),
  });
  if (!res.ok) throw new Error(`Failed to delete order intent (${res.status})`);
  log("DELETE /order-intents/:id → success", { orderIntentId, status: res.status });
}

/**
 * Create an order intent (card permission) with spending rules.
 * The order intent may require passkey verification before becoming active.
 */
export async function createNewOrderIntent(jwt: string, agentId: string, paymentMethodId: string, mandates: Mandate[]): Promise<OrderIntentResponse> {
  const body = { agentId, payment: { paymentMethodId }, mandates };
  log("POST /order-intents → request body", body);
  const res = await fetch(`${BASE_URL}/order-intents`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to create order intent (${res.status})`);
  const data = await res.json();
  log("POST /order-intents → response", data);
  return data;
}

/**
 * Fetch secure card credentials (card number, expiration, CVC) for an active order intent.
 * Requires merchant info to generate the credentials.
 */
export async function fetchCardCredentials(
  jwt: string,
  orderIntentId: string,
  merchant: { name: string; url: string; countryCode: string },
): Promise<CardCredentials> {
  const body = { merchant };
  log(`POST /order-intents/${orderIntentId}/credentials → request body`, body);
  const res = await fetch(`${BASE_URL}/order-intents/${orderIntentId}/credentials`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to fetch card credentials (${res.status})`);
  const data = await res.json();
  log("POST /order-intents/:id/credentials → success", { orderIntentId, status: res.status });
  return data;
}
