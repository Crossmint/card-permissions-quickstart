import { checkEnrollment } from "@/lib/crossmint-api";

const RETRY_DELAYS_MS = [400, 800, 1200, 1600, 2000, 2000, 2500, 3000, 3000, 4000];

/** Poll until Crossmint reports the enrollment as active, or throw. */
export async function waitForActiveEnrollment(jwt: string, paymentMethodId: string) {
  let lastStatus = "unknown";

  for (const delay of RETRY_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    const res = await checkEnrollment(jwt, paymentMethodId);
    lastStatus = res.status;
    if (res.status === "active") return res;
  }

  throw new Error(
    `Card verification did not finish (status: ${lastStatus}). Complete the Mastercard prompt and try again.`,
  );
}
