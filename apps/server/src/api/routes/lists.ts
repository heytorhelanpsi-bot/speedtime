import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../lib/db.js';
import type { AuthedRequest } from '../auth.js';
import { HttpError, h, parse } from '../http.js';

export const listsRouter = Router();
const name = z.object({ name: z.string().trim().min(1, 'Dê um nome à lista').max(60) });

listsRouter.get(
  '/',
  h(async (req: AuthedRequest, res) => {
    const { rows } = await query(
      `SELECT l.id, l.name, l.position, l.created_at,
              count(i.id)::int AS item_count,
              count(i.id) FILTER (WHERE i.status = 'reached')::int AS reached_count
         FROM lists l LEFT JOIN items i ON i.list_id = l.id
        WHERE l.user_id = $1
        GROUP BY l.id ORDER BY l.position, l.created_at`,
      [req.userId],
    );
    res.json(rows);
  }),
);

listsRouter.post(
  '/',
  h(async (req: AuthedRequest, res) => {
    const body = parse(name, req.body);
    const { rows } = await query(
      `INSERT INTO lists (user_id, name, position)
       VALUES ($1, $2, COALESCE((SELECT max(position) + 1 FROM lists WHERE user_id = $1), 0))
       RETURNING id, name, position, created_at, 0 AS item_count, 0 AS reached_count`,
      [req.userId, body.name],
    );
    res.status(201).json(rows[0]);
  }),
);

listsRouter.patch(
  '/:id',
  h(async (req: AuthedRequest, res) => {
    const body = parse(name, req.body);
    const { rows } = await query(
      `UPDATE lists SET name = $3, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING id, name, position`,
      [req.params.id, req.userId, body.name],
    );
    if (!rows[0]) throw new HttpError(404, 'Lista não encontrada');
    res.json(rows[0]);
  }),
);

listsRouter.delete(
  '/:id',
  h(async (req: AuthedRequest, res) => {
    const r = await query(`DELETE FROM lists WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
    if (!r.rowCount) throw new HttpError(404, 'Lista não encontrada');
    res.status(204).end();
  }),
);
