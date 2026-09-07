"use client";

import { useState } from "react";
import { CreditCard, Plus, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import type { OrderIntentResponse } from "@/lib/crossmint-types";
import { fetchOrderIntent } from "@/lib/crossmint-api";
import { activeCardRail, isUsable, needsVerification, railErrorCode, railLabel, toVerifiableOrderIntent } from "@/lib/rails";
import { OrderIntentVerification } from "@crossmint/client-sdk-react-ui";
import { verificationAppearance } from "@/lib/verification-appearance";
import { DotsMenu } from "./dots-menu";

export function allowanceLimit(orderIntent: OrderIntentResponse) {
  const { available, total, currency } = orderIntent.amount;
  const unit = currency.toUpperCase();
  return available === total ? `${total} ${unit}` : `${available} of ${total} ${unit} left`;
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
  const rail = activeCardRail(orderIntent);
  if (rail) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#00150d]/40 border border-[rgba(0,0,0,0.15)] px-2.5 py-1 rounded-[6px]">
        <ShieldCheck className="size-3 shrink-0" />
        {railLabel(rail)}
      </span>
    );
  }
  if (needsVerification(orderIntent)) {
    return <span className="text-xs font-medium text-[#9A6700]">Needs verification</span>;
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

  const finishVerification = async () => {
    setVerifying(false);
    setConfirming(true);
    try {
      // Re-read the intent: the rail flips from pending_verification to active.
      onUpdated(await fetchOrderIntent(getJwt(), orderIntent.orderIntentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm the verification");
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await onCancel(orderIntent);
    } finally {
      setCancelling(false);
    }
  };

  const verifiable = toVerifiableOrderIntent(orderIntent);
  const pending = verifiable !== null;
  const expiry = expiryLabel(orderIntent);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-lg bg-[#F6F6F6] px-4 py-3">
        <CreditCard className="size-5 text-[#2377FF] shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[#00150d] truncate">{orderIntent.description || "Card Permission"}</div>
          <div className="text-xs text-[#00150d]/50">
            {allowanceLimit(orderIntent)}
            {orderIntent.merchant ? ` · ${orderIntent.merchant.name}` : ""}
            {expiry ? ` · ${expiry}` : ""}
          </div>
        </div>
        <StatusPill orderIntent={orderIntent} />
        {cancelling
          ? <Loader2 className="size-3.5 animate-spin text-[#00150d]/40" />
          : <DotsMenu onDelete={handleCancel} deleteLabel="Cancel allowance" />}
      </div>

      {pending && (
        <div
          className={`flex items-center justify-between gap-3 pl-3 pr-2 py-2 rounded-md border ${
            error ? "bg-[#FDF2F2] border-[#F4C7C7]" : "bg-[#FFF8E1] border-[#E6C87A]"
          }`}
        >
          <div className={`flex items-center gap-2 text-xs ${error ? "text-[#B42318]" : "text-[#9A6700]"}`}>
            {(verifying || confirming) && <Loader2 className="size-3.5 animate-spin shrink-0" />}
            <span>
              {confirming
                ? "Confirming with Crossmint..."
                : verifying
                  ? "Complete the verification with your bank..."
                  : error || "Verify this allowance with your bank before the agent can pay."}
            </span>
          </div>
          <button
            type="button"
            onClick={() => { setError(""); setVerifying(true); }}
            disabled={verifying || confirming}
            className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium px-3 py-1.5 rounded-[4px] bg-[#05B959] text-white hover:bg-[#049d4c] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <ShieldCheck className="size-3.5" />
            {error ? "Try again" : "Verify"}
          </button>
        </div>
      )}

      {verifying && verifiable && (
        <OrderIntentVerification
          orderIntent={verifiable}
          displayName="Card Permissions Quickstart"
          appearance={verificationAppearance}
          onVerificationComplete={() => void finishVerification()}
          onVerificationError={(err) => {
            setVerifying(false);
            // The user closing the bank prompt is not a failure.
            const message = err instanceof Error ? err.message : "";
            if (/cancel/i.test(message)) return;
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
  viewMode = "ui",
}: {
  orderIntents: OrderIntentResponse[];
  loading: boolean;
  getJwt: () => string;
  onUpdated: (orderIntent: OrderIntentResponse) => void;
  onCancel: (orderIntent: OrderIntentResponse) => Promise<void>;
  onIssueCardPermission?: () => void;
  viewMode?: "ui" | "code";
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

  if (viewMode === "code") {
    return (
      <pre className="rounded-lg bg-black/[0.02] p-3 text-xs font-mono text-[#00150d] overflow-auto max-h-96">
        {JSON.stringify(orderIntents, null, 2)}
      </pre>
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
