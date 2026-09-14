"use client";

import { useState } from "react";
import { CreditCard, Plus, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import type { OrderIntentResponse } from "@/lib/crossmint-types";
import { fetchOrderIntent } from "@/lib/crossmint-api";
import { availableAmount, isUsable, needsVerification, pendingAgenticRail, railErrorCode, toVerifiableOrderIntent } from "@/lib/rails";
import { OrderIntentVerification } from "@crossmint/client-sdk-react-ui";
import { verificationAppearance } from "@/lib/verification-appearance";
import { DotsMenu } from "./dots-menu";
import { RailBadge } from "./rail-badge";

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

function StatusPill({ orderIntent }: { orderIntent: OrderIntentResponse }) {
  if (orderIntent.status !== "active") {
    return <span className="text-xs text-[#00150d]/40 capitalize">{orderIntent.status}</span>;
  }
  if (isExhausted(orderIntent)) return <ExhaustedPill orderIntent={orderIntent} />;
  const rails = orderIntent.rails.filter((rail) => rail.status !== "error" || rail.error);
  if (rails.some((rail) => rail.status !== "error")) {
    return (
      <div className="flex flex-wrap justify-end gap-1.5">
        {rails.map((rail) => (
          <RailBadge
            key={`${rail.rail}-${rail.provider ?? "default"}`}
            rail={rail.rail}
            provider={rail.rail === "agentic-token" ? rail.provider : rail.rail === "spt" ? "stripe" : undefined}
            status={rail.status}
            code={rail.status === "error" ? rail.error?.code : undefined}
          />
        ))}
      </div>
    );
  }
  const code = railErrorCode(orderIntent);
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[#B42318]" title={code}>
      <AlertTriangle className="size-3 shrink-0" />
      Unavailable{code ? ` (${code})` : ""}
    </span>
  );
}

function OrderIntentItem({
  orderIntent,
  getJwt,
  onUpdated,
  onCancel,
}: {
  orderIntent: OrderIntentResponse;
  getJwt: () => string;
  onUpdated: (orderIntent: OrderIntentResponse) => void;
  onCancel: (orderIntent: OrderIntentResponse) => Promise<void>;
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
      <div className={`rounded-lg px-4 py-3 ${tone}`}>
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
          <StatusPill orderIntent={orderIntent} />
          {pending && /pending_verification/.test(error) && (
            <button
              type="button"
              onClick={() => void checkAgain()}
              disabled={verifying || confirming}
              className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium px-3 py-1.5 rounded-[4px] border border-[rgba(0,0,0,0.15)] text-[#00150d] hover:bg-black/[0.03] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              Check again
            </button>
          )}
          {pending && (
            <button
              type="button"
              onClick={() => { setError(""); setVerifying(true); }}
              disabled={verifying || confirming}
              className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium px-3 py-1.5 rounded-[4px] bg-[#05B959] text-white hover:bg-[#049d4c] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {verifying || confirming ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
              {error ? "Try again" : "Verify"}
            </button>
          )}
          {cancelling
            ? <Loader2 className="size-3.5 animate-spin text-[#00150d]/40" />
            : <DotsMenu onDelete={handleCancel} deleteLabel="Cancel allowance" />}
        </div>

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
}: {
  orderIntents: OrderIntentResponse[];
  loading: boolean;
  getJwt: () => string;
  onUpdated: (orderIntent: OrderIntentResponse) => void;
  onCancel: (orderIntent: OrderIntentResponse) => Promise<void>;
  onIssueCardPermission?: () => void;
}) {
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

  return (
    <div className="space-y-4">
      <div className="space-y-[14px]">
        {sorted.map((orderIntent) => (
          <OrderIntentItem
            key={orderIntent.orderIntentId}
            orderIntent={orderIntent}
            getJwt={getJwt}
            onUpdated={onUpdated}
            onCancel={onCancel}
          />
        ))}
      </div>
      {onIssueCardPermission && (
        <button onClick={onIssueCardPermission} className="flex items-center gap-3 pl-4 group">
          <Plus className="size-5 text-[#00150d] group-hover:text-[#05B959] transition-colors shrink-0" />
          <span className="text-sm font-medium text-[#00150d] group-hover:text-[#05B959] transition-colors">
            Create allowance
          </span>
        </button>
      )}
    </div>
  );
}
