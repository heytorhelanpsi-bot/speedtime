import { DelayedError, Queue, Worker } from 'bullmq';
import { dispatchAlert } from '../alerts/dispatcher.js';
import { config } from '../lib/config.js';
import { query } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { QUEUE_CHECKS, QUEUE_NOTIFY, enqueueCheck, enqueueNotify, type CheckJob, type NotifyJob } from '../lib/queues.js';
import { channels, createRedis, redis } from '../lib/redis.js';
import { createHttpClient } from '../net/http.js';
import { checkItem } from './checkItem.js';

const QUEUE_SCHEDULER = 'scheduler';
const http = createHttpClient({ redis, config, log: logger });

/**
 * Agendador: a cada minuto pega os itens vencidos e coloca na fila.
 * O "lease" de 10 min em next_check_at impede que o mesmo item seja enfileirado de novo
 * enquanto a verificação ainda não terminou (vale com vários workers em paralelo).
 */
async function enqueueDueItems() {
  const { rows } = await query<{ id: string }>(
    `UPDATE items SET next_check_at = now() + interval '10 minutes'
      WHERE id IN (
        SELECT id FROM items
         WHERE status <> 'paused' AND next_check_at <= now()
         ORDER BY next_check_at
         LIMIT 500
         FOR UPDATE SKIP LOCKED)
      RETURNING id`,
  );
  for (const r of rows) await enqueueCheck(r.id);
  if (rows.length) logger.info({ count: rows.length }, 'itens enfileirados');
}

/** Inicia agendador + filas. Devolve uma função que encerra tudo. */
export async function startWorker() {
  const schedulerQueue = new Queue(QUEUE_SCHEDULER, { connection: redis });
  await schedulerQueue.upsertJobScheduler('tick', { every: 60_000 }, { name: 'tick', opts: { removeOnComplete: 10, removeOnFail: 50 } });

  const scheduler = new Worker(QUEUE_SCHEDULER, enqueueDueItems, { connection: createRedis(), concurrency: 1 });

  const checks = new Worker<CheckJob>(
    QUEUE_CHECKS,
    async (job, token) => {
      const outcome = await checkItem(job.data.itemId, { http, config, log: logger.child({ jobId: job.id }) });
      if (outcome.kind === 'rate_limited') {
        // outro item do mesmo host acabou de ser consultado: reagenda sem contar como falha
        await job.moveToDelayed(Date.now() + outcome.retryAfterMs + Math.floor(Math.random() * 1000), token);
        throw new DelayedError();
      }
      if (outcome.kind === 'success' && outcome.alertId) {
        await enqueueNotify(outcome.alertId);
        await redis.publish(channels.userEvents(outcome.userId), JSON.stringify({ type: 'alert', alertId: outcome.alertId }));
      }
      if (outcome.kind === 'success' || outcome.kind === 'failure') {
        const { rows } = await query(`SELECT user_id FROM items WHERE id = $1`, [job.data.itemId]);
        if (rows[0]) await redis.publish(channels.userEvents(rows[0].user_id), JSON.stringify({ type: 'item', itemId: job.data.itemId }));
      }
      return outcome;
    },
    { connection: createRedis(), concurrency: config.WORKER_CONCURRENCY },
  );

  const notify = new Worker<NotifyJob>(QUEUE_NOTIFY, (job) => dispatchAlert(job.data.alertId, logger.child({ jobId: job.id })), {
    connection: createRedis(),
    concurrency: 5,
  });

  for (const w of [scheduler, checks, notify]) {
    w.on('failed', (job, err) => logger.error({ queue: w.name, jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'job falhou'));
    w.on('error', (err) => logger.error({ queue: w.name, err: err.message }, 'erro no worker'));
  }

  await enqueueDueItems();
  logger.info({ concurrency: config.WORKER_CONCURRENCY }, 'worker iniciado');

  return async () => {
    await Promise.allSettled([scheduler.close(), checks.close(), notify.close()]);
    await schedulerQueue.close().catch(() => {});
  };
}
