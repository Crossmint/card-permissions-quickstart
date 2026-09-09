"use client";

// Right-hand column: the Crossmint API calls behind each step, as they happen.
// Grouped by step, key calls only by default. Each card explains the call in
// one sentence, shows the rail it involves, and folds the raw request and
// response underneath.

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy } from "lucide-react";
import type { ApiTrace } from "@/lib/api-trace";
import { useApiLog } from "@/lib/api-log";
import { explain, type Explained, type Step } from "@/lib/api-explain";
import { RailBadge } from "@/components/rail-badge";

const STEPS: Array<{ step: Step; title: string; placeholder: string; example: string }> = [
  { step: 1, title: "Save credit card", placeholder: "Register a card to see", example: "PUT /payment-methods/{id}/order-intent-registration" },
  { step: 2, title: "Create allowance", placeholder: "Create an allowance to see", example: "POST /order-intents" },
  { step: 3, title: "Reveal card details", placeholder: "Reveal a card to see", example: "POST /order-intents/{id}/credentials" },
];

const METHOD_TONE: Record<ApiTrace["method"], string> = {
  GET: "bg-sky-100 text-sky-800",
  POST: "bg-emerald-100 text-emerald-800",
  PUT: "bg-amber-100 text-amber-800",
  DELETE: "bg-rose-100 text-rose-800",
};

function statusTone(status: number) {
  if (status === 0 || status >= 500) return "text-[#B42318]";
  if (status >= 400) return "text-[#9A6700]";
  return "text-[#0B7A3E]";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-[11px] text-[#00150d]/50 hover:text-[#00150d]"
    >
      {copied ? <Check className="size-3 text-[#05B959]" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const text = value === undefined ? "" : JSON.stringify(value, null, 2);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#00150d]/40">{label}</span>
        {text && <CopyButton text={text} />}
      </div>
      <pre className="max-h-64 overflow-auto rounded-[6px] bg-[#F6F6F6] p-2.5 font-mono text-[11px] leading-[16px] text-[#00150d] whitespace-pre-wrap break-words">
        {text || <span className="text-[#00150d]/40">No body</span>}
      </pre>
    </div>
  );
}

function CallCard({ trace, info }: { trace: ApiTrace; info: Explained }) {
  const [open, setOpen] = useState<null | "request" | "response">(null);
  const failed = !trace.ok;

  return (
    <div
      className={`timeline-card rounded-[8px] border bg-white p-3 ${failed ? "border-[#F4C7C7]" : "border-[rgba(0,0,0,0.08)]"}`}
    >
      {/* Line 1: the call */}
      <div className="flex items-start gap-2">
        <span className={`shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${METHOD_TONE[trace.method]}`}>
          {trace.method}
        </span>
        <span className="min-w-0 flex-1 break-all font-mono text-[11.5px] leading-4 text-[#00150d]" title={trace.url}>
          {trace.path}
        </span>
        <span className={`shrink-0 font-mono text-[11.5px] font-semibold ${statusTone(trace.status)}`}>{trace.status === 0 ? "no response" : trace.status}</span>
        <span className="shrink-0 font-mono text-[10.5px] text-[#00150d]/40">{trace.durationMs} ms</span>
      </div>

      {/* Line 2: what it does */}
      <p className="mt-1.5 text-[12.5px] leading-[18px] text-[#00150d]">
        {info.title}
      </p>

      {/* Line 3: rails and facts */}
      {(info.rails.length > 0 || info.facts.length > 0 || info.error) && (
        <div className="mt-2 space-y-2">
          {info.rails.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {info.rails.map((rail, index) => (
                <RailBadge key={index} rail={rail.rail} provider={rail.provider} status={rail.status} code={rail.code} preferred={rail.preferred} />
              ))}
            </div>
          )}
          {info.facts.map((fact) => (
            <p key={fact} className="text-[11.5px] leading-[16px] text-[#00150d]/65">
              {fact}
            </p>
          ))}
          {info.error && <p className="text-[11.5px] leading-[16px] text-[#B42318] break-words">{info.error}</p>}
        </div>
      )}

      {/* Line 4: raw request and response */}
      <div className="mt-2.5 flex items-center gap-3 text-[11px]">
        {(["request", "response"] as const).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setOpen(open === name ? null : name)}
            className={`inline-flex items-center gap-0.5 capitalize ${open === name ? "text-[#00150d]" : "text-[#00150d]/55 hover:text-[#00150d]"}`}
          >
            {open === name ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            {name}
          </button>
        ))}
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <JsonBlock label="Headers" value={open === "request" ? trace.requestHeaders : trace.responseHeaders} />
          <JsonBlock label="Body" value={open === "request" ? trace.requestBody : trace.responseBody} />
        </div>
      )}
    </div>
  );
}

type Row = { trace: ApiTrace; info: Explained };

export function ApiTimeline({ step: currentStep }: { step: Step }) {
  const traces = useApiLog();
  // Only the calls that tell the story of the flow. Background reads
  // (lists, polls, refreshes) are UI housekeeping and stay out.
  const rows: Row[] = traces.map((trace) => ({ trace, info: explain(trace) })).filter((row) => row.info.important);
  const inStep = rows.filter((row) => row.info.step === currentStep);

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-[family-name:var(--font-heading)] text-[15px] font-medium text-[#00150d]">API calls</h2>
        <span className="text-[11px] text-[#00150d]/45">{inStep.length} in this step</span>
      </div>

      {STEPS.filter(({ step }) => step === currentStep).map(({ step, placeholder, example }) => {
        const own = rows.filter((row) => row.info.step === step);
        const visible = own;
        return (
          <section key={step} className="space-y-2">
            {visible.length === 0 ? (
              <div className="rounded-[8px] border border-dashed border-[rgba(0,0,0,0.12)] px-3 py-2.5 text-[11.5px] leading-[16px] text-[#00150d]/45">
                {placeholder} <span className="font-mono">{example}</span>
              </div>
            ) : (
              visible.map((row) => <CallCard key={row.trace.id} trace={row.trace} info={row.info} />)
            )}
          </section>
        );
      })}

    </div>
  );
}
