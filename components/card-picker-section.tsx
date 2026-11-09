"use client";

// Step 01: CrossmintPaymentMethodManagement lists the user's saved cards and
// holds the add-card form. SDK 5 contract: the component renders no submit
// button. This app renders its own and calls ref.current.submit(). The iframe
// draws field errors only; this app shows the message of a rejected submit.

import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  CrossmintPaymentMethodManagement,
  type CrossmintPaymentMethod,
  type CrossmintPaymentMethodManagementRef,
  type PaymentMethodManagementChangeEvent,
} from "@crossmint/client-sdk-react-ui";

// allowedModes travels in the iframe URL: a new array reloads the iframe, so it is a module constant.
const ALLOWED_MODES: Array<"new" | "existing"> = ["new", "existing"];

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

export function CardPickerSection({
  jwt,
  onCardSelected,
}: {
  jwt: string;
  /** Called with the picked saved card, or with the card the form just saved. */
  onCardSelected: (paymentMethodId: string) => void;
}) {
  const cardFormRef = useRef<CrossmintPaymentMethodManagementRef>(null);
  // onReady fires when submit() can first select or save. onChange then reports what a submit would do.
  const [ready, setReady] = useState(false);
  const [formState, setFormState] = useState<PaymentMethodManagementChangeEvent | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleReady = useCallback(() => setReady(true), []);
  const handleChange = useCallback((event: PaymentMethodManagementChangeEvent) => {
    setFormState(event);
    // The user changed the form or the selection after a rejected submit: the old message no longer applies.
    setSubmitError("");
  }, []);
  // selected and saved results also fire onPaymentMethodSelected, so the flow continues from here.
  const handlePaymentMethodSelected = useCallback(
    (paymentMethod: CrossmintPaymentMethod) => onCardSelected(paymentMethod.paymentMethodId),
    [onCardSelected]
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

  // In "existing" mode a submit selects the highlighted saved card; in "new" mode it saves the form.
  const selecting = formState?.mode === "existing";
  const idleLabel = selecting ? "Use this card" : "Save card";
  const busyLabel = selecting ? "Selecting card..." : "Saving card...";

  return (
    <div className="space-y-3">
      <div className="relative">
        <CrossmintPaymentMethodManagement
          ref={cardFormRef}
          jwt={jwt}
          allowedModes={ALLOWED_MODES}
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
          disabled={!ready || !formState?.complete || submitting}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-[#05B959] hover:bg-[#049d4c] px-4 py-2 rounded-md disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {submitting && <Loader2 className="size-3.5 animate-spin" />}
          {submitting ? busyLabel : idleLabel}
        </button>
        {submitError && (
          <p role="alert" className="text-xs text-red-600 break-words">
            {submitError}
          </p>
        )}
      </div>
    </div>
  );
}
