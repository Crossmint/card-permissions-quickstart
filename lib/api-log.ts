// Client-side log of Crossmint API calls, fed by lib/crossmint-api.ts.
// A plain module store so non-React code (lib/card-credentials.ts) can append,
// plus a hook for components. Kept in memory only: a reload starts clean.

import { useSyncExternalStore } from "react";
import type { ApiTrace } from "@/lib/api-trace";

const MAX_ENTRIES = 300;

let entries: ApiTrace[] = [];
const listeners = new Set<() => void>();

export function addTraces(traces: ApiTrace[]) {
  if (traces.length === 0) return;
  // Oldest first, so the timeline reads top to bottom.
  entries = [...entries, ...traces].slice(-MAX_ENTRIES);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: ApiTrace[] = [];

/** All recorded calls, oldest first. */
export function useApiLog(): ApiTrace[] {
  return useSyncExternalStore(subscribe, () => entries, () => EMPTY);
}
