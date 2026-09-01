"use client";

import { CreditCard, Plus } from "lucide-react";
import type { OrderIntentResponse } from "@/lib/crossmint-types";

function OrderIntentItem({ oi }: { oi: OrderIntentResponse }) {
  const description = oi.mandates.find((m) => m.type === "description") as { value: string } | undefined;
  const maxAmount = oi.mandates.find((m) => m.type === "maxAmount") as { value: string; details: { currency: string } } | undefined;
  const limitLabel = maxAmount ? `${maxAmount.value} ${maxAmount.details.currency.toUpperCase()}` : null;

  return (
    <div className="flex items-center gap-3 rounded-lg bg-[#F6F6F6] px-4 py-3">
      <CreditCard className="size-5 text-[#2377FF] shrink-0" />
      <div>
        <div className="text-sm font-medium text-[#00150d]">
          {description?.value ?? "Card Permission"}
        </div>
        {limitLabel && (
          <div className="text-xs text-[#00150d]/50">{limitLabel}</div>
        )}
      </div>
    </div>
  );
}

export function OrderIntentsList({
  orderIntents,
  loading,
  onIssueCardPermission,
  viewMode = "ui",
}: {
  orderIntents: OrderIntentResponse[];
  loading: boolean;
  onIssueCardPermission?: () => void;
  viewMode?: "ui" | "code";
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-[#F6F6F6] px-4 py-3 animate-pulse">
        <div className="size-5 rounded bg-black/[0.08] shrink-0" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 w-36 rounded bg-black/[0.08]" />
          <div className="h-3 w-20 rounded bg-black/[0.05]" />
        </div>
      </div>
    );
  }

  if (orderIntents.length === 0) {
    if (!onIssueCardPermission) return null;
    return (
      <button onClick={onIssueCardPermission} className="flex items-center gap-4 h-[35px] group">
        <div className="bg-white border-[1.5px] border-[rgba(0,0,0,0.1)] rounded-[6px] w-[56px] h-[35px] flex items-center justify-center group-hover:border-[#05B959]/40 transition-colors shrink-0">
          <Plus className="size-5 text-[#00150d] group-hover:text-[#05B959] transition-colors" />
        </div>
        <span className="font-medium text-base text-[#00150d] group-hover:text-[#05B959] transition-colors">
          Create allowance
        </span>
      </button>
    );
  }

  if (viewMode === "code") {
    return (
      <pre className="rounded-lg bg-black/[0.02] p-3 text-xs font-mono text-[#00150d] overflow-auto max-h-96">
        {JSON.stringify(orderIntents, null, 2)}
      </pre>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-[14px]">
        {orderIntents.map((oi) => (
          <OrderIntentItem key={oi.orderIntentId} oi={oi} />
        ))}
      </div>
      {onIssueCardPermission && (
        <button onClick={onIssueCardPermission} className="flex items-center gap-3 pl-4 group">
          <Plus className="size-5 text-[#00150d] group-hover:text-[#05B959] transition-colors shrink-0" />
          <span className="text-sm font-medium text-[#00150d] group-hover:text-[#05B959] transition-colors">
            Create allowance
          </span>
        </button>
      )}
    </div>
  );
}
