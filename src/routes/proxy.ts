import { Hono } from 'hono';
import { requireBearerToken } from '../middleware/auth';

const proxy = new Hono<{ Bindings: Env }>();

// Vendor base URLs
const VENDORS: Record<string, string> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  stripe: 'https://api.stripe.com',
  github: 'https://api.github.com',
};

// Per-vendor header injection — returns the headers to set on the upstream request
type VendorHeadersFn = (env: Env, headers: Headers) => void;
const VENDOR_HEADERS: Record<string, VendorHeadersFn> = {
  // OpenAI: standard Bearer token
  openai: (env, headers) => {
    if (env.OPENAI_API_KEY)
      headers.set('Authorization', `Bearer ${env.OPENAI_API_KEY}`);
  },
  // Anthropic: uses x-api-key header (not Authorization)
  anthropic: (env, headers) => {
    if (env.ANTHROPIC_API_KEY) headers.set('x-api-key', env.ANTHROPIC_API_KEY);
  },
  // Stripe: uses the secret key (sk_...), not the webhook signing secret
  stripe: (env, headers) => {
    if (env.STRIPE_SECRET_KEY)
      headers.set('Authorization', `Bearer ${env.STRIPE_SECRET_KEY}`);
  },
  // GitHub: pass through without modification
  github: () => {},
};

/**
 * Vendor API proxy gateway — ALL /api/proxy/:vendor/* routes.
 *
 * Requires a valid BlackRoad Bearer token (see GET /auth/login).
 * Replaces the Authorization header with the vendor-specific API key
 * stored in Cloudflare secrets, so callers never need raw vendor keys.
 *
 * Example:
 *   POST /api/proxy/openai/v1/chat/completions
 *   Authorization: Bearer <blackroad-jwt>
 *   → forwards to https://api.openai.com/v1/chat/completions
 *     with Authorization: Bearer <OPENAI_API_KEY>
 */
proxy.all('/:vendor/*', requireBearerToken, async (c) => {
  const vendor = c.req.param('vendor').toLowerCase();
  const baseUrl = VENDORS[vendor];
  if (!baseUrl) {
    return c.json(
      {
        error: 'Unknown vendor',
        supported: Object.keys(VENDORS),
      },
      404
    );
  }

  // Build the upstream URL
  const url = new URL(c.req.url);
  const path = url.pathname.replace(`/api/proxy/${vendor}`, '');
  const upstreamUrl = `${baseUrl}${path}${url.search}`;

  // Clone headers, strip the BlackRoad auth header, inject vendor credentials
  const headers = new Headers(c.req.raw.headers);
  headers.delete('Authorization');
  headers.set('User-Agent', 'BlackRoad-OS-Gateway/1.0');

  const injectVendorHeaders = VENDOR_HEADERS[vendor];
  if (injectVendorHeaders) injectVendorHeaders(c.env, headers);

  const upstreamRes = await fetch(upstreamUrl, {
    method: c.req.method,
    headers,
    body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
  });

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: upstreamRes.headers,
  });
});

export default proxy;
