// The one visual for "which rail". Names are the API's own.

import type { RailName, RailProvider } from "@/lib/crossmint-types";

type Status = "enabled" | "active" | "pending" | "pending_verification" | "error";

const STATUS_TEXT: Record<Status, string> = {
  enabled: "ready",
  active: "active",
  pending: "setting up",
  pending_verification: "needs verification",
  error: "unavailable",
};

/** Rail name exactly as the API returns it, with the provider code when it has one. */
export function railTitle(rail: RailName, provider?: RailProvider | "stripe"): string {
  if (rail === "encrypted-card") return "encrypted-card";
  if (rail === "spt") return "spt · stripe";
  return provider ? `agentic-token · ${provider}` : "agentic-token";
}

export function RailBadge({
  rail,
  provider,
  status,
  code,
  preferred,
}: {
  rail: RailName;
  provider?: RailProvider | "stripe";
  status?: Status;
  code?: string;
  preferred?: boolean;
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
      className={`inline-flex items-center rounded-[6px] border px-2 py-0.5 font-mono text-[11px] font-medium leading-4 ${tone}`}
      title={tooltip}
    >
      {rail}
    </span>
  );
}
