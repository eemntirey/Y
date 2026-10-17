import { Router } from 'express';
import { all, get, now, run, tx } from '../db/index.js';
import { bad, forbidden, int, notFound, offsetOf, requireAuth, str, wrap, type AuthedRequest } from '../lib/http.js';
import { loadUser, loadUserByUsername, serializeUser, serializeVideo, USER_COLUMNS, type UserRow, type VideoRow } from '../lib/serialize.js';
import { notify, push } from '../lib/notify.js';

export const userRouter = Router();

const ALL_USERS = `SELECT ${USER_COLUMNS.join(', ')} FROM users`;

userRouter.get(
  '/suggestions',
  wrap((req: AuthedRequest, res) => {
    const limit = Math.min(int(req.query.limit, 8), 30);
    const rows = all<UserRow>(
      `${ALL_USERS} u
       WHERE u.id != COALESCE(:me, '') AND u.is_private = 0
         AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = COALESCE(:me, ''))
       ORDER BY (u.follower_count * 2 + u.like_count * 0.1) DESC LIMIT :limit`,
      { me: req.userId ?? '', limit },
    );
    res.json({ items: rows.map((r) => serializeUser(r, req.userId)) });
  }),
);

userRouter.get(
  '/search',
  wrap((req: AuthedRequest, res) => {
    const term = str(req.query.q, 60);
    if (!term) return res.json({ items: [] });
    const like = `%${term.toLowerCase()}%`;
    const rows = all<UserRow>(
      `${ALL_USERS} u
       WHERE (lower(u.username) LIKE :like OR lower(u.display_name) LIKE :like)
         AND u.id != COALESCE(:me, '')
       ORDER BY (u.verified DESC, u.follower_count DESC) LIMIT 20`,
      { like, me: req.userId ?? '' },
    );
    res.json({ items: rows.map((r) => serializeUser(r, req.userId)) });
  }),
);

userRouter.get(
  '/:username',
  wrap((req: AuthedRequest, res) => {
    const user = loadUserByUsername(str(req.params.username, 24).toLowerCase());
    if (!user) throw notFound('Compte introuvable');
    const viewerId = req.userId;
    if (user.is_private && viewerId !== user.id) {
      const follows = viewerId
        ? !!get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', [viewerId, user.id])
        : false;
      if (!follows) {
        return res.json({ user: serializeUser(user, viewerId), locked: true, videos: [] });
      }
    }
    const rows = all<VideoRow>(
      `SELECT * FROM videos WHERE user_id = ? AND (visibility = 'public' OR ? = user_id) ORDER BY pinned DESC, created_at DESC`,
      [user.id, viewerId ?? ''],
    );
    res.json({
      user: serializeUser(user, viewerId),
      locked: false,
      videos: rows.map((r) => serializeVideo(r, viewerId)),
    });
  }),
);

userRouter.get(
  '/:username/videos',
  wrap((req: AuthedRequest, res) => {
    const user = loadUserByUsername(str(req.params.username, 24).toLowerCase());
    if (!user) throw notFound('Compte introuvable');
    const tab = str(req.query.tab, 12) || 'videos';
    const offset = offsetOf(req);
    const limit = Math.min(int(req.query.limit, 18), 30);

    let rows: VideoRow[] = [];
    if (tab === 'liked') {
      if (!req.userId) return res.json({ items: [], nextOffset: null });
      rows = all<VideoRow>(
        `SELECT v.* FROM videos v JOIN likes l ON l.video_id = v.id
         WHERE l.user_id = ? AND v.visibility = 'public' ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
        [user.id, limit + 1, offset],
      );
    } else if (tab === 'saved') {
      if (req.userId !== user.id) throw forbidden();
      rows = all<VideoRow>(
        `SELECT v.* FROM videos v JOIN saves s ON s.video_id = v.id
         WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
        [user.id, limit + 1, offset],
      );
    } else {
      rows = all<VideoRow>(
        `SELECT * FROM videos WHERE user_id = ? AND visibility = 'public' ORDER BY pinned DESC, created_at DESC LIMIT ? OFFSET ?`,
        [user.id, limit + 1, offset],
      );
    }
    const hasMore = rows.length > limit;
    res.json({
      items: rows.slice(0, limit).map((r) => serializeVideo(r, req.userId)),
      nextOffset: hasMore ? offset + limit : null,
    });
  }),
);

