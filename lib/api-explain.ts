// Turn a raw ApiTrace into what the timeline shows: which step it belongs to,
// whether it is one of the calls the demo is about, a plain-language title,
// and the facts that matter from the response, rails first.
// Pure functions over redacted trace bodies. No I/O.

import type { ApiTrace } from "@/lib/api-trace";
import type { OrderIntentRegistration, OrderIntentResponse, RailProvider } from "@/lib/crossmint-types";

export type Step = 1 | 2 | 3;

export type RailFact = {
  rail: "agentic-token" | "encrypted-card";
  provider?: RailProvider;
  /** Registration or intent status, normalized to what the badge shows. */
  status: "enabled" | "active" | "pending" | "pending_verification" | "error";
  code?: string;
  /** The rail the app will use to mint a card, when more than one is present. */
  preferred?: boolean;
};

export type Explained = {
  step: Step;
  /** False for background reads (lists, polls). Hidden unless "Show all calls" is on. */
  important: boolean;
  title: string;
  /** Short facts from the response, one per line. */
  facts: string[];
  rails: RailFact[];
  /** Human message when the call failed. */
  error?: string;
};

export function stepForPath(path: string): Step {
  if (path.endsWith("/credentials")) return 3;
  if (path.startsWith("/order-intents")) return 2;
  return 1;
}

/** Provider as the API names it, with the network it stands for in parentheses. */
export function providerName(provider?: RailProvider): string {
  return provider === "vic" ? "vic (Visa)" : provider === "agentpay" ? "agentpay (Mastercard)" : "agentic-token";
}

function money(amount?: { value?: string; total?: string; currency?: string }): string {
  if (!amount) return "";
  const value = amount.value ?? amount.total ?? "";
  return `${value} ${(amount.currency ?? "").toUpperCase()}`.trim();
}

function dateLabel(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : undefined;
}

