"use server";

// Server actions for all Crossmint API calls.
//
// These endpoints (/payment-methods, /order-intents) are user-scoped and
// Crossmint requires a client-side API key + user JWT to auth them — a
// server key is rejected with 403. The server-action layer here is purely a
// CORS proxy (the staging API doesn't accept direct browser fetches), not a
// secrets boundary. The same NEXT_PUBLIC_* client key is also bundled to the
// browser for the Crossmint React SDK in app/providers.tsx.
//
// Card numbers from the encrypted-card rail never pass through here in the
// clear: the browser sends a public key and decrypts the returned JWE itself.

import type {
  AgenticTokenCredentialResponse,
  CreateOrderIntentInput,
  EncryptedCardCredentialResponse,
  Merchant,
  OrderIntentRegistration,
  OrderIntentResponse,
  PaymentMethodResponse,
  RailProvider,
  RsaPublicJwk,
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

/** Build an error that includes the API's message, so the UI can show why a call failed. */
async function apiError(label: string, res: Response): Promise<Error> {
  let detail = "";
  try {
    const body = await res.text();
    const parsed = JSON.parse(body) as { message?: string | string[]; error?: string };
    const message = Array.isArray(parsed.message) ? parsed.message.join("; ") : parsed.message ?? parsed.error;
    detail = message ? `: ${message}` : body ? `: ${body.slice(0, 200)}` : "";
  } catch {
    // Non-JSON body, keep the status only.
  }
  return new Error(`${label} (${res.status})${detail}`);
}

// ─── Payment methods ────────────────────────────────────────────────────────

/** List all saved payment methods for the authenticated user. */
export async function fetchPaymentMethods(jwt: string): Promise<PaymentMethodResponse[]> {
  const res = await fetch(`${BASE_URL}/payment-methods`, { headers: authHeaders(jwt) });
  if (!res.ok) throw await apiError("Failed to fetch payment methods", res);
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
  if (!res.ok) throw await apiError("Failed to delete payment method", res);
  log("DELETE /payment-methods/:id → success", { paymentMethodId, status: res.status });
}

// ─── Card registration ──────────────────────────────────────────────────────
// Before a card can back an allowance, register it once. Registration
// provisions the agentic rails (Visa, Mastercard) the card supports. It has
// no user ceremony: verification happens later, per allowance.

/** Read the registration for a payment method. Returns null when the card is not registered. */
export async function fetchRegistration(
  jwt: string,
  paymentMethodId: string,
): Promise<OrderIntentRegistration | null> {
  const res = await fetch(`${BASE_URL}/payment-methods/${paymentMethodId}/order-intent-registration`, {
    headers: authHeaders(jwt),
  });
  // 404 is the server's signal that the card has never been registered.
  if (res.status === 404) {
    log(`GET /payment-methods/${paymentMethodId}/order-intent-registration → 404`, { registered: false });
    return null;
  }
  if (!res.ok) throw await apiError("Failed to check card registration", res);
  const data = await res.json();
  log(`GET /payment-methods/${paymentMethodId}/order-intent-registration → response`, data);
  return data;
}

/**
 * Register a payment method for order intents. Idempotent per card.
 * External-auth JWTs (Stytch) carry no email claim, so pass the user's email.
 */
export async function registerCard(
  jwt: string,
  paymentMethodId: string,
  email: string,
): Promise<OrderIntentRegistration> {
  const body = { email, countryCode: "US" };
  log(`PUT /payment-methods/${paymentMethodId}/order-intent-registration → request body`, body);
  const res = await fetch(`${BASE_URL}/payment-methods/${paymentMethodId}/order-intent-registration`, {
    method: "PUT",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await apiError("Failed to register card", res);
  const data = await res.json();
  log(`PUT /payment-methods/${paymentMethodId}/order-intent-registration → response`, data);
  return data;
}

// ─── Order intents (allowances) ─────────────────────────────────────────────

/** List all order intents (allowances) for the authenticated user. */
export async function fetchOrderIntents(jwt: string): Promise<OrderIntentResponse[]> {
  const res = await fetch(`${BASE_URL}/order-intents`, { headers: authHeaders(jwt) });
  if (!res.ok) throw await apiError("Failed to fetch order intents", res);
  const data: OrderIntentResponse[] | { data: OrderIntentResponse[] } = await res.json();
  log("GET /order-intents → response", data);
  // Accept both a bare array and a `{ data }` envelope.
  return Array.isArray(data) ? data : data.data ?? [];
}

/** Fetch a single order intent. Rail statuses and balances are read live from the provider. */
export async function fetchOrderIntent(jwt: string, orderIntentId: string): Promise<OrderIntentResponse> {
  const res = await fetch(`${BASE_URL}/order-intents/${orderIntentId}`, { headers: authHeaders(jwt) });
  if (!res.ok) throw await apiError("Failed to fetch order intent", res);
  const data = await res.json();
  log("GET /order-intents/:id → response", data);
  return data;
}

/**
 * Create an order intent (allowance) on a registered card.
 * The response lists the rails that can spend it. An agentic-token rail may
 * come back as pending_verification: the user then verifies with their bank.
 * An unsupported card gets an encrypted-card rail instead, already active.
 */
export async function createNewOrderIntent(jwt: string, input: CreateOrderIntentInput): Promise<OrderIntentResponse> {
  log("POST /order-intents → request body", input);
  const res = await fetch(`${BASE_URL}/order-intents`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await apiError("Failed to create order intent", res);
  const data = await res.json();
  log("POST /order-intents → response", data);
  return data;
}

/** Cancel (revoke) an order intent by ID. */
export async function deleteOrderIntent(jwt: string, orderIntentId: string): Promise<void> {
  log("DELETE /order-intents/:id → request", { orderIntentId });
  const res = await fetch(`${BASE_URL}/order-intents/${orderIntentId}`, {
    method: "DELETE",
    headers: authHeaders(jwt),
  });
  if (!res.ok) throw await apiError("Failed to cancel order intent", res);
  log("DELETE /order-intents/:id → success", { orderIntentId, status: res.status });
}

// ─── Batch fetch ────────────────────────────────────────────────────────────
// Next.js serializes concurrent server action calls from the client, so
// fetching cards and intents as separate calls runs sequentially.
// This single action fetches everything in parallel on the server side.

export async function fetchAllData(jwt: string): Promise<{
  cards: PaymentMethodResponse[];
  orderIntents: OrderIntentResponse[];
  registrations: Record<string, OrderIntentRegistration | null>;
}> {
  const [cards, orderIntents] = await Promise.all([
    fetchPaymentMethods(jwt),
    fetchOrderIntents(jwt).catch(() => [] as OrderIntentResponse[]),
  ]);

  // Fan out registration checks for each saved card in parallel.
  // A single failure shouldn't break the whole page — treat it as not registered.
  const registrationEntries = await Promise.all(
    cards.map(async (card) => {
      try {
        return [card.paymentMethodId, await fetchRegistration(jwt, card.paymentMethodId)] as const;
      } catch {
        return [card.paymentMethodId, null] as const;
      }
    }),
  );
  const registrations = Object.fromEntries(registrationEntries);

  log("fetchAllData → summary", {
    cardCount: cards.length,
    orderIntentCount: orderIntents.length,
    registrations,
  });
  return { cards, orderIntents, registrations };
}

// ─── Credentials ────────────────────────────────────────────────────────────

/**
 * Mint a one-time card number on the agentic-token rail (Visa or Mastercard).
 * `amount` is the exact charge. Pass `merchant` only when the intent has none.
 */
export async function fetchAgenticTokenCredentials(
  jwt: string,
  orderIntentId: string,
  input: { provider: RailProvider; amount: { value: string; currency: string }; merchant?: Merchant },
): Promise<AgenticTokenCredentialResponse> {
  const body = {
    rail: "agentic-token" as const,
    provider: input.provider,
    amount: input.amount,
    credential: { format: "card" as const },
    ...(input.merchant ? { merchant: input.merchant } : {}),
  };
  log(`POST /order-intents/${orderIntentId}/credentials → request body`, body);
  const res = await fetch(`${BASE_URL}/order-intents/${orderIntentId}/credentials`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await apiError("Failed to fetch card credentials", res);
  const data = await res.json();
  // Never log the card number.
  log("POST /order-intents/:id/credentials → success", { orderIntentId, rail: "agentic-token", status: res.status });
  return data;
}

/**
 * Fetch the saved card as a JWE on the encrypted-card fallback rail.
 * Send only the RSA public JWK. The caller decrypts the result in the browser.
 */
export async function fetchEncryptedCardCredentials(
  jwt: string,
  orderIntentId: string,
  publicKey: RsaPublicJwk,
): Promise<EncryptedCardCredentialResponse> {
  const body = {
    rail: "encrypted-card" as const,
    credential: { format: "card" as const, publicKey },
  };
  log(`POST /order-intents/${orderIntentId}/credentials → request body`, { ...body, credential: { format: "card", publicKey: "<RSA JWK>" } });
  const res = await fetch(`${BASE_URL}/order-intents/${orderIntentId}/credentials`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await apiError("Failed to fetch encrypted card credentials", res);
  const data = await res.json();
  log("POST /order-intents/:id/credentials → success", { orderIntentId, rail: "encrypted-card", status: res.status });
  return data;
}
