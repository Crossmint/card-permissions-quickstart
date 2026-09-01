"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStytch, useStytchUser } from "@stytch/nextjs";
import { OrderIntentVerification } from "@crossmint/client-sdk-react-ui";
import {
  ArrowLeft,
  Bot,
  Check,
  CreditCard,
  Loader2,
  LockKeyhole,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import {
  createNewAgent,
  createNewOrderIntent,
  ensureEnrollment,
  fetchAllData,
  fetchCardCredentials,
  fetchOrderIntent,
} from "@/lib/crossmint-api";
import type {
  AgenticEnrollmentResponse,
  AgentResponse,
  CardCredentials,
  OrderIntentResponse,
  PaymentMethodResponse,
} from "@/lib/crossmint-types";
import { verificationAppearance } from "@/lib/verification-appearance";
import { EnrollmentVerificationStep } from "@/components/enrollment-verification-step";
import { SaveCardSection } from "@/components/save-card-section";

type AgentStage =
  | "idle"
  | "planning"
  | "checking"
  | "registering"
  | "creating"
  | "authorizing"
  | "securing"
  | "ready"
  | "blocked"
  | "error";
type FailureStep = "agent" | "allowance" | "credentials" | null;
type PendingEnrollment = Extract<AgenticEnrollmentResponse, { status: "pending" }>;

const TASK = {
  request: "Build a grocery cart at Whole Foods",
  budget: 45,
};

const MOCK_CART = [
  { label: "Fresh produce", price: "$14.37" },
  { label: "Pantry staples", price: "$12.84" },
  { label: "Milk & eggs", price: "$9.98" },
  { label: "Delivery", price: "$4.99" },
];

const MOCK_TOTAL_AMOUNT = 42.18;
const MOCK_TOTAL = `$${MOCK_TOTAL_AMOUNT.toFixed(2)}`;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatCardNumber(number: string) {
  return number.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function allowanceName(orderIntent: OrderIntentResponse) {
  const description = orderIntent.mandates.find((mandate) => mandate.type === "description");
  return description?.value ?? "Agent card allowance";
}

function allowanceLimit(orderIntent: OrderIntentResponse) {
  const maxAmount = orderIntent.mandates.find((mandate) => mandate.type === "maxAmount");
  if (maxAmount?.type !== "maxAmount") {
    return "Active allowance";
  }
  return `${maxAmount.value} ${maxAmount.details.currency.toUpperCase()}`;
}

function paymentMethodName(paymentMethod: PaymentMethodResponse) {
  if (!paymentMethod.card) {
    return "Saved payment method";
  }
  return `${paymentMethod.card.brand} •••• ${paymentMethod.card.last4}`;
}

function ActivityItem({
  label,
  state,
}: {
  label: string;
  state: "waiting" | "running" | "done" | "failed";
}) {
  return (
    <div className={`flex items-center gap-3 ${state === "waiting" ? "opacity-35" : ""}`}>
      <div
        className={`size-6 rounded-full flex items-center justify-center shrink-0 ${
          state === "done"
            ? "bg-[#05B959] text-white"
            : state === "failed"
              ? "bg-red-50 text-red-600"
            : state === "running"
              ? "bg-[#05B959]/10 text-[#05B959]"
              : "bg-black/[0.06] text-[#00150d]/50"
        }`}
      >
        {state === "done" ? (
          <Check className="size-3.5 stroke-[3]" />
        ) : state === "failed" ? (
          <X className="size-3.5 stroke-[2.5]" />
        ) : state === "running" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <div className="size-1.5 rounded-full bg-current" />
        )}
      </div>
      <span className="text-sm text-[#00150d]">{label}</span>
    </div>
  );
}

export default function AgentDemoPage() {
  const stytch = useStytch();
  const { user, isInitialized } = useStytchUser();
  const router = useRouter();
  const [agent, setAgent] = useState<AgentResponse | null>(null);
  const [cards, setCards] = useState<PaymentMethodResponse[]>([]);
  const [enrollmentStatuses, setEnrollmentStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showAddCard, setShowAddCard] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [pendingEnrollment, setPendingEnrollment] = useState<PendingEnrollment | null>(null);
  const [stage, setStage] = useState<AgentStage>("idle");
  const [taskAllowance, setTaskAllowance] = useState<OrderIntentResponse | null>(null);
  const [credentials, setCredentials] = useState<CardCredentials | null>(null);
  const [runError, setRunError] = useState("");
  const [failureStep, setFailureStep] = useState<FailureStep>(null);

  const getJwt = useCallback(() => stytch.session.getTokens()?.session_jwt ?? "", [stytch]);

  const loadContext = useCallback(async () => {
    try {
      const data = await fetchAllData(getJwt());
      setAgent(data.agents[0] ?? null);
      setCards(data.cards);
      setEnrollmentStatuses(data.enrollmentStatuses);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load agent context");
    } finally {
      setLoading(false);
    }
  }, [getJwt]);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }
    if (!user) {
      router.replace("/login");
      return;
    }

    void loadContext();
  }, [isInitialized, loadContext, router, user]);

  useEffect(() => {
    if (!credentials) {
      return;
    }
    const expiresInMs = new Date(credentials.expiresAt).getTime() - Date.now();
    if (!Number.isFinite(expiresInMs)) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCredentials(null);
      setStage("idle");
    }, Math.max(0, expiresInMs));
    return () => window.clearTimeout(timer);
  }, [credentials]);

  const verifiedPaymentMethod = cards.find(
    (card) => enrollmentStatuses[card.paymentMethodId] === "active",
  );
  const paymentMethodToVerify = cards.find(
    (card) => enrollmentStatuses[card.paymentMethodId] !== "active",
  );

  const markCardVerified = (paymentMethodId: string) => {
    setEnrollmentStatuses((current) => ({ ...current, [paymentMethodId]: "active" }));
    setPendingEnrollment(null);
    setRunError("");
  };

  const verifyCard = async () => {
    if (!paymentMethodToVerify || !user) {
      return;
    }
    setEnrolling(true);
    setRunError("");
    try {
      const enrollment = await ensureEnrollment(
        getJwt(),
        paymentMethodToVerify.paymentMethodId,
        user.emails[0]?.email ?? "",
      );
      if (enrollment.status === "active") {
        markCardVerified(paymentMethodToVerify.paymentMethodId);
      } else if (enrollment.status === "pending") {
        setPendingEnrollment(enrollment);
      }
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Failed to start card verification");
    } finally {
      setEnrolling(false);
    }
  };

  const secureCard = async (orderIntentId: string) => {
    setStage("securing");
    try {
      const result = await fetchCardCredentials(getJwt(), orderIntentId, {
        name: "Whole Foods",
        url: "https://www.wholefoodsmarket.com",
        countryCode: "US",
      });
      setCredentials(result);
      setStage("ready");
    } catch (error) {
      setFailureStep("credentials");
      setRunError(error instanceof Error ? error.message : "Failed to secure an agent card");
      setStage("error");
    }
  };

  const completeAllowanceApproval = async () => {
    if (!taskAllowance) {
      return;
    }
    try {
      const refreshedAllowance = await fetchOrderIntent(getJwt(), taskAllowance.orderIntentId);
      if (refreshedAllowance.phase !== "active") {
        throw new Error("The allowance is still waiting for approval");
      }
      setTaskAllowance(refreshedAllowance);
      await secureCard(refreshedAllowance.orderIntentId);
    } catch (error) {
      setFailureStep("allowance");
      setRunError(error instanceof Error ? error.message : "Failed to activate the allowance");
      setStage("error");
    }
  };

  const runAgent = async () => {
    if (
      !verifiedPaymentMethod
      || stage === "planning"
      || stage === "checking"
      || stage === "registering"
      || stage === "creating"
      || stage === "authorizing"
      || stage === "securing"
    ) {
      return;
    }

    setTaskAllowance(null);
    setCredentials(null);
    setRunError("");
    setFailureStep(null);
    setStage("planning");
    await wait(650);
    setStage("checking");
    await wait(750);

    if (MOCK_TOTAL_AMOUNT > TASK.budget) {
      setRunError(`The ${MOCK_TOTAL} cart exceeds the $${TASK.budget.toFixed(2)} task budget.`);
      setStage("blocked");
      return;
    }

    let currentAgent = agent;
    if (!currentAgent) {
      setStage("registering");
      try {
        currentAgent = await createNewAgent(
          getJwt(),
          "Shopping Agent",
          "Agent for the scripted grocery checkout demo",
        );
        setAgent(currentAgent);
      } catch (error) {
        setFailureStep("agent");
        setRunError(error instanceof Error ? error.message : "Failed to create the shopping agent");
        setStage("error");
        return;
      }
    }

    try {
      setStage("creating");
      const allowance = await createNewOrderIntent(
        getJwt(),
        currentAgent.agentId,
        verifiedPaymentMethod.paymentMethodId,
        [
          {
            type: "maxAmount",
            value: TASK.budget.toFixed(2),
            details: { currency: "usd" },
          },
          { type: "description", value: "Whole Foods grocery cart" },
        ],
      );
      setTaskAllowance(allowance);

      if (allowance.phase === "requires-verification") {
        setStage("authorizing");
      } else {
        await secureCard(allowance.orderIntentId);
      }
    } catch (error) {
      setFailureStep("allowance");
      setRunError(error instanceof Error ? error.message : "Failed to prepare the task allowance");
      setStage("error");
    }
  };

  const isRunning = [
    "planning",
    "checking",
    "registering",
    "creating",
    "authorizing",
    "securing",
  ].includes(stage);

  const handlePrimaryAction = () => {
    if (cards.length === 0) {
      setShowAddCard(true);
    } else if (!verifiedPaymentMethod) {
      void verifyCard();
    } else {
      void runAgent();
    }
  };

  if (!isInitialized || !user || loading) {
    return (
      <main className="min-h-dvh bg-[#F7F5F4] flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-[#05B959]" />
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#F7F5F4] text-[#00150d]">
      <header className="h-16 border-b border-black/[0.07] bg-white/80 backdrop-blur flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-[#05B959] text-white flex items-center justify-center">
            <Bot className="size-4.5" />
          </div>
          <div>
            <div className="font-[family-name:var(--font-heading)] font-semibold text-sm">Shopping Agent</div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#00150d]/45">
              <span className="size-1.5 rounded-full bg-[#05B959]" />
              Connected to Crossmint
            </div>
          </div>
        </div>
        <Link href="/" className="flex items-center gap-1.5 text-xs font-medium text-[#00150d]/55 hover:text-[#00150d]">
          <ArrowLeft className="size-3.5" />
          Card permissions
        </Link>
      </header>

      <div className="max-w-[1040px] mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5">
        <section className="min-h-[680px] bg-white rounded-2xl border border-black/[0.06] shadow-[0_12px_40px_rgba(0,21,13,0.04)] flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-black/[0.06] flex items-center justify-between">
            <div>
              <h1 className="font-[family-name:var(--font-heading)] font-semibold text-lg">Agent checkout</h1>
              <p className="text-xs text-[#00150d]/45 mt-0.5">Watch an agent plan, validate, and prepare a purchase.</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-[#F6F6F6] px-2.5 py-1 text-[11px] text-[#00150d]/50">
              <Sparkles className="size-3 text-[#05B959]" />
              Scripted demo
            </div>
          </div>

          <div className="flex-1 px-6 py-7 space-y-6 overflow-y-auto">
            <div className="flex items-start gap-3 max-w-[85%]">
              <div className="size-8 rounded-lg bg-[#05B959]/10 text-[#05B959] flex items-center justify-center shrink-0">
                <Bot className="size-4" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-[#F6F6F6] px-4 py-3 text-sm leading-6">
                I have a shopping task ready. I’ll build the cart, check its total against your allowance, and secure a merchant-specific card.
              </div>
            </div>

            <div className="flex justify-end">
              <div className="w-full max-w-[78%] rounded-2xl rounded-tr-sm bg-[#00150d] text-white px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.14em] text-white/45 mb-2">Assigned task</div>
                <div className="text-sm font-medium">{TASK.request}</div>
                <div className="text-xs text-white/55 mt-1">Stay under ${TASK.budget.toFixed(2)}</div>
              </div>
            </div>

            {cards.length === 0 && (
              <div className="flex items-start gap-3 max-w-[92%]">
                <div className="size-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <CreditCard className="size-4" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  I need a payment source before I can request an allowance. Add a card, then I’ll guide you through verification.
                </div>
              </div>
            )}

            {showAddCard && cards.length === 0 && (
              <div className="ml-11 max-w-[92%]">
                <SaveCardSection
                  jwt={getJwt()}
                  onCardSaved={() => {
                    setShowAddCard(false);
                    void loadContext();
                  }}
                  onCancel={() => setShowAddCard(false)}
                />
              </div>
            )}

            {cards.length > 0 && !verifiedPaymentMethod && (
              <div className="flex items-start gap-3 max-w-[92%]">
                <div className="size-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <ShieldCheck className="size-4" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  Your saved card must be verified for agent payments. Continue with passkey verification to enable it.
                </div>
              </div>
            )}

            {pendingEnrollment && paymentMethodToVerify && (
              <div className="ml-11 max-w-[92%]">
                <EnrollmentVerificationStep
                  enrollment={pendingEnrollment}
                  message="Verify this card with your passkey to enable agent payments..."
                  onComplete={() => markCardVerified(paymentMethodToVerify.paymentMethodId)}
                  onError={() => {
                    setPendingEnrollment(null);
                    setRunError("Card verification failed. Please try again.");
                  }}
                  onCancel={() => setPendingEnrollment(null)}
                />
              </div>
            )}

            {runError && stage === "idle" && !verifiedPaymentMethod && (
              <div className="flex items-start gap-3 max-w-[85%]">
                <div className="size-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                  <ShieldCheck className="size-4" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-red-50 px-4 py-3 text-sm text-red-700">
                  I couldn’t verify the payment card. {runError}
                </div>
              </div>
            )}

            {isRunning && stage !== "authorizing" && (
              <div className="flex items-start gap-3 max-w-[88%]">
                <div className="size-8 rounded-lg bg-[#05B959]/10 text-[#05B959] flex items-center justify-center shrink-0">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-[#F6F6F6] px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-[#00150d]/65">
                    <Loader2 className="size-3.5 animate-spin text-[#05B959]" />
                    {stage === "planning"
                      ? "Building a grocery cart for the $45 budget…"
                      : stage === "checking"
                        ? `Cart ready at ${MOCK_TOTAL}. Comparing it with your spending rules…`
                        : stage === "registering"
                          ? "No agent found. Registering a Shopping Agent for this task…"
                          : stage === "creating"
                            ? "Creating a fresh $45 task allowance for your approval…"
                            : "Passkey approved. Requesting a Whole Foods-scoped agent card…"}
                  </div>
                  {stage !== "planning" && (
                    <div className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11px] text-[#00150d]/50">
                      <ShoppingBag className="size-3 text-[#05B959]" />
                      4 groups · {MOCK_TOTAL}
                    </div>
                  )}
                </div>
              </div>
            )}

            {stage === "authorizing" && taskAllowance?.phase === "requires-verification" && (
              <div className="flex items-start gap-3 max-w-[92%]">
                <div className="size-8 rounded-lg bg-[#05B959]/10 text-[#05B959] flex items-center justify-center shrink-0">
                  <ShieldCheck className="size-4" />
                </div>
                <div className="space-y-3 min-w-0 flex-1">
                  <div className="rounded-2xl rounded-tl-sm bg-[#F6F6F6] px-4 py-3 text-sm leading-6">
                    I created a fresh <span className="font-medium">$45 Whole Foods allowance</span>. Approve it with your passkey before I access the agent card.
                  </div>
                  <div className="rounded-xl border border-black/[0.08] overflow-hidden bg-white p-4">
                    <OrderIntentVerification
                      orderIntent={taskAllowance}
                      appearance={verificationAppearance}
                      onVerificationComplete={() => void completeAllowanceApproval()}
                      onVerificationError={() => {
                        setFailureStep("allowance");
                        setRunError("Passkey authorization failed. Please run the task again.");
                        setStage("error");
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {stage === "ready" && credentials && taskAllowance && (
              <div className="flex items-start gap-3 max-w-[92%]">
                <div className="size-8 rounded-lg bg-[#05B959]/10 text-[#05B959] flex items-center justify-center shrink-0">
                  <Bot className="size-4" />
                </div>
                <div className="space-y-3 min-w-0">
                  <div className="rounded-2xl rounded-tl-sm bg-[#F6F6F6] px-4 py-3 text-sm leading-6">
                    I built a <span className="font-medium">{MOCK_TOTAL}</span> grocery cart, received approval for the <span className="font-medium">{allowanceLimit(taskAllowance)}</span> {allowanceName(taskAllowance)} allowance, and secured a Whole Foods-only card. Checkout is prepared.
                  </div>
                  <div className="rounded-xl border border-black/[0.08] bg-white overflow-hidden">
                    <div className="flex items-center justify-between bg-[#F6F6F6] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="size-4 text-[#05B959]" />
                        <span className="text-sm font-medium">Whole Foods cart</span>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-[#00150d]/40">Mock order</span>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      {MOCK_CART.map((item) => (
                        <div key={item.label} className="flex items-center justify-between text-xs">
                          <span className="text-[#00150d]/55">{item.label}</span>
                          <span className="font-mono text-[#00150d]">{item.price}</span>
                        </div>
                      ))}
                      <div className="h-px bg-black/[0.07]" />
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>Total</span>
                        <span className="font-mono">{MOCK_TOTAL}</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#00150d] text-white p-5 shadow-lg overflow-hidden relative">
                    <div className="absolute -right-8 -top-10 size-36 rounded-full bg-[#05B959]/20 blur-2xl" />
                    <div className="relative flex items-start justify-between gap-4 mb-7">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">Agent card</div>
                        <div className="text-sm font-medium mt-1">Whole Foods only</div>
                      </div>
                      <LockKeyhole className="size-4 text-[#05B959]" />
                    </div>
                    <div className="relative font-mono text-lg tracking-[0.11em] mb-5">
                      {formatCardNumber(credentials.card.number)}
                    </div>
                    <div className="relative flex gap-8 font-mono text-xs">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Expires</div>
                        {String(credentials.card.expirationMonth).padStart(2, "0")}/{String(credentials.card.expirationYear).slice(-2)}
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-white/40 mb-1">CVC</div>
                        {credentials.card.cvc}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#00150d]/45 pl-1">
                    <ShieldCheck className="size-3.5 text-[#05B959]" />
                    No purchase was made. Credentials expire automatically.
                  </div>
                </div>
              </div>
            )}

            {stage === "blocked" && (
              <div className="flex items-start gap-3 max-w-[85%]">
                <div className="size-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  I stopped before requesting an allowance. {runError}
                </div>
              </div>
            )}

            {stage === "error" && (
              <div className="flex items-start gap-3 max-w-[85%]">
                <div className="size-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-red-50 px-4 py-3 text-sm text-red-700">
                  I couldn’t complete the {failureStep === "agent" ? "agent setup" : failureStep === "allowance" ? "allowance approval" : "card retrieval"}. {runError}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-black/[0.06] flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">{TASK.request}</div>
              <div className="text-[11px] text-[#00150d]/40 mt-0.5">Budget ${TASK.budget.toFixed(2)} · no purchase will be made</div>
            </div>
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={showAddCard || enrolling || pendingEnrollment !== null || isRunning}
              className="shrink-0 h-10 rounded-lg bg-[#05B959] text-white px-4 flex items-center gap-2 text-xs font-medium hover:bg-[#049d4c] disabled:opacity-35 transition-colors"
            >
              {enrolling || isRunning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {cards.length === 0
                ? showAddCard
                  ? "Add your card above"
                  : "Add payment card"
                : !verifiedPaymentMethod
                  ? pendingEnrollment
                    ? "Awaiting passkey"
                    : "Verify payment card"
                  : stage === "ready"
                    ? "Run again"
                    : "Run grocery agent"}
            </button>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="bg-white rounded-2xl border border-black/[0.06] p-5">
            <div className="flex items-center gap-2 mb-5">
              <Sparkles className="size-4 text-[#05B959]" />
              <h2 className="font-[family-name:var(--font-heading)] font-semibold text-sm">Agent activity</h2>
            </div>
            <div className="space-y-4">
              <ActivityItem
                label="Plan grocery cart"
                state={stage === "planning" ? "running" : stage === "idle" ? "waiting" : "done"}
              />
              <ActivityItem
                label="Check $45 task budget"
                state={
                  stage === "checking"
                    ? "running"
                    : stage === "blocked"
                      ? "failed"
                      : ["registering", "creating", "authorizing", "securing", "ready", "error"].includes(stage)
                        ? "done"
                        : "waiting"
                }
              />
              <ActivityItem
                label="Prepare shopping agent"
                state={
                  stage === "registering"
                    ? "running"
                    : stage === "error" && failureStep === "agent"
                      ? "failed"
                      : ["creating", "authorizing", "securing", "ready"].includes(stage)
                          || (stage === "error" && failureStep !== "agent")
                        ? "done"
                        : "waiting"
                }
              />
              <ActivityItem
                label="Approve $45 allowance"
                state={
                  stage === "creating" || stage === "authorizing"
                    ? "running"
                    : stage === "error" && failureStep === "allowance"
                      ? "failed"
                      : ["securing", "ready"].includes(stage)
                          || (stage === "error" && failureStep === "credentials")
                        ? "done"
                        : "waiting"
                }
              />
              <ActivityItem
                label="Secure agent card"
                state={
                  stage === "securing"
                    ? "running"
                    : stage === "error" && failureStep === "credentials"
                      ? "failed"
                      : stage === "ready"
                        ? "done"
                        : "waiting"
                }
              />
              <ActivityItem label="Prepare checkout" state={stage === "ready" ? "done" : "waiting"} />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-black/[0.06] p-5">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="size-4 text-[#2377FF]" />
              <h2 className="font-[family-name:var(--font-heading)] font-semibold text-sm">Payment context</h2>
            </div>
            {loadError ? (
              <p className="text-xs text-red-600">{loadError}</p>
            ) : cards.length === 0 ? (
              <div className="space-y-3">
                <p className="text-xs leading-5 text-[#00150d]/50">
                  No payment card is saved yet. Add one here to continue the agent setup.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddCard(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#05B959] hover:text-[#049d4c]"
                >
                  <CreditCard className="size-3.5" />
                  Add payment card
                </button>
              </div>
            ) : !verifiedPaymentMethod ? (
              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-[#00150d]/40 mb-1">Payment source</div>
                  <div className="font-medium">{paymentMethodName(paymentMethodToVerify ?? cards[0])}</div>
                </div>
                <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 text-amber-700 px-2.5 py-2">
                  <ShieldCheck className="size-3.5" />
                  Passkey verification required
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-[#00150d]/40 mb-1">Agent</div>
                  <div className="font-medium truncate">{agent?.metadata.name ?? "Created on first run"}</div>
                </div>
                <div className="h-px bg-black/[0.06]" />
                <div>
                  <div className="text-[#00150d]/40 mb-1">Payment source</div>
                  <div className="font-medium">{paymentMethodName(verifiedPaymentMethod)}</div>
                </div>
                <div className="h-px bg-black/[0.06]" />
                <div>
                  <div className="text-[#00150d]/40 mb-1">Task allowance</div>
                  <div className="font-medium">
                    {taskAllowance ? allowanceName(taskAllowance) : "$45 Whole Foods allowance"}
                  </div>
                  <div className="text-[#00150d]/50 mt-0.5">
                    {taskAllowance ? allowanceLimit(taskAllowance) : "Created fresh on each run"}
                  </div>
                </div>
                <div
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 ${
                    stage === "authorizing"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-[#05B959]/[0.07] text-[#048d45]"
                  }`}
                >
                  <ShieldCheck className="size-3.5" />
                  {stage === "authorizing"
                    ? "Awaiting passkey approval"
                    : stage === "securing"
                      ? "Retrieving the agent card"
                      : stage === "ready"
                        ? "Agent card ready"
                        : "Ready to request an allowance"}
                </div>
              </div>
            )}
          </div>

          <p className="px-1 text-[11px] leading-4 text-[#00150d]/35">
            The conversation and checkout are simulated. Card credentials are retrieved from the staging API.
          </p>
        </aside>
      </div>
    </main>
  );
}
