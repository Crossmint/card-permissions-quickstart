"use client";

import { createStytchClient, StytchProvider } from "@stytch/nextjs";
import {
  CrossmintProvider,
  CrossmintWalletProvider,
} from "@crossmint/client-sdk-react-ui";
import { CROSSMINT_API_KEY } from "@/lib/crossmint-env";

const stytch = createStytchClient(
  process.env.NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN!
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StytchProvider stytch={stytch}>
      <CrossmintProvider apiKey={CROSSMINT_API_KEY}>
        <CrossmintWalletProvider>
          {children}
        </CrossmintWalletProvider>
      </CrossmintProvider>
    </StytchProvider>
  );
}
