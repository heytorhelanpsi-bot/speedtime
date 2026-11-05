import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { runMigrations } from '../lib/migrate.js';
import { initVapid } from '../lib/vapid.js';
import { createApp } from './app.js';

async function main() {
  if (config.AUTO_MIGRATE) await runMigrations();
  await initVapid();
  createApp().listen(config.PORT, () => logger.info({ port: config.PORT, worker: config.RUN_WORKER }, 'API ouvindo'));
  if (config.RUN_WORKER) {
    // deploy com um único serviço: o worker roda no mesmo processo
    const { startWorker } = await import('../worker/run.js');
    const stop = await startWorker();
    process.on('SIGTERM', async () => {
      await stop();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  logger.fatal({ err }, 'API não iniciou');
  process.exit(1);
});
