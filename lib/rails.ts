// Pure helpers to pick a rail from an order intent. No I/O.

import type { OrderIntentVerificationProps } from "@crossmint/client-sdk-react-ui";
import type { AgenticTokenRail, OrderIntentRail, OrderIntentResponse } from "@/lib/crossmint-types";

/**
 * The active rail that can mint a card credential, if any.
 * Prefer the agentic-token rail (one-time card number).
 * Fall back to encrypted-card (works for any eligible card).
 */
export function activeCardRail(intent: OrderIntentResponse): OrderIntentRail | undefined {
  const rails = (intent.rails ?? []).filter(
    (rail) => rail.status === "active" && (rail.credentialFormats ?? []).includes("card"),
  );
  return rails.find((rail) => rail.rail === "agentic-token") ?? rails.find((rail) => rail.rail === "encrypted-card");
}

/** The agentic-token rail that still needs the user's bank verification, if any. */
export function pendingAgenticRail(intent: OrderIntentResponse): AgenticTokenRail | undefined {
  return (intent.rails ?? []).find(
    (rail): rail is AgenticTokenRail => rail.rail === "agentic-token" && rail.status === "pending_verification",
  );
}

/** True when the intent has a rail pending verification and the config to run it. */
export function needsVerification(intent: OrderIntentResponse): boolean {
  return pendingAgenticRail(intent) !== undefined && intent.verificationConfig !== undefined;
}

/** True when the intent is active and at least one rail can mint a card. */
export function isUsable(intent: OrderIntentResponse): boolean {
  return intent.status === "active" && activeCardRail(intent) !== undefined;
}

/** The first rail error code, when no rail is usable. */
export function railErrorCode(intent: OrderIntentResponse): string | undefined {
  return (intent.rails ?? []).find((rail) => rail.status === "error")?.error?.code ?? undefined;
}

/** Rail name as the API returns it, with the provider code when present. */
export function railLabel(rail: OrderIntentRail): string {
  if (rail.rail === "encrypted-card") return "encrypted-card";
  return `agentic-token · ${rail.provider}`;
}

/**
 * Narrow an order intent to the shape `OrderIntentVerification` accepts:
 * a present verificationConfig and agentic-token rails only.
 * Returns null when there is nothing to verify.
 */
export function toVerifiableOrderIntent(intent: OrderIntentResponse): OrderIntentVerificationProps["orderIntent"] | null {
  if (!intent.verificationConfig || !pendingAgenticRail(intent)) return null;
  return {
    ...intent,
    verificationConfig: intent.verificationConfig,
    rails: intent.rails.filter((rail): rail is AgenticTokenRail => rail.rail === "agentic-token"),
  };
}
