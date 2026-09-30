// Client-side dispatcher: reveal credentials for an order intent through the
// rail the user selected. Never log or persist the result. A failed mint is
// reported as is: switching to another rail is the user's choice.

import { fetchAgenticTokenCredentials, fetchEncryptedCardCredentials, fetchSptCredentials } from "@/lib/crossmint-api";
import type {
  AgentCardCredentials,
  CardCredentialValue,
  Merchant,
  OrderIntentResponse,
  RailName,
  RevealedCredentials,
  RsaPublicJwk,
} from "@/lib/crossmint-types";
import { decryptCardJwe, generateEphemeralRsaKeyPair } from "@/lib/encrypted-card";
import { activeCardRail, activeCardRails, activeSptRail, pendingVerificationRails, railErrorCode, railLabel } from "@/lib/rails";

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
  if (!requested) return activeCardRail(orderIntent) ?? spt;
  if (requested === "spt") return spt;
  return cardRails.find((rail) => rail.rail === requested);
}

function unavailableRailError(orderIntent: OrderIntentResponse, requested?: RailName): Error {
  const pending = pendingVerificationRails(orderIntent).find((rail) => rail.rail === requested);
  if (pending) {
    return new Error(`${railLabel(pending)} is pending_verification. Verify this allowance with the bank before minting on it.`);
  }
  const code = railErrorCode(orderIntent);
  if (requested) return new Error(`${requested} is not active on this allowance${code ? ` (${code})` : ""}`);
  return new Error(code ? `No usable rail on this allowance (${code})` : "No usable rail on this allowance");
}

// With a user-supplied public key this tab has no private key, so the JWE is
// returned as is. Otherwise a one-time keypair is generated and the JWE is
// decrypted here.
async function revealEncryptedCard(
  jwt: string,
  orderIntentId: string,
  input: { amount: { value: string; currency: string }; merchant?: Merchant; publicKey?: RsaPublicJwk },
): Promise<RevealedCredentials> {
  if (input.publicKey) {
    const response = await fetchEncryptedCardCredentials(jwt, orderIntentId, { ...input, publicKey: input.publicKey });
    return { kind: "jwe", rail: "encrypted-card", jwe: response.credential.value, expiresAt: response.expiresAt };
  }
  const { publicJwk, privateKey } = await generateEphemeralRsaKeyPair();
  const response = await fetchEncryptedCardCredentials(jwt, orderIntentId, { ...input, publicKey: publicJwk });
  const card = await decryptCardJwe(response.credential.value, privateKey);
  return normalize("encrypted-card", card, response.expiresAt);
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
  if (!rail) throw unavailableRailError(orderIntent, options.rail);

  const amount = { value: options.amount ?? orderIntent.amount.available, currency: orderIntent.amount.currency };
  // A merchant fixed on the allowance is not repeated on credential requests.
  const merchant = orderIntent.merchant ? undefined : options.merchant;

  if (!orderIntent.merchant && !merchant) {
    throw new Error("This allowance has no merchant. Provide one to mint a card.");
  }
  if (rail.rail === "encrypted-card") {
    return revealEncryptedCard(jwt, orderIntent.orderIntentId, { amount, merchant, publicKey: options.publicKey });
  }
  if (rail.rail === "spt") {
    const networkBusinessProfile = options.networkBusinessProfile;
    if (!networkBusinessProfile) {
      throw new Error("Provide the Stripe Network Business Profile ID");
    }
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
  }
  const response = await fetchAgenticTokenCredentials(jwt, orderIntent.orderIntentId, {
    provider: rail.provider,
    amount,
    merchant,
  });
  return normalize("agentic-token", response.credential.value, response.expiresAt);
}
