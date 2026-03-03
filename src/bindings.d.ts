// Extend the generated Cloudflare Env interface with application secrets.
// Set these with: wrangler secret put <NAME>
// See .dev.vars.example for local development.
declare interface Env {
  // Contributor access gate — required on all protected routes
  BLACKROAD_API_KEY: string;
  // OAuth 2.0 (GitHub) credentials
  OAUTH_CLIENT_ID: string;
  OAUTH_CLIENT_SECRET: string;
  // HS256 JWT signing secret (min 32 chars)
  JWT_SECRET: string;
  // Stripe webhook signing secret (whsec_...) and secret key (sk_...)
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_SECRET_KEY: string;
  // Vendor API keys forwarded by the proxy gateway
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
}
