import { all, get, run, uid, now } from '../db/index.js';

type NotificationType = 'like' | 'comment' | 'follow' | 'mention' | 'video' | 'message' | 'live' | 'system';

export function notify(input: {
  userId: string;
  actorId?: string | null;
  type: NotificationType;
  videoId?: string | null;
  commentId?: string | null;
  text?: string;
}): void {
  if (input.userId === input.actorId) return;
  if (get('SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?', [input.userId, input.actorId ?? '']))
    return;
  run(
    `INSERT INTO notifications (id, user_id, actor_id, type, video_id, comment_id, text, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      uid(),
      input.userId,
      input.actorId ?? null,
      input.type,
      input.videoId ?? null,
      input.commentId ?? null,
      input.text ?? '',
      now(),
    ],
  );
}

export function serializeNotification(row: {
  id: string;
  type: string;
  text: string;
  seen: number;
  created_at: string;
  video_id: string | null;
  actor_id: string | null;
  actor_username: string | null;
  actor_display: string | null;
  actor_avatar: string | null;
}) {
  return {
    id: row.id,
    type: row.type,
    text: row.text,
    seen: !!row.seen,
    createdAt: row.created_at,
    videoId: row.video_id,
    actor: row.actor_id
      ? {
          id: row.actor_id,
          username: row.actor_username ?? '',
          displayName: row.actor_display ?? '',
          avatar: row.actor_avatar,
        }
      : null,
  };
}

const SELECT = `SELECT n.id, n.type, n.text, n.seen, n.created_at, n.video_id,
  a.id AS actor_id, a.username AS actor_username, a.display_name AS actor_display, a.avatar AS actor_avatar
  FROM notifications n LEFT JOIN users a ON a.id = n.actor_id`;

export const listNotifications = (userId: string, limit = 50) =>
  all<{
    id: string;
    type: string;
    text: string;
    seen: number;
    created_at: string;
    video_id: string | null;
    actor_id: string | null;
    actor_username: string | null;
    actor_display: string | null;
    actor_avatar: string | null;
  }>(`${SELECT} WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT ?`, [userId, limit]).map(serializeNotification);

export const unreadCount = (userId: string) =>
  get<{ c: number }>('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND seen = 0', [userId])?.c ?? 0;

export type Sender = (userId: string, payload: unknown) => void;

let sender: Sender = () => {};

export const setSender = (fn: Sender): void => {
  sender = fn;
};

export const push = (userId: string, payload: unknown): void => sender(userId, payload);
