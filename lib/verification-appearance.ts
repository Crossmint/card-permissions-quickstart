import type { OrderIntentVerificationProps } from "@crossmint/client-sdk-react-ui";

export type VerificationAppearance = NonNullable<OrderIntentVerificationProps["appearance"]>;

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
