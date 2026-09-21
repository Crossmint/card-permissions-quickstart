// Crypto for the encrypted-card rail. Runs in the browser only.
//
// Two ways to get a key:
// - Ephemeral: the keypair lives for one credential request. The public JWK
//   goes to Crossmint, the private key never leaves this tab.
// - Bring your own: the user pastes an RSA public key in PEM. Crossmint
//   encrypts to it and the user decrypts with the matching private key.
// Crossmint returns the card as a compact JWE (RSA-OAEP-256 + A256GCM).

import { compactDecrypt } from "jose";
import type { CardCredentialValue, RsaPublicJwk } from "@/lib/crossmint-types";

const RSA_OAEP_256: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const RSA_OAEP_256_IMPORT: RsaHashedImportParams = { name: "RSA-OAEP", hash: "SHA-256" };

async function exportPublicJwk(publicKey: CryptoKey): Promise<RsaPublicJwk> {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) {
    throw new Error("Failed to export the RSA public key");
  }
  // Send only kty, n, e. The API rejects any private material.
  return { kty: "RSA", n: jwk.n, e: jwk.e };
}

export async function generateEphemeralRsaKeyPair(): Promise<{ publicJwk: RsaPublicJwk; privateKey: CryptoKey }> {
  const keyPair = await crypto.subtle.generateKey(RSA_OAEP_256, true, ["encrypt", "decrypt"]);
  return { publicJwk: await exportPublicJwk(keyPair.publicKey), privateKey: keyPair.privateKey };
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

// ─── Bring your own key (PEM) ───────────────────────────────────────────────

function toPem(label: string, der: ArrayBuffer): string {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

function fromPem(pem: string, labels: string[]): { label: string; der: ArrayBuffer } {
  const match = pem.match(/-----BEGIN ([A-Z ]+)-----([\s\S]+?)-----END \1-----/);
  if (!match) throw new Error(`Paste a PEM block: -----BEGIN ${labels[0]}----- ... -----END ${labels[0]}-----`);
  const label = match[1];
  if (!labels.includes(label)) throw new Error(`Expected a ${labels.join(" or ")} block, got ${label}`);
  let binary: string;
  try {
    binary = atob(match[2].replace(/\s+/g, ""));
  } catch {
    throw new Error("The PEM body is not valid base64");
  }
  return { label, der: Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer };
}

/** Generate a 2048-bit RSA-OAEP-256 keypair and return both halves as PEM (SPKI and PKCS#8). */
export async function generateRsaKeyPairPem(): Promise<{ publicPem: string; privatePem: string }> {
  const keyPair = await crypto.subtle.generateKey(RSA_OAEP_256, true, ["encrypt", "decrypt"]);
  const [spki, pkcs8] = await Promise.all([
    crypto.subtle.exportKey("spki", keyPair.publicKey),
    crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
  ]);
  return { publicPem: toPem("PUBLIC KEY", spki), privatePem: toPem("PRIVATE KEY", pkcs8) };
}

/** Parse an SPKI PEM public key ("BEGIN PUBLIC KEY") into the JWK the credentials API expects. */
export async function importRsaPublicKeyPem(pem: string): Promise<RsaPublicJwk> {
  const { der } = fromPem(pem, ["PUBLIC KEY"]);
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("spki", der, RSA_OAEP_256_IMPORT, true, ["encrypt"]);
  } catch {
    throw new Error("This is not an RSA public key in SPKI format");
  }
  return exportPublicJwk(key);
}

/** Parse a PKCS#8 PEM private key ("BEGIN PRIVATE KEY") for RSA-OAEP-256 decryption. */
export async function importRsaPrivateKeyPem(pem: string): Promise<CryptoKey> {
  if (/-----BEGIN RSA PRIVATE KEY-----/.test(pem)) {
    throw new Error("PKCS#1 keys (BEGIN RSA PRIVATE KEY) are not supported. Convert to PKCS#8: openssl pkcs8 -topk8 -nocrypt -in key.pem");
  }
  const { der } = fromPem(pem, ["PRIVATE KEY"]);
  try {
    return await crypto.subtle.importKey("pkcs8", der, RSA_OAEP_256_IMPORT, false, ["decrypt"]);
  } catch {
    throw new Error("This is not an RSA private key in PKCS#8 format. PKCS#1 (BEGIN RSA PRIVATE KEY) is not supported.");
  }
}
