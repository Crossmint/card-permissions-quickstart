"use client";

// The encrypted-card rail mints from the CVC the user typed when saving the
// card. Crossmint keeps that CVC for a limited time; once it ages out the rail
// reports `pending_cvc_recollection` (and POST /credentials answers 409
// ORDER_INTENT_CVC_RECOLLECTION_REQUIRED) until the user types it again.
// CrossmintCvcRecollection renders Crossmint's hosted CVC field in an iframe:
// the digits go from that iframe to the vault and never reach this app.

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { CrossmintCvcRecollection } from "@crossmint/client-sdk-react-ui";
import type { OrderIntentResponse } from "@/lib/crossmint-types";
import { fetchOrderIntent } from "@/lib/crossmint-api";
import { verificationAppearance } from "@/lib/verification-appearance";

// react-ui exports the component but not its prop or error types (they live in
// @crossmint/client-sdk-base, which is not a direct dependency here).
type CrossmintCvcRecollectionProps = Parameters<typeof CrossmintCvcRecollection>[0];
type CvcRecollectionError = Parameters<NonNullable<CrossmintCvcRecollectionProps["onError"]>>[0];

const REASON_TEXT: Record<CvcRecollectionError["reason"], string> = {
  "widget-unavailable": "The CVC form could not load.",
  "invalid-configuration": "This card cannot recollect its CVC. Check that it is a saved card of the signed-in user.",
  "invalid-credentials": "Your session was rejected. Sign in again and retry.",
  "provider-error": "The card vault rejected the CVC.",
  unknown: "Something went wrong while saving the CVC.",
};

export function CvcRecollection({
  orderIntent,
  jwt,
  onRecollected,
}: {
  orderIntent: OrderIntentResponse;
  jwt: string;
  /** Called with the re-read allowance once the rail is active again. */
  onRecollected: (orderIntent: OrderIntentResponse) => void;
}) {
  // The iframe is remounted on retry so a non-retriable error starts clean.
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<CvcRecollectionError | null>(null);
  const [confirmError, setConfirmError] = useState("");

  const finish = async () => {
    setConfirming(true);
    setConfirmError("");
    try {
      const latest = await fetchOrderIntent(jwt, orderIntent.orderIntentId);
      onRecollected(latest);
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Could not re-read the allowance.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start gap-2 text-xs text-[#9A6700]">
        <ShieldCheck className="size-3.5 shrink-0 mt-0.5" />
        <p>
          The saved CVC for this card has expired. Enter it again below; it goes straight to Crossmint&apos;s vault and this app never sees it.
          Then the <span className="font-mono">encrypted-card</span> rail is active again.
        </p>
      </div>

      {error ? (
        <div className="space-y-2">
          <p className="text-xs text-red-600 break-words">
            {REASON_TEXT[error.reason]}
            {error.message ? ` (${error.message})` : ""}
          </p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
            className="text-xs font-medium text-white bg-[#05B959] hover:bg-[#049d4c] px-4 py-2 rounded-md transition-colors"
          >
            {error.retriable ? "Try again" : "Reload the CVC form"}
          </button>
        </div>
      ) : confirming ? (
        <div className="flex items-center gap-2 text-xs text-[#00150d]/60">
          <Loader2 className="size-3.5 animate-spin" />
          CVC saved. Re-reading the allowance...
        </div>
      ) : (
        <div className="rounded-md border border-[rgba(0,0,0,0.08)] p-2">
          <CrossmintCvcRecollection
            key={attempt}
            jwt={jwt}
            paymentMethodId={orderIntent.paymentMethodId}
            appearance={verificationAppearance}
            onComplete={() => void finish()}
            onError={(err) => {
              console.error("CVC recollection error:", err);
              setError(err);
            }}
          />
        </div>
      )}
      {confirmError && (
        <div className="space-y-2">
          <p className="text-xs text-red-600 break-words">{confirmError}</p>
          <button type="button" onClick={() => void finish()} className="text-xs text-[#05B959] hover:text-[#049d4c] underline underline-offset-2">
            Check again
          </button>
        </div>
      )}
    </div>
  );
}
