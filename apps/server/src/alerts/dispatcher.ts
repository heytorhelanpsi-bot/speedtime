import { config } from '../lib/config.js';
import { query } from '../lib/db.js';
import type { Logger } from '../lib/logger.js';
import { sendEmail } from './channels/email.js';
import { sendTelegram } from './channels/telegram.js';
import { sendWebPush } from './channels/webpush.js';
import { alertText, type AlertView } from './message.js';

type Channel = 'push' | 'email' | 'telegram';
type Result = { status: 'sent' | 'skipped'; detail?: string };

/**
 * Entrega um alerta em todos os canais habilitados.
 * Cada canal é registrado em alert_deliveries; um canal já "sent" não é reenviado em retentativas,
 * então uma falha no e-mail não duplica o push.
 */
export async function dispatchAlert(alertId: string, log: Logger) {
  const { rows } = await query(
    `SELECT a.id, a.user_id, a.kind, a.price, a.target_price, a.currency, a.item_id,
            i.name AS item_name, i.url AS item_url,
            s.push_enabled, s.email_enabled, COALESCE(s.email_address, u.email) AS email,
            s.telegram_enabled, s.telegram_chat_id
       FROM alerts a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN user_settings s ON s.user_id = a.user_id
       LEFT JOIN items i ON i.id = a.item_id
      WHERE a.id = $1`,
    [alertId],
  );
  const a = rows[0];
  if (!a) return;

  const { rows: done } = await query(`SELECT channel FROM alert_deliveries WHERE alert_id = $1 AND status = 'sent'`, [alertId]);
  const already = new Set(done.map((d) => d.channel as Channel));
  const { title, body } = alertText(a as AlertView);
  const appLink = a.item_id ? `${config.APP_URL}/item/${a.item_id}` : config.APP_URL;

  const plan: [Channel, boolean, () => Promise<Result>][] = [
    ['push', a.push_enabled ?? true, () => sendWebPush(a.user_id, { title, body, url: appLink, tag: `item-${a.item_id}`, alertId }, log)],
    ['email', !!a.email_enabled && !!a.email, () => sendEmail(a.email, title, body, a.item_url ?? appLink)],
    ['telegram', !!a.telegram_enabled && !!a.telegram_chat_id, () => sendTelegram(a.telegram_chat_id, title, body, a.item_url ?? appLink)],
  ];

  const failures: string[] = [];
  for (const [channel, enabled, send] of plan) {
    if (!enabled || already.has(channel)) continue;
    try {
      const r = await send();
      await saveDelivery(alertId, channel, r.status, r.detail);
      log.info({ alertId, channel, status: r.status, detail: r.detail }, 'alerta entregue');
    } catch (err: any) {
      failures.push(`${channel}: ${err?.message}`);
      await saveDelivery(alertId, channel, 'failed', err?.message);
      log.warn({ alertId, channel, err: err?.message }, 'falha ao entregar alerta');
    }
  }
  // lança para o BullMQ tentar de novo apenas os canais que falharam
  if (failures.length) throw new Error(failures.join(' | '));
}

async function saveDelivery(alertId: string, channel: Channel, status: string, detail?: string) {
  await query(
    `INSERT INTO alert_deliveries (alert_id, channel, status, detail) VALUES ($1,$2,$3,$4)
     ON CONFLICT (alert_id, channel) DO UPDATE
       SET status = EXCLUDED.status, detail = EXCLUDED.detail, attempts = alert_deliveries.attempts + 1, updated_at = now()`,
    [alertId, channel, status, detail?.slice(0, 500) ?? null],
  );
}
