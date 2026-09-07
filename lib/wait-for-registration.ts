import { fetchRegistration } from "@/lib/crossmint-api";
import type { OrderIntentRegistration } from "@/lib/crossmint-types";

const RETRY_DELAYS_MS = [800, 1200, 1600, 2000, 2500, 3000, 3000, 4000];

/** Poll until no registration rail is still pending, or return the last state. */
export async function waitForRegistration(
  jwt: string,
  paymentMethodId: string,
  initial: OrderIntentRegistration,
): Promise<OrderIntentRegistration> {
  let latest = initial;
  for (const delay of RETRY_DELAYS_MS) {
    if (!latest.rails.some((rail) => rail.status === "pending")) return latest;
    await new Promise((resolve) => setTimeout(resolve, delay));
    const next = await fetchRegistration(jwt, paymentMethodId);
    if (next) latest = next;
  }
  return latest;
}
