import { Router } from 'express';
import multer from 'multer';
import { extname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { UPLOAD_DIR, all, bumpUserCounts, get, now, run, syncHashtags, tx, uid } from '../db/index.js';
import { config } from '../config.js';
import { bad, bool, forbidden, int, notFound, offsetOf, oneOf, requireAuth, str, wrap, type AuthedRequest } from '../lib/http.js';
import { loadUserByUsername, serializeVideo, type VideoRow } from '../lib/serialize.js';
import { notify, push } from '../lib/notify.js';

export const videoRouter = Router();

const VIDEO_DIR = join(UPLOAD_DIR, 'videos');
const THUMB_DIR = join(UPLOAD_DIR, 'thumbs');
const SOUND_DIR = join(UPLOAD_DIR, 'sounds');
for (const dir of [VIDEO_DIR, THUMB_DIR, SOUND_DIR]) mkdirSync(dir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VIDEO_DIR),
  filename: (_req, file, cb) => cb(null, `${randomBytes(12).toString('hex')}${extname(file.originalname) || '.mp3'}`),
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/')) return cb(null, true);
    cb(new Error('Seules les vidéos sont acceptées'));
  },
});

const FEED_COLUMNS = `v.* FROM videos v
  JOIN users u ON u.id = v.user_id
  WHERE v.visibility = 'public' AND u.is_private = 0
    AND v.user_id NOT IN (SELECT blocked_id FROM blocks WHERE user_id = :me)
    AND v.user_id NOT IN (SELECT user_id FROM blocks WHERE blocked_id = :me)`;

function feedRows(mode: string, viewerId: string | undefined, offset: number, limit: number): VideoRow[] {
  if (mode === 'following') {
    if (!viewerId) return [];
    return all<VideoRow>(
      `SELECT v.* FROM videos v
       JOIN users u ON u.id = v.user_id
       WHERE v.visibility = 'public' AND u.is_private = 0
         AND (v.user_id = ? OR v.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?))
       ORDER BY v.created_at DESC LIMIT ? OFFSET ?`,
      [viewerId, viewerId, limit, offset],
    );
  }
  if (mode === 'favorites') {
    if (!viewerId) return [];
    return all<VideoRow>(
      `SELECT v.* FROM videos v
       JOIN users u ON u.id = v.user_id
       WHERE v.visibility = 'public' AND u.is_private = 0 AND v.id IN (SELECT video_id FROM saves WHERE user_id = ?)
       ORDER BY v.created_at DESC LIMIT ? OFFSET ?`,
      [viewerId, limit, offset],
    );
  }
  if (mode === 'friends') {
    if (!viewerId) return [];
    return all<VideoRow>(
      `SELECT v.* FROM videos v
       JOIN users u ON u.id = v.user_id
       WHERE v.visibility = 'public' AND u.is_private = 0
         AND v.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
       ORDER BY (v.like_count * 3 + v.view_count + v.comment_count * 2) DESC, v.created_at DESC
       LIMIT ? OFFSET ?`,
      [viewerId, limit, offset],
    );
  }
  // foryou: score = fraîcheur + engagement, avec un léger biais exploration
  return all<VideoRow>(
    `SELECT ${FEED_COLUMNS}
     ORDER BY (
       (strftime('%s', 'now') - strftime('%s', v.created_at)) / 60.0
       - (v.like_count * 1.2 + v.comment_count * 2.0 + v.share_count * 1.5 + v.view_count * 0.05)
     ) ASC
     LIMIT :limit OFFSET :offset`,
    { me: viewerId ?? '', limit, offset },
  );
}

videoRouter.get(
  '/feed',
  wrap((req: AuthedRequest, res) => {
    const mode = oneOf(req.query.mode, ['foryou', 'following', 'friends', 'favorites'] as const, 'foryou');
    const offset = offsetOf(req, 0, 20000);
    const limit = Math.min(int(req.query.limit, 6), 20);
    const rows = feedRows(mode, req.userId, offset, limit + 1);
    const hasMore = rows.length > limit;
    res.json({
      items: rows.slice(0, limit).map((r) => serializeVideo(r, req.userId)),
      nextOffset: hasMore ? offset + limit : null,
    });
  }),
);

videoRouter.get(
  '/:id',
  wrap((req: AuthedRequest, res) => {
    const row = get<VideoRow>('SELECT * FROM videos WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Vidéo introuvable');
    res.json({ video: serializeVideo(row, req.userId) });
  }),
);

