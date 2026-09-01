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
import { fetchAllData, fetchCardCredentials } from "@/lib/crossmint-api";
import type { AgentResponse, CardCredentials, OrderIntentResponse } from "@/lib/crossmint-types";

type AgentStage = "idle" | "checking" | "securing" | "ready" | "error";

const EXAMPLE_PROMPT = "Buy $45 of groceries from Whole Foods";

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
  const { user } = useStytchUser();
  const router = useRouter();
  const [agent, setAgent] = useState<AgentResponse | null>(null);
  const [orderIntents, setOrderIntents] = useState<OrderIntentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPT);
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [stage, setStage] = useState<AgentStage>("idle");
  const [credentials, setCredentials] = useState<CardCredentials | null>(null);
  const [runError, setRunError] = useState("");

  const getJwt = useCallback(() => stytch.session.getTokens()?.session_jwt ?? "", [stytch]);

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }

    const load = async () => {
      try {
        const data = await fetchAllData(getJwt());
        const currentAgent = data.agents[0] ?? null;
        setAgent(currentAgent);
        setOrderIntents(data.orderIntents);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Failed to load agent context");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [getJwt, router, user]);

  useEffect(() => {
    if (!credentials) {
      return;
    }
    const expiresInMs = new Date(credentials.expiresAt).getTime() - Date.now();
    if (!Number.isFinite(expiresInMs)) {
      return;
    }
    const timer = window.setTimeout(() => setCredentials(null), Math.max(0, expiresInMs));
    return () => window.clearTimeout(timer);
  }, [credentials]);

  const activeAllowance = agent
    ? orderIntents.find((orderIntent) => orderIntent.agentId === agent.agentId && orderIntent.phase === "active")
    : undefined;

  const runAgent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeAllowance || !prompt.trim() || stage === "checking" || stage === "securing") {
      return;
    }

    setSubmittedPrompt(prompt.trim());
    setCredentials(null);
    setRunError("");
    setStage("checking");
    await wait(650);
    setStage("securing");

    try {
      const result = await fetchCardCredentials(getJwt(), activeAllowance.orderIntentId, {
        name: "Whole Foods",
        url: "https://www.wholefoodsmarket.com",
        countryCode: "US",
      });
      setCredentials(result);
      setStage("ready");
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Failed to secure an agent card");
      setStage("error");
    }
  };

  if (!user || loading) {
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
              <p className="text-xs text-[#00150d]/45 mt-0.5">Tell the agent what you need. It will handle the card.</p>
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
                What can I help you buy today?
              </div>
            </div>

            {submittedPrompt && (
              <div className="flex justify-end">
                <div className="max-w-[78%] rounded-2xl rounded-tr-sm bg-[#00150d] text-white px-4 py-3 text-sm leading-6">
                  {submittedPrompt}
                </div>
              </div>
            )}

            {(stage === "checking" || stage === "securing") && (
              <div className="flex items-start gap-3 max-w-[85%]">
                <div className="size-8 rounded-lg bg-[#05B959]/10 text-[#05B959] flex items-center justify-center shrink-0">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-[#F6F6F6] px-4 py-3 flex items-center gap-2 text-sm text-[#00150d]/60">
                  <Loader2 className="size-3.5 animate-spin text-[#05B959]" />
                  {stage === "checking" ? "Checking your spending rules…" : "Securing a merchant-scoped agent card…"}
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
                    I found your <span className="font-medium">{allowanceName(activeAllowance)}</span> allowance and secured a card for Whole Foods. I’m ready to check out within your {allowanceLimit(activeAllowance)} limit.
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

          <form onSubmit={runAgent} className="p-4 border-t border-black/[0.06]">
            <div className="rounded-xl border border-black/[0.1] bg-white p-2 flex items-center gap-2 focus-within:border-[#05B959]/50 focus-within:ring-2 focus-within:ring-[#05B959]/10">
              <input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                disabled={!activeAllowance || stage === "checking" || stage === "securing"}
                aria-label="Message the shopping agent"
                className="flex-1 min-w-0 bg-transparent px-2.5 py-2 text-sm outline-none disabled:opacity-50"
                placeholder="Ask the agent to buy something…"
              />
              <button
                type="submit"
                disabled={!activeAllowance || !prompt.trim() || stage === "checking" || stage === "securing"}
                className="size-9 rounded-lg bg-[#05B959] text-white flex items-center justify-center hover:bg-[#049d4c] disabled:opacity-35 transition-colors"
                aria-label="Run mock agent"
              >
                {stage === "checking" || stage === "securing" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-4">
          <div className="bg-white rounded-2xl border border-black/[0.06] p-5">
            <div className="flex items-center gap-2 mb-5">
              <Sparkles className="size-4 text-[#05B959]" />
              <h2 className="font-[family-name:var(--font-heading)] font-semibold text-sm">Agent activity</h2>
            </div>
            <div className="space-y-4">
              <ActivityItem label="Understand request" state={stage === "idle" ? "waiting" : "done"} />
              <ActivityItem
                label="Check spending rules"
                state={stage === "checking" ? "running" : stage === "idle" ? "waiting" : "done"}
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
            ) : activeAllowance && agent ? (
              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-[#00150d]/40 mb-1">Agent</div>
                  <div className="font-medium truncate">{agent.metadata.name}</div>
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
            The conversation and checkout are simulated. Card credentials are retrieved from the staging API.
          </p>
        </aside>
      </div>
    </main>
  );
}
