// Client-side dispatcher: reveal card details for an order intent through
// whichever rail is active. Both rails end in the same normalized shape.
// Never log or persist the result.

import { fetchAgenticTokenCredentials, fetchEncryptedCardCredentials } from "@/lib/crossmint-api";
import type { AgentCardCredentials, CardCredentialValue, Merchant, OrderIntentResponse } from "@/lib/crossmint-types";
import { decryptCardJwe, generateEphemeralRsaKeyPair } from "@/lib/encrypted-card";
import { activeCardRail, railErrorCode } from "@/lib/rails";

function normalize(
  rail: AgentCardCredentials["rail"],
  value: CardCredentialValue,
  expiresAt?: string,
): AgentCardCredentials {
  return {
    rail,
    number: String(value.number),
    expirationMonth: String(value.expirationMonth),
    expirationYear: String(value.expirationYear),
    cvc: String(value.cvc),
    expiresAt,
  };
}

export async function revealCardCredentials(
  jwt: string,
  orderIntent: OrderIntentResponse,
  options: {
    // Exact charge amount. Agentic-token rail only. Defaults to the available balance.
    amount?: string;
    // Required for the agentic-token rail when the intent has no merchant.
    merchant?: Merchant;
  } = {},
): Promise<AgentCardCredentials> {
  const rail = activeCardRail(orderIntent);
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
  const response = await fetchAgenticTokenCredentials(jwt, orderIntent.orderIntentId, {
    provider: rail.provider,
    amount: { value: options.amount ?? orderIntent.amount.available, currency: orderIntent.amount.currency },
    merchant,
  });
  return normalize("agentic-token", response.credential.value, response.expiresAt);
}
