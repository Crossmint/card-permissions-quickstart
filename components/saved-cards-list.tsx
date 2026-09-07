"use client";

import { useState } from "react";
import { CreditCard, Loader2, Info, Plus, Check, ShieldAlert } from "lucide-react";
import { DotsMenu } from "./dots-menu";
import type { OrderIntentRegistration, PaymentMethodResponse } from "@/lib/crossmint-types";
import { registerCard } from "@/lib/crossmint-api";
import { waitForRegistration } from "@/lib/wait-for-registration";

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function providerLabel(provider: "vic" | "agentpay") {
  return provider === "vic" ? "Visa" : "Mastercard";
}

/** One-line summary of what a registration provisioned. */
export function registrationSummary(registration: OrderIntentRegistration): {
  tone: "ready" | "pending" | "fallback";
  label: string;
  detail?: string;
} {
  const enabled = registration.rails.filter((rail) => rail.status === "enabled");
  if (enabled.length > 0) {
    return { tone: "ready", label: `${enabled.map((rail) => providerLabel(rail.provider)).join(" + ")} ready` };
  }
  if (registration.rails.some((rail) => rail.status === "pending")) {
    return { tone: "pending", label: "Setting up" };
  }
  const codes = registration.rails.map((rail) => rail.error?.code).filter(Boolean).join(", ");
  return {
    tone: "fallback",
    label: "Fallback only",
    detail: codes
      ? `Network rails unavailable (${codes}). Allowances on this card use the encrypted-card fallback.`
      : "Network rails unavailable. Allowances on this card use the encrypted-card fallback.",
  };
}

