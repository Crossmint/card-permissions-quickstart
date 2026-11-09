"use client";

// Step 01: the rails of the card picked in CrossmintPaymentMethodManagement.
// The component lists and saves cards; it does not show rails.

import { useEffect, useRef, useState } from "react";
import { CreditCard, Info, Loader2 } from "lucide-react";
import { DotsMenu } from "./dots-menu";
import { RailRow } from "./rail-badge";
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

/** Registration never lists encrypted-card; it is still a way to mint on an allowance. */
function displayRails(registration: OrderIntentRegistration) {
  return [...registration.rails, { rail: "encrypted-card" as const, status: "enabled" as const }];
}

/** The rails a registered card can use, with a one-line description. */
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
  const rails = displayRails(registration);
  const enabled = registration.rails.filter((rail) => rail.status === "enabled");
  const pending = registration.rails.some((rail) => rail.status === "pending");

  if (pending && enabled.length === 0) {
    // Nothing polls in the background. The user asks for a re-check.
    return (
      <div className="space-y-2">
        <RailRow rails={rails} />
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
      </div>
    );
  }

  const code = registration.rails.find((rail) => rail.status === "error")?.error?.code;

  return (
    <div className="space-y-2">
      <RailRow rails={rails} />
      <p className="text-xs leading-5 text-[#00150d]/60">
        {enabled.some((rail) => rail.rail === "agentic-token") &&
          "One-time card numbers from the card network after the user verifies with their bank. "}
        {enabled.some((rail) => rail.rail === "spt") && "Stripe Shared Payment Token for Stripe merchants. "}
        {enabled.length === 0 && code
          ? `Network rails failed (${code}). `
          : registration.rails
              .filter((rail) => rail.status === "error")
              .map((rail) => `${rail.rail} is unavailable (${rail.error?.code}). `)}
        If a mint on those rails fails, you can choose encrypted-card in Step 3 to reveal the saved card instead.
      </p>
      {pending && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onCheckAgain}
            disabled={checking}
            className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium px-3 py-1.5 rounded-[4px] bg-[#05B959] text-white hover:bg-[#049d4c] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {checking && <Loader2 className="size-3.5 animate-spin" />}
            Check again
          </button>
        </div>
      )}
    </div>
  );
}

export function SelectedCardRails({
  card,
  registration,
  getJwt,
  email,
  onDeleteCard,
  onRegistrationComplete,
}: {
  card: PaymentMethodResponse;
  registration: OrderIntentRegistration | null;
  getJwt: () => string;
  email: string;
  onDeleteCard: (paymentMethodId: string) => Promise<void>;
  onRegistrationComplete?: () => void | Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState("");
  // The card this panel already tried to register on its own, so a failure does not loop.
  const autoRegistered = useRef<string | null>(null);

  const pmId = card.paymentMethodId;
  const expiry = cardExpiry(card);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDeleteCard(pmId);
    } finally {
      setDeleting(false);
    }
  };

  // Registration is a one-time step per card with no user ceremony. It tells
  // Crossmint to provision the card's payment rails. Bank verification happens
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

  // A picked card that is not registered yet registers right away. "Register card" retries a failure.
  useEffect(() => {
    if (registration || autoRegistered.current === pmId) {
      return;
    }
    autoRegistered.current = pmId;
    void handleRegister();
    // handleRegister reads the current card; it runs once per picked card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pmId, registration]);

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
      {/* Selected card + delete */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-3 rounded-lg bg-[#F6F6F6] px-4 py-3">
          <CreditCard className="size-5 text-[#05B959] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[#00150d]">{cardTitle(card)}</div>
            {expiry && <div className="text-xs text-[#00150d]/50">{expiry}</div>}
          </div>
        </div>
        {deleting
          ? <Loader2 className="size-3.5 animate-spin text-[#00150d]/40" />
          : <DotsMenu onDelete={handleDelete} deleteLabel="Remove card" />}
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
