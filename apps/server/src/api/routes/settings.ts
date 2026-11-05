import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { describeStores } from '../../adapters/index.js';
import { webPushConfigured } from '../../alerts/channels/webpush.js';
import { config } from '../../lib/config.js';
import { query } from '../../lib/db.js';
import { enqueueNotify } from '../../lib/queues.js';
import type { AuthedRequest } from '../auth.js';
import { HttpError, h, parse } from '../http.js';

export const settingsRouter = Router();

const SETTINGS_COLUMNS = `default_interval_min, push_enabled, email_enabled, email_address, telegram_enabled,
  telegram_chat_id IS NOT NULL AS telegram_linked, theme`;

settingsRouter.get(
  '/',
  h(async (req: AuthedRequest, res) => {
    const { rows } = await query(
      `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING ${SETTINGS_COLUMNS}`,
      [req.userId],
    );
    const { rows: subs } = await query('SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = $1', [req.userId]);
    res.json({
      ...rows[0],
      push_devices: subs[0].n,
      capabilities: {
        push: webPushConfigured(),
        email: !!config.RESEND_API_KEY,
        telegram: !!(config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_BOT_USERNAME),
      },
      stores: describeStores(config),
    });
  }),
);

settingsRouter.put(
  '/',
  h(async (req: AuthedRequest, res) => {
    const body = parse(
      z.object({
        default_interval_min: z.coerce.number().refine((n) => [15, 30, 60].includes(n)).optional(),
        push_enabled: z.boolean().optional(),
        email_enabled: z.boolean().optional(),
        email_address: z.string().trim().email('E-mail inválido').nullable().optional().or(z.literal('').transform(() => null)),
        telegram_enabled: z.boolean().optional(),
        theme: z.enum(['system', 'light', 'dark']).optional(),
        apply_interval_to_all: z.boolean().optional(),
      }),
      req.body,
    );
    const { apply_interval_to_all, ...fields } = body;
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (entries.length) {
      const sets = entries.map(([k], i) => `${k} = $${i + 2}`).join(', ');
      await query(`UPDATE user_settings SET ${sets}, updated_at = now() WHERE user_id = $1`, [req.userId, ...entries.map(([, v]) => v)]);
    }
    if (apply_interval_to_all && body.default_interval_min) {
      await query(`UPDATE items SET interval_min = $2 WHERE user_id = $1`, [req.userId, body.default_interval_min]);
    }
    const { rows } = await query(`SELECT ${SETTINGS_COLUMNS} FROM user_settings WHERE user_id = $1`, [req.userId]);
    res.json(rows[0]);
  }),
);

/** Gera um código para vincular o Telegram: o usuário abre t.me/<bot>?start=<código>. */
settingsRouter.post(
  '/telegram/link',
  h(async (req: AuthedRequest, res) => {
    if (!config.TELEGRAM_BOT_USERNAME) throw new HttpError(503, 'Bot do Telegram não configurado no servidor');
    const code = randomBytes(12).toString('base64url');
    await query(`UPDATE user_settings SET telegram_link_code = $2 WHERE user_id = $1`, [req.userId, code]);
    res.json({ url: `https://t.me/${config.TELEGRAM_BOT_USERNAME}?start=${code}` });
  }),
);

settingsRouter.delete(
  '/telegram',
  h(async (req: AuthedRequest, res) => {
    await query(`UPDATE user_settings SET telegram_chat_id = NULL, telegram_enabled = false, telegram_link_code = NULL WHERE user_id = $1`, [req.userId]);
    res.status(204).end();
  }),
);

/** Dispara um alerta de teste por todos os canais habilitados. */
settingsRouter.post(
  '/test-notification',
  h(async (req: AuthedRequest, res) => {
    const { rows } = await query(`INSERT INTO alerts (user_id, kind) VALUES ($1, 'test') RETURNING id`, [req.userId]);
    await enqueueNotify(rows[0].id);
    res.status(202).json({ alertId: rows[0].id });
  }),
);
