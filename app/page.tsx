"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Copy, Check, LayoutList, Code2, Circle } from "lucide-react";
import { useStytch, useStytchUser } from "@stytch/nextjs";
import { useCrossmint } from "@crossmint/client-sdk-react-ui";
import type { PaymentMethodResponse, AgentResponse, OrderIntentResponse } from "@/lib/crossmint-types";
import {
  fetchAllData,
  fetchOrderIntent,
  createNewAgent,
  deleteAgent,
  removePaymentMethod,
} from "@/lib/crossmint-api";
import { SavedCardsList } from "@/components/saved-cards-list";
import { SaveCardSection } from "@/components/save-card-section";
import { IssueCardPermission } from "@/components/issue-card-permission";
import { OrderIntentsList } from "@/components/order-intents-list";
import { AgentSection } from "@/components/agent-section";
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
  const { user } = useStytchUser();
  const { setJwt } = useCrossmint();
  const router = useRouter();

  const userEmail = user?.emails?.[0]?.email ?? "";
  const userInitial = userEmail[0]?.toUpperCase() ?? "U";
  const getJwt = () => stytch.session.getTokens()?.session_jwt ?? "";

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  useEffect(() => {
    const tokens = stytch.session.getTokens();
    if (tokens?.session_jwt) setJwt(tokens.session_jwt);
  }, [stytch, user, setJwt]);

  const [agent, setAgent] = useState<AgentResponse | null>(null);
  const [savedCards, setSavedCards] = useState<PaymentMethodResponse[]>([]);
  const [orderIntents, setOrderIntents] = useState<OrderIntentResponse[]>([]);
  const [enrollmentStatuses, setEnrollmentStatuses] = useState<Record<string, string>>({});
  const [showSaveCard, setShowSaveCard] = useState(false);
  const [cardViewMode, setCardViewMode] = useState<"ui" | "code">("ui");
  const [orderIntentViewMode, setOrderIntentViewMode] = useState<"ui" | "code">("ui");
  const [issuingForCard, setIssuingForCard] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState(false);

  const fetchData = useCallback(async () => {
    const jwt = stytch.session.getTokens()?.session_jwt ?? "";
    if (!jwt) return;
    try {
      const { cards, agents, orderIntents, enrollmentStatuses } = await fetchAllData(jwt);

      setSavedCards(cards);
      setOrderIntents(orderIntents);
      setEnrollmentStatuses(enrollmentStatuses);
      if (agents.length > 0) setAgent(agents[0]);
    } catch (err) {
      console.error("Failed to fetch profile data:", err);
    } finally {
      setLoading(false);
    }
  }, [stytch]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  const handleCreateAgent = async () => {
    setCreatingAgent(true);
    try {
      const result = await createNewAgent(getJwt(), "Card Payment Agent", "Default agent for card payments");
      setAgent(result);
    } finally {
      setCreatingAgent(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!agent) return;
    setDeletingAgent(true);
    try {
      await deleteAgent(getJwt(), agent.agentId);
      setAgent(null);
    } finally {
      setDeletingAgent(false);
    }
  };

  const handleCardSaved = () => {
    setShowSaveCard(false);
    fetchData();
  };

  const handleDeleteCard = async (paymentMethodId: string) => {
    await removePaymentMethod(getJwt(), paymentMethodId);
    fetchData();
  };

  const handleCardIssued = (orderIntent: OrderIntentResponse) => {
    setOrderIntents((current) => {
      if (current.some((intent) => intent.orderIntentId === orderIntent.orderIntentId)) {
        return current;
      }
      return [orderIntent, ...current];
    });
    setIssuingForCard(null);
    void fetchOrderIntent(getJwt(), orderIntent.orderIntentId)
      .then((refreshedOrderIntent) => {
        setOrderIntents((current) =>
          current.map((intent) =>
            intent.orderIntentId === refreshedOrderIntent.orderIntentId ? refreshedOrderIntent : intent,
          ),
        );
      })
      .catch((error) => {
        console.error("Failed to refresh the new allowance:", error);
      });
  };

  const hasEnrolledCard = Object.values(enrollmentStatuses).some((s) => s === "active");
  const agentOrderIntents = agent
    ? orderIntents.filter((orderIntent) => orderIntent.agentId === agent.agentId)
    : [];
  const activeAgentOrderIntents = agentOrderIntents.filter((orderIntent) => orderIntent.phase === "active");

  // Determine which step is currently active for sidebar highlight
  const activeStep = !agent
    ? 1
    : savedCards.length === 0 || !hasEnrolledCard
      ? 2
      : activeAgentOrderIntents.length === 0
        ? 3
        : 4;

  if (!user) {
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
            <SidebarItem active={activeStep === 1} completed={!!agent} label="Register agent" />
            <SidebarItem active={activeStep === 2} completed={hasEnrolledCard} label="Link credit card" />
            <SidebarItem active={activeStep === 3} completed={activeAgentOrderIntents.length > 0} label="Create allowance" />
            <SidebarItem active={activeStep === 4} completed={false} label="Reveal details" />
          </nav>
        </aside>

        {/* Content */}
        <div className="space-y-7">

          {/* Step 1 — Register agent */}
          <div className="bg-white rounded-[10px] p-5">
            <StepHeader
              step="01"
              title="Register agent"
              subtitle="Link your agent to start allowing card payments."
            />
            <AgentSection
              agent={agent}
              loading={loading}
              creating={creatingAgent}
              deleting={deletingAgent}
              onCreate={handleCreateAgent}
              onDelete={handleDeleteAgent}
            />
          </div>

          {/* Step 2 — Save credit card */}
          <div className={`bg-white rounded-[10px] p-5 transition-opacity ${!agent ? "opacity-50 pointer-events-none" : ""}`}>
            <div className="flex items-start justify-between">
              <StepHeader
                step="02"
                title="Save credit card"
                subtitle="Your cards are encrypted and stored securely."
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
              canIssue={!!agent}
              getJwt={getJwt}
              email={userEmail}
              enrollmentStatuses={enrollmentStatuses}
              onIssueCardPermission={(paymentMethodId) => setIssuingForCard(paymentMethodId)}
              onDeleteCard={handleDeleteCard}
              onAddCard={showSaveCard || (savedCards.length > 0 && orderIntents.length === 0) ? undefined : () => setShowSaveCard(true)}
              onEnrollmentComplete={fetchData}
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

          {/* Step 3 — Allow payments */}
          <div className={`bg-white rounded-[10px] p-5 transition-opacity ${!agent || !hasEnrolledCard ? "opacity-50 pointer-events-none" : ""}`}>
            <div className="flex items-start justify-between">
              <StepHeader
                step="03"
                title="Create allowance"
                subtitle="Give an agent permission to pay with your card using spending rules."
              />
              <div className="shrink-0 mt-1">
                {agentOrderIntents.length > 0 && (
                  <ViewSwitch view={orderIntentViewMode} onChange={setOrderIntentViewMode} />
                )}
              </div>
            </div>

            <OrderIntentsList
              orderIntents={agentOrderIntents}
              loading={loading}
              viewMode={orderIntentViewMode}
              onIssueCardPermission={
                !issuingForCard
                  ? () => {
                      const firstEnrolled = savedCards.find(
                        (c) => enrollmentStatuses[c.paymentMethodId] === "active"
                      );
                      if (firstEnrolled) setIssuingForCard(firstEnrolled.paymentMethodId);
                    }
                  : undefined
              }
            />

            {issuingForCard && agent && (
              <div className="mt-4">
                <IssueCardPermission
                  agentId={agent.agentId}
                  paymentMethodId={issuingForCard}
                  cards={savedCards.filter((c) => enrollmentStatuses[c.paymentMethodId] === "active")}
                  getJwt={getJwt}
                  onCardIssued={handleCardIssued}
                  onCancel={() => setIssuingForCard(null)}
                />
              </div>
            )}
          </div>

          {/* Step 4 — Reveal card details */}
          <div className={`bg-white rounded-[10px] p-5 transition-opacity ${!agent || activeAgentOrderIntents.length === 0 ? "opacity-50 pointer-events-none" : ""}`}>
            <StepHeader
              step="04"
              title="Reveal card details"
              subtitle="Retrieve merchant-scoped card details when your agent is ready to pay."
            />
            <RevealCardDetails
              orderIntents={activeAgentOrderIntents}
              loading={loading}
              getJwt={getJwt}
            />
          </div>

        </div>
      </div>
    </div>
  );
}
