// ─── Crossmint API types ────────────────────────────────────────────────────

export type AgenticEnrollmentVerificationConfig = {
  environment: "production" | "test";
  publicApiKey: string;
};

export type OrderIntentVerificationConfig = AgenticEnrollmentVerificationConfig & {
  agentId: string;
  instructionId: string;
};

export type PaymentMethodResponse = {
  paymentMethodId: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    expiration: { month: string; year: string };
  };
};

// Agentic enrollment status:
//   - "not_started": card has never been enrolled
//   - "pending": enrollment initiated, waiting for passkey verification
//   - "active": enrollment complete, agent can use this card
export type AgenticEnrollmentResponse =
  | { status: "not_started" }
  | { enrollmentId: string; status: "active" }
  | { enrollmentId: string; status: "pending"; verificationConfig: AgenticEnrollmentVerificationConfig };

export type AgentResponse = {
  agentId: string;
  metadata: { name: string; description?: string };
};

// Mandates define the rules/constraints for an order intent (card permission):
//   - maxAmount: spending limit per transaction/day/month/year
//   - description: free-text description of intended use
//   - prompt: instructions for the agent
export type Mandate =
  | { type: "maxAmount"; value: string; details: { currency: string; period?: "weekly" | "monthly" | "yearly" } }
  | { type: "description"; value: string }
  | { type: "prompt"; value: string };

// Order intent phases:
//   - "requires-verification": passkey authorization needed before the card is active
//   - "active": card permission is ready, credentials can be fetched
//   - "expired": card permission has expired and can no longer be used
export type OrderIntentResponse =
  | {
      orderIntentId: string;
      agentId: string;
      phase: "requires-verification";
      payment: { paymentMethodId: string };
      mandates: Mandate[];
      verificationConfig: OrderIntentVerificationConfig;
    }
  | {
      orderIntentId: string;
      agentId: string;
      phase: "active" | "expired";
      payment: { paymentMethodId: string };
      mandates: Mandate[];
    };

export type CardCredentials = {
  card: {
    number: string;
    expirationMonth: string;
    expirationYear: string;
    cvc: string;
  };
  expiresAt: string;
};
