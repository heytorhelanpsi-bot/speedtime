import { Queue } from 'bullmq';
import { redis } from './redis.js';

export const QUEUE_CHECKS = 'price-checks';
export const QUEUE_NOTIFY = 'notifications';

export type CheckJob = { itemId: string };
export type NotifyJob = { alertId: string };

let checks: Queue<CheckJob> | undefined;
let notify: Queue<NotifyJob> | undefined;

export function checksQueue() {
  return (checks ??= new Queue<CheckJob>(QUEUE_CHECKS, { connection: redis }));
}
export function notifyQueue() {
  return (notify ??= new Queue<NotifyJob>(QUEUE_NOTIFY, { connection: redis }));
}

export async function enqueueCheck(itemId: string, opts: { now?: boolean } = {}) {
  // agendadas: jobId estável por minuto evita duplicar a mesma verificação;
  // manuais ("Verificar agora"): sempre executam
  const bucket = Math.floor(Date.now() / 60_000);
  const jobId = opts.now ? `check-${itemId}-manual-${Date.now()}` : `check-${itemId}-${bucket}`;
  await checksQueue().add(
    'check',
    { itemId },
    {
      jobId,
      removeOnComplete: 1000,
      removeOnFail: 1000,
      priority: opts.now ? 1 : 5,
    },
  );
}

export async function enqueueNotify(alertId: string) {
  await notifyQueue().add(
    'notify',
    { alertId },
    {
      jobId: `notify-${alertId}`,
      attempts: 4,
      backoff: { type: 'exponential', delay: 15_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  );
}
