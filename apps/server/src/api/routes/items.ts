import { Router } from 'express';
import { z } from 'zod';
import { parseProductUrl, resolveAdapter } from '../../adapters/index.js';
import { AdapterError } from '../../adapters/types.js';
import { query } from '../../lib/db.js';
import { enqueueCheck } from '../../lib/queues.js';
import type { AuthedRequest } from '../auth.js';
import { HttpError, h, parse } from '../http.js';

export const itemsRouter = Router();

const ITEM_COLUMNS = `
  i.id, i.list_id, l.name AS list_name, i.name, i.url, i.store, i.currency, i.target_price,
  i.current_price, i.original_price, i.shipping_price, i.in_stock, i.previous_price,
  i.lowest_price, i.lowest_price_at, i.status, i.interval_min, i.next_check_at,
  i.last_checked_at, i.last_success_at, i.last_error, i.last_error_code, i.last_error_at,
  i.consecutive_failures, i.created_at, i.updated_at,
  CASE WHEN i.previous_price > 0 AND i.current_price IS NOT NULL
       THEN round(((i.current_price - i.previous_price) / i.previous_price * 100)::numeric, 2) END AS change_pct`;

const money = z.coerce.number({ invalid_type_error: 'Informe um valor' }).positive('O preço-alvo precisa ser maior que zero').max(10_000_000);
const interval = z.coerce.number().refine((n) => [15, 30, 60].includes(n), 'Intervalo deve ser 15, 30 ou 60 minutos');

const createSchema = z.object({
  listId: z.string().uuid('Escolha uma lista'),
  name: z.string().trim().min(1, 'Dê um nome ao produto').max(200),
  url: z.string().trim().min(1, 'Cole o link do produto'),
  targetPrice: money,
  currency: z.string().trim().length(3).toUpperCase().default('BRL'),
  intervalMin: interval.optional(),
});

const updateSchema = z.object({
  listId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  targetPrice: money.optional(),
  intervalMin: interval.optional(),
  status: z.enum(['monitoring', 'paused']).optional(),
});

const SORTS: Record<string, string> = {
  date: 'i.created_at',
  price: 'i.current_price',
  change: 'change_pct',
  checked: 'i.last_checked_at',
  name: 'i.name',
};

itemsRouter.get(
  '/',
  h(async (req: AuthedRequest, res) => {
    const q = z
      .object({
        q: z.string().trim().max(100).optional(),
        status: z.enum(['monitoring', 'reached', 'paused', 'error']).optional(),
        listId: z.string().uuid().optional(),
        sort: z.enum(['date', 'price', 'change', 'checked', 'name']).default('date'),
        order: z.enum(['asc', 'desc']).default('desc'),
      })
      .parse(req.query);
    const where = ['i.user_id = $1'];
    const params: unknown[] = [req.userId];
    if (q.listId) where.push(`i.list_id = $${params.push(q.listId)}`);
    if (q.status === 'error') where.push('i.last_error IS NOT NULL');
    else if (q.status) where.push(`i.status = $${params.push(q.status)}`);
    if (q.q) {
      const p = params.push(`%${q.q}%`);
      where.push(`(i.name ILIKE $${p} OR i.store ILIKE $${p} OR l.name ILIKE $${p} OR i.url ILIKE $${p})`);
    }
    const { rows } = await query(
      `SELECT ${ITEM_COLUMNS} FROM items i JOIN lists l ON l.id = i.list_id
        WHERE ${where.join(' AND ')}
        ORDER BY ${SORTS[q.sort]} ${q.order} NULLS LAST, i.id`,
      params,
    );
    res.json(rows);
  }),
);

