import { fetchRegistration } from "@/lib/crossmint-api";
import type { OrderIntentRegistration } from "@/lib/crossmint-types";
import { isRegistrationSettled } from "@/lib/rails";

const RETRY_DELAYS_MS = [800, 1200, 1600, 2000, 2500, 3000, 3000, 4000];

/** Thrown when the registration is still pending after the polling budget. Carries the last state. */
export class RegistrationPendingError extends Error {
  readonly registration: OrderIntentRegistration;
  constructor(registration: OrderIntentRegistration) {
    super("The card networks have not finished enrolling this card yet.");
    this.name = "RegistrationPendingError";
    this.registration = registration;
  }
}

/** Poll until no registration rail is still pending. Throws RegistrationPendingError when the budget runs out. */
export async function waitForRegistration(
  jwt: string,
  paymentMethodId: string,
  initial: OrderIntentRegistration,
): Promise<OrderIntentRegistration> {
  let latest = initial;
  for (const delay of RETRY_DELAYS_MS) {
    if (isRegistrationSettled(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, delay));
    const next = await fetchRegistration(jwt, paymentMethodId);
    if (next) latest = next;
  }
  if (isRegistrationSettled(latest)) return latest;
  throw new RegistrationPendingError(latest);
}
