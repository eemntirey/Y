import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { verifyAccessToken } from './auth.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export const bad = (msg: string) => new ApiError(400, msg);
export const unauthorized = (msg = 'Authentification requise') => new ApiError(401, msg);
export const forbidden = (msg = 'Accès refusé') => new ApiError(403, msg);
export const notFound = (msg = 'Introuvable') => new ApiError(404, msg);

export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) => {
    try {
      const out = fn(req, res, next);
      if (out instanceof Promise) out.catch(next);
    } catch (err) {
      next(err);
    }
  };

export interface AuthedRequest extends Request {
  userId?: string;
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) {
    const payload = verifyAccessToken(header.slice(7));
    if (payload) req.userId = payload.sub;
  }
  next();
}

/** Fenêtre glissante en mémoire, clé par IP (un seul process : OK pour ce projet). */
export const rateLimit = (options: { windowMs: number; max: number }): RequestHandler => {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const sweep = setInterval(() => {
    const t = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= t) hits.delete(key);
  }, options.windowMs);
  sweep.unref();

  return (req, res, next) => {
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const t = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + options.windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > options.max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - t) / 1000))));
      res.status(429).json({ error: 'Trop de tentatives, réessaie dans un instant' });
      return;
    }
    next();
  };
};

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentification requise' });
    return;
  }
  const payload = verifyAccessToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ error: 'Session expirée ou invalide' });
    return;
  }
  req.userId = payload.sub;
  next();
}

export const str = (v: unknown, max = 5000): string => String(v ?? '').trim().slice(0, max);
export const int = (v: unknown, fallback = 0): number => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
};
export const bool = (v: unknown): boolean => v === true || v === 'true' || v === 1 || v === '1';
export const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(String(v)) ? (String(v) as T) : fallback;

export const offsetOf = (req: Request, def = 0, max = 5000): number =>
  Math.min(Math.max(int(req.query.offset, def), 0), max);
