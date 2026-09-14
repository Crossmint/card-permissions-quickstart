"use client";

import { useEffect, useState } from "react";
import { CreditCard, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import type { Merchant, OrderIntentResponse, RailName, RevealedCredentials } from "@/lib/crossmint-types";
import { revealCardCredentials } from "@/lib/card-credentials";
import { activeCardRail, activeCardRails, activeSptRail, clampDelay } from "@/lib/rails";
import { RailBadge } from "./rail-badge";
import { allowanceLimit, ExhaustedPill, isExhausted } from "./order-intents-list";
import { fetchOrderIntent } from "@/lib/crossmint-api";

// The encrypted-card rail returns no expiry. Hide those details after a fixed time.
const FALLBACK_HIDE_MS = 5 * 60 * 1000;

function formatCardNumber(number: string) {
  return number.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function hideAt(credentials: RevealedCredentials) {
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
  onUpdated,
}: {
  orderIntents: OrderIntentResponse[];
  loading: boolean;
  getJwt: () => string;
  /** Called with the re-read allowance after a card is minted, so the balance updates. */
  onUpdated?: (orderIntent: OrderIntentResponse) => void;
}) {
  const [expandedOrderIntentId, setExpandedOrderIntentId] = useState<string | null>(null);
  const [selectedRailByOrderIntentId, setSelectedRailByOrderIntentId] = useState<Record<string, RailName>>({});
  const [amount, setAmount] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [merchantUrl, setMerchantUrl] = useState("");
  const [networkBusinessProfile, setNetworkBusinessProfile] = useState("");
  const [revealingOrderIntentId, setRevealingOrderIntentId] = useState<string | null>(null);
  const [credentialsByOrderIntentId, setCredentialsByOrderIntentId] = useState<Record<string, RevealedCredentials>>({});
  // Keyed by orderIntentId so a failure shows under the allowance it belongs to.
  const [errorByOrderIntentId, setErrorByOrderIntentId] = useState<Record<string, string>>({});

  const setError = (orderIntentId: string, message: string) =>
    setErrorByOrderIntentId((current) => {
      const next = { ...current };
      if (message) next[orderIntentId] = message;
      else delete next[orderIntentId];
      return next;
    });

  const hideDetails = (orderIntentId: string) => {
    setCredentialsByOrderIntentId((current) => {
      const next = { ...current };
      delete next[orderIntentId];
      return next;
    });
  };

  useEffect(() => {
    const timers = Object.entries(credentialsByOrderIntentId).map(([orderIntentId, credentials]) =>
      window.setTimeout(() => hideDetails(orderIntentId), clampDelay(hideAt(credentials) - Date.now())),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [credentialsByOrderIntentId]);

  const revealDetails = async (
    orderIntent: OrderIntentResponse,
    options: { rail: RailName; amount?: string; merchant?: Merchant; networkBusinessProfile?: string },
  ) => {
    setError(orderIntent.orderIntentId, "");
    setRevealingOrderIntentId(orderIntent.orderIntentId);
    try {
      const credentials = await revealCardCredentials(getJwt(), orderIntent, options);
      setCredentialsByOrderIntentId((current) => ({ ...current, [orderIntent.orderIntentId]: credentials }));
      setExpandedOrderIntentId(null);
      // Minting reserves the amount. Re-read so the balance shown goes down.
      if (onUpdated) {
        try {
          onUpdated(await fetchOrderIntent(getJwt(), orderIntent.orderIntentId));
        } catch (err) {
          console.error("Could not refresh the allowance after minting:", err);
        }
      }
    } catch (err) {
      setError(orderIntent.orderIntentId, err instanceof Error ? err.message : "Failed to reveal credentials");
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
        const cardRails = activeCardRails(orderIntent);
        const spt = activeSptRail(orderIntent);
        const options = [...cardRails, ...(spt ? [spt] : [])];
        if (options.length === 0) return null;
        const preferred = activeCardRail(orderIntent)?.rail ?? "spt";
        const selectedRail =
          options.find((rail) => rail.rail === selectedRailByOrderIntentId[orderIntent.orderIntentId]) ??
          options.find((rail) => rail.rail === preferred) ??
          options[0];
        const credentials = credentialsByOrderIntentId[orderIntent.orderIntentId];
        const deliveredRail = credentials && options.find((rail) => rail.rail === credentials.rail);
        const isExpanded = expandedOrderIntentId === orderIntent.orderIntentId;
        const isRevealing = revealingOrderIntentId === orderIntent.orderIntentId;
        const isEncrypted = selectedRail.rail === "encrypted-card";
        const needsMerchant = !orderIntent.merchant;
        const error = errorByOrderIntentId[orderIntent.orderIntentId] ?? "";
        const exhausted = isExhausted(orderIntent);
        const availableLabel = `${orderIntent.amount.available} ${orderIntent.amount.currency.toUpperCase()}`;

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
              {options.length > 1 && (
                <div className="flex items-center gap-1">
                  {options.map((rail) => (
                    <button
                      key={rail.rail}
                      type="button"
                      onClick={() => setSelectedRailByOrderIntentId((current) => ({ ...current, [orderIntent.orderIntentId]: rail.rail }))}
                      aria-pressed={selectedRail.rail === rail.rail}
                    >
                      <RailBadge
                        rail={rail.rail}
                        provider={rail.rail === "agentic-token" ? rail.provider : rail.rail === "spt" ? "stripe" : undefined}
                        compact
                        preferred={selectedRail.rail === rail.rail}
                      />
                    </button>
                  ))}
                </div>
              )}
              {exhausted && !credentials ? (
                <ExhaustedPill orderIntent={orderIntent} />
              ) : (
                <RailBadge
                  rail={selectedRail.rail}
                  provider={selectedRail.rail === "agentic-token" ? selectedRail.provider : selectedRail.rail === "spt" ? "stripe" : undefined}
                  compact
                />
              )}
              {exhausted && !credentials ? null : credentials ? (
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
                  onClick={() => void revealDetails(orderIntent, { rail: selectedRail.rail })}
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
                    setError(orderIntent.orderIntentId, "");
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#05B959] hover:text-[#049d4c]"
                >
                  <Eye className="size-3.5" />
                  Reveal details
                </button>
              )}
            </div>

            {exhausted && !credentials && (
              <p className="px-4 py-3 text-xs text-[#00150d]/60">Each credential reserves its amount. Create a new allowance to mint another.</p>
            )}

            {isEncrypted && error && revealingOrderIntentId === null && !credentials && (
              <p className="px-4 py-3 text-xs text-red-600 break-words">{error}</p>
            )}

            {isExpanded && !credentials && !isEncrypted && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void revealDetails(orderIntent, {
                    rail: selectedRail.rail,
                    amount,
                    merchant: needsMerchant ? { name: merchantName, url: merchantUrl, countryCode: "US" } : undefined,
                    networkBusinessProfile: selectedRail.rail === "spt" ? networkBusinessProfile : undefined,
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
                <p className="text-xs text-[#00150d]/60">
                  This amount is reserved from the allowance. {availableLabel} available.
                </p>
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
                {selectedRail.rail === "spt" && (
                  <div>
                    <label className="text-xs font-medium text-[#00150d]/60 block mb-1">Stripe Network Business Profile ID</label>
                    <input type="text" value={networkBusinessProfile} onChange={(event) => setNetworkBusinessProfile(event.target.value)} required className={inputClass} />
                  </div>
                )}
                {error && <p className="text-xs text-red-600 break-words">{error}</p>}
                <button
                  type="submit"
                  disabled={isRevealing}
                  className="flex items-center gap-2 text-xs font-medium text-white bg-[#05B959] hover:bg-[#049d4c] disabled:opacity-60 px-4 py-2 rounded-md transition-colors"
                >
                  {isRevealing && <Loader2 className="size-3.5 animate-spin" />}
                  {selectedRail.rail === "spt" ? "Mint shared payment token" : "Mint one-time card"}
                </button>
              </form>
            )}

            {credentials && (
              <div className="border-t border-[rgba(0,0,0,0.08)] p-4 space-y-3">
                <div className="flex items-center gap-3 text-[11px] text-[#00150d]/60">
                  <span>Delivered on</span>
                  <RailBadge
                    rail={credentials.rail}
                    provider={
                      deliveredRail?.rail === "agentic-token"
                        ? deliveredRail.provider
                        : deliveredRail?.rail === "spt"
                          ? "stripe"
                          : undefined
                    }
                    compact
                  />
                </div>
                {credentials.kind === "spt" ? (
                  <>
                    <div>
                      <div className="text-xs text-[#00150d]/50 mb-1">Stripe shared payment token</div>
                      <div className="font-mono text-base text-[#00150d] break-all">{credentials.token}</div>
                    </div>
                    <div className="text-xs">
                      <div className="text-[#00150d]/50">Expires</div>
                      <div className="font-mono text-[#00150d]">{new Date(credentials.expiresAt).toLocaleTimeString()}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="text-xs text-[#00150d]/50 mb-1">
                        {credentials.rail === "encrypted-card" ? "Card number (decrypted in your browser)" : "One-time agent card number"}
                      </div>
                      <div className="font-mono text-base text-[#00150d] tracking-wide">{formatCardNumber(credentials.number)}</div>
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
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
