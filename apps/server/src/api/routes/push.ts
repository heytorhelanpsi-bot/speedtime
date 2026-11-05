import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../lib/config.js';
import { query } from '../../lib/db.js';
import { requireAuth, type AuthedRequest } from '../auth.js';
import { HttpError, h, parse } from '../http.js';

export const pushRouter = Router();

pushRouter.get('/vapid-public-key', (_req, res) => {
  if (!config.VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Web Push não configurado no servidor' });
  res.json({ key: config.VAPID_PUBLIC_KEY });
});

const subscription = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

pushRouter.post(
  '/subscribe',
  requireAuth,
  h(async (req: AuthedRequest, res) => {
    if (!config.VAPID_PUBLIC_KEY) throw new HttpError(503, 'Web Push não configurado no servidor');
    const s = parse(subscription, req.body);
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.userId, s.endpoint, s.keys.p256dh, s.keys.auth, req.headers['user-agent']?.slice(0, 300) ?? null],
    );
    res.status(201).json({ ok: true });
  }),
);

pushRouter.post(
  '/unsubscribe',
  requireAuth,
  h(async (req: AuthedRequest, res) => {
    const { endpoint } = parse(z.object({ endpoint: z.string() }), req.body);
    await query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.userId]);
    res.status(204).end();
  }),
);
