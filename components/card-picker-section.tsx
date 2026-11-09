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
// fields travels in the iframe URL too. address: true collects a required billing address
// (line2 optional); { line2: "required" | "hidden" } changes the second address line.
const BILLING_ADDRESS_FIELDS = { billingDetails: { address: true } };

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
  const [collectBillingAddress, setCollectBillingAddress] = useState(false);

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

  // A change of fields reloads the iframe: wait for onReady again.
  const toggleBillingAddress = (checked: boolean) => {
    setCollectBillingAddress(checked);
    setReady(false);
    setFormState(null);
    setSubmitError("");
  };

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
    <div className="max-w-md space-y-3">
      <label className="flex items-center gap-2 text-xs text-[#00150d]/70">
        <input
          type="checkbox"
          checked={collectBillingAddress}
          onChange={(event) => toggleBillingAddress(event.target.checked)}
          className="accent-[#05B959]"
        />
        Collect billing address
      </label>
      <div className="relative">
        <CrossmintPaymentMethodManagement
          ref={cardFormRef}
          jwt={jwt}
          allowedModes={ALLOWED_MODES}
          fields={collectBillingAddress ? BILLING_ADDRESS_FIELDS : undefined}
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
          className="flex w-full items-center justify-center gap-2 h-11 rounded-lg bg-[#05B959] text-sm font-semibold text-white shadow-sm hover:bg-[#049d4c] active:bg-[#038a43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#05B959]/40 focus-visible:ring-offset-2 disabled:bg-[#05B959]/45 disabled:shadow-none disabled:cursor-not-allowed transition-colors"
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
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
