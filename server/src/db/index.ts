import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { schema } from './schema.js';

const here = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.Y_DATA_DIR ?? join(here, '..', '..', 'data');
export const UPLOAD_DIR = join(DATA_DIR, 'uploads');

mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(join(DATA_DIR, 'y.db'));
db.exec(schema);

export const uid = (): string => randomUUID();
export const now = (): string => new Date().toISOString();

type Params = unknown[] | Record<string, unknown>;

const toArgs = (p: Params): any[] => (Array.isArray(p) ? p : [p]) as any[];

export const all = <T = Record<string, any>>(sql: string, params?: Params): T[] =>
  db.prepare(sql).all(...toArgs(params ?? [])) as T[];

export const get = <T = Record<string, any>>(sql: string, params?: Params): T | undefined =>
  db.prepare(sql).get(...toArgs(params ?? [])) as T | undefined;

export const run = (sql: string, params?: Params) =>
  db.prepare(sql).run(...toArgs(params ?? []));

export const exec = (sql: string) => db.exec(sql);

let txDepth = 0;
export function tx<T>(fn: () => T): T {
  if (txDepth > 0) return fn();
  txDepth++;
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    txDepth--;
  }
}

export const parseHashtags = (text: string): string[] => {
  const found = text.match(/#([\p{L}\p{N}_]{1,40})/gu) ?? [];
  return [...new Set(found.map((t) => t.slice(1).toLowerCase()))].slice(0, 30);
};

export function syncHashtags(videoId: string, description: string): void {
  run('DELETE FROM video_hashtags WHERE video_id = ?', [videoId]);
  for (const name of parseHashtags(description)) {
    run('INSERT INTO hashtags (id, name) VALUES (?, ?) ON CONFLICT(name) DO NOTHING', [uid(), name]);
    const tag = get<{ id: string }>('SELECT id FROM hashtags WHERE name = ?', [name]);
    if (tag) run('INSERT OR IGNORE INTO video_hashtags (video_id, hashtag_id) VALUES (?, ?)', [videoId, tag.id]);
  }
}

export function bumpUserCounts(userId: string): void {
  run(
    `UPDATE users SET
       video_count = (SELECT COUNT(*) FROM videos WHERE user_id = :uid AND visibility = 'public'),
       like_count  = COALESCE((SELECT SUM(like_count) FROM videos WHERE user_id = :uid), 0),
       updated_at = :now
     WHERE id = :uid`,
    [{ uid: userId, now: now() }],
  );
}
