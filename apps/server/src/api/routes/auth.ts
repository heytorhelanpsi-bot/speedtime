import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../../lib/db.js';
import { requireAuth, signToken, type AuthedRequest } from '../auth.js';
import { HttpError, h, parse } from '../http.js';

export const authRouter = Router();

const credentials = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres').max(200),
  name: z.string().trim().max(80).optional(),
});

authRouter.post(
  '/register',
  h(async (req, res) => {
    const body = parse(credentials, req.body);
    const hash = await bcrypt.hash(body.password, 11);
    const user = await tx(async (c) => {
      const exists = await c.query('SELECT 1 FROM users WHERE email = $1', [body.email]);
      if (exists.rowCount) throw new HttpError(409, 'Este e-mail já tem conta');
      const { rows } = await c.query(
        'INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id, email, name',
        [body.email, hash, body.name ?? null],
      );
      await c.query('INSERT INTO user_settings (user_id) VALUES ($1)', [rows[0].id]);
      // listas iniciais
      for (const [i, name] of ['Eletrônicos', 'Casa', 'Presentes'].entries()) {
        await c.query('INSERT INTO lists (user_id, name, position) VALUES ($1,$2,$3)', [rows[0].id, name, i]);
      }
      return rows[0];
    });
    res.status(201).json({ token: signToken(user.id), user });
  }),
);

authRouter.post(
  '/login',
  h(async (req, res) => {
    const body = parse(credentials.pick({ email: true, password: true }), req.body);
    const { rows } = await query('SELECT id, email, name, password_hash FROM users WHERE email = $1', [body.email]);
    const user = rows[0];
    const ok = user && (await bcrypt.compare(body.password, user.password_hash));
    if (!ok) throw new HttpError(401, 'E-mail ou senha incorretos');
    res.json({ token: signToken(user.id), user: { id: user.id, email: user.email, name: user.name } });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  h(async (req: AuthedRequest, res) => {
    const { rows } = await query('SELECT id, email, name FROM users WHERE id = $1', [req.userId]);
    if (!rows[0]) throw new HttpError(401, 'Usuário não encontrado');
    res.json(rows[0]);
  }),
);
