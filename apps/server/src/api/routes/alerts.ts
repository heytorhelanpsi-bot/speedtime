import { Router } from 'express';
import { query } from '../../lib/db.js';
import type { AuthedRequest } from '../auth.js';
import { h } from '../http.js';

export const alertsRouter = Router();

export const ALERT_SELECT = `
  SELECT a.id, a.kind, a.price, a.target_price, a.currency, a.read_at, a.created_at,
         a.item_id, i.name AS item_name, i.url AS item_url, i.store AS item_store
    FROM alerts a LEFT JOIN items i ON i.id = a.item_id`;

alertsRouter.get(
  '/',
  h(async (req: AuthedRequest, res) => {
    const unread = req.query.unread === '1';
    const { rows } = await query(
      `${ALERT_SELECT} WHERE a.user_id = $1 ${unread ? 'AND a.read_at IS NULL' : ''} ORDER BY a.created_at DESC LIMIT 100`,
      [req.userId],
    );
    const { rows: c } = await query(`SELECT count(*)::int AS n FROM alerts WHERE user_id = $1 AND read_at IS NULL`, [req.userId]);
    res.json({ alerts: rows, unread: c[0].n });
  }),
);

alertsRouter.post(
  '/read-all',
  h(async (req: AuthedRequest, res) => {
    await query(`UPDATE alerts SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [req.userId]);
    res.status(204).end();
  }),
);

alertsRouter.post(
  '/:id/read',
  h(async (req: AuthedRequest, res) => {
    await query(`UPDATE alerts SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
    res.status(204).end();
  }),
);
