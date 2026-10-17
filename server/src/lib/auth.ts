import {
  createHmac,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { get, run, uid, now } from '../db/index.js';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), keyHex.length / 2);
  const expected = Buffer.from(keyHex, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const b64u = (input: Buffer | string) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64uDecode = (input: string) => Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export interface TokenPayload {
  sub: string;
  username: string;
  iat: number;
  exp: number;
}

export function signAccessToken(userId: string, username: string): string {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64u(
    JSON.stringify({
      sub: userId,
      username,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + config.jwtTtl,
    }),
  );
  const sig = b64u(createHmac('sha256', config.jwtSecret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

export function verifyAccessToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts as [string, string, string];
  const expected = b64u(createHmac('sha256', config.jwtSecret).update(`${header}.${payload}`).digest());
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(b64uDecode(payload).toString('utf8')) as TokenPayload;
    if (typeof parsed.exp !== 'number' || parsed.exp * 1000 < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function createSession(userId: string, userAgent?: string): string {
  const refresh = randomBytes(32).toString('base64url');
  run(
    'INSERT INTO sessions (id, user_id, token_hash, user_agent, expires_at, created_at) VALUES (?,?,?,?,?,?)',
    [
      uid(),
      userId,
      sha256(refresh),
      userAgent ?? null,
      new Date(Date.now() + config.refreshTtl * 1000).toISOString(),
      now(),
    ],
  );
  return refresh;
}

export function consumeSession(refresh: string): { userId: string; username: string } | null {
  const row = get<{ id: string; user_id: string; expires_at: string }>(
    'SELECT id, user_id, expires_at FROM sessions WHERE token_hash = ?',
    [sha256(refresh)],
  );
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
  run('DELETE FROM sessions WHERE id = ?', [row.id]);
  const user = get<{ username: string }>('SELECT username FROM users WHERE id = ?', [row.user_id]);
  return user ? { userId: row.user_id, username: user.username } : null;
}

export const passwordProblem = (password: string): string | null => {
  if (password.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères';
  if (password.length > 200) return 'Le mot de passe est trop long';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password))
    return 'Le mot de passe doit contenir au moins une lettre et un chiffre';
  return null;
};

export const usernameProblem = (username: string): string | null => {
  if (!/^[a-z0-9._]{3,24}$/.test(username))
    return "Le nom d'utilisateur doit faire 3 à 24 caractères (lettres minuscules, chiffres, . _ )";
  return null;
};
