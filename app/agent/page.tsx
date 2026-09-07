"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStytch, useStytchUser } from "@stytch/nextjs";
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
} from "lucide-react";
import { fetchAllData } from "@/lib/crossmint-api";
import type { AgentCardCredentials, OrderIntentResponse } from "@/lib/crossmint-types";
import { revealCardCredentials } from "@/lib/card-credentials";
import { activeCardRail, isUsable, railLabel } from "@/lib/rails";
import { CROSSMINT_ENVIRONMENT } from "@/lib/crossmint-env";

type AgentStage = "idle" | "planning" | "checking" | "securing" | "ready" | "error";

const TASK = {
  request: "Build a grocery cart at Whole Foods",
  budget: "$45.00",
};

const MOCK_CART = [
  { label: "Fresh produce", price: "$14.37" },
  { label: "Pantry staples", price: "$12.84" },
  { label: "Milk & eggs", price: "$9.98" },
  { label: "Delivery", price: "$4.99" },
];

const MOCK_TOTAL = "$42.18";
const MOCK_TOTAL_VALUE = "42.18";

// The encrypted-card rail returns no expiry. Hide those details after a fixed time.
const FALLBACK_HIDE_MS = 5 * 60 * 1000;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatCardNumber(number: string) {
  return number.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function allowanceName(orderIntent: OrderIntentResponse) {
  return orderIntent.description || "Agent card allowance";
}

function allowanceLimit(orderIntent: OrderIntentResponse) {
  return `${orderIntent.amount.available} ${orderIntent.amount.currency.toUpperCase()} available`;
}

function ActivityItem({
  label,
  state,
}: {
  label: string;
  state: "waiting" | "running" | "done";
}) {
  return (
    <div className={`flex items-center gap-3 ${state === "waiting" ? "opacity-35" : ""}`}>
      <div
        className={`size-6 rounded-full flex items-center justify-center shrink-0 ${
          state === "done"
            ? "bg-[#05B959] text-white"
            : state === "running"
              ? "bg-[#05B959]/10 text-[#05B959]"
              : "bg-black/[0.06] text-[#00150d]/50"
        }`}
      >
        {state === "done" ? (
          <Check className="size-3.5 stroke-[3]" />
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
  const [orderIntents, setOrderIntents] = useState<OrderIntentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [stage, setStage] = useState<AgentStage>("idle");
  const [credentials, setCredentials] = useState<AgentCardCredentials | null>(null);
  const [runError, setRunError] = useState("");

  const getJwt = useCallback(() => stytch.session.getTokens()?.session_jwt ?? "", [stytch]);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }
    if (!user) {
      router.replace("/login");
      return;
    }

    const load = async () => {
      try {
        const data = await fetchAllData(getJwt());
        setOrderIntents(data.orderIntents);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Failed to load agent context");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [getJwt, isInitialized, router, user]);

  useEffect(() => {
    if (!credentials) {
      return;
    }
    const expiresAt = credentials.expiresAt ? new Date(credentials.expiresAt).getTime() : NaN;
    const expiresInMs = Number.isFinite(expiresAt) ? expiresAt - Date.now() : FALLBACK_HIDE_MS;
    const timer = window.setTimeout(() => {
      setCredentials(null);
      setStage("idle");
    }, Math.max(0, expiresInMs));
    return () => window.clearTimeout(timer);
  }, [credentials]);

  // Pick the first allowance with a rail that can mint a card. The dispatcher
  // prefers the network rail and falls back to encrypted-card.
  const activeAllowance = orderIntents.find(isUsable);
  const activeRail = activeAllowance ? activeCardRail(activeAllowance) : undefined;

  const runAgent = async () => {
    if (!activeAllowance || stage === "planning" || stage === "checking" || stage === "securing") {
      return;
    }

    setCredentials(null);
    setRunError("");
    setStage("planning");
    await wait(650);
    setStage("checking");
    await wait(750);
    setStage("securing");

    try {
      // Charge the cart total, capped at what the allowance still has available.
      const available = Number(activeAllowance.amount.available);
      const amount = Math.min(Number(MOCK_TOTAL_VALUE), Number.isFinite(available) ? available : Infinity).toFixed(2);
      const result = await revealCardCredentials(getJwt(), activeAllowance, {
        amount,
        // Used only when the allowance has no merchant of its own.
        merchant: { name: "Whole Foods", url: "https://www.wholefoodsmarket.com", countryCode: "US" },
      });
      setCredentials(result);
      setStage("ready");
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Failed to secure an agent card");
      setStage("error");
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
                <div className="text-xs text-white/55 mt-1">Stay under {TASK.budget}</div>
              </div>
            </div>

            {(stage === "planning" || stage === "checking" || stage === "securing") && (
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
                        : "Approved. Requesting a Whole Foods-scoped agent card…"}
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

            {stage === "ready" && credentials && activeAllowance && (
              <div className="flex items-start gap-3 max-w-[92%]">
                <div className="size-8 rounded-lg bg-[#05B959]/10 text-[#05B959] flex items-center justify-center shrink-0">
                  <Bot className="size-4" />
                </div>
                <div className="space-y-3 min-w-0">
                  <div className="rounded-2xl rounded-tl-sm bg-[#F6F6F6] px-4 py-3 text-sm leading-6">
                    I built a <span className="font-medium">{MOCK_TOTAL}</span> grocery cart, confirmed it is within your <span className="font-medium">{allowanceLimit(activeAllowance)}</span> {allowanceName(activeAllowance)} allowance, and secured a Whole Foods-only card. Checkout is prepared.
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
                      {formatCardNumber(credentials.number)}
                    </div>
                    <div className="relative flex gap-8 font-mono text-xs">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Expires</div>
                        {credentials.expirationMonth.padStart(2, "0")}/{credentials.expirationYear.slice(-2)}
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-white/40 mb-1">CVC</div>
                        {credentials.cvc}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#00150d]/45 pl-1">
                    <ShieldCheck className="size-3.5 text-[#05B959]" />
                    No purchase was made. {credentials.rail === "encrypted-card" ? "Card decrypted in this tab with a one-time key." : "Credentials expire automatically."}
                  </div>
                </div>
              </div>
            )}

            {stage === "error" && (
              <div className="flex items-start gap-3 max-w-[85%]">
                <div className="size-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-red-50 px-4 py-3 text-sm text-red-700">
                  I couldn’t secure the card. {runError}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-black/[0.06] flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">{TASK.request}</div>
              <div className="text-[11px] text-[#00150d]/40 mt-0.5">Budget {TASK.budget} · no purchase will be made</div>
            </div>
            <button
              type="button"
              onClick={() => void runAgent()}
              disabled={!activeAllowance || stage === "planning" || stage === "checking" || stage === "securing"}
              className="shrink-0 h-10 rounded-lg bg-[#05B959] text-white px-4 flex items-center gap-2 text-xs font-medium hover:bg-[#049d4c] disabled:opacity-35 transition-colors"
            >
              {stage === "planning" || stage === "checking" || stage === "securing" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {stage === "ready" ? "Run again" : "Run grocery agent"}
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
                label="Check spending rules"
                state={stage === "checking" ? "running" : stage === "securing" || stage === "ready" ? "done" : "waiting"}
              />
              <ActivityItem
                label="Secure agent card"
                state={stage === "securing" ? "running" : stage === "ready" ? "done" : "waiting"}
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
            ) : activeAllowance && activeRail ? (
              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-[#00150d]/40 mb-1">Payment rail</div>
                  <div className="font-medium truncate">{railLabel(activeRail)}</div>
                </div>
                <div className="h-px bg-black/[0.06]" />
                <div>
                  <div className="text-[#00150d]/40 mb-1">Allowance</div>
                  <div className="font-medium">{allowanceName(activeAllowance)}</div>
                  <div className="text-[#00150d]/50 mt-0.5">{allowanceLimit(activeAllowance)}</div>
                </div>
                <div className="flex items-center gap-1.5 rounded-lg bg-[#05B959]/[0.07] text-[#048d45] px-2.5 py-2">
                  <ShieldCheck className="size-3.5" />
                  Ready for agent payments
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs leading-5 text-[#00150d]/50">Create an active allowance before running the agent demo.</p>
                <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#05B959] hover:text-[#049d4c]">
                  <ShoppingBag className="size-3.5" />
                  Set up card permissions
                </Link>
              </div>
            )}
          </div>

          <p className="px-1 text-[11px] leading-4 text-[#00150d]/35">
            The conversation and checkout are simulated. Card credentials are retrieved from the Crossmint {CROSSMINT_ENVIRONMENT} API.
          </p>
        </aside>
      </div>
    </main>
  );
}
