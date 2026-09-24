// Pure helpers to pick a rail from an order intent. No I/O.

/** Longest delay window.setTimeout honours. Larger values fire immediately. */
export const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/** Clamp a delay for setTimeout: never negative, never past the 32-bit limit. */
export function clampDelay(ms: number): number {
  return Math.min(Math.max(0, ms), MAX_TIMEOUT_MS);
}

import type { OrderIntentVerificationProps } from "@crossmint/client-sdk-react-ui";
import type {
  AgenticTokenRail,
  EncryptedCardRail,
  OrderIntentRail,
  OrderIntentRegistration,
  OrderIntentResponse,
  SptRail,
} from "@/lib/crossmint-types";

/**
 * True when card registration has finished: every rail is enabled or in error,
 * none is still pending.
 */
export function isRegistrationSettled(registration: OrderIntentRegistration | null | undefined): boolean {
  if (!registration) return false;
  return registration.rails.length > 0 && !registration.rails.some((rail) => rail.status === "pending");
}

/** Active card-minting rails, preferring agentic-token over encrypted-card. */
export function activeCardRails(intent: OrderIntentResponse): (AgenticTokenRail | EncryptedCardRail)[] {
  const rails = (intent.rails ?? []).filter(
    (rail): rail is AgenticTokenRail | EncryptedCardRail =>
      (rail.rail === "agentic-token" || rail.rail === "encrypted-card") &&
      rail.status === "active" &&
      rail.credentialFormats.includes("card"),
  );
  return rails.sort((a, b) => Number(b.rail === "agentic-token") - Number(a.rail === "agentic-token"));
}

/** Preferred active card-minting rail, if any. */
export function activeCardRail(intent: OrderIntentResponse): AgenticTokenRail | EncryptedCardRail | undefined {
  return activeCardRails(intent)[0];
}

/** Active encrypted-card rail, if it can return a card. */
export function activeEncryptedCardRail(intent: OrderIntentResponse): EncryptedCardRail | undefined {
  return (intent.rails ?? []).find(
    (rail): rail is EncryptedCardRail =>
      rail.rail === "encrypted-card" && rail.status === "active" && rail.credentialFormats.includes("card"),
  );
}

/** Active Stripe Shared Payment Token rail, if it supports identifiers. */
export function activeSptRail(intent: OrderIntentResponse): SptRail | undefined {
  return (intent.rails ?? []).find(
    (rail): rail is SptRail =>
      rail.rail === "spt" && rail.status === "active" && rail.credentialFormats.includes("identifier"),
  );
}

/** The agentic-token rail that still needs the user's bank verification, if any. */
export function pendingAgenticRail(intent: OrderIntentResponse): AgenticTokenRail | undefined {
  return (intent.rails ?? []).find(
    (rail): rail is AgenticTokenRail => rail.rail === "agentic-token" && rail.status === "pending_verification",
  );
}

/** The encrypted-card rail whose vaulted CVC must be re-entered before it can mint, if any. */
export function pendingCvcRecollectionRail(intent: OrderIntentResponse): EncryptedCardRail | undefined {
  return (intent.rails ?? []).find(
    (rail): rail is EncryptedCardRail => rail.rail === "encrypted-card" && rail.status === "pending_cvc_recollection",
  );
}

/** Rails that still need verification, if any. */
export function pendingVerificationRails(intent: OrderIntentResponse): (AgenticTokenRail | SptRail)[] {
  return (intent.rails ?? []).filter(
    (rail): rail is AgenticTokenRail | SptRail =>
      (rail.rail === "agentic-token" || rail.rail === "spt") && rail.status === "pending_verification",
  );
}

/** True when a network or Stripe token rail needs verification and config exists. */
export function needsVerification(intent: OrderIntentResponse): boolean {
  return pendingVerificationRails(intent).length > 0 && intent.verificationConfig !== undefined;
}

/** True when the intent is active and can mint a card or shared payment token. */
export function isRevealable(intent: OrderIntentResponse): boolean {
  return intent.status === "active" && Boolean(
    activeCardRail(intent) || activeSptRail(intent) || pendingCvcRecollectionRail(intent),
  );
}

/** Preserve an explicit active selection, including while bank verification is pending. */
export function resolveAllowanceSelection(intents: OrderIntentResponse[], selectedId: string | null): string | null {
  if (intents.some((intent) => intent.orderIntentId === selectedId && intent.status === "active")) return selectedId;
  return intents.find(isUsable)?.orderIntentId ?? intents.find(isRevealable)?.orderIntentId ?? null;
}

export function isUsable(intent: OrderIntentResponse): boolean {
  return (
    intent.status === "active" &&
    (activeCardRails(intent).length > 0 || activeSptRail(intent) !== undefined) &&
    availableAmount(intent) > 0
  );
}

/** Remaining balance as a number. 0 when missing or malformed. */
export function availableAmount(intent: OrderIntentResponse): number {
  const value = Number(intent.amount?.available);
  return Number.isFinite(value) ? value : 0;
}

/** The first rail error code, when no rail is usable. */
export function railErrorCode(intent: OrderIntentResponse): string | undefined {
  return (intent.rails ?? []).find((rail) => rail.status === "error")?.error?.code ?? undefined;
}

/** Rail name as the API returns it, with the provider code when present. */
export function railLabel(rail: OrderIntentRail): string {
  if (rail.rail === "encrypted-card") return "encrypted-card";
  if (rail.rail === "spt") return "spt · stripe";
  return `agentic-token · ${rail.provider}`;
}

/**
 * Narrow an order intent to the verification-required shape.
 * Returns null when there is nothing pending.
 */
export function toVerifiableOrderIntent(intent: OrderIntentResponse): OrderIntentVerificationProps["orderIntent"] | null {
  if (!intent.verificationConfig || !pendingAgenticRail(intent)) return null;
  return { ...intent, verificationConfig: intent.verificationConfig };
}