userRouter.post(
  '/:username/follow',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const target = loadUserByUsername(str(req.params.username, 24).toLowerCase());
    if (!target) throw notFound('Compte introuvable');
    if (target.id === req.userId) throw bad('Impossible de te suivre toi-même');
    if (get('SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?', [target.id, req.userId]))
      throw forbidden("Ce compte ne peut pas être suivi");

    const existing = get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', [
      req.userId,
      target.id,
    ]);
    tx(() => {
      if (existing) {
        run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [req.userId, target.id]);
        run('UPDATE users SET following_count = MAX(0, following_count - 1) WHERE id = ?', [req.userId]);
        run('UPDATE users SET follower_count = MAX(0, follower_count - 1) WHERE id = ?', [target.id]);
      } else {
        run('INSERT INTO follows (follower_id, following_id, created_at) VALUES (?,?,?)', [
          req.userId,
          target.id,
          now(),
        ]);
        run('UPDATE users SET following_count = following_count + 1 WHERE id = ?', [req.userId]);
        run('UPDATE users SET follower_count = follower_count + 1 WHERE id = ?', [target.id]);
        notify({ userId: target.id, actorId: req.userId, type: 'follow' });
        push(target.id, { type: 'notification', unread: true });
      }
    });
    res.json({ following: !existing, user: serializeUser(loadUser(target.id)!, req.userId) });
  }),
);

userRouter.get(
  '/:username/followers',
  wrap((req: AuthedRequest, res) => {
    const user = loadUserByUsername(str(req.params.username, 24).toLowerCase());
    if (!user) throw notFound('Compte introuvable');
    const rows = all<UserRow>(
      `SELECT ${USER_COLUMNS.map((c) => `f.${c}`).join(', ')}
       FROM follows fo JOIN users f ON f.id = fo.follower_id
       WHERE fo.following_id = ? ORDER BY fo.created_at DESC LIMIT 200`,
      [user.id],
    );
    res.json({ items: rows.map((r) => serializeUser(r, req.userId)) });
  }),
);

userRouter.get(
  '/:username/following',
  wrap((req: AuthedRequest, res) => {
    const user = loadUserByUsername(str(req.params.username, 24).toLowerCase());
    if (!user) throw notFound('Compte introuvable');
    const rows = all<UserRow>(
      `SELECT ${USER_COLUMNS.map((c) => `f.${c}`).join(', ')}
       FROM follows fo JOIN users f ON f.id = fo.following_id
       WHERE fo.follower_id = ? ORDER BY fo.created_at DESC LIMIT 200`,
      [user.id],
    );
    res.json({ items: rows.map((r) => serializeUser(r, req.userId)) });
  }),
);

userRouter.post(
  '/:username/block',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const target = loadUserByUsername(str(req.params.username, 24).toLowerCase());
    if (!target) throw notFound('Compte introuvable');
    if (target.id === req.userId) throw bad('Impossible');
    const existing = get('SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?', [req.userId, target.id]);
    tx(() => {
      if (existing) run('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?', [req.userId, target.id]);
      else {
        run('INSERT INTO blocks (user_id, blocked_id, created_at) VALUES (?,?,?)', [req.userId, target.id, now()]);
        run('DELETE FROM follows WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)', [
          req.userId,
          target.id,
          target.id,
          req.userId,
        ]);
      }
      const fresh = get<{ following_count: number; follower_count: number }>(
        `SELECT (SELECT COUNT(*) FROM follows WHERE follower_id = :id) AS following_count,
                (SELECT COUNT(*) FROM follows WHERE following_id = :id) AS follower_count`,
        { id: req.userId },
      );
      run('UPDATE users SET following_count = ?, follower_count = ?, updated_at = ? WHERE id = ?', [
        fresh!.following_count,
        fresh!.follower_count,
        now(),
        req.userId,
      ]);
    });
    res.json({ blocked: !existing });
  }),
);

userRouter.get(
  '/me/videos/analytics',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const rows = all<{
      id: string;
      description: string;
      view_count: number;
      like_count: number;
      comment_count: number;
      share_count: number;
      created_at: string;
    }>(
      `SELECT id, description, view_count, like_count, comment_count, share_count, created_at
       FROM videos WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`,
      [req.userId],
    );
    const totals = rows.reduce(
      (acc, r) => ({
        views: acc.views + r.view_count,
        likes: acc.likes + r.like_count,
        comments: acc.comments + r.comment_count,
        shares: acc.shares + r.share_count,
      }),
      { views: 0, likes: 0, comments: 0, shares: 0 },
    );
    const days = all<{ day: string; views: number }>(
      `SELECT substr(created_at, 1, 10) AS day, SUM(view_count) AS views
       FROM videos WHERE user_id = ? GROUP BY day ORDER BY day DESC LIMIT 30`,
      [req.userId],
    );
    res.json({ totals, videos: rows, timeline: days.reverse() });
  }),
);

userRouter.post(
  '/me/avatar',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const url = str(req.body?.avatar, 500);
    if (!url) throw bad('Avatar manquant');
    run('UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?', [url, now(), req.userId]);
    const username = get<{ username: string }>('SELECT username FROM users WHERE id = ?', [req.userId])!.username;
    res.json({ user: serializeUser(loadUserByUsername(username)!, req.userId) });
  }),
);

export const internalUserId = (username: string): string | undefined =>
  get<{ id: string }>('SELECT id FROM users WHERE lower(username) = ?', [username.toLowerCase()])?.id;
