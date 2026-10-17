import { Router } from 'express';
import { all, get, now, run, tx, uid } from '../db/index.js';
import { int, notFound, offsetOf, requireAuth, str, wrap, type AuthedRequest } from '../lib/http.js';
import { serializeUser, serializeVideo, USER_COLUMNS, type UserRow, type VideoRow } from '../lib/serialize.js';
import { listNotifications, unreadCount } from '../lib/notify.js';

export const discoverRouter = Router();
export const notificationRouter = Router();

// ---------- Hashtags ----------

discoverRouter.get(
  '/hashtags/trending',
  wrap((_req, res) => {
    const rows = all<{ id: string; name: string; video_count: number; total_views: number }>(
      `SELECT * FROM (
         SELECT h.id, h.name,
           (SELECT COUNT(*) FROM video_hashtags vh JOIN videos v ON v.id = vh.video_id
             WHERE vh.hashtag_id = h.id AND v.visibility = 'public') AS video_count,
           (SELECT COALESCE(SUM(v.view_count), 0) FROM video_hashtags vh JOIN videos v ON v.id = vh.video_id
             WHERE vh.hashtag_id = h.id AND v.visibility = 'public') AS total_views
         FROM hashtags h
       ) WHERE video_count > 0
       ORDER BY (total_views * 0.4 + video_count * 12) DESC
       LIMIT 30`,
    );
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        videoCount: r.video_count,
        viewCount: r.total_views,
      })),
    });
  }),
);

discoverRouter.get(
  '/hashtags/:name',
  wrap((req: AuthedRequest, res) => {
    const name = str(req.params.name, 40).replace(/^#/, '').toLowerCase();
    const tag = get<{ id: string; name: string }>('SELECT id, name FROM hashtags WHERE name = ?', [name]);
    if (!tag) throw notFound('Hashtag introuvable');
    const offset = offsetOf(req);
    const limit = Math.min(int(req.query.limit, 18), 30);
    const rows = all<VideoRow>(
      `SELECT v.* FROM video_hashtags vh JOIN videos v ON v.id = vh.video_id
       JOIN users u ON u.id = v.user_id
       WHERE vh.hashtag_id = ? AND v.visibility = 'public' AND u.is_private = 0
       ORDER BY (v.like_count * 2 + v.view_count * 0.1) DESC LIMIT ? OFFSET ?`,
      [tag.id, limit + 1, offset],
    );
    const stats = get<{ c: number; views: number }>(
      `SELECT COUNT(*) AS c, COALESCE(SUM(v.view_count),0) AS views
       FROM video_hashtags vh JOIN videos v ON v.id = vh.video_id
       WHERE vh.hashtag_id = ? AND v.visibility = 'public'`,
      [tag.id],
    );
    res.json({
      hashtag: { id: tag.id, name: tag.name, videoCount: stats?.c ?? 0, viewCount: stats?.views ?? 0 },
      items: rows.slice(0, limit).map((r) => serializeVideo(r, req.userId)),
      nextOffset: rows.length > limit ? offset + limit : null,
    });
  }),
);

discoverRouter.get(
  '/hashtags/:name/related',
  wrap((req, res) => {
    const tag = get<{ id: string; name: string }>('SELECT id, name FROM hashtags WHERE name = ?', [
      str(req.params.name, 40).replace(/^#/, '').toLowerCase(),
    ]);
    if (!tag) throw notFound('Hashtag introuvable');
    const rows = all<{ name: string; shared: number }>(
      `SELECT h2.name, COUNT(*) AS shared
       FROM video_hashtags vh1
       JOIN video_hashtags vh2 ON vh2.video_id = vh1.video_id AND vh2.hashtag_id != vh1.hashtag_id
       JOIN hashtags h2 ON h2.id = vh2.hashtag_id
       WHERE vh1.hashtag_id = ?
       GROUP BY h2.id ORDER BY shared DESC LIMIT 12`,
      [tag.id],
    );
    res.json({ items: rows.map((r) => ({ name: r.name, sharedCount: r.shared })) });
  }),
);

// ---------- Sons ----------

discoverRouter.get(
  '/sounds',
  wrap((req, res) => {
    const term = str(req.query.q, 40).toLowerCase();
    const rows = all<{ id: string; name: string; artist: string; path: string; cover: string | null; video_count: number }>(
      `SELECT id, name, artist, path, cover, video_count FROM sounds
       ${term ? 'WHERE lower(name) LIKE ? OR lower(artist) LIKE ?' : ''}
       ORDER BY use_count DESC, video_count DESC LIMIT 60`,
      term ? [`%${term}%`, `%${term}%`] : [],
    );
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        artist: r.artist,
        src: r.path,
        cover: r.cover,
        videoCount: r.video_count,
      })),
    });
  }),
);

discoverRouter.post(
  '/sounds',
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const name = str(req.body?.name, 80);
    const path = str(req.body?.src, 500);
    if (!name || !path) throw notFound('Nom ou fichier manquant');
    const id = uid();
    run(
      `INSERT INTO sounds (id, name, artist, path, is_original, created_at) VALUES (?,?,?,?,1,?)`,
      [id, name, str(req.body?.artist, 80) || 'Y original', path, now()],
    );
    res.status(201).json({
      sound: { id, name, artist: str(req.body?.artist, 80) || 'Y original', src: path, cover: null, videoCount: 0 },
    });
  }),
);

