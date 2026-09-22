"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Copy, Check, Circle } from "lucide-react";
import { useStytch, useStytchUser } from "@stytch/nextjs";
import { useCrossmint } from "@crossmint/client-sdk-react-ui";
import type { OrderIntentRegistration, OrderIntentResponse, PaymentMethodResponse } from "@/lib/crossmint-types";
import { deleteOrderIntent, fetchAllData, fetchOrderIntent, removePaymentMethod } from "@/lib/crossmint-api";
import { activeCardRail, activeSptRail, isRegistrationSettled, isUsable, pendingCvcRecollectionRail } from "@/lib/rails";
import { IS_PRODUCTION } from "@/lib/crossmint-env";
import { SavedCardsList } from "@/components/saved-cards-list";
import { SaveCardSection } from "@/components/save-card-section";
import { IssueCardPermission } from "@/components/issue-card-permission";
import { OrderIntentsList } from "@/components/order-intents-list";
import { RevealCardDetails } from "@/components/reveal-card-details";
import { ApiTimeline } from "@/components/api-timeline";

const TEST_CARD = "4242 4242 4242 4242";

type StepNumber = 1 | 2 | 3;

const STEP_TITLES: Record<StepNumber, string> = { 1: "Save credit card", 2: "Create allowance", 3: "Reveal card details" };

function TestCardHint() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(TEST_CARD.replace(/\s/g, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={copy}
      className="flex flex-col gap-[6px] items-start justify-center px-[10px] py-[8px] rounded-[7px] border border-[rgba(109,109,109,0.4)] hover:bg-black/[0.02] transition-colors shrink-0 text-left"
    >
      <span className="text-[12px] leading-[16px] text-[#6d6d6d]/80">Test card</span>
      <span className="flex items-center gap-[16px]">
        <span className="text-[12px] leading-[16px] text-[#606060]/80">{TEST_CARD}</span>
        {copied
          ? <Check className="size-3 text-[#05B959] shrink-0" />
          : <Copy className="size-3 text-[#606060]/60 shrink-0" />
        }
      </span>
    </button>
  );
}

function SidebarItem({
  active,
  completed,
  locked,
  label,
  onClick,
}: {
  active: boolean;
  completed: boolean;
  locked: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      title={locked ? "Complete the previous step first" : undefined}
      className={`w-full flex items-center gap-2.5 px-4 py-1.5 border-l-2 text-left transition-all ${
        active
          ? "border-[#05B959] text-[#05B959]"
          : locked
            ? "border-transparent text-[#00150d] opacity-30 cursor-not-allowed"
            : "border-transparent text-[#00150d] opacity-50 hover:opacity-100"
      }`}
    >
      {completed ? (
        <div className="size-4 rounded-full bg-[#05B959] flex items-center justify-center shrink-0">
          <Check className="size-2.5 text-white stroke-[3]" />
        </div>
      ) : (
        <Circle className="size-4 shrink-0" strokeWidth={1.5} />
      )}
      <span className="font-[family-name:var(--font-heading)] font-medium text-[15px] leading-6 whitespace-nowrap">
        {label}
      </span>
    </button>
  );
}

/** Back / next links at the bottom of a step. Next stays disabled until the step is complete. */
function StepNav({ current, unlocked, onGo }: { current: StepNumber; unlocked: Record<StepNumber, boolean>; onGo: (step: StepNumber) => void }) {
  const prev = current > 1 ? ((current - 1) as StepNumber) : null;
  const next = current < 3 ? ((current + 1) as StepNumber) : null;
  return (
    <div className="mt-6 flex items-center justify-between border-t border-[rgba(0,0,0,0.06)] pt-4 text-sm">
      {prev ? (
        <button type="button" onClick={() => onGo(prev)} className="text-[#00150d]/60 hover:text-[#00150d] transition-colors">
          ← {STEP_TITLES[prev]}
        </button>
      ) : <span />}
      {next && (
        <button
          type="button"
          onClick={() => onGo(next)}
          disabled={!unlocked[next]}
          title={unlocked[next] ? undefined : "Complete this step first"}
          className="font-medium text-[#05B959] hover:text-[#049d4c] disabled:text-[#00150d]/30 disabled:cursor-not-allowed transition-colors"
        >
          {STEP_TITLES[next]} →
        </button>
      )}
    </div>
  );
}

