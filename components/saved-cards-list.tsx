"use client";

import { useState } from "react";
import { CreditCard, Loader2, Info, Plus, Check } from "lucide-react";
import { DotsMenu } from "./dots-menu";
import type { PaymentMethodResponse, AgenticEnrollmentResponse } from "@/lib/crossmint-types";
import { ensureEnrollment } from "@/lib/crossmint-api";
import { waitForActiveEnrollment } from "@/lib/wait-for-active-enrollment";
import { EnrollmentVerificationStep } from "./enrollment-verification-step";

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function SavedCardsList({
  cards,
  loading,
  canIssue,
  getJwt,
  email,
  enrollmentStatuses,
  onIssueCardPermission,
  onDeleteCard,
  onAddCard,
  onEnrollmentComplete,
  viewMode = "ui",
}: {
  cards: PaymentMethodResponse[];
  loading: boolean;
  canIssue: boolean;
  getJwt: () => string;
  email: string;
  enrollmentStatuses: Record<string, string>;
  onIssueCardPermission: (paymentMethodId: string) => void;
  onDeleteCard: (paymentMethodId: string) => Promise<void>;
  onAddCard?: () => void;
  onEnrollmentComplete?: () => void | Promise<void>;
  viewMode?: "ui" | "code";
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pendingEnrollment, setPendingEnrollment] = useState<AgenticEnrollmentResponse | null>(null);
  const [verifyError, setVerifyError] = useState<Record<string, string>>({});

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

  const handleDelete = async (paymentMethodId: string) => {
    setDeletingId(paymentMethodId);
    try {
      await onDeleteCard(paymentMethodId);
    } finally {
      setDeletingId(null);
    }
  };

  const finishEnrollment = async (pmId: string) => {
    setConfirmingId(pmId);
    setVerifyError((prev) => {
      const next = { ...prev };
      delete next[pmId];
      return next;
    });
    try {
      await waitForActiveEnrollment(getJwt(), pmId);
      setVerifyingId(null);
      setPendingEnrollment(null);
      await onEnrollmentComplete?.();
    } catch (err) {
      console.error("Verification did not become active:", err);
      setVerifyError((prev) => ({
        ...prev,
        [pmId]: err instanceof Error ? err.message : "Verification did not finish. Please try again.",
      }));
      setVerifyingId(null);
      setPendingEnrollment(null);
    } finally {
      setConfirmingId(null);
    }
  };

  const handleEnroll = async (pmId: string) => {
    setEnrollingId(pmId);
    setVerifyError((prev) => {
      const next = { ...prev };
      delete next[pmId];
      return next;
    });
    try {
      const res = await ensureEnrollment(getJwt(), pmId, email);
      if (res.status === "active") {
        await onEnrollmentComplete?.();
      } else if (res.status === "pending") {
        setPendingEnrollment(res);
        setVerifyingId(pmId);
      }
    } catch (err) {
      console.error("Verification failed:", err);
    } finally {
      setEnrollingId(null);
    }
  };

  return (
    <div className="space-y-[14px]">
      {viewMode === "code" ? (
        <pre className="rounded-lg bg-black/[0.02] p-3 text-xs font-mono text-[#00150d] overflow-auto max-h-96">
          {JSON.stringify(cards, null, 2)}
        </pre>
      ) : (
        <>
        {cards.map((card) => {
          const pmId = card.paymentMethodId;
          const isEnrolled = enrollmentStatuses[pmId] === "active";
          const isEnrolling = enrollingId === pmId;
          const isVerifying = verifyingId === pmId;
          const isConfirming = confirmingId === pmId;
          const brand = card.card?.brand ? capitalize(card.card.brand) : "Card";
          const last4 = card.card?.last4 ?? "????";
          const expMonth = card.card?.expiration?.month ?? "";
          const expYear = card.card?.expiration?.year ?? "";
          const expDisplay = expMonth && expYear ? `Exp. date ${expMonth}/${expYear.slice(-2)}` : null;

          return (
            <div key={pmId} className="flex flex-col gap-[20px]">
              <div className="flex items-center justify-between rounded-lg bg-[#F6F6F6] px-4 py-3">
                <div className="flex items-center gap-3">
                  <CreditCard className="size-5 text-[#05B959] shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-[#00150d]">
                      {brand} •••• {last4}
                    </div>
                    {expDisplay && (
                      <div className="text-xs text-[#00150d]/50">{expDisplay}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isEnrolled && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#00150d]/40 border border-[rgba(0,0,0,0.15)] px-2.5 py-1 rounded-[6px]">
                      <Check className="size-3 shrink-0" />
                      Verified
                    </span>
                  )}
                  {deletingId === pmId
                    ? <Loader2 className="size-3.5 animate-spin text-[#00150d]/40" />
                    : <DotsMenu onDelete={() => handleDelete(pmId)} deleteLabel="Delete card" />
                  }
                </div>
              </div>

              {!isEnrolled && (
                <div
                  className={`flex items-center justify-between gap-3 pl-3 pr-2 py-2 rounded-md border ${
                    verifyError[pmId]
                      ? "bg-[#FDF2F2] border-[#F4C7C7]"
                      : "bg-[#F5FCF8] border-[#DDF5E8]"
                  }`}
                >
                  <div className={`flex items-center gap-2 text-xs ${verifyError[pmId] ? "text-[#B42318]" : "text-[#03A14D]"}`}>
                    <Info className={`size-3.5 shrink-0 ${verifyError[pmId] ? "text-[#B42318]" : "text-[#03A14D]"}`} />
                    <span>
                      {isConfirming
                        ? "Confirming verification with Crossmint..."
                        : verifyError[pmId]
                          ? verifyError[pmId]
                          : "This card needs to be verified for agentic use before allowing payments."}
                    </span>
                  </div>
                  <button
                    onClick={() => handleEnroll(pmId)}
                    disabled={isEnrolling || isVerifying || isConfirming}
                    className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium px-3 py-1.5 rounded-[4px] bg-[#05B959] text-white hover:bg-[#049d4c] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {(isEnrolling || isConfirming) && <Loader2 className="size-3.5 animate-spin" />}
                    <span>{isConfirming ? "Confirming" : "Verify card"}</span>
                  </button>
                </div>
              )}

              {isVerifying && pendingEnrollment?.status === "pending" && (
                <EnrollmentVerificationStep
                  enrollment={pendingEnrollment}
                  message={
                    isConfirming
                      ? "Mastercard UI closed. Waiting for Crossmint to mark the card verified..."
                      : "Complete passkey verification to enable agentic payments..."
                  }
                  onComplete={() => finishEnrollment(pmId)}
                  onError={() => { setVerifyingId(null); setPendingEnrollment(null); }}
                  onCancel={() => { setVerifyingId(null); setPendingEnrollment(null); }}
                />
              )}
            </div>
          );
        })}
        {onAddCard && (
          <button onClick={onAddCard} className="flex items-center gap-3 pl-4 group">
            <Plus className="size-5 text-[#00150d] group-hover:text-[#05B959] transition-colors shrink-0" />
            <span className="text-sm font-medium text-[#00150d] group-hover:text-[#05B959] transition-colors">
              Add credit card
            </span>
          </button>
        )}
        </>
      )}
    </div>
  );
}
