// Crypto for the encrypted-card rail. Runs in the browser only.
//
// The keypair is ephemeral: it lives for one credential request. The public
// JWK goes to Crossmint, the private key never leaves this tab. Crossmint
// returns the card as a compact JWE (RSA-OAEP-256 + A256GCM).

import { compactDecrypt } from "jose";
import type { CardCredentialValue, RsaPublicJwk } from "@/lib/crossmint-types";

export async function generateEphemeralRsaKeyPair(): Promise<{ publicJwk: RsaPublicJwk; privateKey: CryptoKey }> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) {
    throw new Error("Failed to export the RSA public key");
  }
  // Send only kty, n, e. The API rejects any private material.
  return { publicJwk: { kty: "RSA", n: jwk.n, e: jwk.e }, privateKey: keyPair.privateKey };
}

export async function decryptCardJwe(jwe: string, privateKey: CryptoKey): Promise<CardCredentialValue> {
  const { plaintext } = await compactDecrypt(jwe, privateKey, {
    keyManagementAlgorithms: ["RSA-OAEP-256"],
    contentEncryptionAlgorithms: ["A256GCM"],
  });
  const decoded = JSON.parse(new TextDecoder().decode(plaintext)) as
    | CardCredentialValue
    | { card: CardCredentialValue };
  const card = "card" in decoded ? decoded.card : decoded;
  if (!card?.number) {
    throw new Error("Decrypted card had no number");
  }
  return card;
}
