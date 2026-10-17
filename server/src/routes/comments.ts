import { Router } from 'express';
import { all, get, now, run, tx, uid } from '../db/index.js';
import { bad, int, notFound, offsetOf, requireAuth, str, wrap, type AuthedRequest } from '../lib/http.js';
import { loadUser, serializeUser, USER_COLUMNS, type UserRow } from '../lib/serialize.js';
import { notify, push } from '../lib/notify.js';

export const commentRouter = Router();

interface CommentRow {
  id: string;
  video_id: string;
  user_id: string;
  parent_id: string | null;
  text: string;
  like_count: number;
  created_at: string;
}

const serialize = (row: CommentRow, viewerId?: string) => {
  const author = loadUser(row.user_id);
  const replies = get<{ c: number }>(
    'SELECT COUNT(*) AS c FROM comments WHERE parent_id = ?',
    [row.id],
  );
  return {
    id: row.id,
    text: row.text,
    likeCount: row.like_count,
    createdAt: row.created_at,
    parentId: row.parent_id,
    replyCount: replies?.c ?? 0,
    liked: viewerId ? !!get('SELECT 1 FROM comment_likes WHERE user_id = ? AND comment_id = ?', [viewerId, row.id]) : false,
    author: author ? serializeUser(author, viewerId) : null,
  };
};

commentRouter.get(
  '/video/:videoId',
  wrap((req: AuthedRequest, res) => {
    const videoId = str(req.params.videoId, 64);
    const offset = offsetOf(req);
    const limit = Math.min(int(req.query.limit, 20), 50);
    const sort = str(req.query.sort, 8) === 'old' ? 'old' : 'top';

    const rows = all<CommentRow>(
      `SELECT * FROM comments WHERE video_id = ? AND parent_id IS NULL
       ORDER BY ${sort === 'top' ? 'like_count DESC, created_at DESC' : 'created_at DESC'}
       LIMIT ? OFFSET ?`,
      [videoId, limit, offset],
    );
    const withReplies = rows.map((row) => ({
      ...serialize(row, req.userId),
      replies: all<CommentRow>('SELECT * FROM comments WHERE parent_id = ? ORDER BY created_at ASC LIMIT 3', [row.id]).map(
        (r) => serialize(r, req.userId),
      ),
    }));
    res.json({ items: withReplies, nextOffset: rows.length === limit ? offset + limit : null });
  }),
);

commentRouter.post(
  '/video/:videoId',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const videoId = str(req.params.videoId, 64);
    const video = get<{ id: string; user_id: string; allow_comment: number }>(
      'SELECT id, user_id, allow_comment FROM videos WHERE id = ?',
      [videoId],
    );
    if (!video) throw notFound('Vidéo introuvable');
    if (!video.allow_comment) throw bad('Les commentaires sont désactivés sur cette vidéo');

    const text = str(req.body?.text, 500);
    if (!text) throw bad('Commentaire vide');
    const parentId = str(req.body?.parentId, 64) || null;
    if (parentId) {
      const parent = get<CommentRow>('SELECT * FROM comments WHERE id = ?', [parentId]);
      if (!parent || parent.video_id !== videoId) throw bad('Commentaire parent introuvable');
      if (parent.parent_id) throw bad('Impossible de répondre à une réponse');
    }

    const id = uid();
    tx(() => {
      run('INSERT INTO comments (id, video_id, user_id, parent_id, text, created_at) VALUES (?,?,?,?,?,?)', [
        id,
        videoId,
        req.userId,
        parentId,
        text,
        now(),
      ]);
      run('UPDATE videos SET comment_count = comment_count + 1 WHERE id = ?', [videoId]);

      const target = parentId
        ? get<CommentRow>('SELECT * FROM comments WHERE id = ?', [parentId])!
        : null;
      notify({
        userId: target ? target.user_id : video.user_id,
        actorId: req.userId,
        type: 'comment',
        videoId,
        commentId: id,
        text: text.slice(0, 120),
      });
      push(target ? target.user_id : video.user_id, { type: 'notification', unread: true });
    });

    res.status(201).json({ comment: serialize(get<CommentRow>('SELECT * FROM comments WHERE id = ?', [id])!, req.userId) });
  }),
);

commentRouter.post(
  '/:id/like',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const row = get<CommentRow>('SELECT * FROM comments WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Commentaire introuvable');
    const liked = get('SELECT 1 FROM comment_likes WHERE user_id = ? AND comment_id = ?', [req.userId, row.id]);
    tx(() => {
      if (liked) {
        run('DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?', [req.userId, row.id]);
        run('UPDATE comments SET like_count = MAX(0, like_count - 1) WHERE id = ?', [row.id]);
      } else {
        run('INSERT INTO comment_likes (user_id, comment_id) VALUES (?,?)', [req.userId, row.id]);
        run('UPDATE comments SET like_count = like_count + 1 WHERE id = ?', [row.id]);
      }
    });
    const fresh = get<{ like_count: number }>('SELECT like_count FROM comments WHERE id = ?', [row.id])!;
    res.json({ liked: !liked, likeCount: fresh.like_count });
  }),
);

commentRouter.delete(
  '/:id',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const row = get<CommentRow>('SELECT * FROM comments WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Commentaire introuvable');
    const videoOwner = get<{ user_id: string }>('SELECT user_id FROM videos WHERE id = ?', [row.video_id]);
    if (row.user_id !== req.userId && videoOwner?.user_id !== req.userId)
      throw bad('Vous ne pouvez pas supprimer ce commentaire');

    tx(() => {
      const descendants = all<{ id: string }>(
        'WITH RECURSIVE tree(id) AS (SELECT id FROM comments WHERE id = :id UNION ALL SELECT c.id FROM comments c JOIN tree ON c.parent_id = tree.id) SELECT id FROM tree',
        { id: row.id },
      );
      for (const d of descendants) {
        run('DELETE FROM comments WHERE id = ?', [d.id]);
      }
      run('UPDATE videos SET comment_count = MAX(0, comment_count - ?) WHERE id = ?', [descendants.length, row.video_id]);
    });
    res.json({ ok: true });
  }),
);

commentRouter.get(
  '/mention/search',
  wrap((req: AuthedRequest, res) => {
    const term = str(req.query.q, 40).toLowerCase();
    if (!term) return res.json({ items: [] });
    const rows = all<UserRow>(
      `SELECT ${USER_COLUMNS.join(', ')} FROM users WHERE username LIKE ? OR display_name LIKE ? LIMIT 10`,
      [`%${term}%`, `%${term}%`],
    );
    res.json({ items: rows.map((r) => serializeUser(r, req.userId)) });
  }),
);

commentRouter.post(
  '/video/:videoId/mentions',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const videoId = str(req.params.videoId, 64);
    const video = get<{ id: string; user_id: string }>('SELECT id, user_id FROM videos WHERE id = ?', [videoId]);
    if (!video) throw notFound('Vidéo introuvable');
    const usernames = (Array.isArray(req.body?.usernames) ? req.body.usernames : []).map((u: unknown) =>
      String(u).toLowerCase(),
    );
    let notified = 0;
    for (const username of usernames.slice(0, 10)) {
      const target = get<{ id: string }>('SELECT id FROM users WHERE lower(username) = ?', [username]);
      if (!target) continue;
      notify({ userId: target.id, actorId: req.userId, type: 'mention', videoId });
      push(target.id, { type: 'notification', unread: true });
      notified++;
    }
    res.json({ notified });
  }),
);
