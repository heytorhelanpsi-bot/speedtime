import type { PoolClient } from 'pg';
import { adapterById } from '../adapters/index.js';
import { AdapterError, type AdapterContext, type PriceResult } from '../adapters/types.js';
import { decideAlert } from '../alerts/antispam.js';
import { config } from '../lib/config.js';
import { query, tx } from '../lib/db.js';
import type { Logger } from '../lib/logger.js';

export type CheckOutcome =
  | { kind: 'skipped'; reason: string }
  | { kind: 'success'; price: number; alertId: string | null; userId: string }
  | { kind: 'failure'; code: string; message: string }
  | { kind: 'rate_limited'; retryAfterMs: number };

/**
 * Verifica um item. Nunca lança erro de adaptador: falhas viram estado visível no item
 * ("não foi possível verificar") e não afetam os demais.
 */
export async function checkItem(itemId: string, ctx: AdapterContext): Promise<CheckOutcome> {
  const { rows } = await query(`SELECT id, url, store, status FROM items WHERE id = $1`, [itemId]);
  const item = rows[0];
  if (!item) return { kind: 'skipped', reason: 'item removido' };
  if (item.status === 'paused') return { kind: 'skipped', reason: 'pausado' };

  const log = ctx.log.child({ itemId, store: item.store });
  const adapter = adapterById(item.store);
  const started = Date.now();

  let result: PriceResult;
  try {
    result = await adapter.fetchPrice(new URL(item.url), { ...ctx, log });
  } catch (err) {
    if (err instanceof AdapterError && err.code === 'rate_limited') {
      return { kind: 'rate_limited', retryAfterMs: err.retryAfterMs ?? 1000 };
    }
    const code = err instanceof AdapterError ? err.code : 'internal';
    const message = err instanceof AdapterError ? err.message : 'Erro inesperado na verificação';
    if (!(err instanceof AdapterError)) log.error({ err }, 'erro inesperado no adaptador');
    else log.warn({ code, msg: message, ms: Date.now() - started }, 'verificação falhou');
    await recordFailure(itemId, code, message);
    return { kind: 'failure', code, message };
  }

  const outcome = await tx((client) => recordSuccess(client, itemId, result));
  log.info({ price: result.price, currency: result.currency, alert: outcome.kind === 'success' && outcome.alertId != null, ms: Date.now() - started }, 'preço verificado');
  return outcome;
}

async function recordFailure(itemId: string, code: string, message: string) {
  // backoff: intervalo x 2, 4, 8 (máx.) conforme falhas consecutivas — mesma regra de nextCheckDelayMin
  await query(
    `UPDATE items SET
       last_checked_at = now(),
       last_error = $2,
       last_error_code = $3,
       last_error_at = now(),
       consecutive_failures = consecutive_failures + 1,
       next_check_at = now() + make_interval(mins => interval_min * LEAST(power(2, consecutive_failures + 1), 8)::int),
       updated_at = now()
     WHERE id = $1`,
    [itemId, message, code],
  );
}

async function recordSuccess(client: PoolClient, itemId: string, r: PriceResult): Promise<CheckOutcome> {
  // trava a linha: evita alertas duplicados se duas verificações correrem ao mesmo tempo
  const { rows } = await client.query(
    `SELECT id, user_id, status, target_price, current_price, lowest_price, alert_armed, last_alert_price, interval_min, currency
       FROM items WHERE id = $1 FOR UPDATE`,
    [itemId],
  );
  const item = rows[0];
  if (!item) return { kind: 'skipped', reason: 'item removido' };

  await client.query(
    `INSERT INTO price_history (item_id, price, original_price, shipping_price, currency, in_stock) VALUES ($1,$2,$3,$4,$5,$6)`,
    [itemId, r.price, r.originalPrice ?? null, r.shipping ?? null, r.currency, r.inStock ?? null],
  );

  const paused = item.status === 'paused';
  const decision = decideAlert(
    { targetPrice: item.target_price, alertArmed: item.alert_armed, lastAlertPrice: item.last_alert_price },
    r.price,
    config.ALERT_REARM_HYSTERESIS,
  );
  const newLow = item.lowest_price == null || r.price < item.lowest_price;

  await client.query(
    `UPDATE items SET
       previous_price = current_price,
       current_price = $2,
       original_price = $3,
       shipping_price = $4,
       in_stock = $5,
       currency = $6,
       lowest_price = CASE WHEN $7 THEN $2 ELSE lowest_price END,
       lowest_price_at = CASE WHEN $7 THEN now() ELSE lowest_price_at END,
       status = CASE WHEN status = 'paused' THEN status ELSE $8 END,
       alert_armed = $9,
       last_alert_price = $10,
       last_checked_at = now(),
       last_success_at = now(),
       last_error = NULL,
       last_error_code = NULL,
       consecutive_failures = 0,
       next_check_at = now() + make_interval(mins => interval_min),
       updated_at = now()
     WHERE id = $1`,
    [itemId, r.price, r.originalPrice ?? null, r.shipping ?? null, r.inStock ?? null, r.currency, newLow,
     decision.status, paused ? item.alert_armed : decision.alertArmed, paused ? item.last_alert_price : decision.lastAlertPrice],
  );

  let alertId: string | null = null;
  if (decision.alert && !paused) {
    const ins = await client.query(
      `INSERT INTO alerts (user_id, item_id, kind, price, target_price, currency) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [item.user_id, itemId, decision.alert, r.price, item.target_price, r.currency],
    );
    alertId = ins.rows[0].id;
  }
  return { kind: 'success', price: r.price, alertId, userId: item.user_id };
}
