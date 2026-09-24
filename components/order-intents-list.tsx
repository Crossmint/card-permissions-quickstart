"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, CreditCard, Plus, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import type { OrderIntentResponse } from "@/lib/crossmint-types";
import { fetchOrderIntent } from "@/lib/crossmint-api";
import { availableAmount, isUsable, needsVerification, pendingAgenticRail, pendingCvcRecollectionRail, railErrorCode, toVerifiableOrderIntent } from "@/lib/rails";
import { OrderIntentVerification } from "@crossmint/client-sdk-react-ui";
import { verificationAppearance } from "@/lib/verification-appearance";
import { DotsMenu } from "./dots-menu";
import { RailRow } from "./rail-badge";

// Backoff between re-reads after a successful bank verification: about 6 s total.
const CONFIRM_DELAYS_MS = [1000, 1500, 2000, 1500];

// Error names @basis-theory/web-agentic throws when the user backs out of the ceremony.
const USER_CANCELLED_ERRORS = new Set(["VerificationCancelledError", "PopupClosedError"]);

/** Remaining balance, always as "X of Y USD left", so the wallet is seen going down. */
export function allowanceLimit(orderIntent: OrderIntentResponse) {
  const { available, total, currency } = orderIntent.amount;
  return `${available} of ${total} ${currency.toUpperCase()} left`;
}

/** True when nothing is left to mint. */
export function isExhausted(orderIntent: OrderIntentResponse) {
  return availableAmount(orderIntent) <= 0;
}

/** Grey pill for an allowance with no balance left: "spent" once charged, "reserved" while held by a card. */
export function ExhaustedPill({ orderIntent }: { orderIntent: OrderIntentResponse }) {
  const spent = Number(orderIntent.amount.spent) > 0;
  return (
    <span className="inline-flex items-center rounded-[6px] border border-[rgba(0,0,0,0.12)] bg-black/[0.04] px-2 py-0.5 font-mono text-[11px] font-medium leading-4 text-[#00150d]/60">
      {spent ? "spent" : "reserved"}
    </span>
  );
}

