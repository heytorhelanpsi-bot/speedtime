import { Router } from 'express';
import { telegramApi } from '../../alerts/channels/telegram.js';
import { config } from '../../lib/config.js';
import { query } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { h } from '../http.js';

/**
 * Webhook do bot. Configure com:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<API>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
 */
export const telegramRouter = Router();

telegramRouter.post(
  '/webhook',
  h(async (req, res) => {
    if (!config.TELEGRAM_WEBHOOK_SECRET || req.headers['x-telegram-bot-api-secret-token'] !== config.TELEGRAM_WEBHOOK_SECRET) {
      return res.status(401).end();
    }
    const msg = req.body?.message;
    const text: string = msg?.text ?? '';
    const chatId = msg?.chat?.id;
    res.status(200).end(); // responde rápido; o Telegram reenvia se demorar

    const code = text.match(/^\/start\s+([\w-]{8,})/)?.[1];
    if (!chatId || !code) return;
    const { rowCount } = await query(
      `UPDATE user_settings SET telegram_chat_id = $2, telegram_enabled = true, telegram_link_code = NULL WHERE telegram_link_code = $1`,
      [code, String(chatId)],
    );
    try {
      await telegramApi('sendMessage', {
        chat_id: chatId,
        text: rowCount ? 'Pronto! Você vai receber os alertas do SpeedTime aqui.' : 'Código inválido ou expirado. Gere um novo nas configurações do SpeedTime.',
      });
    } catch (err: any) {
      logger.warn({ err: err.message }, 'falha ao responder no Telegram');
    }
  }),
);