export function SavedCardsList({
  cards,
  loading,
  getJwt,
  email,
  registrations,
  onDeleteCard,
  onAddCard,
  onRegistrationComplete,
  viewMode = "ui",
}: {
  cards: PaymentMethodResponse[];
  loading: boolean;
  getJwt: () => string;
  email: string;
  registrations: Record<string, OrderIntentRegistration | null>;
  onDeleteCard: (paymentMethodId: string) => Promise<void>;
  onAddCard?: () => void;
  onRegistrationComplete?: () => void | Promise<void>;
  viewMode?: "ui" | "code";
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<Record<string, string>>({});

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-[#F6F6F6] px-4 py-3 animate-pulse">
        <div className="size-5 rounded bg-black/[0.08] shrink-0" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 w-32 rounded bg-black/[0.08]" />
          <div className="h-3 w-24 rounded bg-black/[0.05]" />
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    if (!onAddCard) return null;
    return (
      <button onClick={onAddCard} className="flex items-center gap-4 h-[35px] group">
        <div className="bg-white border-[1.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] w-[56px] h-[35px] flex items-center justify-center group-hover:border-[#05B959]/40 transition-colors shrink-0">
          <Plus className="size-5 text-[#00150d] group-hover:text-[#05B959] transition-colors" />
        </div>
        <span className="font-medium text-base text-[#00150d] group-hover:text-[#05B959] transition-colors">
          Add credit card
        </span>
      </button>
    );
  }

  const handleDelete = async (paymentMethodId: string) => {
    setDeletingId(paymentMethodId);
    try {
      await onDeleteCard(paymentMethodId);
    } finally {
      setDeletingId(null);
    }
  };

  // Registration is a one-time step per card with no user ceremony. It tells
  // Crossmint to provision the card's agentic rails. Bank verification happens
  // later, per allowance.
  const handleRegister = async (pmId: string) => {
    setRegisteringId(pmId);
    setRegisterError((prev) => {
      const next = { ...prev };
      delete next[pmId];
      return next;
    });
    try {
      const jwt = getJwt();
      const registration = await registerCard(jwt, pmId, email);
      await waitForRegistration(jwt, pmId, registration);
      await onRegistrationComplete?.();
    } catch (err) {
      console.error("Registration failed:", err);
      setRegisterError((prev) => ({
        ...prev,
        [pmId]: err instanceof Error ? err.message : "Registration failed. Please try again.",
      }));
    } finally {
      setRegisteringId(null);
    }
  };

  return (
    <div className="space-y-[14px]">
      {viewMode === "code" ? (
        <pre className="rounded-lg bg-black/[0.02] p-3 text-xs font-mono text-[#00150d] overflow-auto max-h-96">
          {JSON.stringify(cards.map((card) => ({ ...card, registration: registrations[card.paymentMethodId] ?? null })), null, 2)}
        </pre>
      ) : (
        <>
        {cards.map((card) => {
          const pmId = card.paymentMethodId;
          const registration = registrations[pmId] ?? null;
          const summary = registration ? registrationSummary(registration) : null;
          const isRegistering = registeringId === pmId;
          const brand = card.card?.brand ? capitalize(card.card.brand) : "Card";
          const last4 = card.card?.last4 ?? "????";
          const expMonth = card.card?.expiration?.month ?? "";
          const expYear = card.card?.expiration?.year ?? "";
          const expDisplay = expMonth && expYear ? `Exp. date ${expMonth}/${expYear.slice(-2)}` : null;

          return (
            <div key={pmId} className="flex flex-col gap-[20px]">
              <div className="flex items-center justify-between rounded-lg bg-[#F6F6F6] px-4 py-3">
                <div className="flex items-center gap-3">
                  <CreditCard className="size-5 text-[#05B959] shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-[#00150d]">
                      {brand} •••• {last4}
                    </div>
                    {expDisplay && (
                      <div className="text-xs text-[#00150d]/50">{expDisplay}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {summary && (
                    <span
                      title={summary.detail}
                      className={`inline-flex items-center gap-1 text-xs font-medium border px-2.5 py-1 rounded-[6px] ${
                        summary.tone === "fallback"
                          ? "text-[#9A6700] border-[#E6C87A] bg-[#FFF8E1]"
                          : "text-[#00150d]/40 border-[rgba(0,0,0,0.15)]"
                      }`}
                    >
                      {summary.tone === "fallback"
                        ? <ShieldAlert className="size-3 shrink-0" />
                        : summary.tone === "pending"
                          ? <Loader2 className="size-3 shrink-0 animate-spin" />
                          : <Check className="size-3 shrink-0" />}
                      {summary.label}
                    </span>
                  )}
                  {deletingId === pmId
                    ? <Loader2 className="size-3.5 animate-spin text-[#00150d]/40" />
                    : <DotsMenu onDelete={() => handleDelete(pmId)} deleteLabel="Delete card" />
                  }
                </div>
              </div>

              {summary?.tone === "fallback" && summary.detail && (
                <div className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-md border bg-[#FFF8E1] border-[#E6C87A] text-xs text-[#9A6700]">
                  <Info className="size-3.5 shrink-0" />
                  <span>{summary.detail}</span>
                </div>
              )}

              {!registration && (
                <div
                  className={`flex items-center justify-between gap-3 pl-3 pr-2 py-2 rounded-md border ${
                    registerError[pmId]
                      ? "bg-[#FDF2F2] border-[#F4C7C7]"
                      : "bg-[#F5FCF8] border-[#DDF5E8]"
                  }`}
                >
                  <div className={`flex items-center gap-2 text-xs ${registerError[pmId] ? "text-[#B42318]" : "text-[#03A14D]"}`}>
                    <Info className={`size-3.5 shrink-0 ${registerError[pmId] ? "text-[#B42318]" : "text-[#03A14D]"}`} />
                    <span>
                      {isRegistering
                        ? "Registering the card with the card networks..."
                        : registerError[pmId]
                          ? registerError[pmId]
                          : "Register this card once before agents can pay with it."}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRegister(pmId)}
                    disabled={isRegistering}
                    className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium px-3 py-1.5 rounded-[4px] bg-[#05B959] text-white hover:bg-[#049d4c] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {isRegistering && <Loader2 className="size-3.5 animate-spin" />}
                    <span>{isRegistering ? "Registering" : "Register card"}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {onAddCard && (
          <button onClick={onAddCard} className="flex items-center gap-3 pl-4 group">
            <Plus className="size-5 text-[#00150d] group-hover:text-[#05B959] transition-colors shrink-0" />
            <span className="text-sm font-medium text-[#00150d] group-hover:text-[#05B959] transition-colors">
              Add credit card
            </span>
          </button>
        )}
        </>
      )}
    </div>
  );
}