function expiryLabel(orderIntent: OrderIntentResponse) {
  const date = new Date(orderIntent.expiresAt);
  if (!Number.isFinite(date.getTime())) return null;
  return `Expires ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function StatusAside({ orderIntent }: { orderIntent: OrderIntentResponse }) {
  if (orderIntent.status !== "active") {
    return <span className="shrink-0 text-xs text-[#00150d]/40 capitalize">{orderIntent.status}</span>;
  }
  if (isExhausted(orderIntent)) return <ExhaustedPill orderIntent={orderIntent} />;
  if (orderIntent.rails.some((rail) => rail.status !== "error")) return null;
  const code = railErrorCode(orderIntent);
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[#B42318]" title={code}>
      <AlertTriangle className="size-3 shrink-0" />
      Unavailable{code ? ` (${code})` : ""}
    </span>
  );
}

function showRails(orderIntent: OrderIntentResponse) {
  return orderIntent.status === "active" && orderIntent.rails.some((rail) => rail.status !== "error");
}

function OrderIntentItem({
  orderIntent,
  getJwt,
  onUpdated,
  onCancel,
  selected,
  onSelect,
}: {
  orderIntent: OrderIntentResponse;
  getJwt: () => string;
  onUpdated: (orderIntent: OrderIntentResponse) => void;
  onCancel: (orderIntent: OrderIntentResponse) => Promise<void>;
  selected: boolean;
  onSelect?: () => void;
}) {
  const [verifying, setVerifying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");

  // The provider may take a moment to flip the rail from pending_verification
  // to active after the SDK reports success. Re-read with a short backoff.
  const finishVerification = async () => {
    setVerifying(false);
    setConfirming(true);
    setError("");
    try {
      let latest = orderIntent;
      for (const delay of CONFIRM_DELAYS_MS) {
        latest = await fetchOrderIntent(getJwt(), orderIntent.orderIntentId);
        if (!pendingAgenticRail(latest)) break;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      onUpdated(latest);
      if (pendingAgenticRail(latest)) {
        setError("Verified with the bank, but Crossmint still reports pending_verification. Check again in a moment.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm the verification");
    } finally {
      setConfirming(false);
    }
  };

  // Re-read the intent on demand, without opening the bank flow again.
  const checkAgain = async () => {
    setConfirming(true);
    setError("");
    try {
      const latest = await fetchOrderIntent(getJwt(), orderIntent.orderIntentId);
      onUpdated(latest);
      if (pendingAgenticRail(latest)) setError("Still pending_verification. Try again in a moment, or verify again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the allowance");
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setError("");
    try {
      await onCancel(orderIntent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel the allowance");
    } finally {
      setCancelling(false);
    }
  };

  const verifiable = toVerifiableOrderIntent(orderIntent);
  const pending = needsVerification(orderIntent) && verifiable !== null;
  const expiry = expiryLabel(orderIntent);

  // One card per allowance. While it needs verification, the action lives inside
  // the card. A failed verification turns the whole card red, message included.
  const tone = error
    ? "bg-[#FDF2F2] border border-[#F4C7C7]"
    : pending
      ? "bg-[#FFF8E1] border border-[#E6C87A]"
      : "bg-[#F6F6F6] border border-transparent";

  return (
    <div className="flex flex-col gap-3">
      <div className={`rounded-lg px-4 py-3 ${selected ? "border border-[#05B959] bg-[#F2FBF6]" : tone}`}>
        <div className="flex items-center gap-3">
          <CreditCard className={`size-5 shrink-0 ${error ? "text-[#B42318]" : "text-[#2377FF]"}`} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[#00150d] truncate">{orderIntent.description || "Card Permission"}</div>
            <div className="text-xs text-[#00150d]/50">
              {allowanceLimit(orderIntent)}
              {orderIntent.merchant ? ` · ${orderIntent.merchant.name}` : ""}
              {expiry ? ` · ${expiry}` : ""}
            </div>
          </div>
          {pending && /pending_verification/.test(error) && (
            <button
              type="button"
              onClick={() => void checkAgain()}
              disabled={verifying || confirming}
              className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap text-xs font-medium px-3 py-1.5 rounded-[4px] border border-[rgba(0,0,0,0.15)] text-[#00150d] hover:bg-black/[0.03] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              Check again
            </button>
          )}
          {pending && (
            <button
              type="button"
              onClick={() => { setError(""); setVerifying(true); }}
              disabled={verifying || confirming}
              className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap text-xs font-medium px-3 py-1.5 rounded-[4px] bg-[#05B959] text-white hover:bg-[#049d4c] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {verifying || confirming ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
              {error ? "Try again" : "Verify"}
            </button>
          )}
          <StatusAside orderIntent={orderIntent} />
          {onSelect && (
            <button
              type="button"
              onClick={onSelect}
              aria-pressed={selected}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                selected
                  ? "bg-[#05B959] text-white"
                  : "border border-[rgba(0,0,0,0.14)] bg-white text-[#00150d] hover:border-[#05B959] hover:text-[#049d4c]"
              }`}
            >
              {selected && <Check className="size-3.5" />}
              {selected ? "Selected" : "Use allowance"}
            </button>
          )}
          {cancelling
            ? <Loader2 className="size-3.5 animate-spin text-[#00150d]/40" />
            : <DotsMenu onDelete={handleCancel} deleteLabel="Cancel allowance" />}
        </div>
        {showRails(orderIntent) && (
          <div className="mt-2 pl-8">
            <RailRow rails={orderIntent.rails} muted={isExhausted(orderIntent)} />
          </div>
        )}

        {!pending && !isUsable(orderIntent) && pendingCvcRecollectionRail(orderIntent) && (
          <p className="mt-2 text-xs leading-4 text-[#9A6700]">
            The saved CVC for this card has expired. Re-enter it in Step 3 to use encrypted-card again.
          </p>
        )}

        {pending && (
          <p className={`mt-2 text-xs leading-4 ${error ? "text-[#B42318]" : "text-[#9A6700]"}`}>
            {confirming
              ? "Confirming with Crossmint..."
              : verifying
                ? "Complete the verification with your bank..."
                : error || "Not usable yet. Verify this allowance with your bank before the agent can pay."}
          </p>
        )}
      </div>

      {verifying && verifiable && (
        <OrderIntentVerification
          orderIntent={verifiable}
          displayName="Card Permissions Quickstart"
          appearance={verificationAppearance}
          onVerificationComplete={() => void finishVerification()}
          onVerificationError={(err) => {
            // Forwarded to the dev server log by Next, so the real cause is visible there.
            console.error("Verification error:", err);
            setVerifying(false);
            // The user closing or cancelling the bank prompt is not a failure.
            // @basis-theory/web-agentic names these errors; match on the name, not the text.
            if (err instanceof Error && USER_CANCELLED_ERRORS.has(err.name)) return;
            const message = err instanceof Error ? err.message : "";
            setError(message || "Verification failed. Please try again.");
          }}
        />
      )}
    </div>
  );
}

