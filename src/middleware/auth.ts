import type { Context, Next } from 'hono';

const API_KEY_HEADER = 'X-BlackRoad-API-Key';

/**
 * Contributor access gate.
 * Every request must include a valid X-BlackRoad-API-Key header.
 * Keys are provisioned via `wrangler secret put BLACKROAD_API_KEY`.
 */
export async function requireApiKey(c: Context, next: Next) {
  const key = c.req.header(API_KEY_HEADER);
  if (!key || key !== (c.env as Env).BLACKROAD_API_KEY) {
    return c.json(
      {
        error: 'Unauthorized',
        message: `A valid ${API_KEY_HEADER} header is required. See CONTRIBUTING.md to become a contributor.`,
      },
      401
    );
  }
  await next();
}

/**
 * Bearer JWT middleware (HS256).
 * Validates Authorization: Bearer <token> using the JWT_SECRET binding.
 */
export async function requireBearerToken(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json(
      { error: 'Unauthorized', message: 'Bearer token required' },
      401
    );
  }
  const token = authHeader.slice(7);
  const secret = (c.env as Env).JWT_SECRET;
  if (!secret) {
    return c.json(
      { error: 'Server misconfiguration: JWT_SECRET not set' },
      500
    );
  }
  try {
    const ok = await verifyJWT(token, secret);
    if (!ok) {
      return c.json(
        { error: 'Unauthorized', message: 'Invalid or expired token' },
        401
      );
    }
  } catch {
    return c.json({ error: 'Unauthorized', message: 'Malformed token' }, 401);
  }
  await next();
}

// ─── helpers ────────────────────────────────────────────────────────────────

export async function verifyJWT(
  token: string,
  secret: string
): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [header, payload, signature] = parts;
  const data = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const sigBytes = base64urlDecode(signature);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    new TextEncoder().encode(data)
  );
  if (!valid) return false;

  const decoded = JSON.parse(
    new TextDecoder().decode(base64urlDecode(payload))
  ) as {
    exp?: number;
  };
  if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return false;

  return true;
}

export async function createJWT(
  payload: Record<string, unknown>,
  secret: string
): Promise<string> {
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64urlEncode(
    JSON.stringify({ ...payload, iat: now, exp: now + 86400 })
  );
  const data = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data)
  );
  const signature = base64urlEncode(new Uint8Array(sig));
  return `${data}.${signature}`;
}

function base64urlEncode(input: string | Uint8Array): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad =
    padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Uint8Array.from(atob(padded + pad), (c) => c.charCodeAt(0));
}
