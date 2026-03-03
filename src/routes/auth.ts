import { Hono } from 'hono';
import { createJWT } from '../middleware/auth';

const auth = new Hono<{ Bindings: Env }>();

// GET /auth/login — redirect to GitHub OAuth
auth.get('/login', (c) => {
  const clientId = c.env.OAUTH_CLIENT_ID;
  if (!clientId)
    return c.json({ error: 'OAUTH_CLIENT_ID not configured' }, 500);

  const redirectUri = `${new URL(c.req.url).origin}/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user',
    response_type: 'code',
  });
  return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// GET /auth/callback — exchange GitHub code for a BlackRoad JWT
auth.get('/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json({ error: 'Missing authorization code' }, 400);

  const {
    OAUTH_CLIENT_ID: clientId,
    OAUTH_CLIENT_SECRET: clientSecret,
    JWT_SECRET: jwtSecret,
  } = c.env;
  if (!clientId || !clientSecret)
    return c.json({ error: 'OAuth not configured' }, 500);
  if (!jwtSecret) return c.json({ error: 'JWT_SECRET not configured' }, 500);

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${new URL(c.req.url).origin}/auth/callback`,
    }),
  });

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!tokenData.access_token) {
    return c.json(
      { error: 'Failed to obtain access token', detail: tokenData.error },
      400
    );
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'User-Agent': 'BlackRoad-OS-Container/1.0',
    },
  });
  const user = (await userRes.json()) as { login?: string; id?: number };

  const jwt = await createJWT(
    { sub: String(user.id), login: user.login, provider: 'github' },
    jwtSecret
  );
  return c.json({ token: jwt, user: { login: user.login, id: user.id } });
});

// GET /auth/logout — client should discard the JWT
auth.get('/logout', (c) => {
  return c.json({
    message: 'Logged out. Discard your Bearer token on the client side.',
  });
});

export default auth;
