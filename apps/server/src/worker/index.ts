import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { runMigrations } from '../lib/migrate.js';
import { redis } from '../lib/redis.js';
import { initVapid } from '../lib/vapid.js';
import { startWorker } from './run.js';

/** Worker como processo separado (escala independente da API). */
async function main() {
  await runMigrations();
  await initVapid();
  const stop = await startWorker();
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'encerrando worker');
    await stop();
    await Promise.allSettled([pool.end(), redis.quit()]);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'worker não iniciou');
  process.exit(1);
});
