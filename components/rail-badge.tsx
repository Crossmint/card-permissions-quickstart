"use client";

// The one visual for "which rail". Names are the API's own.

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { RailName, RailProvider } from "@/lib/crossmint-types";

type Status = "enabled" | "active" | "pending" | "pending_verification" | "error";

const STATUS_TEXT: Record<Status, string> = {
  enabled: "ready",
  active: "active",
  pending: "setting up",
  pending_verification: "needs verification",
  error: "unavailable",
};

type RailItem = {
  rail: RailName;
  provider?: RailProvider | "stripe";
  status?: Status;
  error?: { code: string } | null;
};

/** Rail name exactly as the API returns it, with the provider code when it has one. */
export function railTitle(rail: RailName, provider?: RailProvider | "stripe"): string {
  if (rail === "encrypted-card") return "encrypted-card";
  if (rail === "spt") return "spt · stripe";
  return provider ? `agentic-token · ${provider}` : "agentic-token";
}

function badgeProvider(
  rail: RailName,
  provider?: RailProvider | "stripe",
): RailProvider | "stripe" | undefined {
  if (rail === "agentic-token") return provider;
  if (rail === "spt") return "stripe";
  return undefined;
}

function railHint(rail: RailName): string {
  if (rail === "encrypted-card") return "Saved card, decrypted in this tab";
  if (rail === "spt") return "Stripe Shared Payment Token";
  return "One-time card from the network";
}

export function RailBadge({
  rail,
  provider,
  status,
  code,
  preferred,
  muted,
}: {
  rail: RailName;
  provider?: RailProvider | "stripe";
  status?: Status;
  code?: string;
  preferred?: boolean;
  selected?: boolean;
  muted?: boolean;
  compact?: boolean;
}) {
  // Only the rail name is shown. Provider, status and error code stay in the tooltip.
  const isError = status === "error";
  const isPending = status === "pending" || status === "pending_verification";
  const tone = isError
    ? "border-[#F4C7C7] bg-[#FDF2F2] text-[#B42318]"
    : isPending
      ? "border-[#E6C87A] bg-[#FFF8E1] text-[#9A6700]"
      : rail === "encrypted-card"
        ? "border-[#BFD6FF] bg-[#EEF4FF] text-[#1D4ED8]"
        : rail === "spt"
          ? "border-[#D9C8FF] bg-[#F4EEFF] text-[#6D28D9]"
          : "border-[#B7E9CB] bg-[#EDFBF2] text-[#0B7A3E]";
  const tooltip = [railTitle(rail, provider), status && STATUS_TEXT[status], code, preferred && "preferred"].filter(Boolean).join(" · ");

  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-[6px] border px-2 py-0.5 font-mono text-[11px] font-medium leading-4 ${tone} ${muted ? "opacity-45" : ""}`}
      title={tooltip}
    >
      {rail}
    </span>
  );
}

export function RailRow({
  rails,
  muted,
}: {
  rails: RailItem[];
  selected?: RailName;
  onSelect?: (rail: RailName) => void;
  muted?: boolean;
  label?: string;
}) {
  if (rails.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {rails.map((item) => {
        const provider = badgeProvider(item.rail, item.provider);
        return (
          <RailBadge
            key={`${item.rail}-${provider ?? "default"}`}
            rail={item.rail}
            provider={provider}
            status={item.status}
            code={item.status === "error" ? item.error?.code : undefined}
            muted={muted}
          />
        );
      })}
    </div>
  );
}

/** Closed until clicked. Nothing is chosen until the user picks a rail. */
export function RailSelect({
  rails,
  selected,
  onSelect,
  disabled,
}: {
  rails: RailItem[];
  selected?: RailName;
  onSelect: (rail: RailName) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedItem = rails.find((item) => item.rail === selected);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (rails.length === 0) return null;

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Choose rail"
        className={`inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-1 transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
          selectedItem
            ? "border-[rgba(0,0,0,0.12)] bg-white hover:border-[#05B959]/60"
            : "border-dashed border-[#05B959]/60 bg-white hover:bg-[#F5FCF8]"
        }`}
      >
        {selectedItem ? (
          <RailBadge
            rail={selectedItem.rail}
            provider={badgeProvider(selectedItem.rail, selectedItem.provider)}
            status={selectedItem.status}
          />
        ) : (
          <span className="font-mono text-[11px] font-medium leading-4 text-[#05B959]">choose rail</span>
        )}
        <ChevronDown className={`size-3 shrink-0 text-[#00150d]/35 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && !disabled && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1 min-w-[15rem] bg-white rounded-[8px] border border-[rgba(0,0,0,0.1)] shadow-lg py-1 z-50"
        >
          {rails.map((item) => {
            const provider = badgeProvider(item.rail, item.provider);
            const isSelected = selected === item.rail;
            return (
              <button
                key={`${item.rail}-${provider ?? "default"}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onSelect(item.rail);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#F6F6F6] transition-colors text-left"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <RailBadge rail={item.rail} provider={provider} status={item.status} />
                  <div className="text-[11px] text-[#00150d]/50">{railHint(item.rail)}</div>
                </div>
                <span className="w-4 shrink-0">{isSelected && <Check className="size-4 text-[#05B959]" />}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
