import { describe, expect, test } from "vitest";
import { explain } from "@/lib/api-explain";
import type { ApiTrace, TraceContext } from "@/lib/api-trace";
import type { EncryptedCardRail, OrderIntentResponse } from "@/lib/crossmint-types";

function orderIntent(encryptedCard: Exclude<EncryptedCardRail["status"], "error">): OrderIntentResponse {
  const id = `oi_${Math.random().toString(36).slice(2)}`;
  return {
    orderIntentId: id,
    paymentMethodId: `pm_${Math.random().toString(36).slice(2)}`,
    status: "active",
    amount: { total: "50.00", spent: "0.00", reserved: "0.00", available: "50.00", currency: "usd" },
    description: "test",
    rails: [{ rail: "encrypted-card", status: encryptedCard, credentialFormats: ["card"] }],
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

function readTrace(intent: OrderIntentResponse, context?: TraceContext): ApiTrace {
  return {
    id: Math.random().toString(36).slice(2),
    at: new Date().toISOString(),
    method: "GET",
    url: `https://staging.crossmint.com/api/2025-06-09/order-intents/${intent.orderIntentId}`,
    path: `/order-intents/${intent.orderIntentId}`,
    requestHeaders: {},
    status: 200,
    ok: true,
    durationMs: Math.floor(Math.random() * 500),
    responseHeaders: {},
    responseBody: intent,
    context,
  };
}

describe("explain: order-intent re-reads", () => {
  test.each([
    {
      name: "after CVC recollection, an active rail is a headline entry",
      context: "cvc-recollected" as const,
      status: "active" as const,
      important: true,
      title: /after CVC recollection.*active again/,
    },
    {
      name: "after CVC recollection, a still-pending rail says so",
      context: "cvc-recollected" as const,
      status: "pending_cvc_recollection" as const,
      important: true,
      title: /after CVC recollection.*still pending/,
    },
    {
      name: "the pre-mint re-read stays in the background while the rail is active",
      context: "rail-selected" as const,
      status: "active" as const,
      important: false,
      title: /snapshot/,
    },
    {
      name: "the pre-mint re-read surfaces when it discovers a stale CVC",
      context: "rail-selected" as const,
      status: "pending_cvc_recollection" as const,
      important: true,
      title: /snapshot/,
    },
    {
      name: "the re-read after a simulated expiry surfaces the pending rail",
      context: "cvc-expired" as const,
      status: "pending_cvc_recollection" as const,
      important: true,
      title: /simulating CVC expiry/,
    },
    {
      name: "an untagged re-read of an active rail stays in the background",
      context: undefined,
      status: "active" as const,
      important: false,
      title: /Re-read the allowance\./,
    },
  ])("$name", ({ context, status, important, title }) => {
    const info = explain(readTrace(orderIntent(status), context));
    expect(info.step).toBe(context ? 3 : 2);
    expect(info.important).toBe(important);
    expect(info.title).toMatch(title);
    expect(info.rails).toEqual([{ rail: "encrypted-card", provider: undefined, status, code: undefined, preferred: undefined }]);
  });
});
