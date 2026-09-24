import { describe, expect, it } from "vitest";
import type { OrderIntentResponse } from "./crossmint-types";
import { isRevealable, resolveAllowanceSelection } from "./rails";

function allowance(id: string, patch: Partial<OrderIntentResponse> = {}): OrderIntentResponse {
  return {
    orderIntentId: id, paymentMethodId: "card", description: id, status: "active",
    expiresAt: "2099-01-01T00:00:00Z",
    amount: { available: "10", total: "10", spent: "0", reserved: "0", currency: "usd" },
    rails: [{ rail: "encrypted-card", status: "active", credentialFormats: ["card"] }],
    ...patch,
  };
}

describe("allowance selection across steps", () => {
  it("keeps the exhausted allowance selected and revealable", () => {
    const exhausted = allowance("a", { amount: { available: "0", total: "10", spent: "10", reserved: "0", currency: "usd" } });
    expect(isRevealable(exhausted)).toBe(true);
    expect(resolveAllowanceSelection([exhausted, allowance("b")], "a")).toBe("a");
  });

  it("preserves a newly created selection before and after verification", () => {
    const pending = allowance("new", { rails: [{ rail: "spt", provider: "stripe", status: "pending_verification", credentialFormats: ["identifier"] }] });
    expect(isRevealable(pending)).toBe(false);
    expect(resolveAllowanceSelection([allowance("old"), pending], "new")).toBe("new");
    expect(resolveAllowanceSelection([allowance("old"), allowance("new")], "new")).toBe("new");
    expect(resolveAllowanceSelection([pending], "new")).toBe("new");
  });

  it("excludes expired allowances even if their rail still waits for CVC", () => {
    const expired = allowance("expired", { status: "expired", rails: [{ rail: "encrypted-card", status: "pending_cvc_recollection", credentialFormats: ["card"] }] });
    expect(isRevealable(expired)).toBe(false);
    expect(resolveAllowanceSelection([expired, allowance("active")], "expired")).toBe("active");
    expect(resolveAllowanceSelection([expired], "expired")).toBeNull();
  });

  it("replaces a deleted selection with a usable allowance", () => {
    expect(resolveAllowanceSelection([allowance("remaining")], "deleted")).toBe("remaining");
    expect(resolveAllowanceSelection([], "deleted")).toBeNull();
  });

  it("falls back when the selected allowance has only failed rails", () => {
    const failed = allowance("failed", { rails: [{ rail: "encrypted-card", status: "error", error: { code: "UNAVAILABLE" }, credentialFormats: ["card"] }] });
    expect(resolveAllowanceSelection([failed, allowance("ready")], "failed")).toBe("ready");
    expect(resolveAllowanceSelection([failed], "failed")).toBeNull();
  });
});
