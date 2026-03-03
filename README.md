# BlackRoad OS Container Gateway

> **© 2026 BlackRoad OS, Inc. — Proprietary & Confidential**  
> CEO: Alexa Amundson · blackroad.systems@gmail.com  
> See [LICENSE](LICENSE) for complete terms.

A production-grade Cloudflare Workers + Container API gateway for **BlackRoad OS, Inc.**  
All vendor API traffic (OpenAI, Anthropic, Stripe, GitHub) routes through this gateway — no raw vendor keys ever leave your infrastructure.

<!-- dash-content-start -->

## Architecture

```
Client
  │
  │  X-BlackRoad-API-Key  (contributor access gate)
  │  Authorization: Bearer <jwt>  (OAuth session token)
  ▼
Cloudflare Worker  (src/index.ts — Hono)
  ├─ GET  /auth/login          → GitHub OAuth redirect
  ├─ GET  /auth/callback       → JWT issuance
  ├─ POST /webhook/stripe      → Stripe event handling (HMAC-verified)
  └─ ALL  /api/proxy/:vendor/* → Vendor API proxy
             ├─ openai    → https://api.openai.com
             ├─ anthropic → https://api.anthropic.com
             ├─ stripe    → https://api.stripe.com
             └─ github    → https://api.github.com
  └─ GET /container/:id  → Routed Cloudflare Container (Go)
  └─ GET /lb             → Load-balanced Container pool
  └─ GET /singleton      → Singleton Container instance
```

<!-- dash-content-end -->

## Access Control

Access to protected routes requires **two** credentials:

| Header | Value | Where to get it |
|--------|-------|-----------------|
| `X-BlackRoad-API-Key` | Your contributor API key | See [CONTRIBUTING.md](CONTRIBUTING.md) |
| `Authorization` | `Bearer <jwt>` | Call `GET /auth/login` → OAuth flow → receive JWT |

Public routes (no credentials required): `/auth/*`, `/webhook/stripe`

## Getting Started

### 1 — Install dependencies

```bash
npm install
```

### 2 — Configure secrets

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your actual values
```

Required secrets (see `.dev.vars.example` for full list):

| Secret | Description |
|--------|-------------|
| `BLACKROAD_API_KEY` | Contributor access gate key |
| `OAUTH_CLIENT_ID` | GitHub OAuth App client ID |
| `OAUTH_CLIENT_SECRET` | GitHub OAuth App client secret |
| `JWT_SECRET` | HS256 signing secret (≥ 32 chars) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_…`) |
| `STRIPE_SECRET_KEY` | Stripe secret key for API proxy (`sk_…`) |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |

### 3 — Run locally

```bash
npm run dev
```

Open [http://localhost:8787](http://localhost:8787) to see available endpoints.

## OAuth 2.0 Authentication

1. Create a GitHub OAuth App at <https://github.com/settings/developers>  
   Set callback URL to `https://<your-worker>.workers.dev/auth/callback`
2. Call `GET /auth/login` — you will be redirected to GitHub
3. After approval, GitHub redirects to `/auth/callback` and you receive a JWT
4. Use the JWT as `Authorization: Bearer <token>` on protected routes

## Vendor API Proxy

Route any vendor API call through the gateway instead of calling vendors directly:

```bash
# OpenAI — no raw API key needed by the caller
curl -X POST https://<worker>/api/proxy/openai/v1/chat/completions \
  -H "X-BlackRoad-API-Key: <your-key>" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'

# Anthropic
curl -X POST https://<worker>/api/proxy/anthropic/v1/messages \
  -H "X-BlackRoad-API-Key: <your-key>" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-opus-4-5","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'
```

Supported vendors: `openai`, `anthropic`, `stripe`, `github`

## Stripe Integration

Point your Stripe webhook to `POST https://<worker>/webhook/stripe`  
The endpoint verifies the `Stripe-Signature` header before processing any event.

Handled events: `payment_intent.succeeded`, `payment_intent.payment_failed`,  
`customer.subscription.created`, `customer.subscription.deleted`, `checkout.session.completed`

## Deploying to Production

```bash
# Set production secrets (run once per secret)
wrangler secret put BLACKROAD_API_KEY
wrangler secret put OAUTH_CLIENT_ID
wrangler secret put OAUTH_CLIENT_SECRET
wrangler secret put JWT_SECRET
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY

# Deploy
npm run deploy
```

| Command | Action |
|---------|--------|
| `npm run dev` | Local development server |
| `npm run deploy` | Deploy to Cloudflare |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` |

## Network Routing Clarification

**Confirmed:** API traffic flows **outbound from your device to vendor servers**.  
There is no inbound tunnel from OpenAI, Anthropic, or any other vendor into your Raspberry Pi cluster or Tailscale mesh by default.

This gateway changes that model: after deploying, your applications call **this Worker** instead of vendor APIs directly. The Worker, running at Cloudflare's edge, forwards calls to vendors using secrets you control. Your clients never hold raw vendor API keys.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).  
By submitting a pull request you agree that your contribution becomes the property of **BlackRoad OS, Inc.**

---

## 📜 License & Copyright

**Copyright © 2026 BlackRoad OS, Inc. All Rights Reserved.**  
**PROPRIETARY AND CONFIDENTIAL — NOT FOR COMMERCIAL RESALE**

CEO: Alexa Amundson · blackroad.systems@gmail.com  
See [LICENSE](LICENSE) for complete terms.
