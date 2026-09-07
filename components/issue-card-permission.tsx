"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, CreditCard, ChevronsUpDown, Store } from "lucide-react";
import type { OrderIntentResponse, PaymentMethodResponse } from "@/lib/crossmint-types";
import { createNewOrderIntent } from "@/lib/crossmint-api";

type Step = "form" | "creating" | "error";

const EXPIRY_OPTIONS = [
  { value: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { value: "1d", label: "1 day", ms: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "30d", label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
] as const;
type ExpiryValue = (typeof EXPIRY_OPTIONS)[number]["value"];

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cardLabel(card: PaymentMethodResponse) {
  const brand = card.card?.brand ? capitalize(card.card.brand) : "Card";
  const last4 = card.card?.last4 ?? "????";
  return { brand, last4 };
}

function cardExpDisplay(card: PaymentMethodResponse) {
  const m = card.card?.expiration?.month ?? "";
  const y = card.card?.expiration?.year ?? "";
  return m && y ? `Exp. date ${m}/${y.slice(-2)}` : null;
}

const inputClass =
  "w-full rounded-md border border-[rgba(0,0,0,0.1)] px-3 py-2 text-sm outline-none focus:border-[#05B959] focus:ring-1 focus:ring-[#05B959]/20";

export function IssueCardPermission({
  paymentMethodId,
  cards,
  getJwt,
  onCardIssued,
  onCancel,
}: {
  paymentMethodId: string;
  cards: PaymentMethodResponse[];
  getJwt: () => string;
  onCardIssued: (orderIntent: OrderIntentResponse) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState("");

  const [selectedCardId, setSelectedCardId] = useState(paymentMethodId);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  const [maxAmount, setMaxAmount] = useState("");
  const [expiry, setExpiry] = useState<ExpiryValue>("7d");
  const [description, setDescription] = useState("");
  const [scopeToMerchant, setScopeToMerchant] = useState(false);
  const [merchantName, setMerchantName] = useState("");
  const [merchantUrl, setMerchantUrl] = useState("");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setSelectorOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedCard = cards.find((c) => c.paymentMethodId === selectedCardId) ?? cards[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setStep("creating");

    try {
      const expiresInMs = EXPIRY_OPTIONS.find((option) => option.value === expiry)?.ms ?? EXPIRY_OPTIONS[2].ms;
      const intent = await createNewOrderIntent(getJwt(), {
        paymentMethodId: selectedCardId,
        amount: { value: maxAmount, currency: "USD" },
        description: description || "Agent card allowance",
        expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
        // Optional. A merchant fixed here is not repeated on credential requests.
        ...(scopeToMerchant && merchantName && merchantUrl
          ? { merchant: { name: merchantName, url: merchantUrl, countryCode: "US" } }
          : {}),
      });
      // The intent may still need bank verification on its network rail.
      // The allowance list shows a "Verify" action for it.
      onCardIssued(intent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create allowance");
      setStep("error");
    }
  };

  if (step === "form") {
    const { brand, last4 } = selectedCard ? cardLabel(selectedCard) : { brand: "Card", last4: "????" };
    const expDisplay = selectedCard ? cardExpDisplay(selectedCard) : null;

    return (
      <div className="rounded-[10px] border border-[rgba(0,0,0,0.1)] bg-white overflow-hidden">
        {/* Card selector */}
        <div className="p-4 pb-4">
          <label className="text-xs font-medium text-[#00150d]/60 block mb-1.5">Origin source</label>
          <div className="relative" ref={selectorRef}>
            <button
              type="button"
              onClick={() => cards.length > 1 && setSelectorOpen((o) => !o)}
              className={`w-full flex items-center gap-3 rounded-lg bg-[#F6F6F6] px-4 py-3 text-left ${cards.length > 1 ? "cursor-pointer hover:bg-[#efefef] transition-colors" : "cursor-default"}`}
            >
              <CreditCard className="size-5 text-[#05B959] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#00150d]">{brand} •••• {last4}</div>
                {expDisplay && <div className="text-xs text-[#00150d]/50">{expDisplay}</div>}
              </div>
              {cards.length > 1 && (
                <ChevronsUpDown className="size-4 text-[#00150d] shrink-0" />
              )}
            </button>

            {selectorOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-[8px] border border-[rgba(0,0,0,0.1)] shadow-md py-1 z-50">
                {cards.map((c) => {
                  const { brand: b, last4: l } = cardLabel(c);
                  const exp = cardExpDisplay(c);
                  return (
                    <button
                      key={c.paymentMethodId}
                      type="button"
                      onClick={() => { setSelectedCardId(c.paymentMethodId); setSelectorOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F6F6F6] transition-colors text-left"
                    >
                      <CreditCard className="size-4 text-[#05B959] shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-[#00150d]">{b} •••• {l}</div>
                        {exp && <div className="text-xs text-[#00150d]/50">{exp}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-[rgba(0,0,0,0.08)]" />

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setMaxAmount("150.00");
                setExpiry("7d");
                setDescription("Weekly groceries");
                setScopeToMerchant(true);
                setMerchantName("Whole Foods");
                setMerchantUrl("https://www.wholefoodsmarket.com");
              }}
              className="text-xs text-[#05B959] hover:text-[#049d4c] underline underline-offset-2"
            >
              Fill example details
            </button>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-[#00150d]/60 block mb-1">Max amount (USD)</label>
              <input
                type="text"
                inputMode="decimal"
                pattern="^\d+(\.\d{1,2})?$"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                placeholder="e.g. 150.00"
                required
                className={inputClass}
              />
            </div>
            <div className="w-32">
              <label className="text-xs font-medium text-[#00150d]/60 block mb-1">Expires in</label>
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value as ExpiryValue)}
                className={`${inputClass} bg-white h-[38px]`}
              >
                {EXPIRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[#00150d]/60 block mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Weekly groceries"
              className={inputClass}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-[#00150d]/70 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={scopeToMerchant}
              onChange={(e) => setScopeToMerchant(e.target.checked)}
              className="accent-[#05B959]"
            />
            <Store className="size-3.5 text-[#00150d]/50" />
            Scope to one merchant (optional)
          </label>
          {scopeToMerchant && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-[#00150d]/60 block mb-1">Merchant name</label>
                <input
                  type="text"
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  placeholder="e.g. Whole Foods"
                  required
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-[#00150d]/60 block mb-1">Merchant URL</label>
                <input
                  type="url"
                  value={merchantUrl}
                  onChange={(e) => setMerchantUrl(e.target.value)}
                  placeholder="https://www.wholefoodsmarket.com"
                  required
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="text-xs font-medium text-white bg-[#05B959] hover:bg-[#049d4c] px-4 py-2 rounded-md transition-colors"
            >
              Create allowance
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-[#00150d]/60 hover:text-[#00150d] px-4 py-2 rounded-md hover:bg-black/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (step === "creating") {
    return (
      <div className="rounded-[10px] border border-[rgba(0,0,0,0.1)] bg-white p-6 flex items-center justify-center gap-2 text-sm text-[#00150d]/60">
        <Loader2 className="size-4 animate-spin text-[#05B959]" />
        <span>Creating allowance...</span>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-red-200 bg-red-50 p-4 space-y-2">
      <p className="text-sm font-medium text-red-700">Failed to create allowance</p>
      <p className="text-xs text-red-600 break-words">{error}</p>
      <button
        onClick={() => { setStep("form"); setError(""); }}
        className="text-xs text-red-600 hover:text-red-800 underline underline-offset-2"
      >
        Try again
      </button>
    </div>
  );
}
