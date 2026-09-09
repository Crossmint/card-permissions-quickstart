"use client";

import { useEffect, useState } from "react";
import { CreditCard, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import type { AgentCardCredentials, OrderIntentResponse } from "@/lib/crossmint-types";
import { revealCardCredentials } from "@/lib/card-credentials";
import { activeCardRail } from "@/lib/rails";
import { RailBadge } from "./rail-badge";
import { allowanceLimit } from "./order-intents-list";

// The encrypted-card rail returns no expiry. Hide those details after a fixed time.
const FALLBACK_HIDE_MS = 5 * 60 * 1000;

function formatCardNumber(number: string) {
  return number.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function hideAt(credentials: AgentCardCredentials) {
  if (credentials.expiresAt) {
    const at = new Date(credentials.expiresAt).getTime();
    if (Number.isFinite(at)) return at;
  }
  return Date.now() + FALLBACK_HIDE_MS;
}

const inputClass =
  "w-full rounded-md border border-[rgba(0,0,0,0.1)] px-3 py-2 text-sm outline-none focus:border-[#05B959] focus:ring-1 focus:ring-[#05B959]/20";

export function RevealCardDetails({
  orderIntents,
  loading,
  getJwt,
}: {
  orderIntents: OrderIntentResponse[];
  loading: boolean;
  getJwt: () => string;
}) {
  const [expandedOrderIntentId, setExpandedOrderIntentId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [merchantUrl, setMerchantUrl] = useState("");
  const [revealingOrderIntentId, setRevealingOrderIntentId] = useState<string | null>(null);
  const [credentialsByOrderIntentId, setCredentialsByOrderIntentId] = useState<Record<string, AgentCardCredentials>>({});
  const [error, setError] = useState("");

  const hideDetails = (orderIntentId: string) => {
    setCredentialsByOrderIntentId((current) => {
      const next = { ...current };
      delete next[orderIntentId];
      return next;
    });
  };

  useEffect(() => {
    const timers = Object.entries(credentialsByOrderIntentId).map(([orderIntentId, credentials]) =>
      window.setTimeout(() => hideDetails(orderIntentId), Math.max(0, hideAt(credentials) - Date.now())),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [credentialsByOrderIntentId]);

  const revealDetails = async (orderIntent: OrderIntentResponse, options: { amount?: string; merchant?: { name: string; url: string; countryCode: string } }) => {
    setError("");
    setRevealingOrderIntentId(orderIntent.orderIntentId);
    try {
      const credentials = await revealCardCredentials(getJwt(), orderIntent, options);
      setCredentialsByOrderIntentId((current) => ({ ...current, [orderIntent.orderIntentId]: credentials }));
      setExpandedOrderIntentId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reveal card details");
    } finally {
      setRevealingOrderIntentId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-[#F6F6F6] px-4 py-3 animate-pulse">
        <div className="size-5 rounded bg-black/[0.08] shrink-0" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 w-36 rounded bg-black/[0.08]" />
          <div className="h-3 w-20 rounded bg-black/[0.05]" />
        </div>
      </div>
    );
  }

  if (orderIntents.length === 0) {
    return (
      <div className="rounded-lg bg-[#F6F6F6] px-4 py-3 text-sm text-[#00150d]/50">
        Create and verify an allowance in Step 2 before revealing card details.
      </div>
    );
  }

  return (
    <div className="space-y-[14px]">
      {orderIntents.map((orderIntent) => {
        const rail = activeCardRail(orderIntent);
        if (!rail) return null;
        const isEncrypted = rail.rail === "encrypted-card";
        const credentials = credentialsByOrderIntentId[orderIntent.orderIntentId];
        const isExpanded = expandedOrderIntentId === orderIntent.orderIntentId;
        const isRevealing = revealingOrderIntentId === orderIntent.orderIntentId;
        const needsMerchant = !isEncrypted && !orderIntent.merchant;

        return (
          <div
            key={orderIntent.orderIntentId}
            className="rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden"
          >
            <div className="flex items-center gap-3 bg-[#F6F6F6] px-4 py-3">
              <CreditCard className="size-5 text-[#2377FF] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[#00150d] truncate">{orderIntent.description || "Agent card allowance"}</div>
                <div className="text-xs text-[#00150d]/50">
                  {allowanceLimit(orderIntent)}
                  {orderIntent.merchant ? ` · ${orderIntent.merchant.name}` : ""}
                </div>
              </div>
              <RailBadge rail={rail.rail} provider={rail.rail === "agentic-token" ? rail.provider : undefined} compact />
              {credentials ? (
                <button
                  type="button"
                  onClick={() => hideDetails(orderIntent.orderIntentId)}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#00150d]/60 hover:text-[#00150d]"
                >
                  <EyeOff className="size-3.5" />
                  Hide details
                </button>
              ) : isEncrypted ? (
                // Encrypted-card needs no input: generate a keypair, fetch, decrypt.
                <button
                  type="button"
                  disabled={isRevealing}
                  onClick={() => void revealDetails(orderIntent, {})}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#05B959] hover:text-[#049d4c] disabled:opacity-60"
                >
                  {isRevealing ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
                  Reveal details
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setExpandedOrderIntentId(isExpanded ? null : orderIntent.orderIntentId);
                    setAmount(orderIntent.amount.available);
                    setError("");
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#05B959] hover:text-[#049d4c]"
                >
                  <Eye className="size-3.5" />
                  Reveal details
                </button>
              )}
            </div>

            {isEncrypted && error && revealingOrderIntentId === null && !credentials && (
              <p className="px-4 py-3 text-xs text-red-600 break-words">{error}</p>
            )}

            {isExpanded && !credentials && !isEncrypted && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void revealDetails(orderIntent, {
                    amount,
                    merchant: needsMerchant ? { name: merchantName, url: merchantUrl, countryCode: "US" } : undefined,
                  });
                }}
                className="p-4 space-y-3"
              >
                {needsMerchant && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setMerchantName("Whole Foods");
                        setMerchantUrl("https://www.wholefoodsmarket.com");
                      }}
                      className="text-xs text-[#05B959] hover:text-[#049d4c] underline underline-offset-2"
                    >
                      Fill example merchant
                    </button>
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-[#00150d]/60 block mb-1">
                    Charge amount ({orderIntent.amount.currency.toUpperCase()})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="^\d+(\.\d{1,2})?$"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    required
                    className={inputClass}
                  />
                </div>
                {needsMerchant && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-[#00150d]/60 block mb-1">Merchant name</label>
                      <input
                        type="text"
                        value={merchantName}
                        onChange={(event) => setMerchantName(event.target.value)}
                        placeholder="e.g. Whole Foods"
                        required
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#00150d]/60 block mb-1">Merchant URL</label>
                      <input
                        type="url"
                        value={merchantUrl}
                        onChange={(event) => setMerchantUrl(event.target.value)}
                        placeholder="e.g. https://www.wholefoodsmarket.com"
                        required
                        className={inputClass}
                      />
                    </div>
                  </>
                )}
                {error && <p className="text-xs text-red-600 break-words">{error}</p>}
                <button
                  type="submit"
                  disabled={isRevealing}
                  className="flex items-center gap-2 text-xs font-medium text-white bg-[#05B959] hover:bg-[#049d4c] disabled:opacity-60 px-4 py-2 rounded-md transition-colors"
                >
                  {isRevealing && <Loader2 className="size-3.5 animate-spin" />}
                  Mint one-time card
                </button>
              </form>
            )}

            {credentials && (
              <div className="border-t border-[rgba(0,0,0,0.08)] p-4 space-y-3">
                <div className="flex items-center gap-3 text-[11px] text-[#00150d]/60">
                  <span>Delivered on</span>
                  <RailBadge rail={credentials.rail} provider={rail.rail === "agentic-token" ? rail.provider : undefined} compact />
                </div>
                <div>
                  <div className="text-xs text-[#00150d]/50 mb-1">
                    {credentials.rail === "encrypted-card" ? "Card number (decrypted in your browser)" : "One-time agent card number"}
                  </div>
                  <div className="font-mono text-base text-[#00150d] tracking-wide">
                    {formatCardNumber(credentials.number)}
                  </div>
                </div>
                <div className="flex gap-8 text-xs">
                  <div>
                    <div className="text-[#00150d]/50">Expires</div>
                    <div className="font-mono text-[#00150d]">
                      {credentials.expirationMonth.padStart(2, "0")}/{credentials.expirationYear.slice(-2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#00150d]/50">CVC</div>
                    <div className="font-mono text-[#00150d]">{credentials.cvc}</div>
                  </div>
                </div>
                {credentials.rail === "encrypted-card" && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[#00150d]/45">
                    <LockKeyhole className="size-3 text-[#05B959]" />
                    Delivered as a JWE and decrypted with a one-time key that never left this tab.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
