"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  useStytch,
  useStytchUser,
  StytchLogin,
  Products,
} from "@stytch/nextjs";
import { LandingPage } from "@/components/landing-page";

const loginPresentation = {
  theme: { "container-border": "transparent" },
};

function getLoginConfig() {
  // Only called after Stytch has initialized, which happens on the client
  // after hydration — so window is always available here.
  const redirectUrl = `${window.location.origin}/login`;
  return {
    products: [Products.oauth],
    oauthOptions: {
      providers: [{ type: "google" as const }],
      loginRedirectURL: redirectUrl,
      signupRedirectURL: redirectUrl,
    },
  };
}

function getOAuthCallbackToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("stytch_token_type") === "oauth" ? params.get("token") : null;
}

// After Stytch redirects back with ?token=...&stytch_token_type=oauth,
// exchange the token for a session and clean up the URL.
function useStytchTokenAuth() {
  const stytch = useStytch();
  const { user, isInitialized } = useStytchUser();

  // Read the callback token only after init so this is never evaluated during
  // SSR/hydration (isInitialized is false on both the server and first paint).
  const token = isInitialized ? getOAuthCallbackToken() : null;

  useEffect(() => {
    if (!token || user) return;
    stytch.oauth
      .authenticate(token, { session_duration_minutes: 60 })
      .catch((err) => console.error("Stytch OAuth authentication failed:", err))
      .finally(() => window.history.replaceState({}, "", "/login"));
  }, [token, stytch, user]);

  return !!token && !user;
}

function LoginSpinner() {
  return (
    <div className="flex items-center justify-center min-h-dvh bg-[#F7F5F4]">
      <Loader2 className="size-5 animate-spin text-[#05B959]" />
    </div>
  );
}

export default function LoginPage() {
  const { user, isInitialized } = useStytchUser();
  const authenticating = useStytchTokenAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  // isInitialized is false on the server and on the client's first paint,
  // so this spinner is the only tree that hydrates. Auth-dependent UI
  // (session user, OAuth token, window.location) is deferred until after.
  if (!isInitialized || authenticating || user) {
    return <LoginSpinner />;
  }

  return (
    <LandingPage>
      <div className="w-full max-w-md bg-white rounded-3xl border shadow-lg overflow-hidden flex items-center justify-center">
        <StytchLogin config={getLoginConfig()} presentation={loginPresentation} />
      </div>
    </LandingPage>
  );
}
