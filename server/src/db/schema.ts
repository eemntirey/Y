export const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL DEFAULT '',
  avatar        TEXT,
  bio           TEXT NOT NULL DEFAULT '',
  link          TEXT NOT NULL DEFAULT '',
  verified      INTEGER NOT NULL DEFAULT 0,
  is_private    INTEGER NOT NULL DEFAULT 0,
  follower_count  INTEGER NOT NULL DEFAULT 0,
  following_count INTEGER NOT NULL DEFAULT 0,
  like_count      INTEGER NOT NULL DEFAULT 0,
  video_count     INTEGER NOT NULL DEFAULT 0,
  coin_balance    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));
CREATE INDEX IF NOT EXISTS idx_users_created ON users (created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS videos (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path          TEXT NOT NULL,
  thumbnail     TEXT,
  cover         TEXT,
  description   TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT 'original',
  parent_id     TEXT REFERENCES videos(id) ON DELETE SET NULL,
  stitch_offset INTEGER NOT NULL DEFAULT 0,
  duration      REAL NOT NULL DEFAULT 0,
  width         INTEGER NOT NULL DEFAULT 0,
  height        INTEGER NOT NULL DEFAULT 0,
  visibility    TEXT NOT NULL DEFAULT 'public',
  allow_comment INTEGER NOT NULL DEFAULT 1,
  allow_duet    INTEGER NOT NULL DEFAULT 1,
  allow_stitch  INTEGER NOT NULL DEFAULT 1,
  pinned        INTEGER NOT NULL DEFAULT 0,
  view_count    INTEGER NOT NULL DEFAULT 0,
  like_count    INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  share_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_videos_user ON videos (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_created ON videos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_parent ON videos (parent_id);
CREATE INDEX IF NOT EXISTS idx_videos_visibility ON videos (visibility, created_at DESC);

CREATE TABLE IF NOT EXISTS hashtags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  view_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_hashtags_name_lower ON hashtags (lower(name));

CREATE TABLE IF NOT EXISTS video_hashtags (
  video_id   TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  hashtag_id TEXT NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  PRIMARY KEY (video_id, hashtag_id)
);
CREATE INDEX IF NOT EXISTS idx_vh_hashtag ON video_hashtags (hashtag_id);

CREATE TABLE IF NOT EXISTS sounds (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  artist      TEXT NOT NULL DEFAULT '',
  path        TEXT NOT NULL,
  cover       TEXT,
  is_original INTEGER NOT NULL DEFAULT 0,
  video_count INTEGER NOT NULL DEFAULT 0,
  use_count   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS video_sounds (
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  sound_id TEXT NOT NULL REFERENCES sounds(id) ON DELETE CASCADE,
  PRIMARY KEY (video_id, sound_id)
);
CREATE INDEX IF NOT EXISTS idx_vs_sound ON video_sounds (sound_id);

CREATE TABLE IF NOT EXISTS likes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id   TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_video ON likes (video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_user ON likes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saves (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id   TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, video_id)
);

CREATE TABLE IF NOT EXISTS shares (
  id         TEXT PRIMARY KEY,
  video_id   TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  channel    TEXT NOT NULL DEFAULT 'link',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shares_video ON shares (video_id);

CREATE TABLE IF NOT EXISTS video_views (
  video_id   TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (video_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  video_id   TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  TEXT REFERENCES comments(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  like_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_video ON comments (video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id);

CREATE TABLE IF NOT EXISTS comment_likes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, comment_id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id, created_at DESC);

CREATE TABLE IF NOT EXISTS blocks (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id   TEXT REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  video_id   TEXT REFERENCES videos(id) ON DELETE CASCADE,
  comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  text       TEXT NOT NULL DEFAULT '',
  seen       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at    TEXT,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cm_user ON conversation_members (user_id);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL DEFAULT 'text',
  body            TEXT NOT NULL DEFAULT '',
  attachment      TEXT,
  seen            INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gifts (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  emoji TEXT NOT NULL,
  coins INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS live_rooms (
  id            TEXT PRIMARY KEY,
  host_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT '',
  thumbnail     TEXT,
  status        TEXT NOT NULL DEFAULT 'live',
  started_at    TEXT NOT NULL,
  ended_at      TEXT,
  peak_viewers  INTEGER NOT NULL DEFAULT 0,
  total_viewers INTEGER NOT NULL DEFAULT 0,
  gift_coins    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_live_status ON live_rooms (status, started_at DESC);

CREATE TABLE IF NOT EXISTS live_viewers (
  room_id   TEXT NOT NULL REFERENCES live_rooms(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS live_messages (
  id         TEXT PRIMARY KEY,
  room_id    TEXT NOT NULL REFERENCES live_rooms(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'comment',
  body       TEXT NOT NULL DEFAULT '',
  gift_id    TEXT REFERENCES gifts(id) ON DELETE SET NULL,
  coins      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_live_messages_room ON live_messages (room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  seller_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'EUR',
  image       TEXT,
  stock       INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active',
  sales       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products (seller_id);

CREATE TABLE IF NOT EXISTS cart_items (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id         TEXT PRIMARY KEY,
  buyer_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total      INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'paid',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  price      INTEGER NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  details     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS search_history (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  term       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_history ON search_history (user_id, created_at DESC);
`;
