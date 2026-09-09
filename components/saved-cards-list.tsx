"use client";

// Step 01: pick a saved card and see which rail it pays through.
// One selector instead of a list. Below it, the selected card's rail badge:
// `agentic-token` with its provider (`vic`, `agentpay`) when the registration
// enabled it, `encrypted-card` when it did not. Registration happens here too.

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, CreditCard, Info, Loader2, Plus } from "lucide-react";
import { DotsMenu } from "./dots-menu";
import { RailBadge } from "./rail-badge";
import type { OrderIntentRegistration, PaymentMethodResponse } from "@/lib/crossmint-types";
import { registerCard } from "@/lib/crossmint-api";
import { RegistrationPendingError, waitForRegistration } from "@/lib/wait-for-registration";

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cardTitle(card: PaymentMethodResponse) {
  const brand = card.card?.brand ? capitalize(card.card.brand) : "Card";
  return `${brand} •••• ${card.card?.last4 ?? "????"}`;
}

function cardExpiry(card: PaymentMethodResponse) {
  const month = card.card?.expiration?.month ?? "";
  const year = card.card?.expiration?.year ?? "";
  return month && year ? `Exp. ${month}/${year.slice(-2)}` : null;
}

/** The rail a registered card pays through, with a one-line description. */
function RailDetail({
  registration,
  checking,
  checkMessage,
  onCheckAgain,
}: {
  registration: OrderIntentRegistration;
  checking: boolean;
  checkMessage: string;
  onCheckAgain: () => void;
}) {
  const enabled = registration.rails.filter((rail) => rail.status === "enabled");
  const pending = registration.rails.some((rail) => rail.status === "pending");

  if (enabled.length > 0) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {enabled.map((rail) => (
            <RailBadge key={rail.provider} rail="agentic-token" provider={rail.provider} status="enabled" />
          ))}
        </div>
        <p className="text-xs leading-5 text-[#00150d]/60">
          One-time card numbers from the card network. Each allowance starts as pending_verification.
        </p>
      </div>
    );
  }

  if (pending) {
    // Nothing polls in the background. The user asks for a re-check.
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-[#E6C87A] bg-[#FFF8E1] pl-3 pr-2 py-2">
        <div className="flex items-center gap-2 text-xs text-[#9A6700]">
          {checking && <Loader2 className="size-3.5 shrink-0 animate-spin" />}
          <span>
            {checking
              ? "GET /payment-methods/{id}/order-intent-registration…"
              : checkMessage || "Rail status is pending. The card networks have not finished enrolling this card. Step 02 stays locked until they do."}
          </span>
        </div>
        <button
          type="button"
          onClick={onCheckAgain}
          disabled={checking}
          className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium px-3 py-1.5 rounded-[4px] bg-[#05B959] text-white hover:bg-[#049d4c] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          Check again
        </button>
      </div>
    );
  }

  const code = registration.rails.find((rail) => rail.status === "error")?.error?.code;
  return (
    <div className="space-y-2">
      <div>
        <RailBadge rail="encrypted-card" status="active" code={code} />
      </div>
      <p className="text-xs leading-5 text-[#00150d]/60">
        The saved card as a JWE, decrypted in your browser. Active with no verification.
      </p>
    </div>
  );
}

/** Badge shown next to each card in the dropdown. */
function CardRailTag({ registration }: { registration: OrderIntentRegistration | null }) {
  if (!registration) return <span className="text-[11px] text-[#00150d]/40">Not registered</span>;
  const enabled = registration.rails.find((rail) => rail.status === "enabled");
  if (enabled) return <RailBadge rail="agentic-token" provider={enabled.provider} compact />;
  if (registration.rails.some((rail) => rail.status === "pending")) {
    return <span className="text-[11px] font-mono text-[#9A6700]">pending</span>;
  }
  return <RailBadge rail="encrypted-card" compact />;
}

