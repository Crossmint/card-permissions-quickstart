import type { OrderIntentVerificationProps, PaymentMethodManagementAppearance } from "@crossmint/client-sdk-react-ui";

export type VerificationAppearance = NonNullable<OrderIntentVerificationProps["appearance"]>;

export type CvcRecollectionAppearance = PaymentMethodManagementAppearance;

/**
 * CrossmintCvcRecollection shares the embedded-checkout appearance model, where
 * `fontSizeUnit` and `spacingUnit` are multiplier units, not base sizes like in
 * the verification modal above. The hosted page renders label = 3.75 units,
 * input = 4, button = 4.25; paddings scale from `spacingUnit`. The values below
 * are the SDK defaults (15/16/17px); passing the verification `14px` here
 * renders 52px labels. Colours and radii are shared with the modal.
 */
export const cvcRecollectionAppearance: CvcRecollectionAppearance = {
  variables: {
    fontFamily: '"Inter", system-ui, sans-serif',
    fontSizeUnit: "4px",
    spacingUnit: "3.33px",
    borderRadius: "0.5rem",
    colors: {
      accent: "#00C768",
      textPrimary: "#0A1825",
      textSecondary: "#5F6B7A",
      backgroundPrimary: "#ffffff",
      borderPrimary: "#E5E7EB",
      danger: "#ef4444",
    },
  },
  rules: {
    Input: { borderRadius: "0.5rem", colors: { background: "#F9FAFA", border: "#E5E7EB" } },
    PrimaryButton: {
      borderRadius: "0.5rem",
      colors: { text: "#ffffff", background: "#00C768" },
      hover: { colors: { background: "#05CE6C" } },
      disabled: { colors: { background: "#A3E4C1" } },
    },
  },
};

export const verificationAppearance: VerificationAppearance = {
  variables: {
    fontFamily: '"Inter", system-ui, sans-serif',
    fontSizeUnit: "14px",
    spacingUnit: "16px",
    borderRadius: "0.5rem",
    colors: {
      accent: "#00C768",
      textPrimary: "#0A1825",
      textSecondary: "#5F6B7A",
      backgroundPrimary: "#ffffff",
      backgroundSecondary: "#F9FAFA",
      border: "#E5E7EB",
      danger: "#ef4444",
      success: "#00C768",
    },
  },
  rules: {
    Overlay: { colors: { background: "rgba(0, 0, 0, 0.4)" } },
    Modal: { borderRadius: "0.625rem", colors: { border: "#E5E7EB" } },
    Input: {
      borderRadius: "0.5rem",
      colors: { background: "#F9FAFA", border: "#E5E7EB" },
    },
    PrimaryButton: {
      borderRadius: "0.5rem",
      colors: { text: "#ffffff", background: "#00C768" },
      hover: { colors: { background: "#05CE6C" } },
      disabled: { colors: { background: "#A3E4C1" } },
    },
    SecondaryButton: {
      colors: { text: "#0A1825", background: "#F0F1F1" },
      hover: { colors: { background: "#E5E7EB" } },
    },
    CloseButton: {
      colors: { background: "transparent" },
      hover: { colors: { background: "#F0F1F1" } },
    },
    Radio: {
      colors: { border: "#E5E7EB" },
      selected: {
        colors: { border: "#00C768", background: "#00C768", dot: "#ffffff" },
      },
    },
  },
};