export function OrderIntentsList({
  orderIntents,
  loading,
  getJwt,
  onUpdated,
  onCancel,
  onIssueCardPermission,
  selectedOrderIntentId,
  onSelectOrderIntent,
}: {
  orderIntents: OrderIntentResponse[];
  loading: boolean;
  getJwt: () => string;
  onUpdated: (orderIntent: OrderIntentResponse) => void;
  onCancel: (orderIntent: OrderIntentResponse) => Promise<void>;
  onIssueCardPermission?: () => void;
  selectedOrderIntentId: string | null;
  onSelectOrderIntent: (orderIntentId: string) => void;
}) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeSelector = (event: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) setSelectorOpen(false);
    };
    document.addEventListener("mousedown", closeSelector);
    return () => document.removeEventListener("mousedown", closeSelector);
  }, []);

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
    if (!onIssueCardPermission) return null;
    return (
      <button onClick={onIssueCardPermission} className="flex items-center gap-4 h-[35px] group">
        <div className="bg-white border-[1.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] w-[56px] h-[35px] flex items-center justify-center group-hover:border-[#05B959]/40 transition-colors shrink-0">
          <Plus className="size-5 text-[#00150d] group-hover:text-[#05B959] transition-colors" />
        </div>
        <span className="font-medium text-base text-[#00150d] group-hover:text-[#05B959] transition-colors">
          Create allowance
        </span>
      </button>
    );
  }

  const sorted = [...orderIntents].sort((a, b) => Number(isUsable(b)) - Number(isUsable(a)));
  const selectable = sorted.filter((intent) => isUsable(intent) || pendingCvcRecollectionRail(intent));
  const selected = selectable.find((intent) => intent.orderIntentId === selectedOrderIntentId) ?? selectable[0];
  const selectorIntents = sorted.filter((intent) => selectable.includes(intent) || intent.status === "expired");
  const needsAction = sorted.filter((intent) => intent.status !== "expired" && !selectable.includes(intent));

  return (
    <div className="space-y-4">
      {selectorIntents.length > 0 && (
        <div ref={selectorRef} className="relative">
          <label id="allowance-selector-label" className="mb-1.5 block text-xs font-medium text-[#00150d]/60">
            Allowance to use
          </label>
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              aria-labelledby="allowance-selector-label"
              aria-haspopup="listbox"
              aria-expanded={selectorOpen}
              onClick={() => setSelectorOpen((open) => !open)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg bg-[#F6F6F6] px-4 py-3 text-left outline-none transition-colors hover:bg-[#EFEFEF] focus-visible:ring-2 focus-visible:ring-[#05B959]/35"
            >
              <CreditCard className="size-5 shrink-0 text-[#2377FF]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[#00150d]">{selected?.description || "Select an active allowance"}</div>
                {selected && (
                  <div className="truncate text-xs text-[#00150d]/55">
                    {allowanceLimit(selected)}{selected.merchant ? ` · ${selected.merchant.name}` : ""}
                  </div>
                )}
              </div>
              <ChevronDown className={`size-4 shrink-0 text-[#00150d]/60 transition-transform ${selectorOpen ? "rotate-180" : ""}`} />
            </button>
            {selected && <DotsMenu onDelete={() => onCancel(selected)} deleteLabel="Cancel allowance" />}
          </div>

          {selectorOpen && (
            <div
              role="listbox"
              aria-labelledby="allowance-selector-label"
              className="absolute left-0 right-10 top-full z-50 mt-1 overflow-hidden rounded-lg border border-[rgba(0,0,0,0.1)] bg-white shadow-[0_8px_24px_rgba(0,21,13,0.12)]"
            >
              <div className="max-h-72 overflow-y-auto py-1">
                {selectorIntents.map((orderIntent) => {
                  const isSelected = orderIntent.orderIntentId === selected?.orderIntentId;
                  const expired = orderIntent.status === "expired";
                  return (
                    <div
                      key={orderIntent.orderIntentId}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={expired}
                      className={`flex items-center gap-1 pr-2 ${expired ? "bg-black/[0.02]" : "hover:bg-[#F6F6F6]"}`}
                    >
                      <button
                        type="button"
                        disabled={expired}
                        onClick={() => {
                          onSelectOrderIntent(orderIntent.orderIntentId);
                          setSelectorOpen(false);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left focus-visible:outline-none disabled:cursor-default"
                      >
                        <CreditCard className={`size-5 shrink-0 ${expired ? "text-[#00150d]/35" : "text-[#2377FF]"}`} />
                        <div className="min-w-0 flex-1">
                          <div className={`flex items-center gap-2 truncate text-sm font-medium ${expired ? "text-[#00150d]/55" : "text-[#00150d]"}`}>
                            <span className="truncate">{orderIntent.description || "Agent card allowance"}</span>
                            {expired && <span className="shrink-0 rounded-md bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#00150d]/50">Expired</span>}
                          </div>
                          <div className="truncate text-xs text-[#00150d]/55">
                            {allowanceLimit(orderIntent)}{orderIntent.merchant ? ` · ${orderIntent.merchant.name}` : ""}
                          </div>
                          <div className="mt-2"><RailRow rails={orderIntent.rails} muted={expired || isExhausted(orderIntent)} /></div>
                        </div>
                        {isSelected && <Check className="size-4 shrink-0 text-[#05B959]" />}
                      </button>
                      {expired && <DotsMenu onDelete={() => onCancel(orderIntent)} deleteLabel="Delete expired allowance" />}
                    </div>
                  );
                })}
              </div>
              {onIssueCardPermission && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectorOpen(false);
                    onIssueCardPermission();
                  }}
                  className="flex w-full items-center gap-3 border-t border-[rgba(0,0,0,0.08)] px-4 py-3 text-left text-sm font-medium text-[#00150d] hover:bg-[#F6F6F6] focus-visible:bg-[#F6F6F6] focus-visible:outline-none"
                >
                  <Plus className="size-5 shrink-0" />
                  Create a new allowance
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {needsAction.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[#00150d]/60">Needs attention</p>
          {needsAction.map((orderIntent) => (
            <OrderIntentItem
              key={orderIntent.orderIntentId}
              orderIntent={orderIntent}
              getJwt={getJwt}
              onUpdated={onUpdated}
              onCancel={onCancel}
              selected={false}
            />
          ))}
        </div>
      )}

      {selectable.length === 0 && onIssueCardPermission && (
        <button onClick={onIssueCardPermission} className="flex w-full items-center gap-3 rounded-lg border border-dashed border-[rgba(0,0,0,0.18)] px-4 py-3 text-left hover:border-[#05B959]/60 hover:bg-[#F2FBF6]">
          <Plus className="size-5 shrink-0 text-[#00150d]/60" />
          <span className="text-sm font-medium text-[#00150d]">Create a new allowance</span>
        </button>
      )}
    </div>
  );
}