export function SavedCardsList({
  cards,
  loading,
  getJwt,
  email,
  registrations,
  selectedCardId,
  onSelectCard,
  onDeleteCard,
  onAddCard,
  onRegistrationComplete,
}: {
  cards: PaymentMethodResponse[];
  loading: boolean;
  getJwt: () => string;
  email: string;
  registrations: Record<string, OrderIntentRegistration | null>;
  selectedCardId: string | null;
  onSelectCard: (paymentMethodId: string) => void;
  onDeleteCard: (paymentMethodId: string) => Promise<void>;
  onAddCard?: () => void;
  onRegistrationComplete?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState("");
  const selectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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

  const selected = cards.find((card) => card.paymentMethodId === selectedCardId) ?? cards[0];
  const pmId = selected.paymentMethodId;
  const registration = registrations[pmId] ?? null;
  const expiry = cardExpiry(selected);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDeleteCard(pmId);
    } finally {
      setDeleting(false);
    }
  };

  // Registration is a one-time step per card with no user ceremony. It tells
  // Crossmint to provision the card's agentic rails. Bank verification happens
  // later, per allowance.
  const handleRegister = async () => {
    setRegistering(true);
    setRegisterError("");
    try {
      const jwt = getJwt();
      const initial = await registerCard(jwt, pmId, email);
      await waitForRegistration(jwt, pmId, initial);
    } catch (err) {
      if (!(err instanceof RegistrationPendingError)) {
        console.error("Registration failed:", err);
        setRegisterError(err instanceof Error ? err.message : "Registration failed. Please try again.");
        setRegistering(false);
        return;
      }
      // Registered, rails still pending: the pending state below takes over.
    }
    await onRegistrationComplete?.();
    setRegistering(false);
  };

  // Re-poll a pending registration on demand. Does not repeat the PUT.
  const handleCheckAgain = async () => {
    if (!registration) return;
    setChecking(true);
    setCheckMessage("");
    try {
      await waitForRegistration(getJwt(), pmId, registration);
      await onRegistrationComplete?.();
    } catch (err) {
      setCheckMessage(
        err instanceof RegistrationPendingError
          ? "Still pending. Give the card networks a moment and check again."
          : err instanceof Error
            ? err.message
            : "Could not read the registration.",
      );
      if (err instanceof RegistrationPendingError) await onRegistrationComplete?.();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Card selector + delete */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0" ref={selectorRef}>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="w-full flex items-center gap-3 rounded-lg bg-[#F6F6F6] px-4 py-3 text-left hover:bg-[#efefef] transition-colors"
          >
            <CreditCard className="size-5 text-[#05B959] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#00150d]">{cardTitle(selected)}</div>
              {expiry && <div className="text-xs text-[#00150d]/50">{expiry}</div>}
            </div>
            {cards.length > 1 && <span className="text-[11px] text-[#00150d]/40">{cards.length} cards</span>}
            <ChevronsUpDown className="size-4 text-[#00150d] shrink-0" />
          </button>

          {open && (
            <div role="listbox" className="absolute left-0 right-0 top-full mt-1 bg-white rounded-[8px] border border-[rgba(0,0,0,0.1)] shadow-md py-1 z-50">
              {cards.map((card) => {
                const isSelected = card.paymentMethodId === pmId;
                const exp = cardExpiry(card);
                return (
                  <button
                    key={card.paymentMethodId}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => { onSelectCard(card.paymentMethodId); setOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F6F6F6] transition-colors text-left"
                  >
                    <CreditCard className="size-4 text-[#05B959] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#00150d]">{cardTitle(card)}</div>
                      {exp && <div className="text-xs text-[#00150d]/50">{exp}</div>}
                    </div>
                    <CardRailTag registration={registrations[card.paymentMethodId] ?? null} />
                    <span className="w-4 shrink-0">{isSelected && <Check className="size-4 text-[#05B959]" />}</span>
                  </button>
                );
              })}
              {onAddCard && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); onAddCard(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 border-t border-[rgba(0,0,0,0.06)] hover:bg-[#F6F6F6] transition-colors text-left"
                >
                  <Plus className="size-4 text-[#00150d] shrink-0" />
                  <span className="text-sm font-medium text-[#00150d]">Add credit card</span>
                </button>
              )}
            </div>
          )}
        </div>
        {deleting
          ? <Loader2 className="size-3.5 animate-spin text-[#00150d]/40" />
          : <DotsMenu onDelete={handleDelete} deleteLabel="Delete card" />}
      </div>

      {/* Selected card: its rail, or the one-time registration */}
      {registration ? (
        <div className="px-1">
          <RailDetail registration={registration} checking={checking} checkMessage={checkMessage} onCheckAgain={() => void handleCheckAgain()} />
        </div>
      ) : (
        <div
          className={`flex items-center justify-between gap-3 pl-3 pr-2 py-2 rounded-md border ${
            registerError ? "bg-[#FDF2F2] border-[#F4C7C7]" : "bg-[#F5FCF8] border-[#DDF5E8]"
          }`}
        >
          <div className={`flex items-center gap-2 text-xs ${registerError ? "text-[#B42318]" : "text-[#03A14D]"}`}>
            <Info className="size-3.5 shrink-0" />
            <span>
              {registering
                ? "PUT /payment-methods/{id}/order-intent-registration…"
                : registerError || "Register this card once. The response lists the rails it can use."}
            </span>
          </div>
          <button
            onClick={handleRegister}
            disabled={registering}
            className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium px-3 py-1.5 rounded-[4px] bg-[#05B959] text-white hover:bg-[#049d4c] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {registering && <Loader2 className="size-3.5 animate-spin" />}
            <span>{registering ? "Registering" : "Register card"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
