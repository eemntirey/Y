import { Router } from 'express';
import { all, get, now, run, tx, uid } from '../db/index.js';
import { bad, notFound, requireAuth, str, wrap, type AuthedRequest } from '../lib/http.js';
import { serializeUser } from '../lib/serialize.js';
import { notify, push } from '../lib/notify.js';

export const messageRouter = Router();

const conversationFor = (a: string, b: string): string => {
  const existing = get<{ id: string }>(
    `SELECT c.id FROM conversations c
     JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = :a
     JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = :b
     LIMIT 1`,
    { a, b },
  );
  if (existing) return existing.id;

  const id = uid();
  const ts = now();
  tx(() => {
    run('INSERT INTO conversations (id, created_at, updated_at) VALUES (?,?,?)', [id, ts, ts]);
    for (const uid_ of [a, b])
      run('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?,?)', [id, uid_]);
  });
  return id;
};

const serializeConversation = (row: {
  id: string;
  other_id: string;
  other_username: string;
  other_display: string;
  other_avatar: string | null;
  other_verified: number;
  other_private: number;
  other_bio: string;
  other_link: string;
  other_followers: number;
  other_following: number;
  other_likes: number;
  other_videos: number;
  other_coins: number;
  other_created: string;
  last_body: string | null;
  last_at: string | null;
  last_kind: string | null;
  unread: number;
}, viewerId?: string) => {
  const other = serializeUser(
    {
      id: row.other_id,
      username: row.other_username,
      display_name: row.other_display,
      avatar: row.other_avatar,
      bio: row.other_bio,
      link: row.other_link,
      verified: row.other_verified,
      is_private: row.other_private,
      follower_count: row.other_followers,
      following_count: row.other_following,
      like_count: row.other_likes,
      video_count: row.other_videos,
      coin_balance: row.other_coins,
      created_at: row.other_created,
    },
    viewerId,
  );
  return {
    id: row.id,
    user: other,
    lastMessage: row.last_body ? { body: row.last_body, kind: row.last_kind, createdAt: row.last_at } : null,
    unread: row.unread,
  };
};

const BASE = `SELECT c.id, o.id AS other_id, o.username AS other_username,
  o.display_name AS other_display, o.avatar AS other_avatar, o.verified AS other_verified,
  o.is_private AS other_private, o.bio AS other_bio, o.link AS other_link,
  o.follower_count AS other_followers, o.following_count AS other_following,
  o.like_count AS other_likes, o.video_count AS other_videos, o.coin_balance AS other_coins,
  o.created_at AS other_created,
  (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_body,
  (SELECT kind FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_kind,
  (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_at,
  (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND user_id != :me AND seen = 0) AS unread
  FROM conversations c
  JOIN conversation_members mine ON mine.conversation_id = c.id AND mine.user_id = :me
  JOIN conversation_members theirs ON theirs.conversation_id = c.id AND theirs.user_id != :me
  JOIN users o ON o.id = theirs.user_id`;

messageRouter.get(
  '/conversations',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const rows = all(BASE + ' ORDER BY COALESCE(last_at, c.created_at) DESC LIMIT 100', { me: req.userId });
    res.json({ items: rows.map((r) => serializeConversation(r as never, req.userId)) });
  }),
);

messageRouter.post(
  '/conversations',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const username = str(req.body?.username, 24).toLowerCase();
    const target = get<{ id: string }>('SELECT id FROM users WHERE lower(username) = ?', [username]);
    if (!target) throw notFound('Compte introuvable');
    if (target.id === req.userId) throw bad('Impossible de se contacter soi-même');
    const id = conversationFor(req.userId!, target.id);
    res.status(201).json({ id });
  }),
);

messageRouter.get(
  '/conversations/:id',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const id = str(req.params.id, 64);
    if (!get('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [id, req.userId]))
      throw notFound('Conversation introuvable');
    const rows = all(
      `SELECT m.id, m.user_id, m.kind, m.body, m.attachment, m.seen, m.created_at,
              u.username, u.display_name, u.avatar
       FROM messages m JOIN users u ON u.id = m.user_id
       WHERE m.conversation_id = ? ORDER BY m.created_at ASC LIMIT 300`,
      [id],
    );
    tx(() => {
      run('UPDATE messages SET seen = 1 WHERE conversation_id = ? AND user_id != ? AND seen = 0', [id, req.userId]);
      run('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?', [
        now(),
        id,
        req.userId,
      ]);
    });
    res.json({
      id,
      items: rows.map((r) => ({
        id: r.id,
        mine: r.user_id === req.userId,
        kind: r.kind,
        body: r.body,
        attachment: r.attachment,
        seen: !!r.seen,
        createdAt: r.created_at,
        author: { username: r.username, displayName: r.display_name || r.username, avatar: r.avatar },
      })),
    });
  }),
);

messageRouter.post(
  '/conversations/:id/messages',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const id = str(req.params.id, 64);
    const members = all<{ user_id: string }>(
      'SELECT user_id FROM conversation_members WHERE conversation_id = ?',
      [id],
    );
    if (members.length < 2 || !members.some((m) => m.user_id === req.userId))
      throw notFound('Conversation introuvable');

    const body = str(req.body?.body, 2000);
    const kind = str(req.body?.kind, 12) === 'video' ? 'video' : 'text';
    const attachment = str(req.body?.attachment, 500) || null;
    if (!body && !attachment) throw bad('Message vide');

    const messageId = uid();
    const ts = now();
    tx(() => {
      run('INSERT INTO messages (id, conversation_id, user_id, kind, body, attachment, created_at) VALUES (?,?,?,?,?,?,?)', [
        messageId,
        id,
        req.userId,
        kind,
        body,
        attachment,
        ts,
      ]);
      run('UPDATE conversations SET updated_at = ? WHERE id = ?', [ts, id]);
    });

    const payload = {
      type: 'message',
      conversationId: id,
      message: {
        id: messageId,
        mine: true,
        kind,
        body,
        attachment,
        seen: false,
        createdAt: ts,
      },
    };
    for (const m of members) {
      if (m.user_id === req.userId) continue;
      push(m.user_id, payload);
      notify({ userId: m.user_id, actorId: req.userId, type: 'message', text: body.slice(0, 60) });
    }
    res.status(201).json(payload.message);
  }),
);

messageRouter.get(
  '/unread',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const count = get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM messages m
       JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = :me
       WHERE m.user_id != :me AND m.seen = 0`,
      { me: req.userId },
    );
    res.json({ unread: count?.c ?? 0 });
  }),
);

messageRouter.delete(
  '/conversations/:id',
  requireAuth,
  wrap((req: AuthedRequest, res) => {
    const id = str(req.params.id, 64);
    run('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [id, req.userId]);
    res.json({ ok: true });
  }),
);
