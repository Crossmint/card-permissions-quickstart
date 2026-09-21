

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
- Retrieve card details through the Visa/Mastercard rail, encrypted-card, or Stripe Shared Payment Token rail. If the selected rail fails to mint, the app reveals the saved card on `encrypted-card`.

## How rails work
An order intent exposes one or more **rails**. Each rail is an independent way to spend the same allowance:

| Rail | Cards | Verification | Credential |
|------|-------|--------------|------------|
| `agentic-token` | Visa (`vic`) and Mastercard (`agentpay`) | Bank verification on the first allowance | One-time card number, expires with `expiresAt` |
| `spt` | Stripe merchants | Verification may be required | Stripe Shared Payment Token identifier |
| `encrypted-card` | Any eligible saved card | None | The saved card as a JWE, decrypted in the browser |

The app prefers `agentic-token` when it is active and lets you pick another active rail. If that mint fails and the allowance still has balance, it immediately retries on `encrypted-card`. The `spt` rail needs a Stripe Network Business Profile ID. See `lib/rails.ts` and `lib/card-credentials.ts`.

For the encrypted-card rail the browser generates a one-time RSA-OAEP-256 keypair with WebCrypto, sends only the public JWK, and decrypts the returned JWE with `jose`. The private key and the card number never reach this app's server. See `lib/encrypted-card.ts`.

When you select `encrypted-card` in Step 3, reveal and decrypt are two steps. Paste an RSA 2048 public key in PEM (`BEGIN PUBLIC KEY`, SPKI), or click "Generate a keypair" to fill one in. "Reveal details" sends that key and shows the returned JWE, not the card. Then paste the matching private key (`BEGIN PRIVATE KEY`, PKCS#8) under "Decrypt in this browser" and click "Decrypt" to read the card locally. The generated private key is prefilled there. The fallback after a failed mint uses a one-time key and decrypts at once.

## See the API calls
The app shows one step at a time. The column on the right lists the Crossmint API calls that step makes, as they happen: method, path, status, a one-line explanation, the rail involved, and the raw request and response. Only the calls that tell the story appear; list and poll reads stay in the server log.

Every call runs through `crossmintFetch()` in `lib/crossmint-api.server.ts`, which records an `ApiTrace` next to the data. `lib/crossmint-api.ts` unwraps it for the components and appends the traces to `lib/api-log.ts`. Secrets never enter the log: the JWT, the API key, card numbers, the JWE, and the public key are redacted on the server. See `lib/api-trace.ts` and `lib/api-explain.ts`.

Rail names in the UI are the API's own: `agentic-token` with its `provider`, `spt` with Stripe, or `encrypted-card`.

## Deploy
Easily deploy the template to Vercel with the button below. You will need to set the required environment variables in the Vercel dashboard.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FCrossmint%2Fcard-permissions-quickstart&env=NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN,NEXT_PUBLIC_CROSSMINT_ENVIRONMENT,NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY)

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
NEXT_PUBLIC_CROSSMINT_ENVIRONMENT=staging
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

## Staging and production
The app reads two environment variables to pick the Crossmint environment. See `lib/crossmint-env.ts`.

| Variable | Staging | Production |
|----------|---------|------------|
| `NEXT_PUBLIC_CROSSMINT_ENVIRONMENT` | `staging` | `production` |
| `NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY` | `ck_staging_...` | `ck_production_...` |
| `NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN` | Stytch test project | Stytch live project |

Rules:
- `NEXT_PUBLIC_CROSSMINT_ENVIRONMENT` is optional. When it is unset, the API key prefix decides.
- When both are set they must agree. The app throws at startup if the key belongs to the other environment.
- `staging` calls `staging.crossmint.com`. `production` calls `www.crossmint.com`.

To go to production:
1. Create a [production API key](https://docs.crossmint.com/introduction/platform/api-keys/client-side) in the Crossmint production console.
2. Set `NEXT_PUBLIC_CROSSMINT_ENVIRONMENT=production` and `NEXT_PUBLIC_CROSSMINT_CLIENT_API_KEY=ck_production_...`.
3. Add every origin the app runs on to the key's allowed origins in the console, for example `http://localhost:3000` and your deploy URL. Production rejects client-side keys from other origins. The server actions forward the browser `Origin` header for this check. See `lib/crossmint-api.ts`.
4. Use a live Stytch project and add your production URL to its redirect URLs.
5. Register your Stytch project in the Crossmint production console under "3P Auth providers".
6. In production only real cards work. The staging test cards are rejected and the test card hint is hidden. If a network rail fails to mint, the app falls back to `encrypted-card`.
