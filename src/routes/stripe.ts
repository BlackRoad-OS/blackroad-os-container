import { Hono } from 'hono';

const webhook = new Hono<{ Bindings: Env }>();

/**
 * POST /webhook/stripe — Stripe event handler.
 * Validates the Stripe-Signature header (HMAC-SHA256) before processing.
 * Set STRIPE_WEBHOOK_SECRET via: wrangler secret put STRIPE_WEBHOOK_SECRET
 */
webhook.post('/stripe', async (c) => {
  const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return c.json({ error: 'Webhook not configured' }, 500);
  }

  const signature = c.req.header('Stripe-Signature');
  if (!signature)
    return c.json({ error: 'Missing Stripe-Signature header' }, 400);

  const body = await c.req.text();

  const valid = await verifyStripeSignature(body, signature, webhookSecret);
  if (!valid) return c.json({ error: 'Invalid signature' }, 401);

  const event = JSON.parse(body) as {
    type: string;
    id: string;
    data: { object: Record<string, unknown> };
  };

  switch (event.type) {
    case 'payment_intent.succeeded':
      console.log(`[Stripe] payment_intent.succeeded: ${event.id}`);
      break;
    case 'payment_intent.payment_failed':
      console.log(`[Stripe] payment_intent.payment_failed: ${event.id}`);
      break;
    case 'customer.subscription.created':
      console.log(`[Stripe] subscription created: ${event.id}`);
      break;
    case 'customer.subscription.deleted':
      console.log(`[Stripe] subscription deleted: ${event.id}`);
      break;
    case 'checkout.session.completed':
      console.log(`[Stripe] checkout.session.completed: ${event.id}`);
      break;
    default:
      console.log(`[Stripe] unhandled event: ${event.type}`);
  }

  return c.json({ received: true });
});

// ─── Stripe HMAC-SHA256 signature verification ───────────────────────────────

async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string
): Promise<boolean> {
  const parts = header
    .split(',')
    .reduce((acc: Record<string, string>, part) => {
      const idx = part.indexOf('=');
      if (idx !== -1) acc[part.slice(0, idx)] = part.slice(idx + 1);
      return acc;
    }, {});

  const timestamp = parts['t'];
  const v1 = parts['v1'];
  if (!timestamp || !v1) return false;

  // Reject stale webhooks (> 5 minutes)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (age > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;

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
    new TextEncoder().encode(signedPayload)
  );
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return computed === v1;
}

export default webhook;
