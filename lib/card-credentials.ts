// Client-side dispatcher: reveal credentials for an order intent through
// whichever active rail is selected. Never log or persist the result.
// If a network or Stripe mint fails and the allowance still has balance,
// immediately retry on encrypted-card.

import { fetchAgenticTokenCredentials, fetchEncryptedCardCredentials, fetchOrderIntent, fetchSptCredentials } from "@/lib/crossmint-api";
import type { AgentCardCredentials, CardCredentialValue, Merchant, OrderIntentResponse, RailName, RevealedCredentials, RsaPublicJwk } from "@/lib/crossmint-types";
import { decryptCardJwe, generateEphemeralRsaKeyPair } from "@/lib/encrypted-card";
import { activeCardRail, activeCardRails, activeEncryptedCardRail, activeSptRail, availableAmount, railErrorCode } from "@/lib/rails";

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

// With a user-supplied public key this tab has no private key, so the JWE is
// returned as is. Otherwise a one-time keypair is generated and the JWE is
// decrypted here.
async function revealEncryptedCard(jwt: string, orderIntentId: string, publicKey?: RsaPublicJwk): Promise<RevealedCredentials> {
  if (publicKey) {
    const response = await fetchEncryptedCardCredentials(jwt, orderIntentId, publicKey);
    return { kind: "jwe", rail: "encrypted-card", jwe: response.credential.value };
  }
  const { publicJwk, privateKey } = await generateEphemeralRsaKeyPair();
  const response = await fetchEncryptedCardCredentials(jwt, orderIntentId, publicJwk);
  const card = await decryptCardJwe(response.credential.value, privateKey);
  return normalize("encrypted-card", card);
}

async function latestIntent(jwt: string, orderIntent: OrderIntentResponse): Promise<OrderIntentResponse> {
  try {
    return await fetchOrderIntent(jwt, orderIntent.orderIntentId);
  } catch {
    return orderIntent;
  }
}

async function fallbackEncryptedCard(
  jwt: string,
  orderIntent: OrderIntentResponse,
  err: unknown,
): Promise<RevealedCredentials> {
  const latest = await latestIntent(jwt, orderIntent);
  if (availableAmount(latest) <= 0 || !activeEncryptedCardRail(latest)) throw err;
  return revealEncryptedCard(jwt, latest.orderIntentId);
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
    // encrypted-card only. Encrypt to this key instead of a one-time key. The
    // result is then a JWE that only the matching private key can read.
    publicKey?: RsaPublicJwk;
  } = {},
): Promise<RevealedCredentials> {
  const rail = activeRail(orderIntent, options.rail);
  if (!rail) {
    const code = railErrorCode(orderIntent);
    throw new Error(code ? `No usable rail on this allowance (${code})` : "No usable rail on this allowance");
  }

  if (rail.rail === "encrypted-card") {
    return revealEncryptedCard(jwt, orderIntent.orderIntentId, options.publicKey);
  }

  const merchant = orderIntent.merchant ? undefined : options.merchant;
  if (!orderIntent.merchant && !merchant) {
    throw new Error("This allowance has no merchant. Provide one to mint a card.");
  }
  if (rail.rail === "spt") {
    const networkBusinessProfile = options.networkBusinessProfile;
    if (!networkBusinessProfile) {
      throw new Error("Provide the Stripe Network Business Profile ID");
    }
    const amount = { value: options.amount ?? orderIntent.amount.available, currency: orderIntent.amount.currency };
    try {
      const response = await fetchSptCredentials(jwt, orderIntent.orderIntentId, {
        amount,
        merchant,
        networkBusinessProfile,
      });
      return {
        kind: "spt",
        rail: "spt",
        token: response.credential.value,
        expiresAt: response.expiresAt,
      };
    } catch (err) {
      return fallbackEncryptedCard(jwt, orderIntent, err);
    }
  }
  const amount = { value: options.amount ?? orderIntent.amount.available, currency: orderIntent.amount.currency };
  try {
    const response = await fetchAgenticTokenCredentials(jwt, orderIntent.orderIntentId, {
      provider: rail.provider,
      amount,
      merchant,
    });
    return normalize("agentic-token", response.credential.value, response.expiresAt);
  } catch (err) {
    return fallbackEncryptedCard(jwt, orderIntent, err);
  }
}