function relativeExpiry(iso?: string): string | undefined {
  if (!iso) return undefined;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return undefined;
  const minutes = Math.max(1, Math.round(ms / 60000));
  return minutes < 90 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

function errorMessage(trace: ApiTrace): string | undefined {
  if (trace.ok) return undefined;
  const body = trace.responseBody as { message?: string | string[]; error?: string; _raw?: string } | undefined;
  const message = Array.isArray(body?.message) ? body.message.join("; ") : body?.message ?? body?.error ?? body?._raw;
  return message ? `${trace.status}: ${message}` : `HTTP ${trace.status}`;
}

function registrationRails(registration?: OrderIntentRegistration): RailFact[] {
  return (registration?.rails ?? []).map((rail) => ({
    rail: "agentic-token",
    provider: rail.provider,
    status: rail.status,
    code: rail.error?.code,
  }));
}

function intentRails(intent?: OrderIntentResponse): RailFact[] {
  const rails = intent?.rails ?? [];
  const usable = rails.filter((rail) => rail.status === "active" && (rail.credentialFormats ?? []).includes("card"));
  const preferred = usable.find((rail) => rail.rail === "agentic-token") ?? usable.find((rail) => rail.rail === "encrypted-card");
  return rails.map((rail) => ({
    rail: rail.rail,
    provider: rail.rail === "agentic-token" ? rail.provider : undefined,
    status: rail.status,
    code: rail.status === "error" ? rail.error?.code : undefined,
    preferred: rails.length > 1 && rail === preferred ? true : undefined,
  }));
}

function intentFacts(intent: OrderIntentResponse | undefined, rails: RailFact[]): string[] {
  const facts: string[] = [];
  if (!intent) return facts;
  if (rails.some((rail) => rail.status === "pending_verification")) {
    facts.push("agentic-token is pending_verification: the user verifies with their bank before the agent can use it.");
  }
  if (rails.some((rail) => rail.rail === "encrypted-card" && rail.status === "active")) {
    facts.push("encrypted-card is active with no verification. The saved card comes back encrypted to the browser.");
  }
  if (rails.length > 0 && rails.every((rail) => rail.status === "error")) {
    facts.push("No usable rail. This allowance cannot mint a card.");
  }
  return facts;
}

export function explain(trace: ApiTrace): Explained {
  const step = stepForPath(trace.path);
  const error = errorMessage(trace);
  const req = trace.requestBody as Record<string, unknown> | undefined;
  const res = trace.responseBody as Record<string, unknown> | undefined;

  // ── Step 1: cards ──
  if (trace.path === "/payment-methods") {
    const count = Array.isArray((res as { data?: unknown[] })?.data) ? (res as { data: unknown[] }).data.length : undefined;
    return { step, important: false, title: "Load the user's saved cards", facts: count === undefined ? [] : [`${count} card${count === 1 ? "" : "s"} on file`], rails: [], error };
  }
  if (trace.path.endsWith("/order-intent-registration")) {
    const registration = trace.ok ? (res as unknown as OrderIntentRegistration) : undefined;
    const rails = registrationRails(registration);
    if (trace.method === "PUT") {
      const facts: string[] = [];
      if (rails.length > 0 && rails.every((rail) => rail.status === "error")) {
        facts.push("No agentic-token rail could be enabled. Allowances on this card get the encrypted-card rail.");
      } else if (rails.some((rail) => rail.status === "pending")) {
        facts.push("Enrollment is in progress. The app polls until it settles.");
      }
      return { step, important: true, title: "Register the card for order intents. Crossmint enables its agentic-token rails.", facts, rails, error };
    }
    return {
      step,
      important: false,
      title: trace.status === 404 ? "Check registration: this card is not registered yet" : "Read which agent rails this card supports",
      facts: [],
      rails,
      error: trace.status === 404 ? undefined : error,
    };
  }
  if (trace.path.startsWith("/payment-methods/") && trace.method === "DELETE") {
    return { step, important: true, title: "Remove the saved card", facts: [], rails: [], error };
  }

  // ── Step 3: credentials ──
  if (trace.path.endsWith("/credentials")) {
    const railName = req?.rail === "encrypted-card" ? "encrypted-card" : "agentic-token";
    const provider = req?.provider as RailProvider | undefined;
    if (railName === "encrypted-card") {
      const rails: RailFact[] = [{ rail: "encrypted-card", status: trace.ok ? "active" : "error" }];
      return {
        step,
        important: true,
        title: "Fetch the saved card on the encrypted-card rail, encrypted to a one-time key from the browser",
        facts: trace.ok ? ["Credential issued by encrypted-card as a JWE. The browser decrypts it. The server never sees the number."] : [],
        rails,
        error,
      };
    }
    const rails: RailFact[] = [{ rail: "agentic-token", provider, status: trace.ok ? "active" : "error" }];
    const amount = money(req?.amount as { value?: string; currency?: string } | undefined);
    const expires = relativeExpiry((res as { expiresAt?: string })?.expiresAt);
    return {
      step,
      important: true,
      title: `Mint a one-time card on the agentic-token rail, provider ${providerName(provider)}${amount ? `, for ${amount}` : ""}`,
      facts: trace.ok ? [`Credential issued by agentic-token · ${provider ?? "?"}.${expires ? ` It expires in ${expires}.` : ""}`] : [],
      rails,
      error,
    };
  }

  // ── Step 2: allowances ──
  if (trace.path === "/order-intents") {
    if (trace.method === "POST") {
      const intent = trace.ok ? (res as unknown as OrderIntentResponse) : undefined;
      const rails = intentRails(intent);
      const amount = money(req?.amount as { value?: string; currency?: string } | undefined);
      const merchant = (req?.merchant as { name?: string } | undefined)?.name;
      const expires = dateLabel(req?.expiresAt as string | undefined);
      return {
        step,
        important: true,
        title: `Create an allowance${amount ? ` of ${amount}` : ""}${merchant ? ` for ${merchant}` : ""}${expires ? `, valid until ${expires}` : ""}`,
        facts: intentFacts(intent, rails),
        rails,
        error,
      };
    }
    const count = Array.isArray(res) ? res.length : Array.isArray((res as { data?: unknown[] })?.data) ? (res as { data: unknown[] }).data.length : undefined;
    return { step, important: false, title: "Load the user's allowances", facts: count === undefined ? [] : [`${count} allowance${count === 1 ? "" : "s"}`], rails: [], error };
  }
  if (trace.method === "DELETE") {
    return { step, important: true, title: "Cancel the allowance", facts: [], rails: [], error };
  }
  const intent = trace.ok ? (res as unknown as OrderIntentResponse) : undefined;
  const rails = intentRails(intent);
  return { step, important: false, title: "Re-read the allowance. Rail status and balance come live from the provider.", facts: intentFacts(intent, rails), rails, error };
}
