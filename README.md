

<div align="center">
<img width="200" alt="Image" src="https://github.com/user-attachments/assets/8b617791-cd37-4a5a-8695-a7c9018b7c70" />
<br>
<br>
<h1>Agent Cards Quickstart</h1>

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
- Create an agent to manage card payments
- Save a payment method via Crossmint's embedded UI
- Verify a card for agent-initiated payments with passkey verification
- Give card permissions with per-transaction, daily, and monthly spending rules
- Retrieve secure card numbers (card number, expiration, CVC)

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
1. Create a [production API key](https://docs.crossmint.com/introduction/platform/api-keys/client-side).
