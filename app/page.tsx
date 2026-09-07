"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Copy, Check, LayoutList, Code2, Circle } from "lucide-react";
import { useStytch, useStytchUser } from "@stytch/nextjs";
import { useCrossmint } from "@crossmint/client-sdk-react-ui";
import type { OrderIntentRegistration, OrderIntentResponse, PaymentMethodResponse } from "@/lib/crossmint-types";
import { deleteOrderIntent, fetchAllData, fetchOrderIntent, removePaymentMethod } from "@/lib/crossmint-api";
import { isUsable } from "@/lib/rails";
import { SavedCardsList } from "@/components/saved-cards-list";
import { SaveCardSection } from "@/components/save-card-section";
import { IssueCardPermission } from "@/components/issue-card-permission";
import { OrderIntentsList } from "@/components/order-intents-list";
import { RevealCardDetails } from "@/components/reveal-card-details";

const TEST_CARD = "4242 4242 4242 4242";

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

function ViewSwitch({ view, onChange }: { view: "ui" | "code"; onChange: (v: "ui" | "code") => void }) {
  return (
    <div className="flex items-center border border-[rgba(0,0,0,0.12)] rounded-[6px] p-[4px] gap-[2px] shrink-0">
      <button
        onClick={() => onChange("ui")}
        className={`flex items-center justify-center p-[4px] rounded-[4px] transition-colors ${view === "ui" ? "bg-[rgba(0,0,0,0.08)]" : "hover:bg-[rgba(0,0,0,0.04)]"}`}
        title="Card view"
      >
        <LayoutList className="size-4 text-[#00150d]" />
      </button>
      <button
        onClick={() => onChange("code")}
        className={`flex items-center justify-center p-[4px] rounded-[4px] transition-colors ${view === "code" ? "bg-[rgba(0,0,0,0.08)]" : "hover:bg-[rgba(0,0,0,0.04)]"}`}
        title="Code view"
      >
        <Code2 className="size-4 text-[#00150d]" />
      </button>
    </div>
  );
}

function SidebarItem({ active, completed, label }: { active: boolean; completed: boolean; label: string }) {
  return (
    <div
      className={`flex items-center gap-2.5 px-4 py-1.5 border-l-2 transition-all ${
        active
          ? "border-[#05B959] text-[#00150d]"
          : "border-transparent text-[#00150d] opacity-40"
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
  const [cardViewMode, setCardViewMode] = useState<"ui" | "code">("ui");
  const [orderIntentViewMode, setOrderIntentViewMode] = useState<"ui" | "code">("ui");
  const [issuingForCard, setIssuingForCard] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const jwt = stytch.session.getTokens()?.session_jwt ?? "";
    if (!jwt) return;
    try {
      const data = await fetchAllData(jwt);
      setSavedCards(data.cards);
      setOrderIntents(data.orderIntents);
      setRegistrations(data.registrations);
    } catch (err) {
      console.error("Failed to fetch profile data:", err);
    } finally {
      setLoading(false);
    }
  }, [stytch]);

  useEffect(() => {
    if (isInitialized && user) {
      void fetchData();
    }
  }, [isInitialized, user, fetchData]);

  const handleCardSaved = () => {
    setShowSaveCard(false);
    fetchData();
  };

  const handleDeleteCard = async (paymentMethodId: string) => {
    await removePaymentMethod(getJwt(), paymentMethodId);
    fetchData();
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

  const registeredCards = savedCards.filter((card) => registrations[card.paymentMethodId]);
  const hasRegisteredCard = registeredCards.length > 0;
  const visibleOrderIntents = orderIntents.filter((orderIntent) => orderIntent.status !== "cancelled");
  const usableOrderIntents = visibleOrderIntents.filter(isUsable);

  // Determine which step is currently active for sidebar highlight
  const activeStep = savedCards.length === 0 || !hasRegisteredCard
    ? 1
    : usableOrderIntents.length === 0
      ? 2
      : 3;

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

      {/* Main layout — content centered, sidebar floats left */}
      <div className="max-w-[720px] mx-auto px-6 pt-[88px] pb-12 relative translate-x-6">
        {/* Sidebar — absolutely positioned to the left of the centered content */}
        <aside className="absolute right-full top-[88px] pr-10 w-52 pt-1 -translate-x-24">
          <h1 className="font-[family-name:var(--font-heading)] font-medium text-[28px] leading-none tracking-[-0.84px] text-[#00150d] mb-8">
            Card Permissions
          </h1>
          <nav className="border-l border-[rgba(0,0,0,0.1)] flex flex-col gap-2">
            <SidebarItem active={activeStep === 1} completed={hasRegisteredCard} label="Link credit card" />
            <SidebarItem active={activeStep === 2} completed={usableOrderIntents.length > 0} label="Create allowance" />
            <SidebarItem active={activeStep === 3} completed={false} label="Reveal details" />
          </nav>
        </aside>

        {/* Content */}
        <div className="space-y-7">

          {/* Step 1 — Save and register a credit card */}
          <div className="bg-white rounded-[10px] p-5">
            <div className="flex items-start justify-between">
              <StepHeader
                step="01"
                title="Save credit card"
                subtitle="Your cards are encrypted and stored securely. Register each card once so agents can pay with it."
              />
              <div className="shrink-0 mt-1">
                {showSaveCard
                  ? <TestCardHint />
                  : savedCards.length > 0 && <ViewSwitch view={cardViewMode} onChange={setCardViewMode} />
                }
              </div>
            </div>

            <SavedCardsList
              cards={savedCards}
              loading={loading}
              getJwt={getJwt}
              email={userEmail}
              registrations={registrations}
              onDeleteCard={handleDeleteCard}
              onAddCard={showSaveCard || (savedCards.length > 0 && orderIntents.length === 0) ? undefined : () => setShowSaveCard(true)}
              onRegistrationComplete={fetchData}
              viewMode={cardViewMode}
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
          </div>

          {/* Step 2 — Create allowance */}
          <div className={`bg-white rounded-[10px] p-5 transition-opacity ${!hasRegisteredCard ? "opacity-50 pointer-events-none" : ""}`}>
            <div className="flex items-start justify-between">
              <StepHeader
                step="02"
                title="Create allowance"
                subtitle="Give an agent permission to pay with your card, up to an amount and until an expiry."
              />
              <div className="shrink-0 mt-1">
                {visibleOrderIntents.length > 0 && (
                  <ViewSwitch view={orderIntentViewMode} onChange={setOrderIntentViewMode} />
                )}
              </div>
            </div>

            <OrderIntentsList
              orderIntents={visibleOrderIntents}
              loading={loading}
              getJwt={getJwt}
              viewMode={orderIntentViewMode}
              onUpdated={upsertOrderIntent}
              onCancel={handleCancelOrderIntent}
              onIssueCardPermission={
                !issuingForCard && registeredCards[0]
                  ? () => setIssuingForCard(registeredCards[0].paymentMethodId)
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
          </div>

          {/* Step 3 — Reveal card details */}
          <div className={`bg-white rounded-[10px] p-5 transition-opacity ${usableOrderIntents.length === 0 ? "opacity-50 pointer-events-none" : ""}`}>
            <StepHeader
              step="03"
              title="Reveal card details"
              subtitle="Retrieve card details when your agent is ready to pay. Uses the network rail, or the encrypted-card fallback."
            />
            <RevealCardDetails
              orderIntents={usableOrderIntents}
              loading={loading}
              getJwt={getJwt}
            />
          </div>

        </div>
      </div>
    </div>
  );
}
