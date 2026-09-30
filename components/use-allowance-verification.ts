"use client";

// Bank verification for an allowance's pending_verification rail, shared by
// Step 2 and Step 3. The rail only turns active once the user completes the
// ceremony; re-reading the allowance alone never activates it.

import { useState } from "react";
import type { OrderIntentResponse } from "@/lib/crossmint-types";
import { fetchOrderIntent } from "@/lib/crossmint-api";
import { pendingAgenticRail } from "@/lib/rails";

// Backoff between re-reads after a successful bank verification: about 6 s total.
const CONFIRM_DELAYS_MS = [1000, 1500, 2000, 1500];

// Error names @basis-theory/web-agentic throws when the user backs out of the ceremony.
const USER_CANCELLED_ERRORS = new Set(["VerificationCancelledError", "PopupClosedError"]);

export function useAllowanceVerification({
  orderIntent,
  getJwt,
  onUpdated,
}: {
  orderIntent: OrderIntentResponse;
  getJwt: () => string;
  onUpdated?: (orderIntent: OrderIntentResponse) => void;
}) {
  const [verifying, setVerifying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  // Not a failure: the user closed the bank prompt, so the rail is still pending.
  const [notice, setNotice] = useState("");

  const start = () => {
    setError("");
    setNotice("");
    setVerifying(true);
  };

  // The provider may take a moment to flip the rail from pending_verification
  // to active after the SDK reports success. Re-read with a short backoff.
  const finish = async () => {
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
      onUpdated?.(latest);
      if (pendingAgenticRail(latest)) {
        setError("Verified with the bank, but Crossmint still reports pending_verification. Check again in a moment.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm the verification");
    } finally {
      setConfirming(false);
    }
  };

  const fail = (err: unknown) => {
    // Forwarded to the dev server log by Next, so the real cause is visible there.
    console.error("Verification error:", err);
    setVerifying(false);
    // @basis-theory/web-agentic names these errors; match on the name, not the text.
    if (err instanceof Error && USER_CANCELLED_ERRORS.has(err.name)) {
      setNotice("Verification closed before it finished. The rail is still pending_verification.");
      return;
    }
    const message = err instanceof Error ? err.message : "";
    setError(message || "Verification failed. Please try again.");
  };

  // Re-read the intent on demand, without opening the bank flow again.
  const checkAgain = async () => {
    setConfirming(true);
    setError("");
    try {
      const latest = await fetchOrderIntent(getJwt(), orderIntent.orderIntentId);
      onUpdated?.(latest);
      if (pendingAgenticRail(latest)) setError("Still pending_verification. Try again in a moment, or verify again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the allowance");
    } finally {
      setConfirming(false);
    }
  };

  return { verifying, confirming, error, notice, setError, start, finish, fail, checkAgain };
}
