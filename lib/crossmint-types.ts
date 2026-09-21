// ─── Crossmint API types ────────────────────────────────────────────────────
// Mirrors https://docs.crossmint.com/api-reference/agentic-commerce (unstable).

export type PaymentMethodResponse = {
  paymentMethodId: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    expiration: { month: string; year: string };
  };
};

export type Merchant = {
  name: string;
  url: string;
  countryCode: string;
};

// The card networks that back the agentic-token rail:
//   - "vic": Visa Intelligent Commerce
//   - "agentpay": Mastercard Agent Pay
export type RailProvider = "vic" | "agentpay";
export type CredentialFormat = "card" | "network-token";
export type SptCredentialFormat = "identifier";
export type RailName = "agentic-token" | "encrypted-card" | "spt";

// ─── Card registration ──────────────────────────────────────────────────────
// One-time step per saved card. It provisions the agentic rails the card
// supports, plus the Stripe Shared Payment Token rail when entitled. The
// encrypted-card rail is used on the allowance, including as fallback when another rail fails to mint.
//   - "enabled": the rail can back a new order intent
//   - "pending": provisioning has not finished, poll again
//   - "error": provisioning failed, read error.code

export type RegistrationRailStatus = "enabled" | "pending" | "error";

export type RegistrationRail =
  | {
      rail: "agentic-token";
      provider: RailProvider;
      status: RegistrationRailStatus;
      error?: { code: string } | null;
    }
  | {
      rail: "spt";
      provider: "stripe";
      status: RegistrationRailStatus;
      error?: { code: string } | null;
    };

export type OrderIntentRegistration = {
  paymentMethodId: string;
  rails: RegistrationRail[];
};

// ─── Order intents (allowances) ─────────────────────────────────────────────
// An order intent is a spending allowance on a saved card. It exposes one or
// more rails, each an independent way to pay from the same allowance:
//   - "agentic-token": Visa/Mastercard network rail, mints a one-time card number
//   - "encrypted-card": fallback on an active allowance, returns the card as a JWE you decrypt
//   - "spt": Stripe Shared Payment Token rail, returns a token identifier
// Per-rail status:
//   - "active": ready to mint credentials
//   - "pending_verification": the user must verify with their bank
//   - "error": this rail cannot be used, read error.code

export type OrderIntentStatus = "active" | "cancelled" | "expired";
export type OrderIntentRailStatus = "active" | "pending_verification" | "error";

// Same discriminated shape as the SDK's OrderIntentRail: `error` exists only on errored rails.
type OrderIntentRailState =
  | { status: "active" | "pending_verification"; error?: never }
  | { status: "error"; error: { code: string } };

export type AgenticTokenRail = OrderIntentRailState & {
  rail: "agentic-token";
  provider: RailProvider;
  credentialFormats: CredentialFormat[];
};

export type EncryptedCardRail = {
  rail: "encrypted-card";
  status: "active";
  error?: never;
  credentialFormats: "card"[];
};

export type SptRail = OrderIntentRailState & {
  rail: "spt";
  provider: "stripe";
  credentialFormats: SptCredentialFormat[];
};

export type OrderIntentRail = AgenticTokenRail | EncryptedCardRail | SptRail;

export type OrderIntentVerificationConfig = {
  environment: "production" | "test";
  publicApiKey: string;
  allowanceId: string;
};

export type OrderIntentAmount = {
  total: string;
  spent: string;
  reserved: string;
  available: string;
  currency: string;
};

export type OrderIntentResponse = {
  orderIntentId: string;
  paymentMethodId: string;
  status: OrderIntentStatus;
  amount: OrderIntentAmount;
  merchant?: Merchant;
  description: string;
  rails: OrderIntentRail[];
  // Present only while at least one rail is pending_verification.
  verificationConfig?: OrderIntentVerificationConfig;
  expiresAt: string;
};

export type CreateOrderIntentInput = {
  paymentMethodId: string;
  amount: { value: string; currency: string };
  description: string;
  expiresAt: string;
  // Optional. When set here, credential requests do not repeat it.
  merchant?: Merchant;
};

// ─── Credentials ────────────────────────────────────────────────────────────

export type RsaPublicJwk = { kty: "RSA"; n: string; e: string };

export type CardCredentialValue = {
  number: string;
  expirationMonth: string | number;
  expirationYear: string | number;
  cvc: string;
};

export type AgenticTokenCredentialResponse = {
  id: string;
  rail: "agentic-token";
  provider: RailProvider;
  amount: { value: string; currency: string };
  credential: { format: "card"; value: CardCredentialValue };
  expiresAt: string;
};

export type SptCredentialResponse = {
  id: string;
  rail: "spt";
  provider: "stripe";
  amount: { value: string; currency: string };
  credential: { format: "identifier"; value: string };
  expiresAt: string;
};

export type SptCredentialInput = {
  amount: { value: string; currency: string };
  merchant?: Merchant;
  networkBusinessProfile: string;
};

export type EncryptedCardCredentialResponse = {
  rail: "encrypted-card";
  // Compact JWE (RSA-OAEP-256 + A256GCM). Decrypt with the matching private key.
  credential: { format: "card"; value: string };
};

// Normalized credentials, whatever rail produced them. Never persist these.
export type RevealedCredentials =
  | {
      kind: "card";
      rail: Exclude<RailName, "spt">;
      number: string;
      expirationMonth: string;
      expirationYear: string;
      cvc: string;
      expiresAt?: string;
    }
  | {
      kind: "spt";
      rail: "spt";
      token: string;
      expiresAt: string;
    };

export type AgentCardCredentials = Extract<RevealedCredentials, { kind: "card" }>;
