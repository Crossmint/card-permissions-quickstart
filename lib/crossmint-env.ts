// The Crossmint environment follows the API key prefix, so switching between
// staging and production only requires changing NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY.
//   ck_staging_...    → https://staging.crossmint.com
//   ck_production_... → https://www.crossmint.com

export const CROSSMINT_API_KEY = process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY ?? "";

export const CROSSMINT_ENVIRONMENT: "production" | "staging" = CROSSMINT_API_KEY.startsWith("ck_production_")
  ? "production"
  : "staging";

export const IS_PRODUCTION = CROSSMINT_ENVIRONMENT === "production";

export const CROSSMINT_BASE_URL =
  CROSSMINT_ENVIRONMENT === "production"
    ? "https://www.crossmint.com/api/unstable"
    : "https://staging.crossmint.com/api/unstable";
