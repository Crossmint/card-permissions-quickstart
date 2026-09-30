import { beforeEach, describe, expect, test, vi } from "vitest";
import type { OrderIntentResponse, RsaPublicJwk } from "./crossmint-types";

const api = vi.hoisted(() => ({
  fetchAgenticTokenCredentials: vi.fn(),
  fetchEncryptedCardCredentials: vi.fn(),
  fetchSptCredentials: vi.fn(),
}));
vi.mock("@/lib/crossmint-api", () => api);

const { revealCardCredentials } = await import("./card-credentials");

const PUBLIC_KEY: RsaPublicJwk = { kty: "RSA", n: "n", e: "AQAB" };
const MERCHANT = { name: "Whole Foods", url: "https://www.wholefoodsmarket.com", countryCode: "US" };

function allowance(patch: Partial<OrderIntentResponse> = {}): OrderIntentResponse {
  return {
    orderIntentId: "oi_1", paymentMethodId: "card", description: "test", status: "active",
    expiresAt: "2099-01-01T00:00:00Z",
    amount: { available: "15.00", total: "15.00", spent: "0.00", reserved: "0.00", currency: "usd" },
    rails: [
      { rail: "agentic-token", provider: "vic", status: "active", credentialFormats: ["card"] },
      { rail: "encrypted-card", status: "active", credentialFormats: ["card"] },
    ],
    ...patch,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("revealCardCredentials", () => {
  describe("when the rail is encrypted-card", () => {
    test("sends the charge amount and merchant with the public key", async () => {
      api.fetchEncryptedCardCredentials.mockResolvedValue({
        id: "cred_1", rail: "encrypted-card", amount: { value: "5.00", currency: "usd" },
        credential: { format: "card", value: "jwe" }, expiresAt: "2099-01-01T00:05:00Z",
      });

      const result = await revealCardCredentials("jwt", allowance(), {
        rail: "encrypted-card", amount: "5.00", merchant: MERCHANT, publicKey: PUBLIC_KEY,
      });

      expect(api.fetchEncryptedCardCredentials).toHaveBeenCalledWith("jwt", "oi_1", {
        amount: { value: "5.00", currency: "usd" }, merchant: MERCHANT, publicKey: PUBLIC_KEY,
      });
      expect(result).toEqual({ kind: "jwe", rail: "encrypted-card", jwe: "jwe", expiresAt: "2099-01-01T00:05:00Z" });
    });

    test("defaults the amount to the available balance", async () => {
      api.fetchEncryptedCardCredentials.mockResolvedValue({
        id: "cred_1", rail: "encrypted-card", amount: { value: "15.00", currency: "usd" },
        credential: { format: "card", value: "jwe" }, expiresAt: "2099-01-01T00:05:00Z",
      });

      await revealCardCredentials("jwt", allowance({ merchant: MERCHANT }), { rail: "encrypted-card", publicKey: PUBLIC_KEY });

      expect(api.fetchEncryptedCardCredentials).toHaveBeenCalledWith("jwt", "oi_1", {
        amount: { value: "15.00", currency: "usd" }, merchant: undefined, publicKey: PUBLIC_KEY,
      });
    });

    test("refuses to mint when neither the allowance nor the request names a merchant", async () => {
      await expect(
        revealCardCredentials("jwt", allowance(), { rail: "encrypted-card", amount: "5.00", publicKey: PUBLIC_KEY }),
      ).rejects.toThrow("This allowance has no merchant");
      expect(api.fetchEncryptedCardCredentials).not.toHaveBeenCalled();
    });
  });

  describe("when the agentic-token mint fails", () => {
    test("rethrows the error without minting on encrypted-card", async () => {
      const failure = new Error("The requested credential is not available for this order intent");
      api.fetchAgenticTokenCredentials.mockRejectedValue(failure);

      await expect(
        revealCardCredentials("jwt", allowance(), { rail: "agentic-token", amount: "5.00", merchant: MERCHANT }),
      ).rejects.toBe(failure);
      expect(api.fetchEncryptedCardCredentials).not.toHaveBeenCalled();
    });
  });

  describe("when the requested rail is pending_verification", () => {
    test("refuses to mint instead of switching to another rail", async () => {
      const pending = allowance({
        rails: [
          { rail: "agentic-token", provider: "vic", status: "pending_verification", credentialFormats: ["card"] },
          { rail: "encrypted-card", status: "active", credentialFormats: ["card"] },
        ],
      });

      await expect(
        revealCardCredentials("jwt", pending, { rail: "agentic-token", amount: "5.00", merchant: MERCHANT }),
      ).rejects.toThrow("agentic-token · vic is pending_verification");
      expect(api.fetchAgenticTokenCredentials).not.toHaveBeenCalled();
      expect(api.fetchEncryptedCardCredentials).not.toHaveBeenCalled();
    });
  });
});
