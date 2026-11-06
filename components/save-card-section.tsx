"use client";

// SDK 5 contract: CrossmintPaymentMethodManagement renders no submit button.
// This app renders its own and calls ref.current.submit(). The iframe draws
// field errors only; this app shows the message of a rejected submit.

import { useCallback, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  CrossmintPaymentMethodManagement,
  type CrossmintPaymentMethod,
  type CrossmintPaymentMethodManagementRef,
  type PaymentMethodManagementChangeEvent,
} from "@crossmint/client-sdk-react-ui";

function CardFormSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="space-y-1.5">
        <div className="h-3 w-24 rounded bg-black/[0.06]" />
        <div className="h-10 rounded-md bg-black/[0.04]" />
      </div>
      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-20 rounded bg-black/[0.06]" />
          <div className="h-10 rounded-md bg-black/[0.04]" />
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-10 rounded bg-black/[0.06]" />
          <div className="h-10 rounded-md bg-black/[0.04]" />
        </div>
      </div>
    </div>
  );
}

export function SaveCardSection({
  jwt,
  onCardSaved,
  onCancel,
}: {
  jwt: string;
  onCardSaved: (paymentMethodId: string) => void;
  onCancel: () => void;
}) {
  const cardFormRef = useRef<CrossmintPaymentMethodManagementRef>(null);
  // onReady fires when submit() can first save. onChange then reports whether a submit would save.
  const [ready, setReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleReady = useCallback(() => setReady(true), []);
  const handleChange = useCallback((event: PaymentMethodManagementChangeEvent) => {
    setComplete(event.complete);
    // The user edits the form after a rejected submit: the old message no longer applies.
    setSubmitError("");
  }, []);
  // A saved result also fires onPaymentMethodSelected, so the flow continues from here.
  const handlePaymentMethodSelected = useCallback(
    (paymentMethod: CrossmintPaymentMethod) => onCardSaved(paymentMethod.paymentMethodId),
    [onCardSaved]
  );

  const submit = async () => {
    if (!cardFormRef.current) {
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    const result = await cardFormRef.current.submit();
    setSubmitting(false);
    // superseded: the iframe reloaded or unmounted during the submit, so the result no longer applies.
    if (result.status === "invalid" || result.status === "failed" || result.status === "unavailable") {
      setSubmitError(result.message);
    }
  };

  return (
    <div className="rounded-[10px] border border-[rgba(0,0,0,0.1)] overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,0,0,0.06)] bg-black/[0.02]">
        <span className="text-sm font-medium text-[#00150d]">Add new card</span>
        <button onClick={onCancel} className="text-[#00150d]/40 hover:text-[#00150d] transition-colors">
          <X className="size-4" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div className="relative">
          <CrossmintPaymentMethodManagement
            ref={cardFormRef}
            jwt={jwt}
            onReady={handleReady}
            onChange={handleChange}
            onPaymentMethodSelected={handlePaymentMethodSelected}
          />
          {!ready && (
            <div className="absolute inset-0 bg-white">
              <CardFormSkeleton />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!ready || !complete || submitting}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-[#05B959] hover:bg-[#049d4c] px-4 py-2 rounded-md disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            {submitting ? "Saving card..." : "Save card"}
          </button>
          {submitError && (
            <p role="alert" className="text-xs text-red-600 break-words">
              {submitError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