itemsRouter.post(
  '/',
  h(async (req: AuthedRequest, res) => {
    const body = parse(createSchema, req.body);
    let url: URL;
    try {
      url = parseProductUrl(body.url);
    } catch (err) {
      throw new HttpError(400, err instanceof AdapterError ? err.message : 'Link inválido');
    }
    const adapter = resolveAdapter(url);
    const list = await query('SELECT 1 FROM lists WHERE id = $1 AND user_id = $2', [body.listId, req.userId]);
    if (!list.rowCount) throw new HttpError(404, 'Lista não encontrada');
    const interval =
      body.intervalMin ??
      (await query('SELECT default_interval_min FROM user_settings WHERE user_id = $1', [req.userId])).rows[0]?.default_interval_min ??
      30;
    const { rows } = await query(
      `INSERT INTO items (user_id, list_id, name, url, store, currency, target_price, interval_min, next_check_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + interval '10 minutes') RETURNING id`,
      [req.userId, body.listId, body.name, url.toString(), adapter.id, body.currency, body.targetPrice, interval],
    );
    // primeira verificação imediata
    await enqueueCheck(rows[0].id, { now: true }).catch(() => query('UPDATE items SET next_check_at = now() WHERE id = $1', [rows[0].id]));
    res.status(201).json(await getItem(req.userId, rows[0].id));
  }),
);

async function getItem(userId: string, id: string) {
  const { rows } = await query(`SELECT ${ITEM_COLUMNS} FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = $1 AND i.user_id = $2`, [id, userId]);
  if (!rows[0]) throw new HttpError(404, 'Produto não encontrado');
  return rows[0];
}

itemsRouter.get(
  '/:id',
  h(async (req: AuthedRequest, res) => {
    const item = await getItem(req.userId, req.params.id);
    const { rows: history } = await query(
      `SELECT price, original_price, shipping_price, currency, in_stock, captured_at
         FROM (SELECT * FROM price_history WHERE item_id = $1 ORDER BY captured_at DESC LIMIT 500) h
        ORDER BY captured_at`,
      [item.id],
    );
    res.json({ ...item, history });
  }),
);

itemsRouter.patch(
  '/:id',
  h(async (req: AuthedRequest, res) => {
    const body = parse(updateSchema, req.body);
    const current = await getItem(req.userId, req.params.id);
    if (body.listId) {
      const ok = await query('SELECT 1 FROM lists WHERE id = $1 AND user_id = $2', [body.listId, req.userId]);
      if (!ok.rowCount) throw new HttpError(404, 'Lista não encontrada');
    }
    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [req.params.id, req.userId];
    if (body.name) sets.push(`name = $${params.push(body.name)}`);
    if (body.listId) sets.push(`list_id = $${params.push(body.listId)}`);
    if (body.intervalMin) sets.push(`interval_min = $${params.push(body.intervalMin)}`);
    if (body.targetPrice) {
      // novo alvo: rearma o alerta e recalcula o status com o preço atual
      const p = params.push(body.targetPrice);
      sets.push(`target_price = $${p}`, 'alert_armed = true', 'last_alert_price = NULL');
      if (current.status !== 'paused') sets.push(`status = 'monitoring'`, 'next_check_at = now()');
    }
    if (body.status === 'paused') sets.push(`status = 'paused'`);
    if (body.status === 'monitoring' && current.status === 'paused') {
      sets.push(`status = 'monitoring'`, 'next_check_at = now()', 'alert_armed = true', 'last_alert_price = NULL');
    }
    await query(`UPDATE items SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`, params);
    res.json(await getItem(req.userId, req.params.id));
  }),
);

itemsRouter.post(
  '/:id/check',
  h(async (req: AuthedRequest, res) => {
    const item = await getItem(req.userId, req.params.id);
    if (item.status === 'paused') throw new HttpError(409, 'Retome o monitoramento para verificar');
    await query(`UPDATE items SET next_check_at = now() + interval '10 minutes' WHERE id = $1`, [item.id]);
    await enqueueCheck(item.id, { now: true });
    res.status(202).json({ queued: true });
  }),
);

itemsRouter.delete(
  '/:id',
  h(async (req: AuthedRequest, res) => {
    const r = await query('DELETE FROM items WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (!r.rowCount) throw new HttpError(404, 'Produto não encontrado');
    res.status(204).end();
  }),
);
