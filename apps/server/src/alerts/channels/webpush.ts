import webpush from 'web-push';
import { config } from '../../lib/config.js';
import { query } from '../../lib/db.js';
import type { Logger } from '../../lib/logger.js';

let ready = false;
export function webPushConfigured() {
  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) return false;
  if (!ready) {
    webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);
    ready = true;
  }
  return true;
}

/** Envia para todas as assinaturas do usuário. Assinaturas expiradas (404/410) são removidas. */
export async function sendWebPush(userId: string, payload: object, log: Logger) {
  if (!webPushConfigured()) return { status: 'skipped' as const, detail: 'VAPID não configurado' };
  const { rows } = await query(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`, [userId]);
  if (!rows.length) return { status: 'skipped' as const, detail: 'nenhum navegador inscrito' };

  let sent = 0;
  const errors: string[] = [];
  await Promise.all(
    rows.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 12, urgency: 'high' },
        );
        sent++;
        await query(`UPDATE push_subscriptions SET last_used_at = now() WHERE id = $1`, [s.id]);
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await query(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]);
          log.info({ subscription: s.id }, 'assinatura push expirada removida');
        } else {
          errors.push(`${err?.statusCode ?? ''} ${err?.body ?? err?.message ?? 'erro'}`.trim());
        }
      }
    }),
  );
  if (sent > 0) return { status: 'sent' as const, detail: `${sent} dispositivo(s)` };
  if (errors.length) throw new Error(`Web Push falhou: ${errors.join('; ')}`);
  return { status: 'skipped' as const, detail: 'assinaturas expiradas' };
}
