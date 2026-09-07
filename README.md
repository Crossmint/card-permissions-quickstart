

<div align="center">
<img width="200" alt="Image" src="https://github.com/user-attachments/assets/8b617791-cd37-4a5a-8695-a7c9018b7c70" />
<br>
<br>
<h1>Card Permissions Quickstart</h1>

<div align="center">
<a href="https://virtual-cards.demos-crossmint.com">Live Demo</a> | <a href="https://docs.crossmint.com/agents/overview">Docs</a> | <a href="https://www.crossmint.com/quickstarts">See all quickstarts</a>
</div>

<br>
<br>
</div>

## Introduction
Give agents permission to pay with a user's card through Crossmint's Agentic Payments API. This quickstart demonstrates the full flow from user authentication to granting scoped card permissions with spending rules — for both human users and AI agents.

**Learn how to:**
- Authenticate a user via Stytch (Google OAuth)
- Save a payment method via Crossmint's embedded UI
- Register a card for agent payments and read which rails it supports
- Create an allowance (order intent) with an amount, an expiry, and an optional merchant
- Verify an allowance with the user's bank when the network rail asks for it
- Retrieve card details through the Visa/Mastercard rail, or through the encrypted-card fallback for cards the networks do not support

## How the fallback works
An order intent exposes one or more **rails**. Each rail is an independent way to spend the same allowance:

| Rail | Cards | Verification | Credential |
|------|-------|--------------|------------|
| `agentic-token` | Visa (`vic`) and Mastercard (`agentpay`) | Bank verification on the first allowance | One-time card number, expires with `expiresAt` |
| `encrypted-card` | Any eligible saved card | None | The saved card as a JWE, decrypted in the browser |

The app picks the first active rail that can mint a `card` credential. It prefers `agentic-token` and falls back to `encrypted-card`. See `lib/rails.ts` and `lib/card-credentials.ts`.

For the encrypted-card rail the browser generates a one-time RSA-OAEP-256 keypair with WebCrypto, sends only the public JWK, and decrypts the returned JWE with `jose`. The private key and the card number never reach this app's server. See `lib/encrypted-card.ts`.

## Deploy
Easily deploy the template to Vercel with the button below. You will need to set the required environment variables in the Vercel dashboard.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FCrossmint%2Fcard-permissions-quickstart&env=NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN,NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY)

## Setup
1. Clone the repository and navigate to the project folder:
```bash
git clone https://github.com/Crossmint/card-permissions-quickstart.git && cd card-permissions-quickstart
```

2. Install all dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

3. Set up the environment variables:
```bash
cp .env.example .env.local
```

4. Get a Crossmint client API key from [here](https://docs.crossmint.com/introduction/platform/api-keys/client-side) and a Stytch public token from the [Stytch dashboard](https://stytch.com/dashboard), then add them to the `.env.local` file:
```bash
NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN=your_stytch_public_token
NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY=your_crossmint_client_api_key
```

5. Configure Stytch redirect URLs:

   In your [Stytch dashboard](https://stytch.com/dashboard/redirect-urls), add `http://localhost:3000/login` as a redirect URL for both **Login** and **Signup** under OAuth.

6. Run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

## Using in production
1. Create a [production API key](https://docs.crossmint.com/introduction/platform/api-keys/client-side) and set it as `NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY`. The app reads the key prefix to pick the environment: `ck_staging_` calls `staging.crossmint.com`, `ck_production_` calls `www.crossmint.com`. See `lib/crossmint-env.ts`.
2. Use a live Stytch project and add your production URL to its redirect URLs.
3. Register your Stytch project in the Crossmint production console under "3P Auth providers".
4. In production only real cards work. The staging test cards are rejected and the test card hint is hidden. Cards the networks do not support fall back to the `encrypted-card` rail.