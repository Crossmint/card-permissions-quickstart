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

// ─── Card registration ──────────────────────────────────────────────────────
// One-time step per saved card. It provisions the agentic rails the card
// supports. A card with only errored rails still works through the
// encrypted-card fallback when an allowance is created.
//   - "enabled": the rail can back a new order intent
//   - "pending": provisioning has not finished, poll again
//   - "error": provisioning failed, read error.code

export type RegistrationRailStatus = "enabled" | "pending" | "error";

export type RegistrationRail = {
  rail: "agentic-token";
  provider: RailProvider;
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
//   - "encrypted-card": universal fallback, returns the card as a JWE you decrypt
// Per-rail status:
//   - "active": ready to mint credentials
//   - "pending_verification": the user must verify with their bank (agentic-token only)
//   - "error": this rail cannot be used, read error.code

export type OrderIntentStatus = "active" | "cancelled" | "expired";
export type OrderIntentRailStatus = "active" | "pending_verification" | "error";

// Same discriminated shape as the SDK's OrderIntentRail: `error` exists only on errored rails.
type OrderIntentRailState =
  | { status: "active" | "pending_verification"; error?: never }
  | { status: "error"; error: { code: string } };

type OrderIntentRailBase = OrderIntentRailState & {
  credentialFormats: CredentialFormat[];
};

export type AgenticTokenRail = OrderIntentRailBase & {
  rail: "agentic-token";
  provider: RailProvider;
};

export type EncryptedCardRail = OrderIntentRailBase & {
  rail: "encrypted-card";
  provider?: undefined;
};

export type OrderIntentRail = AgenticTokenRail | EncryptedCardRail;

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

export type EncryptedCardCredentialResponse = {
  rail: "encrypted-card";
  // Compact JWE (RSA-OAEP-256 + A256GCM). Decrypt with the matching private key.
  credential: { format: "card"; value: string };
};

// Normalized card details, whatever rail produced them. Never persist these.
export type AgentCardCredentials = {
  rail: "agentic-token" | "encrypted-card";
  number: string;
  expirationMonth: string;
  expirationYear: string;
  cvc: string;
  // Only the agentic-token rail returns an expiry. The UI applies its own timer otherwise.
  expiresAt?: string;
};
