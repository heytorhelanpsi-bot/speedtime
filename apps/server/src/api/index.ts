import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { runMigrations } from '../lib/migrate.js';
import { initVapid } from '../lib/vapid.js';
import { createApp } from './app.js';

async function main() {
  if (config.AUTO_MIGRATE) await runMigrations();
  await initVapid();
  createApp().listen(config.PORT, () => logger.info({ port: config.PORT, worker: config.RUN_WORKER }, 'API ouvindo'));
  if (config.KEEP_ALIVE && config.PUBLIC_URL) {
    // Planos gratuitos (ex.: Render Free) desligam o app após 15 min sem acessos.
    // Um acesso à própria URL pública a cada 10 min mantém o monitoramento 24/7.
    const url = `${config.PUBLIC_URL.replace(/\/$/, '')}/health`;
    setInterval(() => {
      fetch(url, { signal: AbortSignal.timeout(20_000) }).catch((err) => logger.warn({ err: err.message }, 'keep-alive falhou'));
    }, 10 * 60_000).unref();
    logger.info({ url }, 'keep-alive ativo');
  }
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
