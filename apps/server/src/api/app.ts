import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { describeStores } from '../adapters/index.js';
import { config } from '../lib/config.js';
import { query } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import { requireAuth } from './auth.js';
import { errorHandler } from './http.js';
import { alertsRouter } from './routes/alerts.js';
import { authRouter } from './routes/auth.js';
import { eventsRouter } from './routes/events.js';
import { itemsRouter } from './routes/items.js';
import { listsRouter } from './routes/lists.js';
import { pushRouter } from './routes/push.js';
import { settingsRouter } from './routes/settings.js';
import { telegramRouter } from './routes/telegram.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(cors({ origin: config.WEB_ORIGIN.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      if (req.path !== '/api/events') logger.info({ method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - started }, 'request');
    });
    next();
  });

  app.get('/health', async (_req, res) => {
    try {
      await query('SELECT 1');
      await redis.ping();
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/telegram', telegramRouter);
  app.get('/api/stores', (_req, res) => res.json(describeStores(config)));
  app.use('/api/push', pushRouter); // vapid-public-key é público; subscribe/unsubscribe exigem login
  app.use('/api/lists', requireAuth, listsRouter);
  app.use('/api/items', requireAuth, itemsRouter);
  app.use('/api/alerts', requireAuth, alertsRouter);
  app.use('/api/settings', requireAuth, settingsRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

  // Se o frontend já foi compilado (apps/web/dist), a própria API serve o site:
  // um único endereço para tudo, sem CORS nem rewrite.
  const webDist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web', 'dist');
  if (existsSync(join(webDist, 'index.html'))) {
    app.use(
      express.static(webDist, {
        index: false,
        setHeaders: (res, path) => {
          if (path.endsWith('sw.js') || path.endsWith('.html')) res.setHeader('cache-control', 'no-cache');
          else if (path.includes(`${'/'}assets${'/'}`)) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.setHeader('cache-control', 'no-cache');
      res.sendFile(join(webDist, 'index.html'));
    });
  }
  app.use(errorHandler);
  return app;
}
