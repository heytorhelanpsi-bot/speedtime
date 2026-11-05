import { pool } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';
import { runMigrations } from '../src/lib/migrate.js';

runMigrations()
  .then(async () => {
    logger.info('banco atualizado');
    await pool.end();
  })
  .catch((err) => {
    logger.error({ err }, 'falha na migração');
    process.exit(1);
  });