function StepHeader({ step, title, subtitle }: { step: string; title: string; subtitle: string }) {
  return (
    <div className="mb-7">
      <div className="flex items-baseline gap-1.5 font-[family-name:var(--font-heading)] font-medium text-[20px] leading-[43px] tracking-[-0.6px] text-[#00150d] whitespace-nowrap">
        <span className="opacity-40">Step {step}</span>
        <span>{title}</span>
      </div>
      <p className="text-sm text-black/80 leading-5">{subtitle}</p>
    </div>
  );
}

export default function Page() {
  const stytch = useStytch();
  const { user, isInitialized } = useStytchUser();
  const { setJwt } = useCrossmint();
  const router = useRouter();

  const userEmail = user?.emails?.[0]?.email ?? "";
  const userInitial = userEmail[0]?.toUpperCase() ?? "U";
  const getJwt = () => stytch.session.getTokens()?.session_jwt ?? "";

  useEffect(() => {
    if (isInitialized && !user) {
      router.replace("/login");
    }
  }, [isInitialized, user, router]);

  useEffect(() => {
    const tokens = stytch.session.getTokens();
    if (tokens?.session_jwt) setJwt(tokens.session_jwt);
  }, [stytch, user, setJwt]);

  const [savedCards, setSavedCards] = useState<PaymentMethodResponse[]>([]);
  const [orderIntents, setOrderIntents] = useState<OrderIntentResponse[]>([]);
  const [registrations, setRegistrations] = useState<Record<string, OrderIntentRegistration | null>>({});
  const [showSaveCard, setShowSaveCard] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<StepNumber>(1);
  const [landed, setLanded] = useState(false);
  const [issuingForCard, setIssuingForCard] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Cards loaded but the allowance list did not. Shown as a warning, not as "no allowances".
  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const jwt = stytch.session.getTokens()?.session_jwt ?? "";
    if (!jwt) return;
    try {
      const data = await fetchAllData(jwt);
      setSavedCards(data.cards);
      setOrderIntents(data.orderIntents);
      setRegistrations(data.registrations);
      setLoadError(null);
      setLoadWarning(data.orderIntentsError ?? null);
    } catch (err) {
      console.error("Failed to fetch profile data:", err);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [stytch]);

  useEffect(() => {
    if (isInitialized && user) {
      void fetchData();
    }
  }, [isInitialized, user, fetchData]);

  const handleCardSaved = (paymentMethodId: string) => {
    setShowSaveCard(false);
    setSelectedCardId(paymentMethodId);
    fetchData();
  };

  const handleDeleteCard = async (paymentMethodId: string) => {
    const jwt = getJwt();
    // Drop linked allowances from the list first so Verify cannot run on a card that is about to disappear.
    setOrderIntents((current) => current.filter((intent) => intent.paymentMethodId !== paymentMethodId));
    const linked = orderIntents.filter(
      (intent) => intent.paymentMethodId === paymentMethodId && intent.status !== "cancelled",
    );
    await Promise.allSettled(linked.map((intent) => deleteOrderIntent(jwt, intent.orderIntentId)));
    await removePaymentMethod(jwt, paymentMethodId);
    if (selectedCardId === paymentMethodId) setSelectedCardId(null);
    if (issuingForCard === paymentMethodId) setIssuingForCard(null);
    await fetchData();
  };

  const upsertOrderIntent = (orderIntent: OrderIntentResponse) => {
    setOrderIntents((current) => {
      const exists = current.some((intent) => intent.orderIntentId === orderIntent.orderIntentId);
      return exists
        ? current.map((intent) => (intent.orderIntentId === orderIntent.orderIntentId ? orderIntent : intent))
        : [orderIntent, ...current];
    });
  };

  const handleCardIssued = (orderIntent: OrderIntentResponse) => {
    upsertOrderIntent(orderIntent);
    setIssuingForCard(null);
    // Re-read once: rail statuses are read live from the provider.
    void fetchOrderIntent(getJwt(), orderIntent.orderIntentId)
      .then(upsertOrderIntent)
      .catch((error) => {
        console.error("Failed to refresh the new allowance:", error);
      });
  };

  const handleCancelOrderIntent = async (orderIntent: OrderIntentResponse) => {
    await deleteOrderIntent(getJwt(), orderIntent.orderIntentId);
    setOrderIntents((current) => current.filter((intent) => intent.orderIntentId !== orderIntent.orderIntentId));
  };

  // A card backs allowances once its registration has settled: rails enabled,
  // or all in error (minting then falls back to encrypted-card). Pending does not count.
  const registeredCards = savedCards.filter((card) => isRegistrationSettled(registrations[card.paymentMethodId]));
  const hasRegisteredCard = registeredCards.length > 0;
  // The card picked in step 01 is the default for step 02, when it is registered.
  const selectedCard = savedCards.find((card) => card.paymentMethodId === selectedCardId) ?? savedCards[0];
  const defaultIssueCard = selectedCard && isRegistrationSettled(registrations[selectedCard.paymentMethodId]) ? selectedCard : registeredCards[0];
  const savedCardIds = new Set(savedCards.map((card) => card.paymentMethodId));
  const visibleOrderIntents = orderIntents.filter(
    (orderIntent) => orderIntent.status !== "cancelled" && savedCardIds.has(orderIntent.paymentMethodId),
  );
  const usableOrderIntents = visibleOrderIntents.filter(isUsable);
  // Step 03 also lists exhausted allowances, so the user sees the balance reach zero,
  // and allowances whose encrypted-card rail waits for its CVC, so the user can re-enter it there.
  const revealableOrderIntents = visibleOrderIntents.filter(
    (intent) =>
      intent.status === "active" &&
      (activeCardRail(intent) !== undefined || activeSptRail(intent) !== undefined || pendingCvcRecollectionRail(intent) !== undefined),
  );

  // One step is shown at a time. A step unlocks when the previous one has
  // produced what it needs: a registered card for 02, a usable allowance for 03.
  // Going back is always allowed.
  const unlocked: Record<StepNumber, boolean> = {
    1: true,
    2: hasRegisteredCard,
    3: revealableOrderIntents.length > 0,
  };
  // The furthest step the data allows. Used to land on the right step after load.
  const furthestStep: StepNumber = !hasRegisteredCard ? 1 : revealableOrderIntents.length === 0 ? 2 : 3;

  useEffect(() => {
    if (loading || landed) return;
    setLanded(true);
    setCurrentStep(furthestStep);
  }, [loading, landed, furthestStep]);

  // If the current step gets locked (a card or allowance was removed), step back.
  const step2Unlocked = unlocked[2];
  const step3Unlocked = unlocked[3];
  useEffect(() => {
    if (currentStep === 3 && !step3Unlocked) setCurrentStep(step2Unlocked ? 2 : 1);
    else if (currentStep === 2 && !step2Unlocked) setCurrentStep(1);
  }, [currentStep, step2Unlocked, step3Unlocked]);

  const goTo = (step: StepNumber) => {
    if (unlocked[step]) setCurrentStep(step);
  };

  if (!isInitialized || !user) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#F7F5F4]">
        <Loader2 className="size-5 animate-spin text-[#05B959]" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#F7F5F4] relative">
      {/* User avatar — top right */}
      <div className="absolute top-5 right-8 flex items-center gap-3">
        <button
          onClick={() => stytch.session.revoke()}
          className="text-xs text-[#00150d]/40 hover:text-[#00150d]/80 transition-colors"
        >
          Log out
        </button>
        <div className="bg-[#eaeaea] rounded-full w-10 h-10 flex items-center justify-center shrink-0">
          <span className="text-[#00150d] font-[family-name:var(--font-heading)] font-medium text-[18px]">
            {userInitial}
          </span>
        </div>
      </div>

      {/* Main layout — three columns: step index, content, API timeline */}
      {/* Three fluid columns from 1024px: step index | current step | API calls. Stacked below that. */}
      <div className="mx-auto max-w-[1500px] px-6 pt-[88px] pb-12 grid grid-cols-1 gap-x-8 gap-y-8 lg:grid-cols-[180px_minmax(0,1fr)_minmax(380px,42%)]">
        {/* Step index */}
        <aside className="hidden lg:block sticky top-[88px] self-start pt-1">
          <h1 className="font-[family-name:var(--font-heading)] font-medium text-[28px] leading-none tracking-[-0.84px] text-[#00150d] mb-8">
            Card Permissions
          </h1>
          <nav className="border-l border-[rgba(0,0,0,0.1)] flex flex-col gap-2">
            <SidebarItem active={currentStep === 1} completed={hasRegisteredCard} locked={false} label="Save credit card" onClick={() => goTo(1)} />
            <SidebarItem active={currentStep === 2} completed={usableOrderIntents.length > 0} locked={!unlocked[2]} label="Create allowance" onClick={() => goTo(2)} />
            <SidebarItem active={currentStep === 3} completed={false} locked={!unlocked[3]} label="Reveal card details" onClick={() => goTo(3)} />
          </nav>
        </aside>

        {/* Content */}
        <div className="space-y-7">

          {loadError && (
            <div className="rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-medium">Could not load your cards and allowances</p>
              <p className="mt-1 break-words font-mono text-xs">{loadError}</p>
              {loadError.includes("(403)") && (
                <p className="mt-2 text-xs text-red-800/80">
                  A 403 from a client-side API key usually means this origin is not in the key&apos;s allowed origins in the Crossmint console.
                </p>
              )}
            </div>
          )}
          {!loadError && loadWarning && (
            <div className="rounded-[10px] border border-[#E6C87A] bg-[#FFF8E1] p-4 text-sm text-[#9A6700]">
              <p className="font-medium">Cards loaded, but the allowance list did not</p>
              <p className="mt-1 break-words font-mono text-xs">{loadWarning}</p>
            </div>
          )}

          {/* Step 1 — Save and register a credit card */}
          {currentStep === 1 && (
          <div className="bg-white rounded-[10px] p-5">
            <div className="flex items-start justify-between">
              <StepHeader
                step="01"
                title="Save credit card"
                subtitle="Your cards are encrypted and stored securely. Register each card once so agents can pay with it."
              />
              <div className="shrink-0 mt-1">
                {showSaveCard && !IS_PRODUCTION && <TestCardHint />}
              </div>
            </div>

            <SavedCardsList
              cards={savedCards}
              loading={loading}
              getJwt={getJwt}
              email={userEmail}
              registrations={registrations}
              selectedCardId={selectedCardId}
              onSelectCard={setSelectedCardId}
              onDeleteCard={handleDeleteCard}
              onAddCard={showSaveCard ? undefined : () => setShowSaveCard(true)}
              onRegistrationComplete={fetchData}
            />

            {showSaveCard && (
              <div className="mt-4">
                <SaveCardSection
                  jwt={getJwt()}
                  onCardSaved={handleCardSaved}
                  onCancel={() => setShowSaveCard(false)}
                />
              </div>
            )}

            <StepNav current={1} unlocked={unlocked} onGo={goTo} />
          </div>
          )}

          {/* Step 2 — Create allowance */}
          {currentStep === 2 && (
          <div className="bg-white rounded-[10px] p-5">
            <StepHeader
              step="02"
              title="Create allowance"
              subtitle="Give an agent permission to pay with your card, up to an amount and until an expiry."
            />

            <OrderIntentsList
              orderIntents={visibleOrderIntents}
              loading={loading}
              getJwt={getJwt}
              onUpdated={upsertOrderIntent}
              onCancel={handleCancelOrderIntent}
              onIssueCardPermission={
                !issuingForCard && defaultIssueCard
                  ? () => setIssuingForCard(defaultIssueCard.paymentMethodId)
                  : undefined
              }
            />

            {issuingForCard && (
              <div className="mt-4">
                <IssueCardPermission
                  paymentMethodId={issuingForCard}
                  cards={registeredCards}
                  getJwt={getJwt}
                  onCardIssued={handleCardIssued}
                  onCancel={() => setIssuingForCard(null)}
                />
              </div>
            )}

            <StepNav current={2} unlocked={unlocked} onGo={goTo} />
          </div>
          )}

          {/* Step 3 — Reveal card details */}
          {currentStep === 3 && (
          <div className="bg-white rounded-[10px] p-5">
            <StepHeader
              step="03"
              title="Reveal card details"
              subtitle="Choose a rail, then reveal card details. If minting it fails, the app reveals the saved card on encrypted-card."
            />
            <RevealCardDetails
              orderIntents={revealableOrderIntents}
              loading={loading}
              getJwt={getJwt}
              onUpdated={upsertOrderIntent}
            />

            <StepNav current={3} unlocked={unlocked} onGo={goTo} />
          </div>
          )}

        </div>

        {/* API timeline */}
        <aside className="lg:sticky lg:top-[88px] lg:self-start lg:max-h-[calc(100dvh-112px)] lg:overflow-y-auto lg:pr-1 pt-1">
          <ApiTimeline step={currentStep} />
        </aside>
      </div>
    </div>
  );
}
