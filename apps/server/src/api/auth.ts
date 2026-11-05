import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../lib/config.js';

export interface AuthedRequest extends Request {
  userId: string;
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, config.JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const userId = verifyToken(header?.startsWith('Bearer ') ? header.slice(7) : undefined);
  if (!userId) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  (req as AuthedRequest).userId = userId;
  next();
}
