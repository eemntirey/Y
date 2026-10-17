import { all, get } from '../db/index.js';

export interface UserRow {
  id: string;
  username: string;
  email?: string;
  display_name: string;
  avatar: string | null;
  bio: string;
  link: string;
  verified: number;
  is_private: number;
  follower_count: number;
  following_count: number;
  like_count: number;
  video_count: number;
  coin_balance: number;
  created_at: string;
}

export interface VideoRow {
  id: string;
  user_id: string;
  path: string;
  thumbnail: string | null;
  cover: string | null;
  description: string;
  kind: string;
  parent_id: string | null;
  duration: number;
  visibility: string;
  allow_comment: number;
  allow_duet: number;
  allow_stitch: number;
  pinned: number;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  created_at: string;
}

const PUBLIC_USER_COLUMNS = `u.id, u.username, u.display_name, u.avatar, u.bio, u.link,
  u.verified, u.is_private, u.follower_count, u.following_count, u.like_count,
  u.video_count, u.coin_balance, u.created_at`;

/** Colonnes à sélectionner quand on charge un utilisateur depuis une requête arbitraire. */
export const USER_COLUMNS = PUBLIC_USER_COLUMNS.split(',').map((c) => c.trim().replace(/^u\./, ''));

export function serializeUser(row: UserRow, viewerId?: string) {
  let isFollowing = false;
  let followsYou = false;
  let isBlocked = false;
  if (viewerId && viewerId !== row.id) {
    isFollowing = !!get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', [viewerId, row.id]);
    followsYou = !!get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', [row.id, viewerId]);
    isBlocked = !!get('SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?', [viewerId, row.id]);
  }
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    avatar: row.avatar,
    bio: row.bio,
    link: row.link,
    verified: !!row.verified,
    isPrivate: !!row.is_private,
    stats: {
      followers: row.follower_count,
      following: row.following_count,
      likes: row.like_count,
      videos: row.video_count,
    },
    coins: viewerId && viewerId === row.id ? row.coin_balance : undefined,
    createdAt: row.created_at,
    isFollowing,
    followsYou,
    isBlocked,
  };
}

export type UserId = string | undefined;
export const loadUser = (id: string): UserRow | undefined =>
  get<UserRow>(`SELECT ${PUBLIC_USER_COLUMNS} FROM users u WHERE u.id = ?`, [id]);

export const loadUserByUsername = (username: string): UserRow | undefined =>
  get<UserRow>(`SELECT ${PUBLIC_USER_COLUMNS} FROM users u WHERE u.username = ?`, [username]);

export function serializeVideo(row: VideoRow, viewerId?: string) {
  const author = loadUser(row.user_id);
  const tags = all<{ name: string }>(
    `SELECT h.name FROM video_hashtags vh JOIN hashtags h ON h.id = vh.hashtag_id WHERE vh.video_id = ?`,
    [row.id],
  );
  const sound = get<{ id: string; name: string; artist: string; path: string; cover: string | null }>(
    `SELECT s.id, s.name, s.artist, s.path, s.cover FROM video_sounds vs
     JOIN sounds s ON s.id = vs.sound_id WHERE vs.video_id = ?`,
    [row.id],
  );
  const liked = viewerId
    ? !!get('SELECT 1 FROM likes WHERE user_id = ? AND video_id = ?', [viewerId, row.id])
    : false;
  const saved = viewerId
    ? !!get('SELECT 1 FROM saves WHERE user_id = ? AND video_id = ?', [viewerId, row.id])
    : false;
  const parent = row.parent_id
    ? get<VideoRow>('SELECT * FROM videos WHERE id = ?', [row.parent_id])
    : undefined;

  return {
    id: row.id,
    src: row.path,
    thumbnail: row.thumbnail,
    cover: row.cover,
    description: row.description,
    kind: row.kind,
    duration: row.duration,
    visibility: row.visibility,
    allowComment: !!row.allow_comment,
    allowDuet: !!row.allow_duet,
    allowStitch: !!row.allow_stitch,
    pinned: !!row.pinned,
    stats: {
      views: row.view_count,
      likes: row.like_count,
      comments: row.comment_count,
      shares: row.share_count,
    },
    createdAt: row.created_at,
    author: author ? serializeUser(author, viewerId) : null,
    hashtags: tags.map((t) => t.name),
    sound: sound
      ? { id: sound.id, name: sound.name, artist: sound.artist, src: sound.path, cover: sound.cover }
      : null,
    parent: parent
      ? {
          id: parent.id,
          src: parent.path,
          author: (() => {
            const a = loadUser(parent.user_id);
            return a ? serializeUser(a, viewerId) : null;
          })(),
        }
      : null,
    liked,
    saved,
    likedBy: all<{ id: string; username: string; display_name: string; avatar: string | null }>(
      'SELECT u.id, u.username, u.display_name, u.avatar FROM likes l JOIN users u ON u.id = l.user_id WHERE l.video_id = ? ORDER BY l.created_at DESC LIMIT 12',
      [row.id],
    ).map((u) => ({ id: u.id, username: u.username, displayName: u.display_name || u.username, avatar: u.avatar })),
  };
}
