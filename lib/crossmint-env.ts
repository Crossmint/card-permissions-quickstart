// Crossmint environment selection.
//
// NEXT_PUBLIC_CROSSMINT_ENVIRONMENT picks the environment explicitly:
//   staging    → https://staging.crossmint.com
//   production → https://www.crossmint.com
//
// When it is unset, the API key prefix decides: ck_production_ selects
// production, anything else selects staging. When both are set they must
// agree, because the API rejects a key from the other environment.

export type CrossmintEnvironment = "staging" | "production";

export const CROSSMINT_API_KEY = process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY ?? "";

const ENVIRONMENT_FROM_KEY: CrossmintEnvironment = CROSSMINT_API_KEY.startsWith("ck_production_")
  ? "production"
  : "staging";

function resolveEnvironment(): CrossmintEnvironment {
  const raw = process.env.NEXT_PUBLIC_CROSSMINT_ENVIRONMENT?.trim().toLowerCase();
  if (!raw) return ENVIRONMENT_FROM_KEY;

  if (raw !== "staging" && raw !== "production") {
    throw new Error(
      `Invalid NEXT_PUBLIC_CROSSMINT_ENVIRONMENT="${raw}". Use "staging" or "production".`,
    );
  }

  if (CROSSMINT_API_KEY && raw !== ENVIRONMENT_FROM_KEY) {
    throw new Error(
      `NEXT_PUBLIC_CROSSMINT_ENVIRONMENT is "${raw}" but NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY is a ${ENVIRONMENT_FROM_KEY} key ` +
        `(prefix "ck_${ENVIRONMENT_FROM_KEY}_"). Use a key from the same environment.`,
    );
  }

  return raw;
}

export const CROSSMINT_ENVIRONMENT: CrossmintEnvironment = resolveEnvironment();

export const IS_PRODUCTION = CROSSMINT_ENVIRONMENT === "production";

export const CROSSMINT_BASE_URL = IS_PRODUCTION
  ? "https://www.crossmint.com/api/unstable"
  : "https://staging.crossmint.com/api/unstable";