discoverRouter.get(
  '/sounds/:id/videos',
  wrap((req: AuthedRequest, res) => {
    const rows = all<VideoRow>(
      `SELECT v.* FROM video_sounds vs JOIN videos v ON v.id = vs.video_id
       JOIN users u ON u.id = v.user_id
       WHERE vs.sound_id = ? AND v.visibility = 'public' AND u.is_private = 0
       ORDER BY v.created_at DESC LIMIT 60`,
      [str(req.params.id, 64)],
    );
    res.json({ items: rows.map((r) => serializeVideo(r, req.userId)) });
  }),
);

// ---------- Recherche globale ----------

discoverRouter.get(
  '/search',
  wrap((req: AuthedRequest, res) => {
    const term = str(req.query.q, 60).trim();
    if (!term) return res.json({ users: [], hashtags: [], sounds: [], videos: [] });

    const like = `%${term.toLowerCase()}%`;
    const users = all<UserRow>(
      `SELECT ${USER_COLUMNS.join(', ')} FROM users
       WHERE lower(username) LIKE ? OR lower(display_name) LIKE ?
       ORDER BY verified DESC, follower_count DESC LIMIT 10`,
      [like, like],
    );
    const tags = all<{ id: string; name: string; c: number }>(
      `SELECT h.id, h.name, (SELECT COUNT(*) FROM video_hashtags vh WHERE vh.hashtag_id = h.id) AS c
       FROM hashtags h WHERE lower(h.name) LIKE ? ORDER BY c DESC LIMIT 10`,
      [like],
    );
    const sounds = all<{ id: string; name: string; artist: string; path: string; cover: string | null; video_count: number }>(
      `SELECT id, name, artist, path, cover, video_count FROM sounds
       WHERE lower(name) LIKE ? OR lower(artist) LIKE ? ORDER BY use_count DESC LIMIT 10`,
      [like, like],
    );
    const videos = all<VideoRow>(
      `SELECT v.* FROM videos v JOIN users u ON u.id = v.user_id
       WHERE v.visibility = 'public' AND u.is_private = 0 AND v.description LIKE ?
       ORDER BY (v.like_count * 2 + v.view_count * 0.1) DESC LIMIT 20`,
      [`%${term}%`],
    );

    if (req.userId)
      run('INSERT INTO search_history (user_id, term, created_at) VALUES (?,?,?)', [req.userId, term, now()]);

    res.json({
      users: users.map((r) => serializeUser(r, req.userId)),
      hashtags: tags.map((t) => ({ id: t.id, name: t.name, videoCount: t.c })),
      sounds: sounds.map((s) => ({ id: s.id, name: s.name, artist: s.artist, src: s.path, cover: s.cover, videoCount: s.video_count })),
      videos: videos.map((v) => serializeVideo(v, req.userId)),
    });
  }),
);

discoverRouter.get(
  '/search/history',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const rows = all<{ term: string }>(
      'SELECT term FROM search_history WHERE user_id = ? GROUP BY term ORDER BY MAX(created_at) DESC LIMIT 12',
      [req.userId],
    );
    res.json({ items: rows.map((r) => r.term) });
  }),
);

discoverRouter.delete(
  '/search/history',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    if (boolBody(req)) run('DELETE FROM search_history WHERE user_id = ?', [req.userId]);
    res.json({ ok: true });
  }),
);

const boolBody = (req: { body?: unknown }): boolean => {
  const b = req.body as { all?: unknown } | undefined;
  return b?.all === true || b?.all === 'true' || b?.all === 1;
};

// ---------- Notifications ----------

notificationRouter.get(
  '/',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    res.json({ items: listNotifications(req.userId!), unread: unreadCount(req.userId!) });
  }),
);

notificationRouter.get(
  '/unread',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    res.json({ unread: unreadCount(req.userId!) });
  }),
);

notificationRouter.post(
  '/seen',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    tx(() => {
      const id = str(req.body?.id, 64);
      if (id) run('UPDATE notifications SET seen = 1 WHERE id = ? AND user_id = ?', [id, req.userId]);
      else run('UPDATE notifications SET seen = 1 WHERE user_id = ?', [req.userId]);
    });
    res.json({ ok: true, unread: unreadCount(req.userId!) });
  }),
);

// ---------- Signalements / modération ----------

discoverRouter.post(
  '/reports',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const targetType = str(req.body?.targetType, 20);
    const targetId = str(req.body?.targetId, 64);
    const reason = str(req.body?.reason, 60);
    if (!['video', 'comment', 'user', 'live', 'product', 'message'].includes(targetType))
      throw notFound('Type de cible invalide');
    if (!targetId || !reason) throw notFound('Cible ou motif manquant');
    run(
      'INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, created_at) VALUES (?,?,?,?,?,?,?)',
      [uid(), req.userId, targetType, targetId, reason, str(req.body?.details, 1000), now()],
    );
    res.status(201).json({ ok: true });
  }),
);
