import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

// NUMERIC -> number (valores monetários cabem com folga em double)
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// BIGINT -> number
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  ssl: /sslmode=require/.test(config.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
});
pool.on('error', (err) => logger.error({ err }, 'erro no pool do Postgres'));

export async function query<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