videoRouter.post(
  '/',
  requireAuth,
  upload.single('video'),
  wrap((req: AuthedRequest, res) => {
    const file = req.file;
    if (!file) throw bad('Aucun fichier vidéo reçu');

    const description = str(req.body?.description, 2200);
    const kind = oneOf(req.body?.kind, ['original', 'duet', 'stitch'] as const, 'original');
    const parentId = str(req.body?.parentId, 64) || null;
    if (parentId && !get('SELECT 1 FROM videos WHERE id = ?', [parentId])) throw bad('Vidéo source introuvable');
    if (kind !== 'original' && !parentId) throw bad('Une vidéo de duo/stitch doit référencer une source');

    const parent = parentId ? get<VideoRow>('SELECT * FROM videos WHERE id = ?', [parentId]) : undefined;
    if (kind === 'duet' && parent && !parent.allow_duet) throw forbidden("Ce créateur a désactivé les duos");
    if (kind === 'stitch' && parent && !parent.allow_stitch) throw forbidden("Ce créateur a désactivé les stitches");

    const id = uid();
    const ts = now();
    const rel = `videos/${file.filename}`;

    tx(() => {
      run(
        `INSERT INTO videos (id, user_id, path, thumbnail, description, kind, parent_id, stitch_offset,
           duration, visibility, allow_comment, allow_duet, allow_stitch, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          req.userId,
          rel,
          str(req.body?.thumbnail, 500) || null,
          description,
          kind,
          parentId,
          Math.max(0, int(req.body?.stitchOffset, 0)),
          Number(req.body?.duration ?? 0) || 0,
          oneOf(req.body?.visibility, ['public', 'private', 'friends'] as const, 'public'),
          bool(req.body?.allowComment ?? 'true') ? 1 : 0,
          bool(req.body?.allowDuet ?? 'true') ? 1 : 0,
          bool(req.body?.allowStitch ?? 'true') ? 1 : 0,
          ts,
        ],
      );
      syncHashtags(id, description);

      const soundId = str(req.body?.soundId, 64);
      if (soundId) {
        run('INSERT OR IGNORE INTO video_sounds (video_id, sound_id) VALUES (?, ?)', [id, soundId]);
        run('UPDATE sounds SET use_count = use_count + 1 WHERE id = ?', [soundId]);
      }

      if (parent) {
        run('UPDATE videos SET share_count = share_count + 1 WHERE id = ?', [parent.id]);
        if (parent.user_id !== req.userId)
          notify({ userId: parent.user_id, actorId: req.userId, type: 'video', videoId: id, text: kind === 'duet' ? 'a fait un duo avec votre vidéo' : 'a stitché votre vidéo' });
      }
    });

    bumpUserCounts(req.userId!);
    const row = get<VideoRow>('SELECT * FROM videos WHERE id = ?', [id])!;
    res.status(201).json({ video: serializeVideo(row, req.userId) });
  }),
);

videoRouter.patch(
  '/:id',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const row = get<VideoRow>('SELECT * FROM videos WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Vidéo introuvable');
    if (row.user_id !== req.userId) throw forbidden();

    const fields: string[] = [];
    const values: unknown[] = [];
    const push_ = (col: string, val: unknown) => {
      fields.push(`${col} = ?`);
      values.push(val);
    };
    if (req.body?.description !== undefined) push_('description', str(req.body.description, 2200));
    if (req.body?.visibility !== undefined) push_('visibility', oneOf(req.body.visibility, ['public', 'private', 'friends'] as const, 'public'));
    if (req.body?.allowComment !== undefined) push_('allow_comment', bool(req.body.allowComment) ? 1 : 0);
    if (req.body?.allowDuet !== undefined) push_('allow_duet', bool(req.body.allowDuet) ? 1 : 0);
    if (req.body?.allowStitch !== undefined) push_('allow_stitch', bool(req.body.allowStitch) ? 1 : 0);
    if (req.body?.pinned !== undefined) push_('pinned', bool(req.body.pinned) ? 1 : 0);
    if (fields.length === 0) throw bad('Aucune modification fournie');

    tx(() => {
      run(`UPDATE videos SET ${fields.join(', ')} WHERE id = ?`, [...values, row.id]);
      if (req.body?.description !== undefined) syncHashtags(row.id, str(req.body.description, 2200));
    });
    res.json({ video: serializeVideo(get<VideoRow>('SELECT * FROM videos WHERE id = ?', [row.id])!, req.userId) });
  }),
);

videoRouter.delete(
  '/:id',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const row = get<VideoRow>('SELECT * FROM videos WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Vidéo introuvable');
    if (row.user_id !== req.userId) throw forbidden();
    run('DELETE FROM videos WHERE id = ?', [row.id]);
    bumpUserCounts(row.user_id);
    res.json({ ok: true });
  }),
);

videoRouter.post(
  '/:id/like',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const row = get<VideoRow>('SELECT * FROM videos WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Vidéo introuvable');
    const liked = get('SELECT 1 FROM likes WHERE user_id = ? AND video_id = ?', [req.userId, row.id]);
    tx(() => {
      if (liked) {
        run('DELETE FROM likes WHERE user_id = ? AND video_id = ?', [req.userId, row.id]);
        run('UPDATE videos SET like_count = MAX(0, like_count - 1) WHERE id = ?', [row.id]);
      } else {
        run('INSERT INTO likes (user_id, video_id, created_at) VALUES (?,?,?)', [req.userId, row.id, now()]);
        run('UPDATE videos SET like_count = like_count + 1 WHERE id = ?', [row.id]);
        notify({ userId: row.user_id, actorId: req.userId, type: 'like', videoId: row.id });
        push(row.user_id, { type: 'notification', unread: true });
      }
      bumpUserCounts(row.user_id);
    });
    const fresh = get<{ like_count: number }>('SELECT like_count FROM videos WHERE id = ?', [row.id])!;
    res.json({ liked: !liked, likeCount: fresh.like_count });
  }),
);

videoRouter.post(
  '/:id/save',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const row = get<VideoRow>('SELECT * FROM videos WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Vidéo introuvable');
    const saved = get('SELECT 1 FROM saves WHERE user_id = ? AND video_id = ?', [req.userId, row.id]);
    if (saved) run('DELETE FROM saves WHERE user_id = ? AND video_id = ?', [req.userId, row.id]);
    else run('INSERT INTO saves (user_id, video_id, created_at) VALUES (?,?,?)', [req.userId, row.id, now()]);
    res.json({ saved: !saved });
  }),
);

videoRouter.post(
  '/:id/share',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const row = get<VideoRow>('SELECT * FROM videos WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Vidéo introuvable');
    tx(() => {
      run('INSERT INTO shares (id, video_id, user_id, channel, created_at) VALUES (?,?,?,?,?)', [
        uid(),
        row.id,
        req.userId,
        oneOf(req.body?.channel, ['link', 'dm', 'copy', 'external'] as const, 'link'),
        now(),
      ]);
      run('UPDATE videos SET share_count = share_count + 1 WHERE id = ?', [row.id]);
    });
    const fresh = get<{ share_count: number }>('SELECT share_count FROM videos WHERE id = ?', [row.id])!;
    res.json({ shareCount: fresh.share_count });
  }),
);

videoRouter.post(
  '/:id/view',
  wrap((req: AuthedRequest, res) => {
    const row = get<VideoRow>('SELECT * FROM videos WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Vidéo introuvable');
    const existing = req.userId
      ? get('SELECT 1 FROM video_views WHERE video_id = ? AND user_id = ?', [row.id, req.userId])
      : null;
    if (!existing) {
      tx(() => {
        run('INSERT OR IGNORE INTO video_views (video_id, user_id, created_at) VALUES (?,?,?)', [
          row.id,
          req.userId ?? null,
          now(),
        ]);
        run('UPDATE videos SET view_count = view_count + 1 WHERE id = ?', [row.id]);
      });
    }
    const fresh = get<{ view_count: number }>('SELECT view_count FROM videos WHERE id = ?', [row.id])!;
    res.json({ viewCount: fresh.view_count });
  }),
);

videoRouter.get(
  '/:id/related',
  wrap((req: AuthedRequest, res) => {
    const row = get<VideoRow>('SELECT * FROM videos WHERE id = ?', [str(req.params.id, 64)]);
    if (!row) throw notFound('Vidéo introuvable');
    const tags = all<{ hashtag_id: string }>('SELECT hashtag_id FROM video_hashtags WHERE video_id = ?', [row.id]);
    const tagIds = tags.map((t) => t.hashtag_id);
    const rows = all<VideoRow>(
      `SELECT v.* FROM videos v JOIN users u ON u.id = v.user_id
       WHERE v.visibility = 'public' AND u.is_private = 0 AND v.id != ?
         AND (v.user_id = ? OR v.id IN (SELECT video_id FROM video_hashtags WHERE hashtag_id IN (${tagIds.map(() => '?').join(',') || 'NULL'})))
       ORDER BY (v.like_count * 2 + v.view_count * 0.1) DESC LIMIT 20`,
      [row.id, row.user_id, ...tagIds],
    );
    res.json({ items: rows.map((r) => serializeVideo(r, req.userId)) });
  }),
);

export { feedRows, upload, VIDEO_DIR, THUMB_DIR, SOUND_DIR };
