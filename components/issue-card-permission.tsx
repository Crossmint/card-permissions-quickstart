"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck, CreditCard, ChevronsUpDown } from "lucide-react";
import type { OrderIntentResponse, PaymentMethodResponse } from "@/lib/crossmint-types";
import { createNewOrderIntent } from "@/lib/crossmint-api";
import { verificationAppearance } from "@/lib/verification-appearance";
import { OrderIntentVerification } from "@crossmint/client-sdk-react-ui";

type Step = "form" | "creating" | "order-verification" | "done" | "error";

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

export function IssueCardPermission({
  agentId,
  paymentMethodId,
  cards,
  getJwt,
  onCardIssued,
  onCancel,
}: {
  agentId: string;
  paymentMethodId: string;
  cards: PaymentMethodResponse[];
  getJwt: () => string;
  onCardIssued: (orderIntent: OrderIntentResponse) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState("");
  const [orderIntent, setOrderIntent] = useState<OrderIntentResponse | null>(null);

  const [selectedCardId, setSelectedCardId] = useState(paymentMethodId);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  const [maxAmount, setMaxAmount] = useState("");
  const [period, setPeriod] = useState<"once" | "weekly" | "monthly" | "yearly">("once");
  const [description, setDescription] = useState("");

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
      const intent = await createNewOrderIntent(getJwt(), agentId, selectedCardId, [
        {
          type: "maxAmount",
          value: maxAmount,
          details: period === "once" ? { currency: "usd" } : { currency: "usd", period },
        },
        { type: "description", value: description || "Agent card allowance" },
      ]);

      setOrderIntent(intent);

      if (intent.phase === "requires-verification") {
        setStep("order-verification");
      } else {
        finishCreatingAllowance(intent);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create allowance");
      setStep("error");
    }
  };

  const finishCreatingAllowance = (intent: OrderIntentResponse) => {
    setStep("done");
    onCardIssued(intent);
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
                setPeriod("once");
                setDescription("Weekly groceries");
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
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                placeholder="e.g. 150.00"
                required
                className="w-full rounded-md border border-[rgba(0,0,0,0.1)] px-3 py-2 text-sm outline-none focus:border-[#05B959] focus:ring-1 focus:ring-[#05B959]/20"
              />
            </div>
            <div className="w-32">
              <label className="text-xs font-medium text-[#00150d]/60 block mb-1">Period</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as "once" | "weekly" | "monthly" | "yearly")}
                className="w-full rounded-md border border-[rgba(0,0,0,0.1)] px-3 py-2 text-sm outline-none focus:border-[#05B959] focus:ring-1 focus:ring-[#05B959]/20 bg-white h-[38px]"
              >
                <option value="once">1 time</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[#00150d]/60 block mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Weekly groceries"
              className="w-full rounded-md border border-[rgba(0,0,0,0.1)] px-3 py-2 text-sm outline-none focus:border-[#05B959] focus:ring-1 focus:ring-[#05B959]/20"
            />
          </div>
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

  if (step === "order-verification" && orderIntent?.phase === "requires-verification") {
    return (
      <div className="rounded-[10px] border border-[rgba(0,0,0,0.1)] overflow-hidden bg-white">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(0,0,0,0.06)] bg-black/[0.02]">
          <ShieldCheck className="size-3.5 text-[#05B959]" />
          <span className="text-xs font-medium text-[#00150d]">Authorize spending</span>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 text-sm text-[#00150d]/60 mb-3">
            <Loader2 className="size-4 animate-spin text-[#05B959]" />
            <span>Waiting for passkey authorization...</span>
          </div>
          <OrderIntentVerification
            orderIntent={orderIntent}
            appearance={verificationAppearance}
            onVerificationComplete={() => finishCreatingAllowance(orderIntent)}
            onVerificationError={() => {
              setError("Verification failed. Please try again.");
              setStep("error");
            }}
          />
        </div>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="rounded-[10px] border border-red-200 bg-red-50 p-4 space-y-2">
        <p className="text-sm font-medium text-red-700">Failed to create allowance</p>
        <p className="text-xs text-red-600">{error}</p>
        <button
          onClick={() => { setStep("form"); setError(""); }}
          className="text-xs text-red-600 hover:text-red-800 underline underline-offset-2"
        >
          Try again
        </button>
      </div>
    );
  }

  return null;
}
