// One captured Crossmint API call. Server actions build these and return them
// next to their data; the client keeps them for the API timeline.
// Everything in a trace is safe to show on screen: secrets are redacted before
// the trace leaves the server.

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export type ApiTrace = {
  id: string;
  /** ISO timestamp taken when the request started. */
  at: string;
  method: HttpMethod;
  /** Full URL that was called. */
  url: string;
  /** Path relative to the API base, with real IDs, e.g. /order-intents/123. */
  path: string;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  status: number;
  ok: boolean;
  durationMs: number;
  responseHeaders: Record<string, string>;
  responseBody?: unknown;
};

const DOCS_BASE = "https://docs.crossmint.com/api-reference/agentic-commerce";

/** Best-effort docs link for an endpoint. */
export function docsUrlFor(method: HttpMethod, path: string): string {
  if (path.endsWith("/credentials")) return `${DOCS_BASE}/order-intents/create-credentials`;
  if (path.endsWith("/order-intent-registration")) {
    return method === "PUT"
      ? `${DOCS_BASE}/payment-methods/register-payment-method`
      : `${DOCS_BASE}/payment-methods/get-registration`;
  }
  if (path.startsWith("/order-intents/")) {
    return method === "DELETE" ? `${DOCS_BASE}/order-intents/cancel-order-intent` : `${DOCS_BASE}/order-intents/get-order-intent`;
  }
  if (path === "/order-intents") {
    return method === "POST" ? `${DOCS_BASE}/order-intents/create-order-intent` : `${DOCS_BASE}/order-intents/list-order-intents`;
  }
  if (path.startsWith("/payment-methods/")) return `${DOCS_BASE}/payment-methods/delete-payment-method`;
  return `${DOCS_BASE}/payment-methods/list-payment-methods`;
}

// ─── Redaction ──────────────────────────────────────────────────────────────

/** Keep the key prefix so the environment stays readable, hide the rest. */
export function redactApiKey(key: string): string {
  const m = /^(ck|sk)_(staging|production|development)_/.exec(key);
  return m ? `${m[0]}…` : "<api key>";
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === "authorization") out[name] = "Bearer <stytch session jwt>";
    else if (lower === "x-api-key") out[name] = redactApiKey(value);
    else out[name] = value;
  }
  return out;
}

const SENSITIVE_KEYS = new Set(["number", "cvc", "cvv", "publicKey", "privateKey"]);

/**
 * Walk a JSON value and replace card data and key material.
 * `credential.value` is either a card object or a JWE string, both secret.
 */
export function redactBody(value: unknown, parentKey = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => redactBody(item, parentKey));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (parentKey === "credential" && key === "value") {
        out[key] = typeof inner === "string" ? "<jwe, decrypted in the browser>" : "<card details, shown once in the UI>";
      } else if (SENSITIVE_KEYS.has(key) && inner != null) {
        out[key] = key === "publicKey" ? "<rsa public jwk>" : "<redacted>";
      } else {
        out[key] = redactBody(inner, key);
      }
    }
    return out;
  }
  return value;
}
