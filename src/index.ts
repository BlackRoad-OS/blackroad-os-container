import { Container, getContainer, getRandom } from '@cloudflare/containers';
import { Hono } from 'hono';
import { requireApiKey } from './middleware/auth';
import authRoutes from './routes/auth';
import proxyRoutes from './routes/proxy';
import webhookRoutes from './routes/stripe';

export class MyContainer extends Container<Env> {
  // Port the container listens on (default: 8080)
  defaultPort = 8080;
  // Time before container sleeps due to inactivity (default: 30s)
  sleepAfter = '2m';
  // Environment variables passed to the container
  envVars = {
    MESSAGE: 'I was passed in via the container class!',
  };

  // Optional lifecycle hooks
  override onStart() {
    console.log('Container successfully started');
  }

  override onStop() {
    console.log('Container successfully shut down');
  }

  override onError(error: unknown) {
    console.log('Container error:', error);
  }
}

// Create Hono app with proper typing for Cloudflare Workers
const app = new Hono<{
  Bindings: Env;
}>();

// ─── Public routes ────────────────────────────────────────────────────────────

// Home route with available endpoints
app.get('/', (c) => {
  return c.text(
    'BlackRoad OS Container Gateway\n' +
      '© 2026 BlackRoad OS, Inc. — Proprietary & Confidential\n\n' +
      'Public endpoints:\n' +
      '  GET  /auth/login            OAuth 2.0 login (GitHub)\n' +
      '  GET  /auth/callback         OAuth 2.0 callback\n' +
      '  GET  /auth/logout           Logout\n' +
      '  POST /webhook/stripe        Stripe event webhook\n\n' +
      'Protected endpoints (require X-BlackRoad-API-Key + Bearer token):\n' +
      '  ALL  /api/proxy/:vendor/*   Vendor API gateway\n' +
      '  GET  /container/:id         Routed container instance\n' +
      '  GET  /lb                    Load-balanced container\n' +
      '  GET  /singleton             Singleton container instance\n'
  );
});

// OAuth 2.0 authentication routes (no API key required)
app.route('/auth', authRoutes);

// Stripe webhook (signature-validated, no API key required)
app.route('/webhook', webhookRoutes);

// ─── Protected routes (require contributor API key) ───────────────────────────

app.use('/api/*', requireApiKey);
app.use('/container/*', requireApiKey);
app.use('/lb', requireApiKey);
app.use('/singleton', requireApiKey);
app.use('/error', requireApiKey);

// Vendor API proxy gateway
app.route('/api/proxy', proxyRoutes);

// Route requests to a specific container using the container ID
app.get('/container/:id', async (c) => {
  const id = c.req.param('id');
  const containerId = c.env.MY_CONTAINER.idFromName(`/container/${id}`);
  const container = c.env.MY_CONTAINER.get(containerId);
  return await container.fetch(c.req.raw);
});

// Demonstrate error handling - this route forces a panic in the container
app.get('/error', async (c) => {
  const container = getContainer(c.env.MY_CONTAINER, 'error-test');
  return await container.fetch(c.req.raw);
});

// Load balance requests across multiple containers
app.get('/lb', async (c) => {
  const container = await getRandom(c.env.MY_CONTAINER, 3);
  return await container.fetch(c.req.raw);
});

// Get a single container instance (singleton pattern)
app.get('/singleton', async (c) => {
  const container = getContainer(c.env.MY_CONTAINER);
  return await container.fetch(c.req.raw);
});

export default app;
