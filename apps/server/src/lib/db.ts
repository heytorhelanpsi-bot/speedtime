import pg from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

// NUMERIC -> number (valores monetários cabem com folga em double)
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// BIGINT -> number
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

/**
 * Bancos gerenciados (Supabase, Neon, Render) exigem SSL; o local não.
 * SSL é ligado para qualquer host remoto, a menos que a URL peça sslmode=disable.
 * Parâmetros de SSL da URL são removidos para não conflitarem com a opção abaixo.
 */
export function poolOptions(databaseUrl: string): pg.PoolConfig {
  const url = new URL(databaseUrl);
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname) || !url.hostname.includes('.');
  const disabled = url.searchParams.get('sslmode') === 'disable';
  for (const k of ['sslmode', 'channel_binding', 'sslrootcert', 'pgbouncer']) url.searchParams.delete(k);
  return {
    connectionString: url.toString(),
    max: 10,
    ssl: local || disabled ? undefined : { rejectUnauthorized: false },
  };
}

export const pool = new pg.Pool(poolOptions(config.DATABASE_URL));
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
