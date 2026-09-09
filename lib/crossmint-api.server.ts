"use server";

// Server actions for all Crossmint API calls.
//
// These endpoints (/payment-methods, /order-intents) are user-scoped and
// Crossmint requires a client-side API key + user JWT to auth them — a
// server key is rejected with 403. The server-action layer here is purely a
// CORS proxy (the Crossmint API doesn't accept direct browser fetches), not a
// secrets boundary. The same NEXT_PUBLIC_* client key is also bundled to the
// browser for the Crossmint React SDK in app/providers.tsx.
//
// Every call goes through crossmintFetch(), which records an ApiTrace. Each
// exported action returns `{ data, traces }` so the UI can show what was
// called and what came back. lib/crossmint-api.ts unwraps this for callers.
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
import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";
import { CROSSMINT_API_KEY as API_KEY, CROSSMINT_BASE_URL as BASE_URL } from "@/lib/crossmint-env";
import { redactBody, redactHeaders, type ApiTrace, type HttpMethod } from "@/lib/api-trace";

export type ActionResult<T> = { data: T; traces: ApiTrace[] };

// ─── Helpers ────────────────────────────────────────────────────────────────
function log(label: string, data: unknown) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`▶ ${label}`);
  console.log(JSON.stringify(data, null, 2));
  console.log(`${"─".repeat(60)}\n`);
}

/**
 * Origin of the browser request that invoked this server action.
 * Crossmint validates client-side API keys against the allowed origins
 * configured in the console. Node's fetch sends no Origin header, so
 * forward the browser's one. Production rejects the call without it.
 */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

async function authHeaders(jwt: string): Promise<Record<string, string>> {
  return {
    "Content-Type": "application/json",
    "X-API-KEY": API_KEY,
    Authorization: `Bearer ${jwt}`,
    Origin: await requestOrigin(),
  };
}

// Traces collected while one server action runs. AsyncLocalStorage lets
// nested helpers (and Promise.all fan-outs) append without threading an
// accumulator through every signature.
const traceStore = new AsyncLocalStorage<ApiTrace[]>();

/**
 * Run an action inside a trace scope. Failures come back as data: server
 * actions strip thrown errors down to a generic message in production, and
 * the failed call must still reach the timeline.
 */
async function traced<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  const traces: ApiTrace[] = [];
  try {
    const data = await traceStore.run(traces, run);
    return { data, traces };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: { __error: message } as unknown as T, traces };
  }
}

const RESPONSE_HEADERS_KEPT = ["content-type", "x-request-id", "cf-ray", "x-vercel-id", "x-amzn-requestid"];

/** Parse a body as JSON when possible, otherwise keep a short text snippet. */
function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    const isHtml = /^\s*<(!doctype|html)/i.test(text);
    const title = isHtml ? /<title>([^<]*)<\/title>/i.exec(text)?.[1]?.trim() : undefined;
    return { _raw: title ?? text.slice(0, 300), ...(isHtml ? { _html: true } : {}) };
  }
}

type FetchOutcome = { status: number; ok: boolean; body: unknown; trace: ApiTrace };

