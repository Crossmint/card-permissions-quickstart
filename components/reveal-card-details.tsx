"use client";

import { useEffect, useState } from "react";
import { CreditCard, Eye, EyeOff, Loader2 } from "lucide-react";
import { fetchCardCredentials } from "@/lib/crossmint-api";
import type { CardCredentials, OrderIntentResponse } from "@/lib/crossmint-types";

function formatCardNumber(number: string) {
  return number.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function allowanceLabel(orderIntent: OrderIntentResponse) {
  const description = orderIntent.mandates.find((mandate) => mandate.type === "description");
  return description?.value ?? "Agent card allowance";
}

function allowanceLimit(orderIntent: OrderIntentResponse) {
  const maxAmount = orderIntent.mandates.find((mandate) => mandate.type === "maxAmount");
  if (maxAmount?.type !== "maxAmount") {
    return null;
  }
  return `${maxAmount.value} ${maxAmount.details.currency.toUpperCase()}`;
}

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
  const [merchantName, setMerchantName] = useState("");
  const [merchantUrl, setMerchantUrl] = useState("");
  const [revealingOrderIntentId, setRevealingOrderIntentId] = useState<string | null>(null);
  const [credentialsByOrderIntentId, setCredentialsByOrderIntentId] = useState<Record<string, CardCredentials>>({});
  const [error, setError] = useState("");

  const activeOrderIntents = orderIntents.filter((orderIntent) => orderIntent.phase === "active");

  const hideDetails = (orderIntentId: string) => {
    setCredentialsByOrderIntentId((current) => {
      const next = { ...current };
      delete next[orderIntentId];
      return next;
    });
  };

  useEffect(() => {
    const expirationTimers = Object.entries(credentialsByOrderIntentId).flatMap(([orderIntentId, credentials]) => {
      const expiresInMs = new Date(credentials.expiresAt).getTime() - Date.now();
      if (!Number.isFinite(expiresInMs)) {
        return [];
      }
      return [window.setTimeout(() => hideDetails(orderIntentId), Math.max(0, expiresInMs))];
    });

    return () => expirationTimers.forEach((timer) => window.clearTimeout(timer));
  }, [credentialsByOrderIntentId]);

  const revealDetails = async (event: React.FormEvent, orderIntentId: string) => {
    event.preventDefault();
    setError("");
    setRevealingOrderIntentId(orderIntentId);

    try {
      const credentials = await fetchCardCredentials(getJwt(), orderIntentId, {
        name: merchantName,
        url: merchantUrl,
        countryCode: "US",
      });
      setCredentialsByOrderIntentId((current) => ({
        ...current,
        [orderIntentId]: credentials,
      }));
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

  if (activeOrderIntents.length === 0) {
    return (
      <div className="rounded-lg bg-[#F6F6F6] px-4 py-3 text-sm text-[#00150d]/50">
        Create an active allowance in Step 3 before revealing card details.
      </div>
    );
  }

  return (
    <div className="space-y-[14px]">
      {activeOrderIntents.map((orderIntent) => {
        const credentials = credentialsByOrderIntentId[orderIntent.orderIntentId];
        const isExpanded = expandedOrderIntentId === orderIntent.orderIntentId;
        const isRevealing = revealingOrderIntentId === orderIntent.orderIntentId;
        const limit = allowanceLimit(orderIntent);

        return (
          <div
            key={orderIntent.orderIntentId}
            className="rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden"
          >
            <div className="flex items-center gap-3 bg-[#F6F6F6] px-4 py-3">
              <CreditCard className="size-5 text-[#2377FF] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[#00150d]">{allowanceLabel(orderIntent)}</div>
                {limit && <div className="text-xs text-[#00150d]/50">{limit}</div>}
              </div>
              {credentials ? (
                <button
                  type="button"
                  onClick={() => hideDetails(orderIntent.orderIntentId)}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#00150d]/60 hover:text-[#00150d]"
                >
                  <EyeOff className="size-3.5" />
                  Hide details
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setExpandedOrderIntentId(isExpanded ? null : orderIntent.orderIntentId);
                    setError("");
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#05B959] hover:text-[#049d4c]"
                >
                  <Eye className="size-3.5" />
                  Reveal details
                </button>
              )}
            </div>

            {isExpanded && !credentials && (
              <form onSubmit={(event) => revealDetails(event, orderIntent.orderIntentId)} className="p-4 space-y-3">
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
                <div>
                  <label className="text-xs font-medium text-[#00150d]/60 block mb-1">Merchant name</label>
                  <input
                    type="text"
                    value={merchantName}
                    onChange={(event) => setMerchantName(event.target.value)}
                    placeholder="e.g. Whole Foods"
                    required
                    className="w-full rounded-md border border-[rgba(0,0,0,0.1)] px-3 py-2 text-sm outline-none focus:border-[#05B959] focus:ring-1 focus:ring-[#05B959]/20"
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
                    className="w-full rounded-md border border-[rgba(0,0,0,0.1)] px-3 py-2 text-sm outline-none focus:border-[#05B959] focus:ring-1 focus:ring-[#05B959]/20"
                  />
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={isRevealing}
                  className="flex items-center gap-2 text-xs font-medium text-white bg-[#05B959] hover:bg-[#049d4c] disabled:opacity-60 px-4 py-2 rounded-md transition-colors"
                >
                  {isRevealing && <Loader2 className="size-3.5 animate-spin" />}
                  Reveal card details
                </button>
              </form>
            )}

            {credentials && (
              <div className="border-t border-[rgba(0,0,0,0.08)] p-4 space-y-3">
                <div>
                  <div className="text-xs text-[#00150d]/50 mb-1">Agent card number</div>
                  <div className="font-mono text-base text-[#00150d] tracking-wide">
                    {formatCardNumber(credentials.card.number)}
                  </div>
                </div>
                <div className="flex gap-8 text-xs">
                  <div>
                    <div className="text-[#00150d]/50">Expires</div>
                    <div className="font-mono text-[#00150d]">
                      {credentials.card.expirationMonth}/{credentials.card.expirationYear.slice(-2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#00150d]/50">CVC</div>
                    <div className="font-mono text-[#00150d]">{credentials.card.cvc}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
