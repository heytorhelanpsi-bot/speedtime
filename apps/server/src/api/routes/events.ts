import { Router } from 'express';
import { query } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { channels, createRedis } from '../../lib/redis.js';
import { verifyToken } from '../auth.js';
import { ALERT_SELECT } from './alerts.js';

/**
 * Server-Sent Events: avisa o app aberto sobre novos alertas e itens atualizados.
 * EventSource não envia cabeçalhos, então o token vem na query string.
 * Um único assinante Redis é compartilhado por todas as conexões do processo.
 */
export const eventsRouter = Router();

type Client = (event: string, data: unknown) => void;
const clients = new Map<string, Set<Client>>();
let subscriber: ReturnType<typeof createRedis> | null = null;

function ensureSubscriber() {
  if (subscriber) return subscriber;
  subscriber = createRedis();
  subscriber.psubscribe(channels.userEvents('*')).catch((err) => logger.error({ err }, 'falha no psubscribe'));
  subscriber.on('pmessage', async (_pattern, channel, message) => {
    const userId = channel.split(':').pop()!;
    const set = clients.get(userId);
    if (!set?.size) return;
    try {
      const evt = JSON.parse(message);
      if (evt.type === 'alert') {
        const { rows } = await query(`${ALERT_SELECT} WHERE a.id = $1`, [evt.alertId]);
        if (rows[0]) set.forEach((send) => send('alert', rows[0]));
      } else {
        set.forEach((send) => send(evt.type, evt));
      }
    } catch (err) {
      logger.warn({ err }, 'evento inválido');
    }
  });
  return subscriber;
}

eventsRouter.get('/', (req, res) => {
  const userId = verifyToken(String(req.query.token ?? ''));
  if (!userId) return res.status(401).end();
  ensureSubscriber();

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write('retry: 5000\n\n');
  const send: Client = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const set = clients.get(userId) ?? new Set();
  set.add(send);
  clients.set(userId, set);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(ping);
    set.delete(send);
    if (!set.size) clients.delete(userId);
  });
});
