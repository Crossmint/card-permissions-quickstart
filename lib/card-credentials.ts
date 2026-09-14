// Client-side dispatcher: reveal credentials for an order intent through
// whichever active rail is selected. Never log or persist the result.

import { fetchAgenticTokenCredentials, fetchEncryptedCardCredentials, fetchSptCredentials } from "@/lib/crossmint-api";
import type { AgentCardCredentials, CardCredentialValue, Merchant, OrderIntentResponse, RailName, RevealedCredentials } from "@/lib/crossmint-types";
import { decryptCardJwe, generateEphemeralRsaKeyPair } from "@/lib/encrypted-card";
import { activeCardRail, activeCardRails, activeSptRail, railErrorCode } from "@/lib/rails";

function normalize(
  rail: AgentCardCredentials["rail"],
  value: CardCredentialValue,
  expiresAt?: string,
): AgentCardCredentials {
  return {
    kind: "card",
    rail,
    number: String(value.number),
    expirationMonth: String(value.expirationMonth),
    expirationYear: String(value.expirationYear),
    cvc: String(value.cvc),
    expiresAt,
  };
}

function activeRail(orderIntent: OrderIntentResponse, requested?: RailName) {
  const cardRails = activeCardRails(orderIntent);
  const spt = activeSptRail(orderIntent);
  if (requested === "spt" && spt) return spt;
  if (requested && requested !== "spt") {
    const card = cardRails.find((rail) => rail.rail === requested);
    if (card) return card;
  }
  return activeCardRail(orderIntent) ?? spt;
}

export async function revealCardCredentials(
  jwt: string,
  orderIntent: OrderIntentResponse,
  options: {
    // Exact charge amount. Defaults to the available balance.
    amount?: string;
    // Required for minting rails when the intent has no merchant.
    merchant?: Merchant;
    rail?: RailName;
    networkBusinessProfile?: string;
  } = {},
): Promise<RevealedCredentials> {
  const rail = activeRail(orderIntent, options.rail);
  if (!rail) {
    const code = railErrorCode(orderIntent);
    throw new Error(code ? `No usable rail on this allowance (${code})` : "No usable rail on this allowance");
  }

  if (rail.rail === "encrypted-card") {
    const { publicJwk, privateKey } = await generateEphemeralRsaKeyPair();
    const response = await fetchEncryptedCardCredentials(jwt, orderIntent.orderIntentId, publicJwk);
    const card = await decryptCardJwe(response.credential.value, privateKey);
    return normalize("encrypted-card", card);
  }

  const merchant = orderIntent.merchant ? undefined : options.merchant;
  if (!orderIntent.merchant && !merchant) {
    throw new Error("This allowance has no merchant. Provide one to mint a card.");
  }
  const amount = { value: options.amount ?? orderIntent.amount.available, currency: orderIntent.amount.currency };
  if (rail.rail === "spt") {
    if (!options.networkBusinessProfile) {
      throw new Error("Provide the Stripe Network Business Profile ID");
    }
    const response = await fetchSptCredentials(jwt, orderIntent.orderIntentId, {
      amount,
      merchant,
      networkBusinessProfile: options.networkBusinessProfile,
    });
    return {
      kind: "spt",
      rail: "spt",
      token: response.credential.value,
      expiresAt: response.expiresAt,
    };
  }
  const response = await fetchAgenticTokenCredentials(jwt, orderIntent.orderIntentId, {
    provider: rail.provider,
    amount,
    merchant,
  });
  return normalize("agentic-token", response.credential.value, response.expiresAt);
}
