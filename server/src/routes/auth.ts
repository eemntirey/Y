import { Router } from 'express';
import { createHash } from 'node:crypto';
import { get, run, uid, now } from '../db/index.js';
import {
  consumeSession,
  createSession,
  hashPassword,
  passwordProblem,
  signAccessToken,
  usernameProblem,
  verifyPassword,
} from '../lib/auth.js';
import { bad, bool, rateLimit, requireAuth, str, unauthorized, wrap, type AuthedRequest } from '../lib/http.js';
import { loadUserByUsername, serializeUser } from '../lib/serialize.js';

export const authRouter = Router();

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

authRouter.post(
  '/register',
  wrap(async (req, res) => {
    const username = str(req.body?.username, 24).toLowerCase();
    const email = str(req.body?.email, 160).toLowerCase();
    const password = String(req.body?.password ?? '');

    const uErr = usernameProblem(username);
    if (uErr) throw bad(uErr);
    if (!emailRe.test(email)) throw bad('Adresse e-mail invalide');
    const pErr = passwordProblem(password);
    if (pErr) throw bad(pErr);

    if (get('SELECT 1 FROM users WHERE lower(username) = ?', [username]))
      throw bad("Ce nom d'utilisateur est déjà pris");
    if (get('SELECT 1 FROM users WHERE lower(email) = ?', [email]))
      throw bad('Cette adresse e-mail est déjà utilisée');

    const id = uid();
    const ts = now();
    run(
      `INSERT INTO users (id, username, email, password_hash, display_name, bio, avatar, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        id,
        username,
        email,
        await hashPassword(password),
        str(req.body?.displayName, 40) || username,
        str(req.body?.bio, 300),
        str(req.body?.avatar, 500) || null,
        ts,
        ts,
      ],
    );
    const refresh = createSession(id, req.get('user-agent') ?? undefined);
    const user = loadUserByUsername(username)!;
    res.status(201).json({ user: serializeUser(user, id), token: signAccessToken(id, username), refresh });
  }),
);

// Anti brute-force : 10 tentatives / minute par IP.
const loginLimiter = rateLimit({ windowMs: 60_000, max: 10 });

authRouter.post(
  '/login',
  loginLimiter,
  wrap(async (req, res) => {
    const identifier = str(req.body?.identifier ?? req.body?.username ?? req.body?.email, 160).toLowerCase();
    const password = String(req.body?.password ?? '');
    const row = get<{ id: string; username: string; password_hash: string }>(
      'SELECT id, username, password_hash FROM users WHERE lower(username) = ? OR lower(email) = ?',
      [identifier, identifier],
    );
    if (!row || !(await verifyPassword(password, row.password_hash)))
      throw unauthorized('Identifiants incorrects');

    const refresh = createSession(row.id, req.get('user-agent') ?? undefined);
    res.json({
      user: serializeUser(loadUserByUsername(row.username)!, row.id),
      token: signAccessToken(row.id, row.username),
      refresh,
    });
  }),
);

authRouter.post(
  '/refresh',
  wrap(async (req, res) => {
    const refresh = String(req.body?.refresh ?? '');
    const session = refresh ? consumeSession(refresh) : null;
    if (!session) throw unauthorized('Session expirée');
    res.json({
      user: serializeUser(loadUserByUsername(session.username)!, session.userId),
      token: signAccessToken(session.userId, session.username),
      refresh: createSession(session.userId, req.get('user-agent') ?? undefined),
    });
  }),
);

authRouter.post(
  '/logout',
  wrap((req, res) => {
    const refresh = String(req.body?.refresh ?? '');
    if (refresh) {
      run('DELETE FROM sessions WHERE token_hash = ?', [createHash('sha256').update(refresh).digest('hex')]);
    }
    res.json({ ok: true });
  }),
);


authRouter.get(
  '/me',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const user = loadUserByUsername(
      get<{ username: string }>('SELECT username FROM users WHERE id = ?', [req.userId])!.username,
    );
    if (!user) throw unauthorized('Compte introuvable');
    res.json({ user: serializeUser(user, req.userId) });
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const fields: string[] = [];
    const values: unknown[] = [];
    const push = (col: string, val: unknown) => {
      fields.push(`${col} = ?`);
      values.push(val);
    };

    if (req.body?.displayName !== undefined) push('display_name', str(req.body.displayName, 40));
    if (req.body?.bio !== undefined) push('bio', str(req.body.bio, 300));
    if (req.body?.link !== undefined) push('link', str(req.body.link, 200));
    if (req.body?.avatar !== undefined) push('avatar', str(req.body.avatar, 500) || null);
    if (req.body?.isPrivate !== undefined) push('is_private', bool(req.body.isPrivate) ? 1 : 0);
    if (fields.length === 0) throw bad('Aucune modification fournie');

    push('updated_at', now());
    run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...values, req.userId]);
    const username = get<{ username: string }>('SELECT username FROM users WHERE id = ?', [req.userId])!.username;
    res.json({ user: serializeUser(loadUserByUsername(username)!, req.userId) });
  }),
);

authRouter.post(
  '/me/password',
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const row = get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [req.userId]);
    if (!row) throw unauthorized();
    const current = String(req.body?.current ?? '');
    const next = String(req.body?.next ?? '');
    if (!(await verifyPassword(current, row.password_hash)))
      throw bad('Mot de passe actuel incorrect');
    const pErr = passwordProblem(next);
    if (pErr) throw bad(pErr);
    run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
      await hashPassword(next),
      now(),
      req.userId,
    ]);
    run('DELETE FROM sessions WHERE user_id = ?', [req.userId]);
    res.json({ ok: true, token: signAccessToken(req.userId!, get<{ username: string }>('SELECT username FROM users WHERE id = ?', [req.userId])!.username), refresh: createSession(req.userId!) });
  }),
);