/** Perform one Crossmint API call and record it. */
async function crossmintFetch(method: HttpMethod, path: string, jwt: string, requestBody?: unknown): Promise<FetchOutcome> {
  const url = `${BASE_URL}${path}`;
  const reqHeaders = await authHeaders(jwt);
  const started = Date.now();

  if (requestBody !== undefined) log(`${method} ${path} → request body`, redactBody(requestBody));

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
  });
  const text = await res.text().catch(() => "");
  const body = parseBody(text);

  const responseHeaders: Record<string, string> = {};
  for (const name of RESPONSE_HEADERS_KEPT) {
    const value = res.headers.get(name);
    if (value) responseHeaders[name] = value;
  }

  const trace: ApiTrace = {
    id: `${started.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date(started).toISOString(),
    method,
    url,
    path,
    requestHeaders: redactHeaders(reqHeaders),
    requestBody: requestBody === undefined ? undefined : redactBody(requestBody),
    status: res.status,
    ok: res.ok,
    durationMs: Date.now() - started,
    responseHeaders,
    responseBody: redactBody(body),
  };
  traceStore.getStore()?.push(trace);

  log(`${method} ${path} → ${res.status}`, trace.responseBody ?? { status: res.status });
  return { status: res.status, ok: res.ok, body, trace };
}

/** Build an error that includes the API's message, so the UI can show why a call failed. */
function apiError(label: string, outcome: FetchOutcome): Error {
  const body = outcome.body as { message?: string | string[]; error?: string; _raw?: string } | undefined;
  const message = Array.isArray(body?.message) ? body.message.join("; ") : body?.message ?? body?.error ?? body?._raw;
  // Request identifiers help Crossmint trace a failed call.
  const ids = Object.entries(outcome.trace.responseHeaders)
    .filter(([name]) => name !== "content-type")
    .map(([name, value]) => `${name}=${value}`)
    .join(" ");
  return new Error(`${label} (${outcome.status})${message ? `: ${message}` : ""}${ids ? ` [${ids}]` : ""}`);
}

// ─── Internal callers (run inside a trace scope) ────────────────────────────

async function listPaymentMethods(jwt: string): Promise<PaymentMethodResponse[]> {
  const out = await crossmintFetch("GET", "/payment-methods", jwt);
  if (!out.ok) throw apiError("Failed to fetch payment methods", out);
  // The endpoint returns a cursor-paginated `{ data, nextCursor?, previousCursor? }`
  // envelope. This quickstart only reads the first page; pagination is left as an
  // exercise for production integrations.
  return (out.body as { data: PaymentMethodResponse[] }).data;
}

async function getRegistration(jwt: string, paymentMethodId: string): Promise<OrderIntentRegistration | null> {
  const out = await crossmintFetch("GET", `/payment-methods/${paymentMethodId}/order-intent-registration`, jwt);
  // 404 is the server's signal that the card has never been registered.
  if (out.status === 404) return null;
  if (!out.ok) throw apiError("Failed to check card registration", out);
  return out.body as OrderIntentRegistration;
}

async function listOrderIntents(jwt: string): Promise<OrderIntentResponse[]> {
  const out = await crossmintFetch("GET", "/order-intents", jwt);
  if (!out.ok) throw apiError("Failed to fetch order intents", out);
  const data = out.body as OrderIntentResponse[] | { data: OrderIntentResponse[] };
  // Accept both a bare array and a `{ data }` envelope.
  return Array.isArray(data) ? data : data.data ?? [];
}

async function getOrderIntent(jwt: string, orderIntentId: string): Promise<OrderIntentResponse> {
  const out = await crossmintFetch("GET", `/order-intents/${orderIntentId}`, jwt);
  if (!out.ok) throw apiError("Failed to fetch order intent", out);
  return out.body as OrderIntentResponse;
}

// ─── Payment methods ────────────────────────────────────────────────────────

/** List all saved payment methods for the authenticated user. */
export async function fetchPaymentMethods(jwt: string): Promise<ActionResult<PaymentMethodResponse[]>> {
  return traced(() => listPaymentMethods(jwt));
}

/** Delete a saved payment method. */
export async function removePaymentMethod(jwt: string, paymentMethodId: string): Promise<ActionResult<void>> {
  return traced(async () => {
    const out = await crossmintFetch("DELETE", `/payment-methods/${paymentMethodId}`, jwt);
    if (!out.ok) throw apiError("Failed to delete payment method", out);
  });
}

// ─── Card registration ──────────────────────────────────────────────────────
// Before a card can back an allowance, register it once. Registration
// provisions the agentic rails (Visa, Mastercard) the card supports. It has
// no user ceremony: verification happens later, per allowance.

/** Read the registration for a payment method. Returns null when the card is not registered. */
export async function fetchRegistration(
  jwt: string,
  paymentMethodId: string,
): Promise<ActionResult<OrderIntentRegistration | null>> {
  return traced(() => getRegistration(jwt, paymentMethodId));
}

/**
 * Register a payment method for order intents. Idempotent per card.
 * External-auth JWTs (Stytch) carry no email claim, so pass the user's email.
 */
export async function registerCard(
  jwt: string,
  paymentMethodId: string,
  email: string,
): Promise<ActionResult<OrderIntentRegistration>> {
  return traced(async () => {
    const out = await crossmintFetch("PUT", `/payment-methods/${paymentMethodId}/order-intent-registration`, jwt, {
      email,
      countryCode: "US",
    });
    if (!out.ok) throw apiError("Failed to register card", out);
    return out.body as OrderIntentRegistration;
  });
}

// ─── Order intents (allowances) ─────────────────────────────────────────────

/** List all order intents (allowances) for the authenticated user. */
export async function fetchOrderIntents(jwt: string): Promise<ActionResult<OrderIntentResponse[]>> {
  return traced(() => listOrderIntents(jwt));
}

/** Fetch a single order intent. Rail statuses and balances are read live from the provider. */
export async function fetchOrderIntent(jwt: string, orderIntentId: string): Promise<ActionResult<OrderIntentResponse>> {
  return traced(() => getOrderIntent(jwt, orderIntentId));
}

/**
 * Create an order intent (allowance) on a registered card.
 * The response lists the rails that can spend it. An agentic-token rail may
 * come back as pending_verification: the user then verifies with their bank.
 * An unsupported card gets an encrypted-card rail instead, already active.
 */
export async function createNewOrderIntent(
  jwt: string,
  input: CreateOrderIntentInput,
): Promise<ActionResult<OrderIntentResponse>> {
  return traced(async () => {
    const out = await crossmintFetch("POST", "/order-intents", jwt, input);
    if (!out.ok) throw apiError("Failed to create order intent", out);
    return out.body as OrderIntentResponse;
  });
}

/** Cancel (revoke) an order intent by ID. */
export async function deleteOrderIntent(jwt: string, orderIntentId: string): Promise<ActionResult<void>> {
  return traced(async () => {
    const out = await crossmintFetch("DELETE", `/order-intents/${orderIntentId}`, jwt);
    if (!out.ok) throw apiError("Failed to cancel order intent", out);
  });
}

// ─── Batch fetch ────────────────────────────────────────────────────────────
// Next.js serializes concurrent server action calls from the client, so
// fetching cards and intents as separate calls runs sequentially.
// This single action fetches everything in parallel on the server side.

export type AllData = {
  cards: PaymentMethodResponse[];
  orderIntents: OrderIntentResponse[];
  registrations: Record<string, OrderIntentRegistration | null>;
};

export async function fetchAllData(jwt: string): Promise<ActionResult<AllData>> {
  return traced(async () => {
    const [cards, orderIntents] = await Promise.all([
      listPaymentMethods(jwt),
      listOrderIntents(jwt).catch(() => [] as OrderIntentResponse[]),
    ]);

    // Fan out registration checks for each saved card in parallel.
    // A single failure shouldn't break the whole page — treat it as not registered.
    const registrationEntries = await Promise.all(
      cards.map(async (card) => {
        try {
          return [card.paymentMethodId, await getRegistration(jwt, card.paymentMethodId)] as const;
        } catch {
          return [card.paymentMethodId, null] as const;
        }
      }),
    );
    const registrations = Object.fromEntries(registrationEntries);

    log("fetchAllData → summary", { cardCount: cards.length, orderIntentCount: orderIntents.length });
    return { cards, orderIntents, registrations };
  });
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
): Promise<ActionResult<AgenticTokenCredentialResponse>> {
  return traced(async () => {
    const body = {
      rail: "agentic-token" as const,
      provider: input.provider,
      amount: input.amount,
      credential: { format: "card" as const },
      ...(input.merchant ? { merchant: input.merchant } : {}),
    };
    const out = await crossmintFetch("POST", `/order-intents/${orderIntentId}/credentials`, jwt, body);
    if (!out.ok) throw apiError("Failed to fetch card credentials", out);
    return out.body as AgenticTokenCredentialResponse;
  });
}

/**
 * Fetch the saved card as a JWE on the encrypted-card fallback rail.
 * Send only the RSA public JWK. The caller decrypts the result in the browser.
 */
export async function fetchEncryptedCardCredentials(
  jwt: string,
  orderIntentId: string,
  publicKey: RsaPublicJwk,
): Promise<ActionResult<EncryptedCardCredentialResponse>> {
  return traced(async () => {
    const body = { rail: "encrypted-card" as const, credential: { format: "card" as const, publicKey } };
    const out = await crossmintFetch("POST", `/order-intents/${orderIntentId}/credentials`, jwt, body);
    if (!out.ok) throw apiError("Failed to fetch encrypted card credentials", out);
    return out.body as EncryptedCardCredentialResponse;
  });
}
